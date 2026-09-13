/**
 * 模块 4／5：tasks.update() 原子性基线（G9 —— 为 G12「update() 包事务」预置验收网）
 * ------------------------------------------------------------------
 * G12 的目标：把 `tasks.cjs#update()` 里「先改 styles、再改 tasks、再写操作日志、再存版本快照」
 * 的一串写操作包进一个事务，做到**中途失败整体回滚、不留脏数据**。
 *
 * 本文件先写「失败时不留脏数据」的测试作为**测试先于修复的基线**：
 *   ① 注入故障让 `UPDATE tasks ...` 抛错，断言 styles 与 tasks 都保持原值（原子性）；
 *   ② 断言版本快照步骤抛错时被 `try/catch` 兜住、不向调用方抛出、不残留脏版本记录（当前已成立）。
 *
 * ⚠️ 基线结论（详见交付报告）：① 当前实现**不满足**原子性——styles 已改而 tasks 未改，属部分写入。
 *    因此 ① 用 vitest 的 `it.fails`（预期失败）承载：它**真实执行**该故障场景、记录已知缺陷、
 *    且不污染整条回归网（G10–G15 仍可把 `npm test` 当绿闸门）。
 *    G12 修复后：把 `it.fails(...)` 改成 `it(...)`，该用例即转正为绿。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTempDb, cleanupTempDb } from '../helpers/dbHarness.js';

let env;
let tasks;

beforeAll(() => {
  env = createTempDb('gs-tasks-atomicity');
  tasks = env.require('../../server/services/tasks.cjs');
});

afterAll(() => {
  cleanupTempDb(env);
});

let seq = 0;
/** 造一个款式 + 一张单据（带初始标题与备注） */
function makeTask(title, note) {
  const db = env.db;
  const styleId = db
    .prepare('INSERT INTO styles (style_no, title, category) VALUES (?, ?, ?)')
    .run(`ATOMIC-${++seq}`, title, '裙').lastInsertRowid;
  const taskId = db
    .prepare('INSERT INTO tasks (style_id, note) VALUES (?, ?)')
    .run(styleId, note).lastInsertRowid;
  return { styleId, taskId };
}

/** 注入故障：让匹配 sqlIncludes 的 prepare 调用抛错，返回 restore() 用于还原 */
function injectPrepareFailure(sqlIncludes) {
  const db = env.db;
  const orig = db.prepare;
  db.prepare = function (sql, ...rest) {
    if (typeof sql === 'string' && sql.includes(sqlIncludes)) {
      throw new Error(`注入故障：命中「${sqlIncludes}」`);
    }
    return orig.call(this, sql, ...rest);
  };
  return () => { db.prepare = orig; };
}

describe('模块 4：tasks.update() 原子性基线', () => {
  it('不存在的 id：update() 返回 null，不产生任何写入', () => {
    const before = env.db.prepare('SELECT COUNT(*) AS c FROM operation_logs').get().c;
    expect(tasks.update(999999, { title: 'x', note: 'y' })).toBeNull();
    expect(env.db.prepare('SELECT COUNT(*) AS c FROM operation_logs').get().c).toBe(before);
  });

  // ── ① 已知缺陷基线：当前实现不原子（styles 已改、tasks 未改） ──
  it.fails('【G12 基线·已知缺陷】tasks 落库步骤抛错时，update() 应整体回滚（styles 不应留下部分写入）', () => {
    const { styleId, taskId } = makeTask('原题', '原备注');
    const restore = injectPrepareFailure('UPDATE tasks SET');
    try {
      let err = null;
      try {
        tasks.update(taskId, { title: '新题', note: '新备注' });
      } catch (e) {
        err = e;
      }
      // 现状：错误确实向上抛出（update 未吞异常）
      expect(err).toBeTruthy();

      const styleAfter = env.db.prepare('SELECT title FROM styles WHERE id = ?').get(styleId);
      const taskAfter = env.db.prepare('SELECT note FROM tasks WHERE id = ?').get(taskId);
      // 原子性要求：失败后两处都必须是原值。当前 styles 已被改成「新题」→ 本断言失败（这正是 G12 要修的）
      expect(styleAfter.title).toBe('原题');
      expect(taskAfter.note).toBe('原备注');
    } finally {
      restore();
    }
  });

  // ── ② 当前已成立的良好行为：版本快照失败被兜住，不影响主写入、不残留脏版本 ──
  it('版本快照（capture）步骤抛错时被兜住：update() 不抛、主字段照常落库、不残留版本记录', () => {
    const { styleId, taskId } = makeTask('快照题', '快照备注');
    // 让 versionSvc.capture 内部用到的 task_versions 写入失败
    const restore = injectPrepareFailure('INSERT INTO task_versions');
    try {
      let result = null;
      let err = null;
      try {
        result = tasks.update(taskId, { title: '快照题-改', note: '快照备注-改' });
      } catch (e) {
        err = e;
      }
      expect(err).toBeNull(); // capture 失败被 try/catch 兜住，不向调用方抛出
      expect(result).toBeTruthy();
      expect(result.taskUpdated).toBe(true);
      expect(result.styleUpdated).toBe(true);
    } finally {
      restore();
    }
    // 主写入已落库
    expect(env.db.prepare('SELECT title FROM styles WHERE id = ?').get(styleId).title).toBe('快照题-改');
    expect(env.db.prepare('SELECT note FROM tasks WHERE id = ?').get(taskId).note).toBe('快照备注-改');
    // 且没有残留半截版本记录
    expect(env.db.prepare('SELECT COUNT(*) AS c FROM task_versions WHERE task_id = ?').get(taskId).c).toBe(0);
  });

  it('正常路径：样式字段与任务字段分别更新，并各自返回更新标志', () => {
    const { styleId, taskId } = makeTask('正常题', '正常备注');
    const r = tasks.update(taskId, { title: '正常题-新', note: '正常备注-新' });
    expect(r).toMatchObject({ success: true, styleUpdated: true, taskUpdated: true });
    expect(env.db.prepare('SELECT title FROM styles WHERE id = ?').get(styleId).title).toBe('正常题-新');
    expect(env.db.prepare('SELECT note FROM tasks WHERE id = ?').get(taskId).note).toBe('正常备注-新');
  });
});
