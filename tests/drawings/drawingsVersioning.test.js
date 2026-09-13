/**
 * 模块 5／5：drawings 去重与版本管控回归（G9）
 * ------------------------------------------------------------------
 * 规则（v8 图纸资料版本管控）：
 *   · 参考资料(reference：参考图/成衣图) → 防冗余：同 task + 同内容(hash) 判为重复（除非 force），不建版本；
 *   · 工作成果(output：其余分类) → 可追溯：同 task + 同 kind + 同名文件 自动归组、版本号 +1，保留旧版；
 *   · 去重优先于升版：同 task + 同 hash（不分大类）一律先判重复。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTempDb, cleanupTempDb } from '../helpers/dbHarness.js';

let env;
let drawings;

beforeAll(() => {
  env = createTempDb('gs-drawings');
  drawings = env.require('../../server/services/drawings.cjs');
});

afterAll(() => {
  cleanupTempDb(env);
});

let seq = 0;
/** 建一张单据，返回 task_id（drawings.task_id 有外键） */
function makeTask() {
  const db = env.db;
  const styleId = db
    .prepare('INSERT INTO styles (style_no, title) VALUES (?, ?)')
    .run(`DRW-${++seq}`, '图纸测试款').lastInsertRowid;
  return db
    .prepare('INSERT INTO tasks (style_id, note) VALUES (?, ?)')
    .run(styleId, '图纸测试').lastInsertRowid;
}

/** 便捷新增 */
function add(taskId, d) {
  return drawings.create({ task_id: taskId, ...d });
}

describe('模块 5：drawings 分类与去重', () => {
  it('categoryKind：参考图/成衣图 → reference，其余 → output', () => {
    expect(drawings.categoryKind('参考图')).toBe('reference');
    expect(drawings.categoryKind('成衣图')).toBe('reference');
    expect(drawings.categoryKind('设计稿')).toBe('output');
    expect(drawings.categoryKind('纸样')).toBe('output');
    expect(drawings.categoryKind('唛架图')).toBe('output');
    expect(drawings.categoryKind('')).toBe('output');
  });

  it('参考资料：同 task + 同内容(hash) 判重复，返回既有记录且不新增行', () => {
    const taskId = makeTask();
    const first = add(taskId, { category: '参考图', filename: 'ref.png', url: '/uploads/a.png', hash: 'HASH-A' });
    expect(first.isNewVersion).toBe(false);
    expect(first.version).toBe(1);

    const dup = add(taskId, { category: '成衣图', filename: 'ref-copy.png', url: '/uploads/b.png', hash: 'hash-a' }); // 大小写应归一
    expect(dup.conflict).toBe('duplicate');
    expect(dup.existing.id).toBe(first.id);

    const rows = env.db.prepare('SELECT COUNT(*) AS c FROM drawings WHERE task_id = ?').get(taskId).c;
    expect(rows).toBe(1); // 未新增
  });

  it('force=true 时跳过去重，允许同内容再入库', () => {
    const taskId = makeTask();
    const first = add(taskId, { category: '参考图', filename: 'r.png', hash: 'SAME' });
    const forced = add(taskId, { category: '参考图', filename: 'r2.png', hash: 'SAME', force: true });
    expect(forced.conflict).toBeUndefined();
    expect(forced.id).not.toBe(first.id);
    expect(env.db.prepare('SELECT COUNT(*) AS c FROM drawings WHERE task_id = ?').get(taskId).c).toBe(2);
  });

  it('参考资料同名不同内容：不升版、各自独立成组（version 恒为 1）', () => {
    const taskId = makeTask();
    const a = add(taskId, { category: '参考图', filename: 'same.png', hash: 'R1' });
    const b = add(taskId, { category: '参考图', filename: 'same.png', hash: 'R2' });
    expect(a.version).toBe(1);
    expect(b.version).toBe(1);
    expect(b.isNewVersion).toBe(false);
    expect(b.previousId).toBeNull();
    expect(a.groupId).not.toBe(b.groupId); // 不归组
  });
});

describe('模块 5：工作成果同名迭代自动升版', () => {
  it('同名工作成果（不同内容）自动归组、版本号递增、保留旧版', () => {
    const taskId = makeTask();
    const v1 = add(taskId, { category: '设计稿', filename: 'draft.pdf', url: '/uploads/d1.pdf', hash: 'D1' });
    expect(v1.version).toBe(1);
    expect(v1.isNewVersion).toBe(false);
    expect(v1.groupId).toBe(v1.id); // 首版组号 = 自身 id

    const v2 = add(taskId, { category: '设计稿', filename: 'draft.pdf', url: '/uploads/d2.pdf', hash: 'D2' });
    expect(v2.version).toBe(2);
    expect(v2.isNewVersion).toBe(true);
    expect(v2.previousId).toBe(v1.id);
    expect(v2.groupId).toBe(v1.groupId); // 同组

    const v3 = add(taskId, { category: '设计稿', filename: 'draft.pdf', url: '/uploads/d3.pdf', hash: 'D3' });
    expect(v3.version).toBe(3);
    expect(v3.groupId).toBe(v1.groupId);

    // listGroup 按版本升序，完整保留 3 版
    const group = drawings.listGroup(v1.groupId);
    expect(group.map((r) => r.version)).toEqual([1, 2, 3]);
    // 旧版仍在（可追溯）
    expect(group.map((r) => r.url)).toEqual(['/uploads/d1.pdf', '/uploads/d2.pdf', '/uploads/d3.pdf']);
  });

  it('去重优先于升版：工作成果同内容(hash)判重复，不静默升版', () => {
    const taskId = makeTask();
    const v1 = add(taskId, { category: '设计稿', filename: 'x.pdf', hash: 'DUP' });
    const again = add(taskId, { category: '设计稿', filename: 'x.pdf', hash: 'DUP' });
    expect(again.conflict).toBe('duplicate');
    expect(again.existing.id).toBe(v1.id);
    expect(drawings.listGroup(v1.groupId).length).toBe(1);
  });

  it('hash 为空时不做内容去重（两行同名参考资料均入库）', () => {
    const taskId = makeTask();
    const a = add(taskId, { category: '参考图', filename: 'nohash.png' });
    const b = add(taskId, { category: '参考图', filename: 'nohash.png' });
    expect(a.conflict).toBeUndefined();
    expect(b.conflict).toBeUndefined();
    expect(a.id).not.toBe(b.id);
  });

  it('去重与升版按 task 隔离：不同单据上的同内容互不影响', () => {
    const t1 = makeTask();
    const t2 = makeTask();
    const a = add(t1, { category: '参考图', filename: 's.png', hash: 'CROSS' });
    const b = add(t2, { category: '参考图', filename: 's.png', hash: 'CROSS' });
    expect(a.conflict).toBeUndefined();
    expect(b.conflict).toBeUndefined();
    expect(a.id).not.toBe(b.id);
  });

  it('删除整组：removeGroup 清掉该组全部版本', () => {
    const taskId = makeTask();
    const v1 = add(taskId, { category: '纸样', filename: 'p.pdf', hash: 'P1' });
    add(taskId, { category: '纸样', filename: 'p.pdf', hash: 'P2' });
    expect(drawings.listGroup(v1.groupId).length).toBe(2);
    const r = drawings.removeGroup(v1.groupId);
    expect(r.success).toBe(true);
    expect(drawings.listGroup(v1.groupId).length).toBe(0);
  });
});
