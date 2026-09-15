// 打样单(Tasks) 业务服务层：纯函数，HTTP路由与IPC handler共用
const { getDb } = require('../db.cjs');
const { syncTaskStatus } = require('./sampleRuns.cjs');
const versionSvc = require('./versions.cjs'); // REQ-011 历史版本快照

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
         s.style_no, s.title, s.brand, s.designer, s.year, s.season, s.month, s.category, s.pdf_url, s.pattern_maker
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

// G11 款级优先级单主口径：取该款全部批次中的最高档（S>A>B>C），无批次回退 B。
// 与看板 KanbanView.taskTopPriority 同规则，保证「看板分组/筛选」与「列表/技术包导出」三处一致。
const PRIO_RANK = { S: 3, A: 2, B: 1, C: 0 };
/** 从批次列表推导款级优先级（最高档优先；无批次/无有效档位回退 B，REQ-030 默认档） */
function topPriorityOf(runs) {
  let top = '';
  for (const r of runs) {
    if (r.priority && (PRIO_RANK[r.priority] ?? -1) > (PRIO_RANK[top] ?? -1)) top = r.priority;
  }
  return top || 'B';
}

/**
 * 从批次列表推导款级状态（REQ-027 修正口径：当前进度 = 最新版次）
 * 完成 = 全部批次已完成（done）；任一批次未完成 → 取未完成批次中 sort_order 最大者（最新版次）的状态。
 * 业务依据：开新版次（复版一/复版二等）意味着从头重做，旧版次的样衣中/打版中是历史进度，
 * 不代表当前在干什么——26AWW526 复版一待配料 → 当前进度=待配料（待处理列）。
 */
function deriveStyleStatus(runs) {
  if (!runs || !runs.length) return 'not_started';
  const active = runs.filter(r => r.status !== 'done');
  if (!active.length) return 'done';
  let latest = active[0];
  for (const r of active) {
    if ((r.sort_order ?? 0) > (latest.sort_order ?? 0)) latest = r;
  }
  return latest.status;
}

/**
 * 取「当前进行中批次」对象：未完成批次中 sort_order 最大者（最新版次，与 deriveStyleStatus 同口径）
 * 全部已完成或无批次 → 回退全部批次中 sort_order 最大者（保证单号/日期投影有值），与 REQ-027 同步
 */
function findTopRun(runs) {
  if (!runs || !runs.length) return null;
  let pool = runs.filter(r => r.status !== 'done');
  if (!pool.length) pool = runs;
  let top = pool[0];
  for (const r of pool) {
    if ((r.sort_order ?? 0) > (top.sort_order ?? 0)) top = r;
  }
  return top;
}

