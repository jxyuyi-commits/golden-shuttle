import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

/**
 * 统一确认弹窗（REQ-006）：用于删除等危险操作二次确认，替换 window.confirm
 * @param {string} title 标题（如「删除打样批次」）
 * @param {string|ReactNode} message 描述/明细
 * @param {string} confirmText 确认按钮文案（默认「确认删除」）
 * @param {boolean} danger 危险样式（红色确认按钮），默认 true
 */
const ConfirmModal = ({ title, message, confirmText = '确认删除', danger = true, onConfirm, onCancel }) => (
  <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
    <div className="confirm-modal glass">
      <div className="confirm-icon" style={{ color: danger ? '#f87171' : '#38bdf8', background: danger ? 'rgba(248,113,113,0.12)' : 'rgba(56,189,248,0.12)' }}>
        {danger ? <Trash2 size={20} /> : <AlertTriangle size={20} />}
      </div>
      <div className="confirm-title">{title}</div>
      {message && <div className="confirm-msg">{message}</div>}
      <div className="confirm-actions">
        <button className="btn-ghost" onClick={onCancel}>取消</button>
        <button className={danger ? 'btn-danger' : 'btn-blue'} onClick={onConfirm}>{confirmText}</button>
      </div>
    </div>
  </div>
);

export default ConfirmModal;
