/**
 * 模块 2／5：状态聚合（款级 derived_status 由批次推导）回归（G9）
 * ------------------------------------------------------------------
 * 权威口径（REQ-027）：完成 = **全部批次已完成**；否则取「未完成批次中 sort_order 最大者」
 * （最新版次）的状态作为款级当前进度。看板列由该状态映射：
 *   not_started / waiting_material → todo；pattern_making / sample_making / pending_confirm → doing；done → done。
 *
 * 覆盖：无批次、全完成、各中间档位、最新版次优先（含 26AWW526「复版待配料」真实口径）、
 *      以及批 1 冒烟清单 #6「最新批次切已完成 → 款级自动同步」与全量重算幂等。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTempDb, cleanupTempDb } from '../helpers/dbHarness.js';

let env;
let sampleRuns;
let tasks;

beforeAll(() => {
  env = createTempDb('gs-aggregate');
  sampleRuns = env.require('../../server/services/sampleRuns.cjs');
  tasks = env.require('../../server/services/tasks.cjs');
});

afterAll(() => {
  cleanupTempDb(env);
});

let seq = 0;
/** 建一个款式 + 一张单据，返回 id */
function makeTask() {
  const db = env.db;
  const styleId = db
    .prepare('INSERT INTO styles (style_no, title, category) VALUES (?, ?, ?)')
    .run(`AGG-${++seq}`, '聚合测试款', '裙').lastInsertRowid;
  const taskId = db
    .prepare('INSERT INTO tasks (style_id, note) VALUES (?, ?)')
    .run(styleId, '聚合测试').lastInsertRowid;
  return { styleId, taskId };
}

/** 给某单加一个批次（直接落库，绕开业务层，便于构造精确状态） */
function addRun(taskId, status, sortOrder) {
  return env.db
    .prepare('INSERT INTO sample_runs (task_id, status, sort_order) VALUES (?, ?, ?)')
    .run(taskId, status, sortOrder).lastInsertRowid;
}

describe('模块 2：款级状态聚合', () => {
  it('无任何批次 → not_started / 看板 todo', () => {
    const { taskId } = makeTask();
    expect(sampleRuns.syncTaskStatus(taskId)).toBe('todo');
    const t = tasks.get(taskId);
    expect(t.derived_status).toBe('not_started');
    expect(t.derived_status_label).toBe('未开始');
    expect(t.status).toBe('todo');
  });

  it('全部批次已完成 → done / 看板 done', () => {
    const { taskId } = makeTask();
    addRun(taskId, 'done', 0);
    addRun(taskId, 'done', 1);
    expect(sampleRuns.syncTaskStatus(taskId)).toBe('done');
    const t = tasks.get(taskId);
    expect(t.derived_status).toBe('done');
    expect(t.derived_status_label).toBe('已完成');
    expect(t.status).toBe('done');
  });

  it('单个批次的各档位映射正确（waiting_material→todo，其余进行中→doing）', () => {
    const cases = [
      ['waiting_material', 'todo', 'waiting_material', '待配料'],
      ['pattern_making', 'doing', 'pattern_making', '打版中'],
      ['sample_making', 'doing', 'sample_making', '样衣中'],
      ['pending_confirm', 'doing', 'pending_confirm', '待确认'],
    ];
    for (const [runStatus, board, derived, label] of cases) {
      const { taskId } = makeTask();
      addRun(taskId, runStatus, 0);
      expect(sampleRuns.syncTaskStatus(taskId)).toBe(board);
      const t = tasks.get(taskId);
      expect(t.derived_status, `批次状态=${runStatus}`).toBe(derived);
      expect(t.derived_status_label).toBe(label);
      expect(t.status).toBe(board);
    }
  });

  it('最新版次优先：前批次已完成、最新批次待配料 → 款级待配料 / todo（26AWW526 口径）', () => {
    const { taskId } = makeTask();
    addRun(taskId, 'done', 0);
    addRun(taskId, 'waiting_material', 1);
    expect(sampleRuns.syncTaskStatus(taskId)).toBe('todo');
    const t = tasks.get(taskId);
    expect(t.derived_status).toBe('waiting_material');
    expect(t.derived_status_label).toBe('待配料');
  });

  it('最新版次优先：旧批次待配料、最新批次样衣中 → 款级样衣中 / doing', () => {
    const { taskId } = makeTask();
    addRun(taskId, 'waiting_material', 0);
    addRun(taskId, 'sample_making', 1);
    expect(sampleRuns.syncTaskStatus(taskId)).toBe('doing');
    expect(tasks.get(taskId).derived_status).toBe('sample_making');
  });

  it('完成判定只看「是否还有未完成」：最新批次已完成、旧批次样衣中 → 款级样衣中 / doing', () => {
    const { taskId } = makeTask();
    addRun(taskId, 'sample_making', 0);
    addRun(taskId, 'done', 1);
    expect(sampleRuns.syncTaskStatus(taskId)).toBe('doing');
    expect(tasks.get(taskId).derived_status).toBe('sample_making');
  });

  it('冒烟 #6：最新批次切「已完成」→ 款级看板状态自动同步（doing → todo → done）', () => {
    const { taskId } = makeTask();
    const run1 = addRun(taskId, 'waiting_material', 0);
    const run2 = addRun(taskId, 'sample_making', 1);

    // 初始：最新批次样衣中 → doing
    expect(sampleRuns.syncTaskStatus(taskId)).toBe('doing');
    expect(tasks.get(taskId).status).toBe('doing');

    // 把最新批次切到已完成 → 回落到旧批次（待配料）→ todo
    sampleRuns.update(run2, { status: 'done' });
    expect(tasks.get(taskId).status).toBe('todo');
    expect(tasks.get(taskId).derived_status).toBe('waiting_material');

    // 旧批次也完成 → 全部完成 → done
    sampleRuns.update(run1, { status: 'done' });
    expect(tasks.get(taskId).status).toBe('done');
    expect(tasks.get(taskId).derived_status).toBe('done');
  });

  it('批量重算 recalcAllTaskStatus：被污染的 tasks.status 会被按批次口径纠正', () => {
    const a = makeTask();
    const b = makeTask();
    addRun(a.taskId, 'sample_making', 0);
    addRun(b.taskId, 'done', 0);
    env.db.prepare("UPDATE tasks SET status = '??污染??'").run();

    const n = tasks.recalcAllTaskStatus();
    expect(n).toBeGreaterThanOrEqual(2);
    expect(tasks.get(a.taskId).status).toBe('doing');
    expect(tasks.get(b.taskId).status).toBe('done');
  });

  it('list() 为每张单附带批次与 derived_status（一次查询分组，非 N+1）', () => {
    const { taskId } = makeTask();
    addRun(taskId, 'pending_confirm', 0);
    sampleRuns.syncTaskStatus(taskId);
    const list = tasks.list();
    const found = list.find((t) => t.id === taskId);
    expect(found).toBeTruthy();
    expect(Array.isArray(found.runs)).toBe(true);
    expect(found.runs.length).toBe(1);
    expect(found.derived_status).toBe('pending_confirm');
    expect(found.top_run).toBeTruthy();
    expect(found.top_run.status).toBe('pending_confirm');
  });
});
