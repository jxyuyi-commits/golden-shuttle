// 打样单(Tasks) 业务服务层：纯函数，HTTP路由与IPC handler共用
const { getDb } = require('../db.cjs');
const { syncTaskStatus } = require('./sampleRuns.cjs');

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

/** 取最先进批次对象（与 deriveStyleStatus 同口径）；无批次返回 null */
function findTopRun(runs) {
  if (!runs || !runs.length) return null;
  let top = runs[0];
  for (const r of runs) {
    if ((RUN_STATUS_RANK[r.status] ?? 0) > (RUN_STATUS_RANK[top.status] ?? 0)) top = r;
  }
  return top;
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
    // 兼容投影：tasks 旧批次字段（sample_type/sample_color/size/sample_count/fabric_date）
    // 已由迁移 v12 移除，权威数据在 sample_runs；此处从首个批次（sort_order 最小）推导，
    // 保持前端卡片/导出/查重列表等消费点无需改动。前端可后续迁移为直接读取 runs。
    const top = runs[0];
    // REQ-004：单号/审核已下沉版次（v14），task 级字段清空；此处从最先进批次投影，
    // 保持看板卡片「版单/审核」行、列表列、导出等消费点展示"当前进行中批次"的信息。
    const topRun = findTopRun(runs);
    return {
      ...t,
      runs,
      derived_status: derived,
      derived_status_label: DERIVED_STATUS_LABEL[derived],
      sample_type: top?.sample_type || '',
      sample_color: top?.sample_color || '',
      size: top?.size || '',
      sample_count: top?.sample_count ?? 1,
      fabric_date: top?.fabric_date || '',
      order_no: topRun?.order_no || '',
      audit_status: topRun?.audit_status || '',
      audit_comment: topRun?.audit_comment || '',
    };
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
    SELECT id, order_no, size_data, created_at
    FROM tasks WHERE style_id = ? ORDER BY created_at DESC
  `).all(styleId);
  if (!rows.length) return rows;
  const ids = rows.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const runs = getDb().prepare(
    `SELECT task_id, sample_type, sample_color, order_no FROM sample_runs
     WHERE task_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`
  ).all(...ids);
  const byTask = {};
  for (const r of runs) (byTask[r.task_id] ||= []).push(r);
  return rows.map(r => {
    const top = (byTask[r.id] || [])[0];
    return {
      ...r,
      // 版次/样衣色已迁至 sample_runs，此处取首个批次投影保持对比 UI 可用；
      // 单号已下沉版次（v14），版本对比用首个批次（V0）单号标识该版本
      sample_type: top?.sample_type || '',
      sample_color: top?.sample_color || '',
      order_no: top?.order_no || '',
      size_data: safeParse(r.size_data, []),
    };
  });
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
        style_id, priority,
        start_date, expected_date, finish_date,
        status, progress_nodes, size_data, fabric_req, trim_req, process_req, note
      )
      VALUES (
        @style_id, @priority,
        @start_date, @expected_date, @finish_date,
        @status, @progress_nodes, @size_data, @fabric_req, @trim_req, @process_req, @note
      )
    `).run({
      style_id,
      priority: b.priority || '中',
      start_date: b.start_date || '',
      expected_date: b.expected_date || '',
      finish_date: b.finish_date || '',
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

    // 款级状态自动同步（首个批次为 waiting_material → todo）
    syncTaskStatus(newTaskId);

    return newTaskId;
  });

  const newId = insertTransaction(b);
  logAction(newId, 'create', `创建打样单 ${b.style_no ? `款号 ${b.style_no}` : ''}`.trim());
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

  // 注：status（款单看板状态）由 syncTaskStatus 按最先进批次自动判定，禁止手动覆盖，故不在白名单
  const TASK_KEYS = [
    'priority',
    'start_date', 'expected_date', 'finish_date',
    'progress_nodes', 'image_url',
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
  if (diffOf('priority')) logs.push(['priority', `优先级：${oldTask.priority || '中'} → ${b.priority || '中'}`]);
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
