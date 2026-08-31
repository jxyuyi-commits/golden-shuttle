// 尺寸部位预设(Measurement Templates) 业务服务层
const { getDb } = require('../db.cjs');

/**
 * 获取尺寸部位预设（可按品类过滤）
 * @param {string} [category] - 品类名
 * @returns {Array<object>}
 */
function list(category) {
  let sql = 'SELECT * FROM measurement_templates';
  const params = [];
  if (category) {
    sql += ' WHERE category = ?';
    params.push(category);
  }
  sql += ' ORDER BY sort_order ASC, id ASC';
  return getDb().prepare(sql).all(...params);
}

/**
 * 新建或更新尺寸部位预设（带 id 则更新）
 * @param {object} b - {id?, category, code, name, method, tolerance, grading_rule, sort_order, is_required}
 * @returns {{success: boolean, id: number}}
 */
function upsert(b) {
  const db = getDb();
  if (b.id) {
    db.prepare(`
      UPDATE measurement_templates
      SET category=@category, code=@code, name=@name, method=@method,
          tolerance=@tolerance, grading_rule=@grading_rule, sort_order=@sort_order,
          is_required=@is_required
      WHERE id=@id
    `).run({ ...b, is_required: b.is_required ? 1 : 0 });
    return { success: true, id: b.id };
  }
  const payload = {
    category: b.category || '未分类',
    code: b.code || '',
    name: b.name || '',
    method: b.method || '',
    tolerance: b.tolerance || '',
    grading_rule: b.grading_rule || '',
    sort_order: parseInt(b.sort_order) || 0,
    is_required: b.is_required ? 1 : 0
  };
  const info = db.prepare(`
    INSERT INTO measurement_templates (category, code, name, method, tolerance, grading_rule, sort_order, is_required)
    VALUES (@category, @code, @name, @method, @tolerance, @grading_rule, @sort_order, @is_required)
  `).run(payload);
  return { success: true, id: info.lastInsertRowid };
}

/**
 * 删除尺寸部位预设
 * @param {number|string} id
 * @returns {{success: boolean}}
 */
function remove(id) {
  getDb().prepare('DELETE FROM measurement_templates WHERE id = ?').run(id);
  return { success: true };
}

module.exports = { list, upsert, remove };
