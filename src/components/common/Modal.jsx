import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * U13 弹窗基座（批4 体验提升）：全站弹窗统一走本组件。
 * - Portal 到 document.body，不受父级 overflow/层叠上下文影响
 * - Esc 关闭最上层弹窗（模块级栈维护层级；下拉面板 .ss-dropdown/.dp-cal 打开时 Esc 只留给面板，不关弹窗）
 * - 焦点陷阱：Tab/Shift+Tab 不逃逸；打开时焦点移入遮罩容器，关闭时还原到触发元素
 * - ARIA：role="dialog" + aria-modal
 * - 遮罩关闭：mousedown 落在遮罩本体才触发（避免「框内选文字、框外松手」误关）
 *
 * 结构约定：role/ref 直接落在遮罩 div 上（不加包装层，避免破坏 .overlay 的 flex/stretch 布局），
 * children 原样渲染——各弹窗保留自己的内层结构（.modal glass 等），DOM 与迁移前一致，零视觉漂移。
 */

// 模块级弹窗栈：记录当前打开的 Modal id，保证 Esc 只关最上层
const escStack = [];
let modalSeq = 0;

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal = ({
  open = true,
  onClose,
  children,
  overlayClassName = 'modal-overlay',
  overlayStyle,
  zIndex,
  ariaLabel,
  closeOnOverlay = true,
  closeOnEsc = true,
}) => {
  const idRef = useRef(null);
  const overlayRef = useRef(null);
  const prevFocusRef = useRef(null);

  // 打开/关闭：登记 Esc 栈 + 焦点迁入/还原
  useEffect(() => {
    if (!open) return undefined;
    const id = ++modalSeq;
    idRef.current = id;
    escStack.push(id);
    prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (overlayRef.current) overlayRef.current.focus({ preventScroll: true });
    return () => {
      const idx = escStack.indexOf(id);
      if (idx !== -1) escStack.splice(idx, 1);
      const pf = prevFocusRef.current;
      if (pf && document.contains(pf)) pf.focus({ preventScroll: true });
    };
  }, [open]);

  // 键盘：Esc 关最上层 + Tab 焦点陷阱
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!closeOnEsc) return;
        // 下拉面板（SmartSelect/DatePicker）打开时，Esc 归面板语义，不关弹窗
        if (document.querySelector('.ss-dropdown, .dp-cal')) return;
        if (escStack[escStack.length - 1] === idRef.current) {
          e.stopPropagation();
          if (onClose) onClose();
        }
        return;
      }
      if (e.key === 'Tab') {
        const root = overlayRef.current;
        if (!root) return;
        const list = Array.from(root.querySelectorAll(FOCUSABLE))
          .filter(el => el.getClientRects().length > 0);
        if (list.length === 0) {
          e.preventDefault();
          root.focus();
          return;
        }
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        // 焦点在陷阱外（body/遮罩本体/意外外部元素）时，Tab 一律拉回弹窗内，防止逃逸
        if (e.shiftKey) {
          if (active === first || !list.includes(active)) { e.preventDefault(); last.focus(); }
        } else if (active === last || !list.includes(active)) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, closeOnEsc]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={overlayClassName}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      style={{ ...(overlayStyle || {}), ...(zIndex != null ? { zIndex } : {}) }}
      onMouseDown={closeOnOverlay ? (e) => { if (e.target === e.currentTarget && onClose) onClose(); } : undefined}
    >
      {children}
    </div>,
    document.body
  );
};

export default Modal;
