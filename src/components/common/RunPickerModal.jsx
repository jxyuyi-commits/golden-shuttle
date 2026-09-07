import React, { useState } from 'react';
import { Check } from 'lucide-react';

/**
 * 版次选择弹窗（REQ-005 修订）：列表展示款内批次，让用户明确选择目标版次，
 * 替代尺寸编辑页的随意下拉切换，杜绝"不知在改哪个版次/不知参照是哪个版次"的误操作。
 * @param {Array} runs 批次列表（含 order_no/sample_type/size/size_data）
 * @param {number} excludeId 排除的批次 id（当前编辑版次）
 * @param {boolean} onlyWithData 仅可选有数据的批次（用于"从其它版次导入"来源选择，空表禁用）
 * @param {string} title 标题
 * @param {string} subtitle 说明文字
 * @param {string} confirmText 确认按钮文案
 * @param {function} onConfirm(run) 确认回调，返回选中的批次对象
 * @param {function} onCancel 取消回调
 */
const RunPickerModal = ({ runs = [], excludeId, onlyWithData = false, title = '选择版次', subtitle, confirmText = '确定', onConfirm, onCancel }) => {
  const [pickId, setPickId] = useState(null);
  const list = runs.filter(r => r.id !== excludeId);
  const picked = runs.find(r => r.id === pickId) || null;

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-modal glass" style={{ width: 500, maxWidth: '92vw' }}>
        <div className="confirm-title">{title}</div>
        {subtitle && <div className="confirm-msg">{subtitle}</div>}
        <div className="run-pick-list">
          {list.length === 0 && (
            <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>暂无可选版次</div>
          )}
          {list.map(r => {
            const rows = Array.isArray(r.size_data) ? r.size_data.length : 0;
            const disabled = onlyWithData && rows === 0;
            const selected = pickId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                className="run-pick-item"
                data-selected={selected ? '1' : '0'}
                disabled={disabled}
                onClick={() => setPickId(r.id)}
              >
                <div className="run-pick-main">
                  <span className="run-pick-order">{r.order_no || '未编号'}</span>
                  <span className="run-pick-meta">{r.sample_type || '未知版次'} · {r.size || '无码'}</span>
                </div>
                <span className="run-pick-count" data-empty={rows === 0 ? '1' : '0'}>
                  {rows > 0 ? `${rows} 行数据` : (onlyWithData ? '无数据（不可导入）' : '无数据')}
                </span>
                {selected && <Check size={16} color="var(--accent)" style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
        <div className="confirm-actions">
          <button className="btn-ghost" onClick={onCancel}>取消</button>
          <button
            className="btn-blue"
            disabled={!picked}
            style={{ opacity: picked ? 1 : 0.5, cursor: picked ? 'pointer' : 'not-allowed' }}
            onClick={() => picked && onConfirm(picked)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RunPickerModal;
