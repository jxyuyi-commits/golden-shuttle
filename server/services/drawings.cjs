// 图纸资料 业务服务层：纯函数，HTTP路由与IPC handler共用
// 版本管控：参考资料(reference) 防冗余（同内容去重）；工作成果(output) 可追溯（同名迭代自动升版本）
const { getDb } = require('../db.cjs');

const FIELDS = ['category', 'title', 'filename', 'url', 'note'];

/** 参考资料分类（防冗余，不建版本） */
const REFERENCE_CATEGORIES = ['参考图', '成衣图'];

/** 根据分类推断资料大类：reference(参考资料) / output(工作成果) */
function categoryKind(category) {
  return REFERENCE_CATEGORIES.includes(category) ? 'reference' : 'output';
}

/** 规范化输入字段 */
function sanitize(d) {
  const out = { sort_order: d.sort_order ?? 0 };
  for (const k of FIELDS) {
    out[k] = (d[k] ?? '').toString();
  }
  return out;
}

/**
 * 获取某打样单的图纸资料列表（含全部版本记录，前端按 group_id 聚合展示）
 */
function listByTask(taskId) {
  return getDb().prepare(
    'SELECT * FROM drawings WHERE task_id = ? ORDER BY group_id ASC, version ASC'
  ).all(taskId);
}

/**
 * 获取某版本组内的全部版本（按版本号升序）
 * @param {number|string} groupId
 */
function listGroup(groupId) {
  return getDb().prepare(
    'SELECT * FROM drawings WHERE group_id = ? ORDER BY version ASC'
  ).all(groupId);
}

/**
 * 智能新增图纸资料：
 * - 同 task + 同 hash（内容重复）→ 返回 conflict:duplicate（除非 force）
 * - 工作成果(output) + 同名文件 → 自动归组升版本（version+1，保留旧版）
 * - 参考资料(reference) + 同名文件 → 各自独立（仅内容去重）
 * @param {object} d - { task_id, category, title, filename, url, hash, note, force? }
 * @returns {{id, version, groupId, isNewVersion, previousId}|{conflict:'duplicate', existing}}
 */
function create(d) {
  const db = getDb();
  const kind = categoryKind(d.category);
  const hash = (d.hash || '').toString().trim().toLowerCase();

  // 1) 内容去重：同 task + 同 hash（仅 hash 非空时校验）
  if (hash && !d.force) {
    const dup = db.prepare(
      "SELECT * FROM drawings WHERE task_id = ? AND file_hash = ? AND file_hash <> ''"
    ).get(d.task_id, hash);
    if (dup) {
      return {
        conflict: 'duplicate',
        existing: {
          id: dup.id, version: dup.version, kind: dup.kind,
          category: dup.category, title: dup.title, filename: dup.filename,
        },
      };
    }
  }

  // 2) 版本归组：仅工作成果(output)，且未强制新建时
  let groupId = null;
  let version = 1;
  let base = null;
  if (kind === 'output' && !d.force) {
    base = db.prepare(
      'SELECT * FROM drawings WHERE task_id = ? AND kind = ? AND filename = ? ORDER BY version DESC'
    ).get(d.task_id, kind, (d.filename || '').toString());
    if (base) {
      groupId = base.group_id || base.id;
      version = base.version + 1;
    }
  }

  // 3) 插入
  const s = sanitize(d);
  const info = db.prepare(`
    INSERT INTO drawings (task_id, category, kind, title, filename, url, file_hash, note, version, group_id, sort_order)
    VALUES (@task_id, @category, @kind, @title, @filename, @url, @hash, @note, @version, @group_id, @sort_order)
  `).run({
    ...s,
    task_id: d.task_id,
    kind,
    hash,
    version,
    group_id: groupId || null,
  });

  const id = info.lastInsertRowid;
  if (!groupId) {
    // 新版本组：group_id = 自身 id（首版）
    db.prepare('UPDATE drawings SET group_id = ? WHERE id = ?').run(id, id);
    groupId = id;
  }

  return {
    id,
    version,
    groupId,
    isNewVersion: version > 1,
    previousId: base ? base.id : null,
  };
}

/**
 * 更新图纸资料（PATCH 语义：只更新传入的字段）
 */
function update(id, d) {
  const db = getDb();
  const keys = FIELDS.filter(k => k in d && d[k] !== undefined);
  if (keys.length === 0) return { success: true };
  const params = {};
  for (const k of keys) {
    params[k] = (d[k] ?? '').toString();
  }
  const setParts = keys.map(k => `${k} = @${k}`).join(', ');
  const result = db.prepare(
    `UPDATE drawings SET ${setParts}, updated_at = CURRENT_TIMESTAMP WHERE id = @_id`
  ).run({ ...params, _id: id });
  return { success: result.changes > 0 };
}

/**
 * 删除单个版本记录（物理文件保留在 uploads，避免误删共享资源）
 */
function remove(id) {
  const result = getDb().prepare('DELETE FROM drawings WHERE id = ?').run(id);
  return { success: result.changes > 0 };
}

/**
 * 删除整个版本组（全部版本记录）
 */
function removeGroup(groupId) {
  const result = getDb().prepare('DELETE FROM drawings WHERE group_id = ?').run(groupId);
  return { success: result.changes > 0 };
}

module.exports = {
  listByTask, listGroup, create, update, remove, removeGroup, categoryKind,
};
