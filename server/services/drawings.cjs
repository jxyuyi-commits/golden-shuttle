// 图纸资料 业务服务层：纯函数，HTTP路由与IPC handler共用
const { getDb } = require('../db.cjs');

const FIELDS = ['category', 'title', 'filename', 'url', 'note'];

/** 规范化输入字段 */
function sanitize(d) {
  const out = { sort_order: d.sort_order ?? 0 };
  for (const k of FIELDS) {
    out[k] = (d[k] ?? '').toString();
  }
  return out;
}

/**
 * 获取某打样单的图纸资料列表
 * @param {number|string} taskId
 * @returns {Array<object>}
 */
function listByTask(taskId) {
  return getDb().prepare(
    'SELECT * FROM drawings WHERE task_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(taskId);
}

/**
 * 新增图纸资料记录
 * @param {object} d - { task_id, ...fields }
 * @returns {number} 新行 id
 */
function create(d) {
  const s = sanitize(d);
  const info = getDb().prepare(`
    INSERT INTO drawings (task_id, category, title, filename, url, note, sort_order)
    VALUES (@task_id, @category, @title, @filename, @url, @note, @sort_order)
  `).run({ ...s, task_id: d.task_id });
  return info.lastInsertRowid;
}

/**
 * 更新图纸资料（PATCH 语义：只更新传入的字段，不覆盖其余字段）
 * @param {number|string} id
 * @param {object} d - 仅包含要更新的字段
 * @returns {{success: boolean}}
 */
function update(id, d) {
  const keys = FIELDS.filter(k => k in d && d[k] !== undefined);
  if (keys.length === 0) return { success: true };
  const params = {};
  for (const k of keys) {
    params[k] = (d[k] ?? '').toString();
  }
  const setParts = keys.map(k => `${k} = @${k}`).join(', ');
  const result = getDb().prepare(
    `UPDATE drawings SET ${setParts}, updated_at = CURRENT_TIMESTAMP WHERE id = @_id`
  ).run({ ...params, _id: id });
  return { success: result.changes > 0 };
}

/**
 * 删除图纸资料记录（物理文件保留在 uploads，避免误删共享资源）
 * @param {number|string} id
 * @returns {{success: boolean}}
 */
function remove(id) {
  const result = getDb().prepare('DELETE FROM drawings WHERE id = ?').run(id);
  return { success: result.changes > 0 };
}

module.exports = { listByTask, create, update, remove };
