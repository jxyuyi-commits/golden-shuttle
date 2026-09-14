// U15 统一空态组件：全站「暂无数据」场景收口（不再"以为丢数据"）
// 基底复用 components.css 的 .empty-state-v4 / .empty-icon（沿用 40px 图标现值），
// compact 紧凑模式用于侧栏/表格单元格/嵌套小区域（24px 图标、小间距）。
import React from 'react';
import { Inbox } from 'lucide-react';

/**
 * @param {React.ComponentType} icon Lucide 图标组件（默认 Inbox；筛选无结果场景传 Filter）
 * @param {string} title 空态主标题（必填）
 * @param {string} hint 次要说明行（可选）
 * @param {{label: string, onClick: Function}} action 可选动作按钮
 * @param {boolean} compact 紧凑模式（默认 false）
 */
const EmptyState = ({ icon, title, hint, action, compact = false }) => {
  // Icon 赋值在函数体内（大写开头命中 no-unused-vars 的 varsIgnorePattern；ESLint 核心规则不识别 JSX 使用）
  const Icon = icon || Inbox;
  return (
    <div className={`empty-state-v4${compact ? ' empty-state--compact' : ''}`}>
      <div className="empty-icon" aria-hidden="true"><Icon size={compact ? 24 : 40} /></div>
      <p className="empty-state__title">{title}</p>
      {hint ? <p className="empty-state__hint">{hint}</p> : null}
      {action && action.label ? (
        <button type="button" className="btn--ghost btn--sm empty-state__action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
};

export default EmptyState;
