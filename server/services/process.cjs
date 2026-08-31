// 工艺指示 业务服务层：纯函数，HTTP路由与IPC handler共用
const { getDb } = require('../db.cjs');

const FIELDS = ['section', 'name', 'requirement', 'standard', 'note'];

/** 规范化输入字段 */
function sanitize(b) {
  const out = { sort_order: b.sort_order ?? 0 };
  for (const k of FIELDS) {
    out[k] = (b[k] ?? '').toString();
  }
  return out;
}

/**
 * 获取某打样单的工艺指示列表
 * @param {number|string} taskId
 * @returns {Array<object>}
 */
function listByTask(taskId) {
  return getDb().prepare(
    'SELECT * FROM process_items WHERE task_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(taskId);
}

/**
 * 新增工艺指示行
 * @param {object} b - { task_id, ...fields }
 * @returns {number} 新行 id
 */
function create(b) {
  const s = sanitize(b);
  const info = getDb().prepare(`
    INSERT INTO process_items (task_id, section, name, requirement, standard, note, sort_order)
    VALUES (@task_id, @section, @name, @requirement, @standard, @note, @sort_order)
  `).run({ ...s, task_id: b.task_id });
  return info.lastInsertRowid;
}

/**
 * 更新工艺指示行（PATCH 语义：只更新传入的字段，不覆盖其余字段）
 * @param {number|string} id
 * @param {object} b - 仅包含要更新的字段
 * @returns {{success: boolean}}
 */
function update(id, b) {
  const keys = FIELDS.filter(k => k in b && b[k] !== undefined);
  if (keys.length === 0) return { success: true };
  const params = {};
  for (const k of keys) {
    params[k] = (b[k] ?? '').toString();
  }
  const setParts = keys.map(k => `${k} = @${k}`).join(', ');
  const result = getDb().prepare(
    `UPDATE process_items SET ${setParts}, updated_at = CURRENT_TIMESTAMP WHERE id = @_id`
  ).run({ ...params, _id: id });
  return { success: result.changes > 0 };
}

/**
 * 删除工艺指示行
 * @param {number|string} id
 * @returns {{success: boolean}}
 */
function remove(id) {
  const result = getDb().prepare('DELETE FROM process_items WHERE id = ?').run(id);
  return { success: result.changes > 0 };
}

/**
 * 整体替换某打样单的工艺指示
 * @param {number|string} taskId
 * @param {Array<object>} items
 * @returns {{count: number}}
 */
function replaceAll(taskId, items) {
  const db = getDb();
  const tx = db.transaction((taskId, items) => {
    db.prepare('DELETE FROM process_items WHERE task_id = ?').run(taskId);
    const ins = db.prepare(`
      INSERT INTO process_items (task_id, section, name, requirement, standard, note, sort_order)
      VALUES (@task_id, @section, @name, @requirement, @standard, @note, @sort_order)
    `);
    for (const item of items || []) {
      ins.run({ ...sanitize(item), task_id: taskId });
    }
  });
  tx(taskId, items);
  return { count: (items || []).length };
}

module.exports = { listByTask, create, update, remove, replaceAll };
