// 打样单(Tasks) 业务服务层：纯函数，HTTP路由与IPC handler共用
const { getDb } = require('../db.cjs');

// ── 操作日志 ──────────────────────────────────────────
const STATUS_LABELS = { todo: '待处理', doing: '打版中', in_progress: '打版中', done: '已完结', completed: '已完结' };

/** 写入一条操作日志 */
function logAction(taskId, action, detail, operator) {
  getDb().prepare('INSERT INTO operation_logs (task_id, action, detail, operator) VALUES (?, ?, ?, ?)')
    .run(taskId || null, action, detail || '', operator || 'system');
}

/** 查询操作日志（倒序；可按 task_id 过滤，limit 默认 200） */
function listLogs({ taskId, limit } = {}) {
  const conds = [];
  const args = [];
  if (taskId) { conds.push('task_id = ?'); args.push(taskId); }
  let sql = 'SELECT * FROM operation_logs';
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY id DESC LIMIT ?';
  args.push(limit || 200);
  return getDb().prepare(sql).all(...args);
}

// 工作动态默认模板：按项目事件流推进（可自由增删改，不再按分工角色写死）
// 每个节点：label 事件名 / status(pending|active|done) / date / by 负责人 / note 备注
const INITIAL_NODES = [
  { label: '收单', status: 'done', date: '', by: '', note: '' },
  { label: '胚样', status: 'pending', date: '', by: '', note: '' },
  { label: '头样', status: 'pending', date: '', by: '', note: '' },
  { label: '样衣', status: 'pending', date: '', by: '', note: '' },
  { label: '制单', status: 'pending', date: '', by: '', note: '' }
];

/** 安全解析 JSON 字段，失败返回默认值 */
function safeParse(json, fallback) {
  try { return JSON.parse(json || '[]'); } catch { return fallback; }
}

const TASK_JOIN_SELECT = `
  SELECT t.*,
         s.style_no, s.title, s.brand, s.designer, s.year, s.season, s.month, s.category, s.pdf_url
  FROM tasks t
  LEFT JOIN styles s ON t.style_id = s.id
`;

// 版次批次状态优先级（数值越大越靠后/越先进），用于款级状态自动聚合
const RUN_STATUS_RANK = {
  waiting_material: 1, pattern_making: 2, sample_making: 3, pending_confirm: 4, done: 5,
};
const DERIVED_STATUS_LABEL = {
  not_started: '未开始', waiting_material: '待配料', pattern_making: '打版中',
  sample_making: '样衣中', pending_confirm: '待确认', done: '已完成',
};

/** 从批次列表推导款级状态：取最先进（优先级最高）批次的状态；无批次为未开始 */
function deriveStyleStatus(runs) {
  if (!runs || !runs.length) return 'not_started';
  let best = 'waiting_material';
  for (const r of runs) {
    if ((RUN_STATUS_RANK[r.status] ?? 0) > (RUN_STATUS_RANK[best] ?? 0)) best = r.status;
  }
  return best;
}

/** 给任务行附带其全部版次批次（sample_runs），一次查询按 task_id 分组避免 N+1；
 *  同时计算 derived_status（款级聚合状态，设计师视角） */
function attachRuns(rows) {
  if (!rows.length) return rows;
  const all = getDb().prepare('SELECT * FROM sample_runs ORDER BY sort_order ASC, id ASC').all();
  const byTask = {};
  for (const r of all) (byTask[r.task_id] ||= []).push(r);
  return rows.map(t => {
    const runs = byTask[t.id] || [];
    const derived = deriveStyleStatus(runs);
    return { ...t, runs, derived_status: derived, derived_status_label: DERIVED_STATUS_LABEL[derived] };
  });
}

/**
 * 获取全部打样单（含款式信息，progress_nodes 已解析，附带版次批次）
 * @returns {Array<object>}
 */
function list() {
  const rows = getDb().prepare(`${TASK_JOIN_SELECT} ORDER BY t.created_at DESC`).all()
    .map(t => ({ ...t, progress_nodes: safeParse(t.progress_nodes, []) }));
  return attachRuns(rows);
}

/**
 * 获取单个打样单
 * @param {number|string} id
 * @returns {object|null}
 */
