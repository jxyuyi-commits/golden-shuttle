// 版次批次（sample_runs）业务服务层：一款单下多个打样批次，板师的工作单元
// 一款单（task）1──N 批次：胚样/头版样/复版/生产样可并行，各自带状态、阻塞与负责人
const { getDb } = require('../db.cjs');

const FIELDS = [
  'sample_type', 'size', 'sample_color', 'sample_count', 'priority',
  'status', 'blocker', 'assignee',
  'fabric_date', 'start_date', 'expected_date', 'finish_date',
  'note', 'sort_order', 'linked_drawing_ids',
];

/** 批次状态枚举（板师手动推进） */
const STATUS_LABELS = {
  waiting_material: '待配料',
  pattern_making: '打版中',
  sample_making: '样衣中',
  pending_confirm: '待确认',
  done: '已完成',
};

/** 阻塞原因枚举（独立字段，不用备注） */
const BLOCKER_LABELS = {
  none: '无',
  short_material: '欠面辅料',
  wait_designer: '待设计师确认',
  wait_tech: '待工艺单',
  other: '其他',
};

/** 写一条操作日志 */
function logAction(taskId, action, detail) {
  try {
    getDb().prepare('INSERT INTO operation_logs (task_id, action, detail, operator) VALUES (?, ?, ?, ?)')
      .run(taskId || null, action, detail || '', 'system');
  } catch { /* 日志失败不影响主流程 */ }
}

/** 批次状态优先级（数值越大越靠后/越先进） */
const RUN_STATUS_RANK = {
  waiting_material: 1, pattern_making: 2, sample_making: 3, pending_confirm: 4, done: 5,
};
/** 款级聚合状态 → 看板列（todo/doing/done）映射 */
const TASK_STATUS_MAP = {
  not_started: 'todo', waiting_material: 'todo',
  pattern_making: 'doing', sample_making: 'doing', pending_confirm: 'doing',
  done: 'done',
};

/**
 * 款级状态自动同步：从该款全部批次推导聚合状态（最先进批次为准），
 * 映射为看板列 todo/doing/done 并写回 tasks.status。
 * 批次是权威数据源，款级看板列不再手动维护。
 */
function syncTaskStatus(taskId) {
  try {
    const db = getDb();
    const runs = db.prepare('SELECT status FROM sample_runs WHERE task_id = ?').all(taskId);
    let derived;
    if (!runs.length) {
      derived = 'not_started';
    } else {
      let best = 'waiting_material';
      for (const r of runs) {
        if ((RUN_STATUS_RANK[r.status] ?? 0) > (RUN_STATUS_RANK[best] ?? 0)) best = r.status;
      }
      derived = best;
    }
    const status = TASK_STATUS_MAP[derived] || 'todo';
    db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, taskId);
    return status;
  } catch { return null; }
}

/** 规范化输入字段 */
function sanitize(d) {
  const out = {};
  for (const k of FIELDS) {
    if (d[k] === undefined) continue;
    if (k === 'sample_count') {
      const n = parseInt(d[k], 10);
      out[k] = Number.isFinite(n) && n > 0 ? n : 1;
    } else if (k === 'sort_order') {
      out[k] = parseInt(d[k], 10) || 0;
    } else {
      out[k] = (d[k] ?? '').toString();
    }
  }
  if (out.status && !STATUS_LABELS[out.status]) out.status = 'waiting_material';
  if (out.blocker && !BLOCKER_LABELS[out.blocker]) out.blocker = 'none';
  return out;
}

/** 某款单下的全部批次（按排序、id 升序） */
function listByTask(taskId) {
  return getDb().prepare(
    'SELECT * FROM sample_runs WHERE task_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(taskId);
}

/** 新增批次：自动排到末尾 */
function create(taskId, d) {
  const db = getDb();
  const data = sanitize(d);
  const last = db.prepare(
    'SELECT MAX(sort_order) AS m FROM sample_runs WHERE task_id = ?'
  ).get(taskId);
  data.sort_order = (last?.m ?? -1) + 1;
  data.task_id = taskId;
  if (!data.status) data.status = 'waiting_material';
  if (!data.blocker) data.blocker = 'none';
  if (!data.priority) data.priority = '中';
  if (!data.sample_count) data.sample_count = 1;

  const cols = Object.keys(data);
  const info = db.prepare(
    `INSERT INTO sample_runs (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  ).run(...cols.map(c => data[c]));
  logAction(taskId, '新增打样批次', `${data.sample_type || '未命名版次'} ${data.size || ''} ${data.sample_color || ''}`.trim());
  syncTaskStatus(taskId);
  return { id: info.lastInsertRowid };
}

/** 更新批次（局部字段） */
function update(id, d) {
  const db = getDb();
  const before = db.prepare('SELECT * FROM sample_runs WHERE id = ?').get(id);
  if (!before) return null;
  const data = sanitize(d);
  delete data.sort_order; // 排序走专用接口
  const keys = Object.keys(data);
  if (keys.length) {
    db.prepare(
      `UPDATE sample_runs SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(...keys.map(k => data[k]), id);
  }
  const after = db.prepare('SELECT * FROM sample_runs WHERE id = ?').get(id);
  // 状态/阻塞变化写日志
  if (data.status && data.status !== before.status) {
    logAction(before.task_id, '批次状态变更',
      `${after.sample_type || '批次#' + id}：${STATUS_LABELS[before.status] || before.status} → ${STATUS_LABELS[data.status]}`);
  }
  if (data.blocker && data.blocker !== before.blocker && data.blocker !== 'none') {
    logAction(before.task_id, '批次阻塞标记',
      `${after.sample_type || '批次#' + id}：${BLOCKER_LABELS[data.blocker]}`);
  }
  if (data.status && data.status !== before.status) syncTaskStatus(before.task_id);
  return after;
}

/** 删除批次 */
function remove(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sample_runs WHERE id = ?').get(id);
  if (!row) return { deleted: 0 };
  db.prepare('DELETE FROM sample_runs WHERE id = ?').run(id);
  // 剩余批次重排
  const rest = db.prepare(
    'SELECT id FROM sample_runs WHERE task_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(row.task_id);
  rest.forEach((r, i) => db.prepare('UPDATE sample_runs SET sort_order = ? WHERE id = ?').run(i, r.id));
  logAction(row.task_id, '删除打样批次', `${row.sample_type || '批次#' + id} ${row.size || ''}`.trim());
  syncTaskStatus(row.task_id);
  return { deleted: 1 };
}

module.exports = {
  STATUS_LABELS, BLOCKER_LABELS,
  listByTask, create, update, remove, syncTaskStatus,
};
