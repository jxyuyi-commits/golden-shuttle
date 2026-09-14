// U15 骨架屏：加载态占位（替代「加载中…」纯文字），形态贴近后续内容减少布局跳动
// 三种 variant：table（表格行块）/ list（头像圆点 + 行）/ lines（纯文本行）
// prefers-reduced-motion: reduce 下关闭 shimmer 动画（components.css）
import React from 'react';

/**
 * @param {('list'|'table'|'lines')} variant 占位形态
 * @param {number} rows 行数（1~12，默认 3）
 */
const Skeleton = ({ variant = 'list', rows = 3 }) => {
  const n = Math.max(1, Math.min(12, Number(rows) || 3));
  // 末行收窄，模拟真实内容的参差感
  const lastWidth = { width: '62%' };
  const items = [];
  for (let i = 0; i < n; i += 1) {
    const style = i === n - 1 ? lastWidth : undefined;
    if (variant === 'table') {
      items.push(<div key={i} className="skeleton skeleton--row" style={style} />);
    } else if (variant === 'list') {
      items.push(
        <div key={i} className="skeleton--list-row">
          <span className="skeleton skeleton--avatar" />
          <span className="skeleton skeleton--line skeleton--line-flex" style={style} />
        </div>
      );
    } else {
      items.push(<div key={i} className="skeleton skeleton--line" style={style} />);
    }
  }

  return (
    <div className="skeleton-wrap" role="status" aria-label="加载中" aria-busy="true">
      {items}
    </div>
  );
};

export default Skeleton;
