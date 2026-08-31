// BOM 物料清单 业务服务层：纯函数，HTTP路由与IPC handler共用
const { getDb } = require('../db.cjs');

const FIELDS = ['category', 'name', 'spec', 'color', 'unit', 'usage', 'supplier', 'price', 'note'];

/** 规范化输入字段 */
function sanitize(b) {
  const out = { sort_order: b.sort_order ?? 0 };
  for (const k of FIELDS) {
    if (k === 'usage' || k === 'price') {
      out[k] = parseFloat(b[k]) || 0;
    } else {
      out[k] = (b[k] ?? '').toString();
    }
  }
  return out;
}

/**
 * 获取某打样单的 BOM 列表
 * @param {number|string} taskId
 * @returns {Array<object>}
 */
function listByTask(taskId) {
  return getDb().prepare(
    'SELECT * FROM bom_items WHERE task_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(taskId);
}

/**
 * 新增 BOM 行
 * @param {object} b - { task_id, ...fields }
 * @returns {number} 新行 id
 */
function create(b) {
  const s = sanitize(b);
  const info = getDb().prepare(`
    INSERT INTO bom_items (task_id, category, name, spec, color, unit, usage, supplier, price, note, sort_order)
    VALUES (@task_id, @category, @name, @spec, @color, @unit, @usage, @supplier, @price, @note, @sort_order)
  `).run({ ...s, task_id: b.task_id });
  return info.lastInsertRowid;
}

/**
 * 更新 BOM 行（PATCH 语义：只更新传入的字段，不覆盖其余字段）
 * @param {number|string} id
 * @param {object} b - 仅包含要更新的字段
 * @returns {{success: boolean}}
 */
function update(id, b) {
  const keys = FIELDS.filter(k => k in b && b[k] !== undefined);
  if (keys.length === 0) return { success: true };
  const params = {};
  for (const k of keys) {
    if (k === 'usage' || k === 'price') {
      params[k] = parseFloat(b[k]) || 0;
    } else {
      params[k] = (b[k] ?? '').toString();
    }
  }
  const setParts = keys.map(k => `${k} = @${k}`).join(', ');
  const result = getDb().prepare(
    `UPDATE bom_items SET ${setParts}, updated_at = CURRENT_TIMESTAMP WHERE id = @_id`
  ).run({ ...params, _id: id });
  return { success: result.changes > 0 };
}

/**
 * 删除 BOM 行
 * @param {number|string} id
 * @returns {{success: boolean}}
 */
function remove(id) {
  const result = getDb().prepare('DELETE FROM bom_items WHERE id = ?').run(id);
  return { success: result.changes > 0 };
}

/**
 * 整体替换某打样单的 BOM（用于前端整表保存）
 * @param {number|string} taskId
 * @param {Array<object>} items
 * @returns {{count: number}}
 */
function replaceAll(taskId, items) {
  const db = getDb();
  const tx = db.transaction((taskId, items) => {
    db.prepare('DELETE FROM bom_items WHERE task_id = ?').run(taskId);
    const ins = db.prepare(`
      INSERT INTO bom_items (task_id, category, name, spec, color, unit, usage, supplier, price, note, sort_order)
      VALUES (@task_id, @category, @name, @spec, @color, @unit, @usage, @supplier, @price, @note, @sort_order)
    `);
    for (const item of items || []) {
      ins.run({ ...sanitize(item), task_id: taskId });
    }
  });
  tx(taskId, items);
  return { count: (items || []).length };
}

module.exports = { listByTask, create, update, remove, replaceAll };
