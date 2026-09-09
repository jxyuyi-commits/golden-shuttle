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

/**
 * 人员改名（REQ-019）：事务内同步全站引用
 * 同步范围：settings.people（人员预设，含旧「设计师库」designers 兼容数组）
 *   + styles.designer（款式设计师）+ sample_runs.pattern_maker（批次版师）
 *   + sample_runs.sample_maker（批次样衣工）
 * 不回改：历史版本快照（task_versions）、操作日志（operation_logs）——历史记录保持当时状态
 * @param {string} oldName 旧姓名（须存在于人员预设）
 * @param {string} newName 新姓名（非空、不得与现有其它人员重名）
 * @returns {{success: boolean, renamed: boolean, styles: number, runs: number, message?: string}}
 */
function renamePerson(oldName, newName) {
  const db = getDb();
  const o = (oldName || '').trim();
  const n = (newName || '').trim();
  if (!o || !n) throw new Error('姓名为空');
  if (o === n) return { success: true, renamed: true, styles: 0, runs: 0, message: '姓名未变化' };

  const tx = db.transaction(() => {
    // 1. 人员预设改名（people 权威；兼容历史 designers 数组）
    const peopleRow = db.prepare("SELECT value FROM settings WHERE key = 'people'").get();
    let renamedInPreset = false;
    if (peopleRow) {
      const people = JSON.parse(peopleRow.value);
      if (Array.isArray(people) && people.length > 0) {
        const target = people.find(p => p.name === o);
        if (!target) throw new Error(`人员「${o}」不存在于预设`);
        if (people.some(p => p.name === n)) throw new Error(`人员「${n}」已存在`);
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run('people', JSON.stringify(people.map(p => p.name === o ? { ...p, name: n } : p)));
        renamedInPreset = true;
      }
    }
    if (!renamedInPreset) {
      const dsRow = db.prepare("SELECT value FROM settings WHERE key = 'designers'").get();
      if (dsRow) {
        const ds = JSON.parse(dsRow.value);
        if (Array.isArray(ds) && ds.includes(o) && !ds.includes(n)) {
          db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
            .run('designers', JSON.stringify(ds.map(x => x === o ? n : x)));
          renamedInPreset = true;
        }
      }
      if (!renamedInPreset) throw new Error(`人员「${o}」不存在于预设`);
    }

    // 2. 兼容旧「设计师库」designers 数组同步（people 存在时也保持数据一致，前端不读、仅残留治理）
    const dsRow = db.prepare("SELECT value FROM settings WHERE key = 'designers'").get();
    if (dsRow) {
      const ds = JSON.parse(dsRow.value);
      if (Array.isArray(ds) && ds.includes(o) && !ds.includes(n)) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run('designers', JSON.stringify(ds.map(x => x === o ? n : x)));
      }
    }

    // 3. 同步款式设计师
    const stylesRes = db.prepare('UPDATE styles SET designer = ? WHERE designer = ?').run(n, o);

    // 4. 同步批次版师 / 样衣工
    const pmRes = db.prepare('UPDATE sample_runs SET pattern_maker = ? WHERE pattern_maker = ?').run(n, o);
    const smRes = db.prepare('UPDATE sample_runs SET sample_maker = ? WHERE sample_maker = ?').run(n, o);

    return { styles: stylesRes.changes, runs: pmRes.changes + smRes.changes };
  });

  const { styles, runs } = tx();
  return { success: true, renamed: true, styles, runs };
}

module.exports = { getAll, set, renamePerson };