/** REQ-025 存量款级状态重算：全部打样单按新口径重算 tasks.status（幂等，启动时调用一次） */
function recalcAllTaskStatus() {
  const db = getDb();
  const ids = db.prepare('SELECT id FROM tasks').all();
  for (const t of ids) syncTaskStatus(t.id);
  return ids.length;
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
    // REQ-022 进度权威口径：最先进批次摘要投影（与 derived_status 同源 findTopRun），
    // 供看板逾期判定/底部进度节点直接消费，保证「看板分组/逾期角标/进度节点/版次条」四处口径一致
    const topRunInfo = topRun ? {
      id: topRun.id,
      sample_type: topRun.sample_type || '',
      status: topRun.status || '',
      expected_date: topRun.expected_date || '',
      fabric_date: topRun.fabric_date || '',
      start_date: topRun.start_date || '',
      pattern_date: topRun.pattern_date || '',
      finish_date: topRun.finish_date || '',
      sample_maker: topRun.sample_maker || '',
      audit_status: topRun.audit_status || '',
    } : null;
    return {
      ...t,
      runs,
      top_run: topRunInfo,
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
      // REQ-005 尺寸表归属版次：权威数据在 sample_runs.size_data（迁移 v16），
      // 此处从首个批次投影保持旧消费点（导出兜底/版本对比等）可用
      size_data: safeParse(top?.size_data, []),
      // G11 priority 单主：tasks.priority 列已随迁移 v21 物理删除，款级优先级改由批次最高档投影
      // （S>A>B>C，无批次回退 B），与看板 KanbanView.taskTopPriority / 列表导出 / 技术包导出口径统一
      priority: topPriorityOf(runs),
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
 * 获取打样单（分页 + 字段裁剪版，批5 G19 轻量实现）
 * - 默认 limit=50、offset=0；limit 钳制到 [1,200]，offset 非负，防止越界/滥用
 * - light=true：丢弃完整 runs 数组，仅保留 top_run + runs_count（看板卡片级信息），缩小响应体
 * - 默认（无参）list() 行为完全不变，看板等现有调用方零影响
 * @param {{limit?:number, offset?:number, light?:boolean}} [opts]
 * @returns {{items:Array<object>, total:number}}
 */
function listPaged({ limit, offset, light } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const rows = getDb()
    .prepare(`${TASK_JOIN_SELECT} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`)
    .all(lim, off)
    .map(t => ({ ...t, progress_nodes: safeParse(t.progress_nodes, []) }));
  let items = attachRuns(rows);
  if (light) items = items.map(toTaskSummary);
  const total = getDb().prepare('SELECT COUNT(*) AS c FROM tasks').get().c;
  return { items, total };
}

/**
 * 把完整任务对象裁剪为「看板卡片级」摘要（G19 light 模式）：
 * 保留款级聚合 / 顶部批次 / 进度节点等看板必需字段，丢弃完整 runs 数组。
 */
function toTaskSummary(t) {
  return {
    id: t.id,
    style_id: t.style_id,
    style_no: t.style_no,
    title: t.title,
    brand: t.brand,
    designer: t.designer,
    year: t.year,
    season: t.season,
    month: t.month,
    category: t.category,
    pdf_url: t.pdf_url,
    pattern_maker: t.pattern_maker,
    progress_nodes: t.progress_nodes,
    derived_status: t.derived_status,
    derived_status_label: t.derived_status_label,
    sample_type: t.sample_type,
    sample_color: t.sample_color,
    size: t.size,
    sample_count: t.sample_count,
    fabric_date: t.fabric_date,
    order_no: t.order_no,
    audit_status: t.audit_status,
    audit_comment: t.audit_comment,
    size_data: t.size_data,
    priority: t.priority,
    top_run: t.top_run,
    runs_count: (t.runs || []).length,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
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
  // G10：tasks.order_no / tasks.size_data 已随 v21 物理删除，版本对比所需的单号/尺寸表一律从批次投影
  const rows = getDb().prepare(`
    SELECT id, created_at
    FROM tasks WHERE style_id = ? ORDER BY created_at DESC
  `).all(styleId);
  if (!rows.length) return rows;
  const ids = rows.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const runs = getDb().prepare(
    `SELECT task_id, sample_type, sample_color, order_no, size_data FROM sample_runs
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
      // REQ-005 尺寸表归属版次：尺寸表从批次投影（迁移 v16 后 tasks.size_data 已清空）
      size_data: safeParse(top?.size_data, []),
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
        INSERT INTO styles (style_no, title, brand, designer, year, season, month, category, pdf_url, pattern_maker)
        VALUES (@style_no, @title, @brand, @designer, @year, @season, @month, @category, @pdf_url, @pattern_maker)
      `).run({
        style_no: b.style_no || `TMP-${Date.now()}`,
        title: b.title || '未命名',
        brand: b.brand || '',
        designer: b.designer || '',
        year: b.year || '',
        season: b.season || '',
        month: b.month || '',
        category: b.category || '',
        pdf_url: b.pdf_url || '',
        pattern_maker: b.pattern_maker || ''
      });
      style_id = styleInfo.lastInsertRowid;
    }

    // G10：tasks 层 priority / size_data 列已随迁移 v21 物理删除（权威数据在 sample_runs），此处不再写入
    const taskInfo = db.prepare(`
      INSERT INTO tasks (
        style_id,
        start_date, expected_date, finish_date,
        status, progress_nodes, fabric_req, trim_req, process_req, note
      )
      VALUES (
        @style_id,
        @start_date, @expected_date, @finish_date,
        @status, @progress_nodes, @fabric_req, @trim_req, @process_req, @note
      )
    `).run({
      style_id,
      start_date: b.start_date || '',
      expected_date: b.expected_date || '',
      finish_date: b.finish_date || '',
      status: b.status || 'todo',
      progress_nodes: JSON.stringify(INITIAL_NODES),
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
      parseInt(b.sample_count) || 1, b.priority || 'B',
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
 *
 * G12：把「styles UPDATE → tasks UPDATE → 操作日志 → 版本快照」整串写入包进**单个事务**，
 * 任一步抛错即整体回滚，杜绝「styles 已改而 tasks 未改」的部分写入（此前实测存在，见
 * tests/tasks/tasksAtomicity.test.js）。唯一例外是版本快照 capture：它原本就用 try/catch
 * 兜住（快照失败不应影响主写入），该 catch 仍在事务内本地消化、不向上抛出，故不破坏提交。
 *
 * @param {number|string} id
 * @param {object} b - PATCH 请求体
 * @returns {{success: boolean, styleUpdated: boolean, taskUpdated: boolean, logged: number}|null}
 */
function update(id, b) {
  const db = getDb();
  const row = db.prepare('SELECT style_id FROM tasks WHERE id = ?').get(id);
  if (!row) return null;
  const { style_id } = row;
  const oldTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  const STYLE_KEYS = ['style_no', 'title', 'brand', 'designer', 'year', 'season', 'month', 'category', 'pdf_url', 'pattern_maker'];
  const styleUpdates = {};
  for (const key of STYLE_KEYS) {
    if (key in b) styleUpdates[key] = b[key];
  }

  // 注：status（款单看板状态）由 syncTaskStatus 按最先进批次自动判定，禁止手动覆盖，故不在白名单
  // G10/G11：tasks.priority 与 tasks.size_data 两列已随 v21 物理删除，其权威数据分别在
  //   sample_runs.priority（款级按批次最高档投影）与 sample_runs.size_data（首个批次投影），故不在白名单。
  const TASK_KEYS = [
    'start_date', 'expected_date', 'finish_date',
    'progress_nodes', 'image_url',
    'fabric_req', 'trim_req', 'process_req', 'note'
  ];
  const taskUpdates = {};
  for (const key of TASK_KEYS) {
    if (key in b) {
      taskUpdates[key] = (key === 'progress_nodes' && Array.isArray(b[key]))
        ? JSON.stringify(b[key])
        : b[key];
    }
  }

  // 操作日志：关键动作去噪记录（同值不记）——纯读比较，放在事务外计算，不产生写入
  // G11：priority 已非款级字段（权威在 sample_runs，按批次最高档投影），故不再记录款级优先级变更日志
  const fmtStatus = (s) => STATUS_LABELS[s] || s || '未设';
  const diffOf = (key) => ('key' in { key }) && (key in b) && String(b[key] ?? '') !== String(oldTask[key] ?? '');
  const logs = [];
  if (diffOf('status')) logs.push(['status', `状态：${fmtStatus(oldTask.status)} → ${fmtStatus(b.status)}`]);
  if (diffOf('expected_date')) logs.push(['expected_date', `期望交期：${oldTask.expected_date || '未设'} → ${b.expected_date || '未设'}`]);
  if ('progress_nodes' in b && JSON.stringify(b.progress_nodes) !== JSON.stringify(oldTask.progress_nodes)) {
    logs.push(['node', '工作动态更新']);
  }

  // G12 事务边界：从 styles UPDATE 之前，到 tasks UPDATE / 操作日志 / 版本快照之后
  const applyUpdate = db.transaction(() => {
    let styleUpdated = false;
    if (Object.keys(styleUpdates).length > 0) {
      const setParts = [...Object.keys(styleUpdates).map(k => `${k} = @${k}`), 'updated_at = CURRENT_TIMESTAMP'].join(', ');
      db.prepare(`UPDATE styles SET ${setParts} WHERE id = @_id`).run({ ...styleUpdates, _id: style_id });
      styleUpdated = true;
    }

    let taskUpdated = false;
    if (Object.keys(taskUpdates).length > 0) {
      const setParts = [...Object.keys(taskUpdates).map(k => `${k} = @${k}`), 'updated_at = CURRENT_TIMESTAMP'].join(', ');
      db.prepare(`UPDATE tasks SET ${setParts} WHERE id = @_id`).run({ ...taskUpdates, _id: id });
      taskUpdated = true;
    }

    for (const [action, detail] of logs) logAction(id, action, detail);

    // REQ-011：自动保存落库后记录/合并历史版本快照（尺寸表/BOM 为重点，5 分钟编辑会话合并）
    // 快照失败必须被本地消化（不打断主写入）——由 tests/tasks/tasksAtomicity.test.js 的绿用例守护
    if (styleUpdated || taskUpdated) {
      try { versionSvc.capture(id); } catch (e) { console.error('[versions] capture failed:', e.message); }
    }

    return { styleUpdated, taskUpdated };
  });

  const { styleUpdated, taskUpdated } = applyUpdate();
  return { success: true, styleUpdated, taskUpdated, logged: logs.length };
}

/**
 * 删除打样单
 *
 * G12：删单 + 清孤儿款式两条语句包成原子单元，避免删单成功但孤儿款式未清理（或反之）。
 * @param {number|string} id
 * @returns {{success: boolean}}
 */
function remove(id) {
  const db = getDb();
  const row = db.prepare('SELECT style_id FROM tasks WHERE id = ?').get(id);
  const doRemove = db.transaction(() => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    // 一款一单模型下，删单即删款：若该款式下已无任何单据，清理孤儿款式行（上传文件不物理删除）
    if (row && row.style_id) {
      const left = db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE style_id = ?').get(row.style_id);
      if (left.c === 0) db.prepare('DELETE FROM styles WHERE id = ?').run(row.style_id);
    }
  });
  doRemove();
  return { success: true };
}

module.exports = { list, listPaged, get, versions, create, update, remove, logAction, listLogs, recalcAllTaskStatus };