function get(id) {
  const row = getDb().prepare(`${TASK_JOIN_SELECT} WHERE t.id = ?`).get(id);
  if (!row) return null;
  row.progress_nodes = safeParse(row.progress_nodes, []);
  return attachRuns([row])[0];
}

/**
 * 获取同款式的所有打样单（版本对比）
 * @param {number|string} styleId
 * @returns {Array<object>}
 */
function versions(styleId) {
  const rows = getDb().prepare(`
    SELECT id, order_no, sample_type, sample_color, size_data, created_at
    FROM tasks WHERE style_id = ? ORDER BY created_at DESC
  `).all(styleId);
  return rows.map(r => ({ ...r, size_data: safeParse(r.size_data, []) }));
}

/**
 * 新建打样单（事务：自动建/复用款式）
 * @param {object} b - 请求体
 * @returns {number} 新任务 id
 */
function create(b) {
  const db = getDb();
  const insertTransaction = db.transaction((b) => {
    let style_id;
    if (b.style_no) {
      const existingStyle = db.prepare('SELECT id FROM styles WHERE style_no = ?').get(b.style_no);
      if (existingStyle) style_id = existingStyle.id;
    }

    if (!style_id) {
      const styleInfo = db.prepare(`
        INSERT INTO styles (style_no, title, brand, designer, year, season, month, category, pdf_url)
        VALUES (@style_no, @title, @brand, @designer, @year, @season, @month, @category, @pdf_url)
      `).run({
        style_no: b.style_no || `TMP-${Date.now()}`,
        title: b.title || '未命名',
        brand: b.brand || '',
        designer: b.designer || '',
        year: b.year || '',
        season: b.season || '',
        month: b.month || '',
        category: b.category || '',
        pdf_url: b.pdf_url || ''
      });
      style_id = styleInfo.lastInsertRowid;
    }

    const taskInfo = db.prepare(`
      INSERT INTO tasks (
        style_id, order_no, priority, sample_type, sample_color, size, sample_count,
        fabric_date, start_date, expected_date, finish_date, audit_status, audit_comment,
        status, progress_nodes, size_data, fabric_req, trim_req, process_req, note
      )
      VALUES (
        @style_id, @order_no, @priority, @sample_type, @sample_color, @size, @sample_count,
        @fabric_date, @start_date, @expected_date, @finish_date, @audit_status, @audit_comment,
        @status, @progress_nodes, @size_data, @fabric_req, @trim_req, @process_req, @note
      )
    `).run({
      style_id,
      order_no: b.order_no || '',
      priority: b.priority || '中',
      sample_type: b.sample_type || '',
      sample_color: b.sample_color || '',
      size: b.size || '',
      sample_count: parseInt(b.sample_count) || 1,
      fabric_date: b.fabric_date || '',
      start_date: b.start_date || '',
      expected_date: b.expected_date || '',
      finish_date: b.finish_date || '',
      audit_status: b.audit_status || '待审核',
      audit_comment: b.audit_comment || '',
      status: b.status || 'todo',
      progress_nodes: JSON.stringify(INITIAL_NODES),
      size_data: b.size_data || '[]',
      fabric_req: b.fabric_req || '',
      trim_req: b.trim_req || '',
      process_req: b.process_req || '',
      note: b.note || ''
    });
    const newTaskId = taskInfo.lastInsertRowid;

    // 新模型：建单即建首个打样批次（版次/尺码/颜色/件数/优先级/日期来自建单表单）
    db.prepare(`
      INSERT INTO sample_runs
        (task_id, sample_type, size, sample_color, sample_count, priority, status,
         fabric_date, start_date, expected_date, finish_date, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, 'waiting_material', ?, ?, ?, ?, 0)
    `).run(
      newTaskId,
      b.sample_type || '', b.size || '', b.sample_color || '',
      parseInt(b.sample_count) || 1, b.priority || '中',
      b.fabric_date || '', b.start_date || '', b.expected_date || '', b.finish_date || ''
    );

    return newTaskId;
  });

  const newId = insertTransaction(b);
  logAction(newId, 'create', `创建打样单 ${b.style_no ? `款号 ${b.style_no}` : ''}${b.order_no ? `，版单 ${b.order_no}` : ''}`.trim());
  return newId;
}

