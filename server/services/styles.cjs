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

/** 款级可编辑字段白名单（REQ-004 ①：款式基本信息独立编辑，款级权威） */
const STYLE_EDIT_KEYS = ['title', 'category', 'brand', 'designer', 'year', 'season', 'month', 'pdf_url'];

/**
 * 更新款式基础信息（款级共享，同款所有打样单即时生效）
 * @param {number|string} id
 * @param {object} b - 请求体（白名单字段）
 * @returns {object|null} 更新后的款式行
 */
function update(id, b) {
  const db = getDb();
  const exists = db.prepare('SELECT id FROM styles WHERE id = ?').get(id);
  if (!exists) return null;
  const updates = {};
  for (const k of STYLE_EDIT_KEYS) {
    if (k in b) updates[k] = b[k] ?? '';
  }
  if (Object.keys(updates).length) {
    const setParts = [...Object.keys(updates).map(k => `${k} = @${k}`), "updated_at = CURRENT_TIMESTAMP"].join(', ');
    db.prepare(`UPDATE styles SET ${setParts} WHERE id = @_id`).run({ ...updates, _id: id });
  }
  return db.prepare('SELECT * FROM styles WHERE id = ?').get(id) || null;
}

module.exports = { findByNo, listAll, update };
