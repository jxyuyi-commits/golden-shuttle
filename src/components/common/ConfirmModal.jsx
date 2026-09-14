import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import Modal from './Modal';

/**
 * 统一确认弹窗（REQ-006 / U17 确认分级）：用于删除等危险操作二次确认
 * @param {string} title 标题（如「删除打样批次」）
 * @param {string|ReactNode} message 描述/明细
 * @param {string} confirmText 确认按钮文案（默认「确认」）
 * @param {string} cancelText 取消按钮文案（默认「取消」；U17 支持自定义，如重复资料双选的「跳过该文件」）
 * @param {('danger'|'default')} tone 确认分级（U17）：danger=不可恢复的删除/回滚（红色确认钮+警示图标）；default=中性确认（金色主钮+提示图标）。默认 'default'
 * @param {boolean} danger 兼容 U17 之前的旧属性（原默认 true）；未显式传 tone 时按 danger 推导，新代码请用 tone
 */
const ConfirmModal = ({ title, message, confirmText = '确认', cancelText = '取消', tone, danger, onConfirm, onCancel, zIndex }) => {
  const resolvedTone = tone || (danger === true ? 'danger' : 'default');
  const isDanger = resolvedTone === 'danger';
  return (
    <Modal onClose={onCancel} ariaLabel={title} zIndex={zIndex}>
      <div className="confirm-modal glass">
        <div className="confirm-icon" style={{ color: isDanger ? 'var(--color-danger-text)' : 'var(--accent)', background: isDanger ? 'rgba(248,113,113,0.12)' : 'var(--accent-soft)' }}>
          {isDanger ? <Trash2 size={20} /> : <AlertTriangle size={20} />}
        </div>
        <div className="confirm-title">{title}</div>
        {message && <div className="confirm-msg">{message}</div>}
        <div className="confirm-actions">
          <button className="btn--ghost" onClick={onCancel}>{cancelText}</button>
          <button className={isDanger ? 'btn--danger' : 'btn--primary'} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
