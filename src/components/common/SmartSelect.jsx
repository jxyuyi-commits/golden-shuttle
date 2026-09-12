import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/** 选项键：string 即自身；对象优先 key（枚举），退 name */
const optKey = (o) => (typeof o === 'object' ? (o.key ?? o.name ?? '') : o);
/** 选项显示文本：对象优先 label（枚举），退 name；string 即自身 */
const optLabel = (o) => (typeof o === 'object' ? (o.label ?? o.name ?? '') : o);

/**
 * 下拉选择 + 自定义输入组合组件（REQ-020 全站下拉统一外观）
 * @param {string} value 当前值（枚举传 key / 自由输入传字符串）
 * @param {function} onChange 选中回调（枚举传 key / 自定义传字符串）
 * @param {Array} options 选项：string[] 或 {key,label}[] / {name}[]
 * @param {string} placeholder 空值占位
 * @param {boolean} allowCustom 是否允许「手动输入自定义值」（固定枚举传 false，REQ-020 用户确认：外观为主，枚举保持语义）
 * @param {string} className 附加类（透传到根节点）
 * @param {object} style 附加样式（透传到根节点，如 --sel-color 值色）
 */
const SmartSelect = ({ value, onChange, options = [], placeholder = '请选择或输入…', allowCustom = true, className = '', style = {} }) => {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      // Portal 渲染到 body 后，弹层不在 ref 内，需单独判断
      if (dropRef.current && dropRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 弹层 fixed 定位：rAF 持续跟随锚点——弹窗/容器布局变化（如查重提示插入、居中重排）时弹层实时同步，不再跑偏
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    let raf;
    const tick = () => {
      const r = el.getBoundingClientRect();
      setPos(prev => {
        const next = { top: r.bottom + 6, left: r.left, width: Math.max(r.width, 140), bottom: r.top - 6 };
        return (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width) ? prev : next;
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const select = (v) => { onChange(v); setOpen(false); };
  const matched = value !== undefined && value !== null && value !== '' ? options.find(o => optKey(o) === value) : null;
  const display = matched ? optLabel(matched) : (value || placeholder);

  return (
    <div className={`smart-select${className ? ' ' + className : ''}`} style={style} ref={ref}>
      <div className={`ss-display${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className={value ? '' : 'placeholder'}>{display}</span>
        <ChevronDown size={14} />
      </div>
      {open && pos && createPortal(
        <div ref={dropRef} className="ss-dropdown" style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto', minWidth: pos.width, maxWidth: '90vw', zIndex: 10000 }}>
          {allowCustom && (
            <input
              className="ss-custom-input"
              placeholder="手动输入自定义值…"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { select(custom.trim()); setCustom(''); } }}
              autoFocus
            />
          )}
          {allowCustom && options.length > 0 && <div className="ss-divider">预设选项</div>}
          {options.map((opt, i) => {
            const k = optKey(opt);
            const label = optLabel(opt);
            return (
              <div key={k || i} className={`ss-option ${value === k ? 'selected' : ''}`} onClick={() => select(k)}>
                {label}
              </div>
            );
          })}
          {!allowCustom && !options.length && <div className="ss-empty">暂无可用选项</div>}
        </div>,
        document.body
      )}
    </div>
  );
};

export default SmartSelect;
