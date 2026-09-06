// 系统设置(Settings) 业务服务层
const { getDb } = require('../db.cjs');

/**
 * 获取全部设置（值 JSON 反序列化）
 * 兼容迁移：历史「设计师库」(designers: string[]) → 人员预设(people: [{name, roles}]，角色=设计师)
 * 仅在读取层补齐，不写回库；下次保存 people 时自然持久化
 * @returns {object}
 */
function getAll() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const r of rows) {
    try { result[r.key] = JSON.parse(r.value); }
    catch { result[r.key] = r.value; }
  }
  if (!Array.isArray(result.people) && Array.isArray(result.designers)) {
    result.people = result.designers.map(name => ({ name, roles: ['设计师'] }));
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
