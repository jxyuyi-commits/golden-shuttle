// U17 输入弹窗：基于 Modal 基座的最小输入框弹窗，替代原生 prompt()
// - Enter = 确认（空值/纯空白禁用确认钮）；Esc / 遮罩点击 = 取消（全部走 Modal 基座自身，不额外注册 keydown）
// - 打开即聚焦并全选，便于直接改写
import React, { useEffect, useRef, useState } from 'react';
import Modal from './Modal';

/**
 * @param {boolean} open 是否打开（默认 true，配合条件渲染）
 * @param {string} title 弹窗标题
 * @param {string} label 输入框上方说明文字（可空）
 * @param {string} initialValue 初始值
 * @param {string} placeholder 占位提示
 * @param {string} confirmText 确认按钮文案
 * @param {string} cancelText 取消按钮文案
 * @param {(value: string) => void} onConfirm 确认回调（收到 trim 后的非空值）
 * @param {() => void} onCancel 取消回调（Esc / 遮罩 / 取消按钮）
 */
const InputModal = ({
  open = true,
  title,
  label = '',
  initialValue = '',
  placeholder = '',
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  zIndex,
}) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef(null);

  // 每次打开重置为初始值（React 官方「props 变化时调整 state」的渲染期模式，
  // 避免在 effect 里同步 setState 触发级联渲染；本组件设计为条件渲染挂载，通常仅初始化一次）
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setValue(initialValue);
  }

  // 打开即聚焦 + 全选。setTimeout(0)：Modal 基座挂载后会把焦点给遮罩容器（父 effect 后于子 effect 执行），
  // 直接在子 effect 里 focus 会被基座覆盖，故延一拍把焦点夺回输入框。
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  const valid = value.trim().length > 0;
  const submit = () => { if (valid && onConfirm) onConfirm(value.trim()); };

  return (
    <Modal open={open} onClose={onCancel} ariaLabel={title} zIndex={zIndex}>
      <div className="confirm-modal glass" style={{ alignItems: 'stretch', textAlign: 'left' }}>
        <div className="confirm-title" style={{ textAlign: 'left' }}>{title}</div>
        {label ? <div className="confirm-msg" style={{ textAlign: 'left' }}>{label}</div> : null}
        <input
          ref={inputRef}
          className="input-modal-input"
          value={value}
          placeholder={placeholder}
          aria-label={label || title}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        />
        <div className="confirm-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn--ghost" onClick={onCancel}>{cancelText}</button>
          <button type="button" className="btn--primary" onClick={submit} disabled={!valid}>{confirmText}</button>
        </div>
      </div>
    </Modal>
  );
};

export default InputModal;
