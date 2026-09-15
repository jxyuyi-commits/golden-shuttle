import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import useKeyboardActivate, { keyboardActivate } from '../../hooks/useKeyboardActivate';

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

  // 弹层 fixed 定位（U21 事件驱动）：仅在打开时绑定 scroll(捕获)/resize/ResizeObserver，
  // 用 rAF 节流把同一帧的多次触发合并为一次测量；关闭即全部解绑。
  // 覆盖场景：祖先容器滚动、窗口缩放、锚点/页面尺寸变化（如查重提示插入、居中重排）。
  // 定位口径（top=锚点下沿+6、left=锚点左缘、width=max(锚宽,140)、bottom=锚点上沿-6）与旧实现逐字一致，视觉无漂移。
  useEffect(() => {
    if (!open) return undefined;
    const el = ref.current;
    if (!el) return undefined;

    let raf = 0;
    let disposed = false;

    const measure = () => {
      if (disposed) return;
      const r = el.getBoundingClientRect();
      setPos(prev => {
        const next = { top: r.bottom + 6, left: r.left, width: Math.max(r.width, 140), bottom: r.top - 6 };
        return (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width) ? prev : next;
      });
    };
    // rAF 节流：同一帧内多次触发（滚动+缩放+尺寸变化）合并为一次测量，读→写解耦，消除强制同步布局抖动
    const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; measure(); }); };

    measure(); // 打开即定位一次
    window.addEventListener('scroll', schedule, true); // 捕获阶段：覆盖任意祖先滚动容器
    window.addEventListener('resize', schedule);

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule);
      ro.observe(el); // 锚点尺寸变化
      if (document.body) ro.observe(document.body); // 页面尺寸变化（提示插入等导致的锚点位移）
    }

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (ro) ro.disconnect();
    };
  }, [open]);

  // U21 修订：面板打开期间于 **document 捕获阶段** 监听 Esc——焦点无论在触发器 / 遮罩(.overlay) / 下拉选项，
  // Esc 都只关面板；因 Modal 基座同为 document 捕获监听且「.ss-dropdown 存在则让位」，弹窗不受影响（U13 栈未动）。
  // open 变 false 即解绑；stopPropagation 阻断继续传播，避免后续 Esc 处理器误触。
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const select = (v) => { onChange(v); setOpen(false); };
  // U14 键盘可达：ss-display 触发器支持 Enter/Space 展开（B 案：保留 div，元素限定选择器 .compare-run-ss .ss-display > span 禁改标签）
  const onDisplayKeyDown = useKeyboardActivate(() => setOpen(o => !o));
  const matched = value !== undefined && value !== null && value !== '' ? options.find(o => optKey(o) === value) : null;
  const display = matched ? optLabel(matched) : (value || placeholder);

  return (
    <div className={`smart-select${className ? ' ' + className : ''}`} style={style} ref={ref}>
      <div
        className={`ss-display${open ? ' open' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onDisplayKeyDown}
      >
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
              <div
                key={k || i}
                className={`ss-option ${value === k ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => select(k)}
                onKeyDown={keyboardActivate(() => select(k))}
              >
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
