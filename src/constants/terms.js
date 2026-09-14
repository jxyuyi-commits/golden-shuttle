// src/constants/terms.js —— 全局术语 / 状态常量单一来源（U12）
// 合并 KanbanView.RUN_STATUS_META / SampleRunList.RUN_STATUS / DesignerDashboard.STATUS_META
// 三处重复的「版次批次状态」枚举，消除漂移；颜色统一引用 U8 语义令牌。

// 版次批次状态（与后端 sampleRuns.cjs 保持一致；颜色走 U8 令牌，三主题一致）
export const RUN_STATUS = {
  not_started:      { label: '未开始', color: 'var(--text-3)' },
  waiting_material: { label: '待安排', color: 'var(--text-2)' }, // REQ-030 改词
  pattern_making:   { label: '打版中', color: 'var(--accent)' },
  sample_making:    { label: '样衣中', color: 'var(--run-sample)' },
  pending_confirm:  { label: '待审版', color: 'var(--color-info)' }, // REQ-030 改词
  done:             { label: '已完成', color: 'var(--run-done)' },
};

// 数组形式（看板筛选 / 批次列表用，不含 not_started）
export const RUN_STATUS_LIST = [
  { key: 'waiting_material', label: '待安排', color: 'var(--text-2)' },
  { key: 'pattern_making', label: '打版中', color: 'var(--accent)' },
  { key: 'sample_making', label: '样衣中', color: 'var(--run-sample)' },
  { key: 'pending_confirm', label: '待审版', color: 'var(--color-info)' },
  { key: 'done', label: '已完成', color: 'var(--run-done)' },
];

// 批次状态推进优先级（数值越大越先进，用于找「最先进批次」）
export const RUN_STATUS_RANK = {
  waiting_material: 1, pattern_making: 2, sample_making: 3, pending_confirm: 4, done: 5,
};

// 状态枚举键顺序（含 not_started）
export const RUN_STATUS_ORDER = Object.keys(RUN_STATUS);

// 任务级状态（NewTaskModal 用；与 utils/techPackModel.STATUS_CN 区分）
export const TASK_STATUS_CN = { todo: '待处理', doing: '打版中', done: '已完结' };

// 其它术语常量（P1）
export const MEASUREMENT_PART = '部位';
export const BATCH_ENTITY = '版次批次'; // 批3 统一「版次 / 批次」叫法
export const ORDER_NO_LABEL = '版单号';
