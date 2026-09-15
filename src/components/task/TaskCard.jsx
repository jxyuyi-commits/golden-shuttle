import React from 'react';
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import PdfThumb from '../common/PdfThumb';
import { keyboardActivate } from '../../hooks/useKeyboardActivate';
import { RUN_STATUS } from '../../constants/terms';
import {
  taskRuns, taskTopPriority, derivedCol, getOverdueInfo, buildRunNodes,
} from '../../utils/taskView';

/**
 * U18/U19 卡片层：单张看板卡片渲染（容器层 KanbanView 只负责分组/筛选/布局/滚动）。
 *
 * 两层层级：
 * - 主信息层（常驻，always visible）：设计稿缩略图 + 设计师徽标 / 款号 / 款名 / 优先级 /
 *   款级状态 / 类别 / 批次数量 / 审核 / 进度节点（配料·跟版·版师·样衣·工艺）。一眼可读。
 * - 次级详情层（按需呈现）：款号·品牌·时段·版单·批次明细——默认隐藏，hover / 键盘聚焦时以
 *   浮层展开（`position:absolute`，**不占布局、无位移抖动**），鼠标移开即收起。
 *
 * 信息零丢失：主层 ∪ 次层 = 迁移前卡片全集；交互（点击/Enter/Space 进详情、设计师徽标、
 * 点击缩略图放大、逾期徽标）全部保留。
 *
 * U19：整个组件用 React.memo 包裹；调用方传入的 onTaskClick 必须 useCallback 稳定引用，
 * 否则 memo 失效。卡片在 tasks 列表未变时零重渲染。
 *
 * @param {{ task: object, onTaskClick: (task: object) => void }} props
 */

/** 进度节点图标（按状态着色；done/completed 兼容两种取值） */
const getNodeIcon = (status) => {
  if (status === 'done' || status === 'completed') return <CheckCircle2 size={14} color="var(--run-done)" />;
  if (status === 'active') return <AlertCircle size={14} color="var(--accent)" />;
  return <Circle size={14} color="var(--text-4)" />;
};

/** 优先级值 → 着色类（S 红 / A 橙 / 其余品牌色） */
const prioClass = (p) => `prio-${p === 'S' ? 'high' : p === 'A' ? 'mid' : 'low'}`;

/** 款级状态（派生列）→ 圆点色 */
const statusDotColor = (col) => (col === 'done' ? 'var(--run-done)' : col === 'doing' ? 'var(--accent)' : 'var(--text-2)');

/** 款级状态（派生列）→ 中文（与列表视图口径一致） */
const statusText = (col) => (col === 'done' ? '已完结' : col === 'doing' ? '打版中' : '待处理');

