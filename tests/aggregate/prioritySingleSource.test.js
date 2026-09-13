/**
 * G11 优先级单主：款级优先级唯一权威在 sample_runs.priority，款级值由后端按「批次最高档」投影
 * ------------------------------------------------------------------
 * 修复前（双写）：tasks.priority 与 sample_runs.priority 各存一份，看板走批次（取最高档）、
 *   列表/技术包导出走 tasks.priority（建单时快照）→ 一旦批次优先级被改，看板与导出不一致。
 * 修复后（G11）：tasks.priority 列随迁移 v21 物理删除；attachRuns 按「批次中取最高档 S>A>B>C，
 *   无批次回退 B」投影出 `t.priority`。看板（KanbanView.taskTopPriority，走批次）与导出
 *   （exportTasks.taskToRow，走 t.priority）共用同一口径 → 必然一致。
 *
 * 覆盖：
 *   ① 后端投影：各类批次组合（含 B/S 混档）→ 款级优先级 = 最高档；无批次 → 回退 B；
 *   ② 导出一致：exportTasks.taskToRow 的「优先级」列 == 后端投影值（单一来源）；
 *   ③ 看板一致：按 KanbanView.taskTopPriority 同规则复算 == 后端投影值；
 *   ④ tasks 再无 priority 列（权威唯一落在批次）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTempDb, cleanupTempDb } from '../helpers/dbHarness.js';
import { taskToRow } from '../../src/utils/exportTasks.js';

let env;
let tasks;

beforeAll(() => {
  env = createTempDb('gs-priority-single');
  tasks = env.require('../../server/services/tasks.cjs');
});

afterAll(() => {
  cleanupTempDb(env);
});

let seq = 0;
/** 建款 + 单 + 若干批次（批次优先级即权威数据），返回 taskId */
function makeTaskWithRuns(runPriorities) {
  const db = env.db;
  const styleId = db
    .prepare('INSERT INTO styles (style_no, title, category) VALUES (?, ?, ?)')
    .run(`PRIO-${++seq}`, '优先级单主测试款', '裙').lastInsertRowid;
  const taskId = db
    .prepare('INSERT INTO tasks (style_id, note) VALUES (?, ?)')
    .run(styleId, '优先级').lastInsertRowid;
  runPriorities.forEach((p, i) => {
    db.prepare('INSERT INTO sample_runs (task_id, priority, status, sort_order) VALUES (?, ?, ?, ?)')
      .run(taskId, p, 'waiting_material', i);
  });
  return taskId;
}

/** 与 KanbanView.taskTopPriority 同规则的独立复算（看板口径） */
const PRIO_RANK = { S: 3, A: 2, B: 1, C: 0 };
function kanbanTopPriority(task) {
  const ps = (task.runs || []).map((r) => r.priority).filter(Boolean);
  if (!ps.length) return task.priority || 'B';
  return ps.sort((a, b) => (PRIO_RANK[b] ?? 1) - (PRIO_RANK[a] ?? 1))[0];
}

/** 导出表「优先级」列索引（与 exportTasks.HEADERS / taskToRow 对齐） */
const PRIORITY_COL = 13;

describe('G11 优先级单主：后端投影 / 看板 / 导出三处一致', () => {
  it('后端投影：批次取最高档（B/S 混档 → S），无批次回退 B', () => {
    expect(tasks.get(makeTaskWithRuns(['B', 'S'])).priority).toBe('S');
    expect(tasks.get(makeTaskWithRuns(['S', 'B'])).priority).toBe('S');
    expect(tasks.get(makeTaskWithRuns(['A', 'C'])).priority).toBe('A');
    expect(tasks.get(makeTaskWithRuns(['C'])).priority).toBe('C');
    expect(tasks.get(makeTaskWithRuns([])).priority).toBe('B'); // 无批次回退
  });

  it('导出一致：taskToRow 的「优先级」列 == 后端投影值（单一来源，不再读死列）', () => {
    for (const runs of [['B', 'S'], ['C'], ['A', 'B'], []]) {
      const t = tasks.get(makeTaskWithRuns(runs));
      expect(taskToRow(t)[PRIORITY_COL]).toBe(t.priority);
    }
  });

  it('看板一致：KanbanView 同规则复算 == 后端投影值（看板分组/筛选与导出结果相同）', () => {
    for (const runs of [['B', 'S'], ['C'], ['A', 'C', 'S'], []]) {
      const t = tasks.get(makeTaskWithRuns(runs));
      expect(kanbanTopPriority(t)).toBe(t.priority);
    }
  });

  it('tasks 不再有 priority 列（权威唯一落在批次）', () => {
    const cols = env.db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
    expect(cols).not.toContain('priority');
  });
});
