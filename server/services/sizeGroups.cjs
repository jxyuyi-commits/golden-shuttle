// 号型规格系列(Size Groups) 业务服务层
const { getDb } = require('../db.cjs');

/**
 * 获取全部号型组
 * @returns {Array<object>}
 */
function list() {
  return getDb().prepare('SELECT * FROM size_groups ORDER BY id ASC').all();
}

/**
 * 新建号型组
 * @param {{name: string, size_list: string, is_default?: number}} data
 * @returns {number} 新 id
 */
function create(data) {
  const { name, size_list, is_default } = data;
  if (!name || !size_list) throw new Error('Missing fields');
  const info = getDb().prepare('INSERT INTO size_groups (name, size_list, is_default) VALUES (?, ?, ?)')
    .run(name, size_list, is_default || 0);
  return info.lastInsertRowid;
}

/**
 * 更新号型组
 * @param {number|string} id
 * @param {{name: string, size_list: string, is_default?: number}} data
 * @returns {{success: boolean}}
 */
function update(id, data) {
  const { name, size_list, is_default } = data;
  getDb().prepare('UPDATE size_groups SET name = ?, size_list = ?, is_default = ? WHERE id = ?')
    .run(name, size_list, is_default || 0, id);
  return { success: true };
}

/**
 * 删除号型组
 * @param {number|string} id
 * @returns {{success: boolean}}
 */
function remove(id) {
  getDb().prepare('DELETE FROM size_groups WHERE id = ?').run(id);
  return { success: true };
}

module.exports = { list, create, update, remove };
