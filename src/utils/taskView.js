// src/utils/taskView.js —— 看板卡片/容器的共享纯函数（U18 两层层级重构）
//
// 背景：U18 把 KanbanView 的巨石卡片渲染抽出为独立 TaskCard（卡片层），KanbanView 退化为
// 容器层（分组/筛选/布局/滚动）。原先这些派生函数内联在 KanbanView 里，容器层（筛选/分组/列表）
// 与卡片层（单卡片渲染）都要用；若卡片层反向 import 容器层会造成循环依赖，故收敛到本模块作为
// **单一来源**（与 constants/terms.js 同理）。
//
// 本模块只含纯函数 + 常量，无 React/JSX 依赖，便于单测与复用。

// REQ-030 优先级 S/A/B/C 排序权重（S 最高）
export const PRIO_RANK = { S: 3, A: 2, B: 1, C: 0 };

/** 取任务的批次列表（兼容迁移前旧字段，无 runs 时用 task 顶层字段拼一条） */
export const taskRuns = (t) => {
  if (Array.isArray(t.runs) && t.runs.length) return t.runs;
  if (t.sample_type) return [{ sample_type: t.sample_type, size: t.size, sample_color: t.sample_color, sample_count: t.sample_count, priority: t.priority, status: '' }];
  return [];
};

/** 任务涉及的全部版次（去重去空） */
export const taskRunTypes = (t) => [...new Set(taskRuns(t).map((r) => r.sample_type).filter(Boolean))];

/**
 * 任务的最高优先级（批次中取最高，无批次回退顶层 priority）
 * G11 优先级单主：权威数据在 sample_runs.priority；后端 attachRuns 已按「批次最高档 S>A>B>C，
 * 无批次回退 B」投影出 `t.priority`。前端此处规则与之**完全一致**，故看板分组/筛选（走批次）与
 * 列表/技术包导出（走投影后的 t.priority）结果必然相同，不再出现「看板与导出优先级不一致」。
 */
export const taskTopPriority = (t) => {
  const ps = taskRuns(t).map((r) => r.priority).filter(Boolean);
  if (!ps.length) return t.priority || 'B'; // REQ-030 默认 B（后端同口径投影，非旧 tasks 列）
  return ps.sort((a, b) => (PRIO_RANK[b] ?? 1) - (PRIO_RANK[a] ?? 1))[0];
};

/**
 * REQ-027：款级分栏口径 = 后端 derived_status（最新未完成版次，sort_order 最大）实时推导，
 * 不再依赖可能过期的 task.status
 * done=全部批次已完成 / doing=最新版次打版中·样衣中·待审版 / todo=未开始·待安排·无批次
 */
export const derivedCol = (t) => {
  const d = t.derived_status;
  if (d === 'done') return 'done';
  if (d === 'pattern_making' || d === 'sample_making' || d === 'pending_confirm') return 'doing';
  return 'todo';
};

/**
 * 逾期判定（REQ-027 权威口径：交期基准 = 最新未完成版次预期完成时间）
 * 基准优先级：最新版次 top_run.expected_date → 该款全部批次中最早的预期 → 款级 expected_date（旧数据兜底）→ 无则 none
 * 完成判定（REQ-025）：款级 derived_status=done（全部批次已完成）→ 不算逾期
 * state: overdue(已逾期) / today(今日到期) / soon(3天内到期) / ok(正常) / none(无交期或已完结)
 */
export const getOverdueInfo = (task) => {
  if (task.status === 'done' || task.status === 'completed') return { state: 'none', days: 0 };
  if (task.derived_status === 'done') return { state: 'none', days: 0 };
  let dueStr = task.top_run?.expected_date || '';
  if (!dueStr && Array.isArray(task.runs) && task.runs.length) {
    const dates = task.runs.map((r) => r.expected_date).filter(Boolean).sort();
    dueStr = dates[0] || '';
  }
  if (!dueStr) dueStr = task.expected_date || '';
  if (!dueStr) return { state: 'none', days: 0, due: '' };
  const m = String(dueStr).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return { state: 'none', days: 0, due: dueStr };
  const due = new Date(+m[1], +m[2] - 1, +m[3]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - due) / 86400000);
  if (diff > 0) return { state: 'overdue', days: diff, due: dueStr };
  if (diff === 0) return { state: 'today', days: 0, due: dueStr };
  if (diff >= -3) return { state: 'soon', days: -diff, due: dueStr };
  return { state: 'ok', days: 0, due: dueStr };
};

/**
 * REQ-027 进度节点：从最新未完成版次（top_run）真实数据派生（与版次条同源 runs）
 * 配料=面料到库 / 跟版=任务开始 / 版师=纸样完成（负责人=款级版师）/ 样衣=实际完工（负责人=批次样衣工）/ 工艺=无对应批次字段
 */
export const buildRunNodes = (task) => {
  const top = task.top_run;
  const mk = (label, date, by) => ({ label, date: date || '', by: by || '', status: date ? 'done' : 'pending' });
  return [
    mk('配料', top?.fabric_date, ''),
    mk('跟版', top?.start_date, ''),
    mk('版师', top?.pattern_date, task.pattern_maker),
    mk('样衣', top?.finish_date, top?.sample_maker),
    mk('工艺', '', ''),
  ];
};
