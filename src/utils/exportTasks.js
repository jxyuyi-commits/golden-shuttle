// 打样单业务数据 → 导出表格行（业务层，基于通用引擎 exporter.js）
import { exportExcel, timestamp } from './exporter';

/** 进度节点状态中文（兼容 done / completed 两种取值） */
const NODE_STATUS_CN = { pending: '待开始', active: '进行中', completed: '已完成', done: '已完成' };

/** 看板状态中文 */
function statusCN(s) {
  if (s === 'done') return '已完结';
  if (s === 'doing') return '打版中';
  return '待处理';
}

/** 工作动态时间线文本：所有事件拼接（事件名 状态 日期） */
function timelineText(t) {
  const nodes = (t.progress_nodes || []).filter(n => n.label || n.date);
  if (!nodes.length) return '';
  return nodes.map(n => {
    const st = NODE_STATUS_CN[n.status] || n.status || '';
    const bits = [n.label || '', st, n.date || ''].filter(Boolean);
    const by = n.by ? `@${n.by}` : '';
    return bits.join(' ') + by;
  }).join('；');
}

const HEADERS = [
  '款号', '款式名称', '类别', '品牌', '设计师', '年度', '季节', '波段',
  '版单号', '版次', '样衣颜色', '尺码', '件数', '优先级', '审核状态', '看板状态',
  '工作动态',
  '面料到库日期', '任务开始日期', '预计完工日期', '实际完工日期',
  '款式说明/打样重点', '物料要求', '辅料要求', '工艺建议/注意事项', '审版意见/修改反馈'
];

/** 单个 task → 行（顺序与 HEADERS 对齐） */
export function taskToRow(t) {
  return [
    t.style_no || '', t.title || '', t.category || '', t.brand || '', t.designer || '',
    t.year || '', t.season || '', t.month || '',
    t.order_no || '', t.sample_type || '', t.sample_color || '',
    t.size || '', t.sample_count ?? '', t.priority || '中', t.audit_status || '待审核',
    statusCN(t.status),
    timelineText(t),
    t.fabric_date || '', t.start_date || '', t.expected_date || '', t.finish_date || '',
    t.note || '', t.fabric_req || '', t.trim_req || '', t.process_req || '', t.audit_comment || ''
  ];
}

/** tasks → 工作表 */
export function buildTaskSheet(tasks) {
  return {
    name: '打样单',
    rows: [HEADERS, ...(tasks || []).map(taskToRow)]
  };
}

/** 生成打样单列表文件名（供确认框预览/导出使用） */
export function getTaskListFileName() {
  return `打样单列表_${timestamp()}.xlsx`;
}

/** 一键导出打样单列表 Excel（返回文件名） */
export function exportTasksToExcel(tasks, { fileName } = {}) {
  const f = fileName || getTaskListFileName();
  exportExcel({
    fileName: f,
    sheets: [buildTaskSheet(tasks)]
  });
  return f;
}
