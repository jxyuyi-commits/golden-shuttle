// U17 全局 Toast 通知系统：替代原生 alert() 的非阻断提示
// 设计要点（与 U13 弹窗体系完全隔离）：
// - 事件单例（模块级 listeners）：任意模块 import { toast } 即可发射，无需 Context / prop 透传
// - 不注册任何 keydown：完全不参与 Esc 栈 / 焦点陷阱，U13 Modal 的键盘行为不受任何影响
// - 容器 pointer-events:none、仅 toast 本体可点击 → 不挡页面交互
// - 样式走 U8/U9 令牌（--bg-elev-2 / --border / --radius-* / --color-*-fg），三主题可读
// - 多行文本用 white-space: pre-line（如图纸批量上传的汇总提示）
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const DURATION = { success: 3200, info: 3200, error: 6000 };
const ACTION_DURATION = 8000; // 带 action 时自动延长，给用户反应时间
const MAX_VISIBLE = 3; // 同时最多 3 条，新的在上，旧的自动挤出

// ── 模块级事件单例 ──
const listeners = new Set();
let toastSeq = 0;

const emit = (event) => {
  listeners.forEach((fn) => { try { fn(event); } catch { /* 单个订阅者异常不影响其它 */ } });
};

/**
 * 发射一条 toast（模块内部用）
 * @param {('success'|'error'|'info')} type
 * @param {string} message 支持 \n 多行（pre-line 渲染）
 * @param {{ action?: {label: string, onClick: Function}, duration?: number }} [opts]
 */
function push(type, message, opts = {}) {
  const id = ++toastSeq;
  const t = {
    id,
    type,
    message: message == null ? '' : String(message),
    action: opts && typeof opts.action === 'object' && opts.action ? opts.action : null,
    // 显式 duration 优先；有 action 延长到 8s；否则按类型默认
    duration: opts.duration || (opts.action ? ACTION_DURATION : DURATION[type] || DURATION.info),
  };
  emit({ kind: 'push', toast: t });
  return id;
}

/**
 * 全局 toast API（非组件模块直接 import 使用）
 * toast.success(message, opts) / toast.error(...) / toast.info(...)
 * opts.action: { label, onClick } 可撤销操作按钮；opts.duration 自定义毫秒
 */
// 禁用 fast-refresh「仅导出组件」约束：toast 是与 Host 配套的事件单例 API，拆文件反而增加耦合
// eslint-disable-next-line react-refresh/only-export-components
export const toast = {
  success: (message, opts) => push('success', message, opts),
  error: (message, opts) => push('error', message, opts),
  info: (message, opts) => push('info', message, opts),
  dismiss: (id) => emit({ kind: 'dismiss', id }),
};

/** 单条 toast：自带倒计时，error 也带关闭钮；action 点击后自动关闭 */
const ToastItem = ({ t }) => {
  const timerRef = useRef(null);
  const close = useCallback(() => toast.dismiss(t.id), [t.id]);

  useEffect(() => {
    timerRef.current = setTimeout(close, t.duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [t.id, t.duration, close]);

  const runAction = () => {
    if (t.action && typeof t.action.onClick === 'function') t.action.onClick();
    close();
  };

  return (
    // error 用 role=alert（打断式播报），其余用 role=status
    <div className={`toast toast--${t.type}`} role={t.type === 'error' ? 'alert' : 'status'} aria-live={t.type === 'error' ? 'assertive' : 'polite'}>
      <span className="toast-icon" aria-hidden="true">
        {t.type === 'success' ? <CheckCircle2 size={14} /> : t.type === 'error' ? <AlertCircle size={14} /> : <Info size={14} />}
      </span>
      <div className="toast-body">
        <div className="toast-msg">{t.message}</div>
        {t.action && (
          <button type="button" className="toast-action" onClick={runAction}>{t.action.label}</button>
        )}
      </div>
      <button type="button" className="toast-close" title="关闭" aria-label="关闭通知" onClick={close}>
        <X size={14} />
      </button>
    </div>
  );
};

/** 全局 Toast 宿主：在 App.jsx 挂载一次；Portal 到 body，右上角固定，最多同时 3 条 */
const ToastHost = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onEvent = (e) => {
      if (e.kind === 'push') {
        // 新的在上（unshift），超出 MAX_VISIBLE 挤掉最旧的
        setToasts((prev) => [e.toast, ...prev].slice(0, MAX_VISIBLE));
      } else if (e.kind === 'dismiss') {
        setToasts((prev) => prev.filter((t) => t.id !== e.id));
      }
    };
    listeners.add(onEvent);
    return () => { listeners.delete(onEvent); };
  }, []);

  return createPortal(
    <div className="toast-host">
      {toasts.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>,
    document.body
  );
};

export default ToastHost;