/**
 * 更新打样单（款式字段与任务字段分离更新）
 * @param {number|string} id
 * @param {object} b - PATCH 请求体
 * @returns {{success: boolean, styleUpdated: boolean, taskUpdated: boolean}}
 */
function update(id, b) {
  const db = getDb();
  const row = db.prepare('SELECT style_id FROM tasks WHERE id = ?').get(id);
  if (!row) return null;
  const { style_id } = row;
  const oldTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  const STYLE_KEYS = ['style_no', 'title', 'brand', 'designer', 'year', 'season', 'month', 'category', 'pdf_url'];
  const styleUpdates = {};
  for (const key of STYLE_KEYS) {
    if (key in b) styleUpdates[key] = b[key];
  }
  let styleUpdated = false;
  if (Object.keys(styleUpdates).length > 0) {
    const setParts = [...Object.keys(styleUpdates).map(k => `${k} = @${k}`), "updated_at = CURRENT_TIMESTAMP"].join(', ');
    db.prepare(`UPDATE styles SET ${setParts} WHERE id = @_id`).run({ ...styleUpdates, _id: style_id });
    styleUpdated = true;
  }

  const TASK_KEYS = [
    'order_no', 'priority', 'sample_type', 'sample_color', 'size', 'sample_count',
    'fabric_date', 'start_date', 'expected_date', 'finish_date', 'audit_status',
    'audit_comment', 'status', 'progress_nodes', 'image_url',
    'fabric_req', 'trim_req', 'process_req', 'note', 'size_data'
  ];
  const taskUpdates = {};
  for (const key of TASK_KEYS) {
    if (key in b) {
      taskUpdates[key] = (['progress_nodes', 'size_data'].includes(key) && Array.isArray(b[key]))
        ? JSON.stringify(b[key])
        : b[key];
    }
  }
  let taskUpdated = false;
  if (Object.keys(taskUpdates).length > 0) {
    const setParts = [...Object.keys(taskUpdates).map(k => `${k} = @${k}`), "updated_at = CURRENT_TIMESTAMP"].join(', ');
    db.prepare(`UPDATE tasks SET ${setParts} WHERE id = @_id`).run({ ...taskUpdates, _id: id });
    taskUpdated = true;
  }

  // 操作日志：关键动作去噪记录（同值不记）
  const fmtStatus = (s) => STATUS_LABELS[s] || s || '未设';
  const diffOf = (key) => ('key' in { key }) && (key in b) && String(b[key] ?? '') !== String(oldTask[key] ?? '');
  const logs = [];
  if (diffOf('status')) logs.push(['status', `状态：${fmtStatus(oldTask.status)} → ${fmtStatus(b.status)}`]);
  if (diffOf('sample_type')) logs.push(['sample_type', `版次：${oldTask.sample_type || '未设'} → ${b.sample_type || '未设'}`]);
  if (diffOf('priority')) logs.push(['priority', `优先级：${oldTask.priority || '中'} → ${b.priority || '中'}`]);
  if (diffOf('audit_status')) logs.push(['audit', `审核：${oldTask.audit_status || '待审核'} → ${b.audit_status || '待审核'}`]);
  if (diffOf('expected_date')) logs.push(['expected_date', `期望交期：${oldTask.expected_date || '未设'} → ${b.expected_date || '未设'}`]);
  if ('progress_nodes' in b && JSON.stringify(b.progress_nodes) !== JSON.stringify(oldTask.progress_nodes)) {
    logs.push(['node', '工作动态更新']);
  }
  for (const [action, detail] of logs) logAction(id, action, detail);

  return { success: true, styleUpdated, taskUpdated, logged: logs.length };
}

/**
 * 删除打样单
 * @param {number|string} id
 * @returns {{success: boolean}}
 */
function remove(id) {
  const db = getDb();
  const row = db.prepare('SELECT style_id FROM tasks WHERE id = ?').get(id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  // 一款一单模型下，删单即删款：若该款式下已无任何单据，清理孤儿款式行（上传文件不物理删除）
  if (row && row.style_id) {
    const left = db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE style_id = ?').get(row.style_id);
    if (left.c === 0) db.prepare('DELETE FROM styles WHERE id = ?').run(row.style_id);
  }
  return { success: true };
}

module.exports = { list, get, versions, create, update, remove, logAction, listLogs };
