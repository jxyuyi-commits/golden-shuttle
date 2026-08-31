import React from 'react';
import { CheckCircle2, AlertCircle, Circle } from 'lucide-react';
import PdfThumb from '../common/PdfThumb';

const getNodeIcon = (status) => {
  if (status === 'done' || status === 'completed') return <CheckCircle2 size={14} color="#4ade80" />;
  if (status === 'active') return <AlertCircle size={14} color="#38bdf8" />;
  return <Circle size={14} color="#475569" />;
};

/** 看板任务卡片：Bento 布局 - 设计稿缩略图 + 款式信息 + 生产属性 + 进度节点 */
const TaskCard = ({ task, onClick }) => {
  return (
    <div className="card glass bento-card" onClick={onClick}>
      <div className="bento-upper">
        <div className="bento-box bento-left">
          <div className="bento-img-wrap">
            <PdfThumb pdfUrl={task.pdf_url} />
            <div className="bento-badge">👤 {task.designer || '未分配'}</div>
          </div>
        </div>

        <div className="bento-right-col">
          <div className="bento-box bento-tr">
            <span className="bento-style-no">{task.style_no || '—'}</span>
          </div>

          <div className="bento-info-row">
            <div className="bento-box bento-info">
              <div className="bento-title-main" title={task.title}>{task.title || '未命名款式'}</div>
              <div className="bento-row" title={task.style_no}><span>款号：</span>{task.style_no || '—'}</div>
              <div className="bento-row" title={task.category}><span>类别：</span>{task.category || '—'}</div>
              <div className="bento-row" title={task.brand}><span>品牌：</span>{task.brand || '—'}</div>
              <div className="bento-row" title={[task.year, task.season, task.month].filter(Boolean).join(' ')}><span>时段：</span>{[task.year, task.season, task.month].filter(Boolean).join(' ') || '—'}</div>
            </div>

            <div className="bento-box bento-info">
              <div className="bento-order-no" title={task.order_no}>版单：{task.order_no || '—'}</div>
              <div className="bento-row" title={task.sample_type}><span>版次：</span><em>{task.sample_type || '—'}</em> {task.sample_color ? `(${task.sample_color})` : ''}</div>
              <div className="bento-row" title={task.priority}><span>优先：</span><em className={`prio-${task.priority === '紧急' ? 'high' : task.priority === '高' ? 'mid' : 'low'}`}>{task.priority || '中'}</em></div>
              <div className="bento-row" title={task.sample_count}><span>件数：</span>{task.sample_count ? `${task.sample_count}件` : ''} {task.size ? `${task.size}码` : ''}</div>
              <div className="bento-row" title={task.audit_status}><span>审核：</span><em className={`audit-${task.audit_status === '已通过' ? 'pass' : 'wait'}`}>{task.audit_status || '待审核'}</em></div>
            </div>
          </div>
        </div>
      </div>

      <div className="bento-box bento-bottom">
        <div className="bento-nodes">
          {(() => {
            const nodes = (task.progress_nodes || []).filter(n => n.label || n.date);
            const visible = nodes.slice(0, 5);
            const hidden = nodes.length - visible.length;
            return (
              <>
                {visible.map((n, i) => (
                  <div key={i} className="bento-node-cell" title={`${n.label || ''}${n.by ? ' · 负责人:' + n.by : ''}${n.note ? ' · ' + n.note : ''}`}>
                    {getNodeIcon(n.status)}
                    <span className="bento-node-label">{n.label || '（未命名）'}</span>
                    <span className="bento-node-date">{n.date || '--'}</span>
                  </div>
                ))}
                {hidden > 0 && <span className="bento-node-more" title={`另有 ${hidden} 条工作动态`}>+{hidden}</span>}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