const TaskCard = ({ task, onTaskClick }) => {
  const ov = getOverdueInfo(task);
  const prio = taskTopPriority(task);
  const dcol = derivedCol(task);
  const runs = taskRuns(task);
  const nodes = buildRunNodes(task);

  // 批次明细（次级层展示，最多 3 条 + 折叠计数）
  const shownRuns = runs.slice(0, 3);
  const hiddenRuns = runs.length - shownRuns.length;

  return (
    <div
      className="card glass bento-card"
      role="button"
      tabIndex={0}
      aria-label={`打开打样单：${task.style_no || ''} ${task.title || '未命名款式'}`}
      onClick={() => onTaskClick(task)}
      onKeyDown={keyboardActivate(() => onTaskClick(task))}
      style={{ position: 'relative', ...(ov.state === 'overdue' ? { borderColor: 'rgba(239,68,68,0.55)' } : {}) }}
    >
      {/* ── 主信息层（常驻）── */}
      <div className="bento-upper">
        <div className="bento-box bento-left">
          <div className="bento-img-wrap">
            <PdfThumb pdfUrl={task.pdf_url} />
            <div className="bento-badge">👤 {task.designer || '未分配'}</div>
          </div>
        </div>
        <div className="bento-right-col">
          <div className="bento-box bento-tr">
            {/* U22 补修：逾期/到期徽标由卡片级移入 .bento-tr，并作为**第一个**子元素。
                桌面：徽标仍 position:absolute，且 .bento-tr 无 position → 定位祖先仍是 .bento-card，
                脱离文档流 → 1440 零视觉漂移（徽标坐标与基线逐像素一致）。
                ≤1366：媒体查询把 .bento-tr 改列方向，徽标 static 独占一行、款号整行可用（修截断）。 */}
            {ov.state === 'overdue' && (
              <div className="bento-overdue-badge" title={`期望交期 ${ov.due}（最新版次），已逾期`}>⚠ 逾期 {ov.days} 天</div>
            )}
            {ov.state === 'today' && (
              <div className="bento-overdue-badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }} title="今日为期望交期（最新版次）">今日到期</div>
            )}
            {ov.state === 'soon' && (
              <div className="bento-overdue-badge" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }} title={`期望交期 ${ov.due}（最新版次）`}>{ov.days} 天后到期</div>
            )}
            <span className="bento-style-no">{task.style_no || '—'}</span>
          </div>

          <div className="bento-primary">
            <div className="bento-title-main" title={task.title}>{task.title || '未命名款式'}</div>
            <div className="bento-meta-line">
              <em className={prioClass(prio)} title={`优先级 ${prio}（批次最高档）`}>{prio}</em>
              <span className="bento-status" title={`款级状态：${statusText(dcol)}`}>
                <span className="bento-status-dot" style={{ background: statusDotColor(dcol) }} />
                {statusText(dcol)}
              </span>
              <span className="bento-chipline" title={task.category}>类别 {task.category || '—'}</span>
              <span className="bento-chipline" title="该款下的打样批次数量">{runs.length ? `${runs.length} 个版次` : '未建批次'}</span>
              <span className={`bento-chipline audit-${task.audit_status === '已通过' ? 'pass' : 'wait'}`} title={`审核：${task.audit_status || '待审核'}`}>审核 {task.audit_status || '待审核'}</span>
            </div>
          </div>

          <div className="bento-nodes">
            {nodes.map((n, i) => (
              <div key={i} className="bento-node-cell" title={`${n.label}${n.by ? ' · 负责人:' + n.by : ''}${n.date ? '' : ' · 未填'}`}>
                {getNodeIcon(n.status)}
                <span className="bento-node-label">{n.label}</span>
                <span className="bento-node-date">{n.date || '--'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 次级详情层（按需呈现：hover / 聚焦浮层，不占布局）──
          不设 aria-hidden：静止态由 visibility:hidden 退出无障碍树，卡片获得焦点时（:focus-within）
          浮层可见，键盘/读屏用户同样可读到次级信息 */}
      <div className="bento-detail">
        <div className="bento-detail-head">款式详情</div>
        <div className="bento-row" title={task.style_no}><span>款号：</span><em>{task.style_no || '—'}</em></div>
        <div className="bento-row" title={task.brand}><span>品牌：</span><em>{task.brand || '—'}</em></div>
        <div className="bento-row" title={[task.year, task.season, task.month].filter(Boolean).join(' ')}><span>时段：</span><em>{[task.year, task.season, task.month].filter(Boolean).join(' ') || '—'}</em></div>
        <div className="bento-row" title={task.order_no}><span>版单：</span><em>{task.order_no || '—'}</em></div>
        <div className="bento-row"><span>类别：</span><em>{task.category || '—'}</em></div>
        <div className="bento-row" title="打样批次明细">
          <span>批次：</span>
          {runs.length === 0 ? (
            <em>未建批次</em>
          ) : (
            <em className="bento-detail-runs">
              {shownRuns.map((r, i) => {
                const meta = RUN_STATUS[r.status];
                const who = r.sample_maker || '';
                // U18 修订：次级层补回「颜色 / N件 / 尺码码」（与重构前 KanbanView 口径逐字一致）；
                // 主信息层常驻区不受影响，卡片高度与 +37% 密度目标保持不变。
                const label = `${r.sample_type || '未命名版次'}${meta ? '·' + meta.label : ''}${r.sample_color ? '·' + r.sample_color : ''}${r.sample_count ? '·' + r.sample_count + '件' : ''}${r.size ? '·' + r.size + '码' : ''}${who ? '·' + who : ''}`;
                return (
                  <span key={i} className="bento-detail-run" title={label}>
                    {meta && <span className="bento-run-dot" style={{ background: meta.color }} />}
                    {label}
                  </span>
                );
              })}
              {hiddenRuns > 0 && <span className="bento-detail-run">+{hiddenRuns} 个批次</span>}
            </em>
          )}
        </div>
      </div>
    </div>
  );
};

// U19：memo 生效前提——调用方传的 onTaskClick 必须 useCallback 稳定；task 引用来自 tasks 列表
export default React.memo(TaskCard);
