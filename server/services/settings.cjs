// 系统设置(Settings) 业务服务层
const { getDb } = require('../db.cjs');

/**
 * 获取全部设置（值 JSON 反序列化）
 * @returns {object}
 */
function getAll() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const r of rows) {
    try { result[r.key] = JSON.parse(r.value); }
    catch { result[r.key] = r.value; }
  }
  return result;
}

/**
 * 写入单条设置（值 JSON 序列化）
 * @param {string} key
 * @param {*} value
 * @returns {{success: boolean}}
 */
function set(key, value) {
  if (!key) throw new Error('Missing key');
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
  return { success: true };
}

module.exports = { getAll, set };
