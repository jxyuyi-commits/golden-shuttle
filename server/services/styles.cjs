// 款式(Styles) 业务服务层
const { getDb } = require('../db.cjs');

/**
 * 按款号查询款式
 * @param {string} styleNo
 * @returns {object|null}
 */
function findByNo(styleNo) {
  return getDb().prepare('SELECT * FROM styles WHERE style_no = ?').get(styleNo) || null;
}

/**
 * 获取全部款式（按创建时间倒序）
 * @returns {Array<object>}
 */
function listAll() {
  return getDb().prepare('SELECT * FROM styles ORDER BY created_at DESC').all();
}

module.exports = { findByNo, listAll };
