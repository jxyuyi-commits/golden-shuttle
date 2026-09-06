// REQ-009 自定义日历选择器：深色主题统一配色/选中态/今日标识/月份切换/底部清除今天
// 值与原生 input[type=date] 兼容（yyyy-MM-dd），可无缝替换全站日期输入
import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const WEEK_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const pad = (n) => String(n).padStart(2, '0');
const fmt = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

const DatePicker = ({ value, onChange, className, placeholder = '年/月/日', width }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const openPicker = () => {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setOpen(true);
  };

  const prevMonth = () => setView(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 });
  const nextMonth = () => setView(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 });

  // 日历网格（含前后月补位）
  const { y, m } = view;
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // 周一为 0
  const dim = new Date(y, m + 1, 0).getDate();
  const dimPrev = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = firstDow - 1; i >= 0; i--) cells.push({ d: dimPrev - i, other: true });
  for (let d = 1; d <= dim; d++) cells.push({ d, other: false });
  while (cells.length % 7 !== 0) cells.push({ d: cells.length % 7 === 0 ? 1 : (cells[cells.length - 1].d + 1), other: true });

  const today = new Date();
  const isToday = (d, other) => !other && today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
  const isSelected = (d) => {
    const parts = (value || '').split('-').map(Number);
    return parts.length === 3 && parts[0] === y && parts[1] - 1 === m && parts[2] === d;
  };

  const pick = (c, i) => {
    let realY = y, realM = m;
    if (c.other) {
      if (i < firstDow) { realM = m - 1; if (realM < 0) { realM = 11; realY -= 1; } }
      else { realM = m + 1; if (realM > 11) { realM = 0; realY += 1; } }
    }
    onChange(fmt(realY, realM, c.d));
    setOpen(false);
  };

  return (
    <div className="dp-wrap" ref={wrapRef} style={{ width }}>
      <div className={`dp-input${className ? ' ' + className : ''}`} onClick={openPicker}>
        <Calendar size={14} className="dp-icon" />
        <span className={value ? '' : 'dp-placeholder'}>{value ? value.replace(/-/g, '/') : placeholder}</span>
      </div>
      {open && (
        <div className="dp-cal glass">
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={prevMonth} title="上个月"><ChevronLeft size={16} /></button>
            <span className="dp-title">{y}年 {m + 1}月</span>
            <button type="button" className="dp-nav" onClick={nextMonth} title="下个月"><ChevronRight size={16} /></button>
          </div>
          <div className="dp-week">
            {WEEK_ZH.map(w => <span key={w}>{w}</span>)}
          </div>
          <div className="dp-grid">
            {cells.map((c, i) => (
              <button
                key={i}
                type="button"
                className={`dp-cell${c.other ? ' other' : ''}${isSelected(c.d) ? ' selected' : ''}${isToday(c.d, c.other) ? ' today' : ''}`}
                onClick={() => pick(c, i)}
              >
                {c.d}
              </button>
            ))}
          </div>
          <div className="dp-foot">
            <button type="button" className="dp-act" onClick={() => { onChange(''); setOpen(false); }}>清除</button>
            <button type="button" className="dp-act primary" onClick={() => { onChange(fmt(today.getFullYear(), today.getMonth(), today.getDate())); setOpen(false); }}>今天</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
