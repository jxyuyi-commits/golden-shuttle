import React, { useCallback } from 'react';
import { X, Plus, ArrowUp, Tag, AlertCircle, CheckCircle2, Clock, FileText, Circle } from 'lucide-react';
import { fetchLogs } from '../../api';
import Modal from './Modal';
import EmptyState from './EmptyState';
import useSoftRetry from '../../hooks/useSoftRetry';

// 动作 → 图标/颜色/短标签
const ACTION_META = {
  create: { icon: Plus, color: 'var(--accent)', label: '创建' },
  status: { icon: ArrowUp, color: 'var(--run-done)', label: '状态' },
  sample_type: { icon: Tag, color: 'var(--color-info)', label: '版次' },
  priority: { icon: AlertCircle, color: 'var(--color-warn)', label: '优先级' },
  audit: { icon: CheckCircle2, color: 'var(--color-teal-400)', label: '审核' },
  expected_date: { icon: Clock, color: 'var(--color-orange-400)', label: '交期' },
  node: { icon: FileText, color: 'var(--text-2)', label: '动态' },
};

const fmtLogTime = (ts) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
};

const OperationLogsModal = ({ onClose }) => {
  // U16 柔性超时：加载失败自动递减倒计时重试（5s/10s/15s），超过 3 次转「立即重试」手动兜底，永不硬失败
  const fetchAll = useCallback(() => fetchLogs({ limit: 200 }), []);
  const { loading, error, countdown, data, retry } = useSoftRetry(fetchAll, { baseDelay: 5, maxAttempts: 3 });
  const logs = data || [];

  return (
    <Modal onClose={onClose} overlayClassName="overlay overlay-show" ariaLabel="操作日志">
      <div className="glass" style={{ width: 560, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>操作日志</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>关键动作 · 最近 {logs.length} 条</span>
          </div>
          <button className="btn--icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0', minHeight: 160 }}>
          {loading && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>加载中…</div>}
          {!loading && error && (
            <div style={{ padding: 28, textAlign: 'center', fontSize: 13 }}>
              <div style={{ color: 'var(--color-danger-text)' }}>加载失败：{error.message || '未知错误'}</div>
              {countdown > 0 ? (
                <div style={{ marginTop: 8, color: 'var(--text-2)' }}>{countdown} 秒后自动重试…</div>
              ) : (
                <button
                  type="button"
                  className="btn--ghost btn--sm"
                  style={{ marginTop: 8, display: 'inline-flex', border: '1px solid var(--border-weak)', borderRadius: 8, padding: '4px 12px' }}
                  onClick={retry}
                >
                  立即重试
                </button>
              )}
            </div>
          )}
          {!loading && !error && logs.length === 0 && (
            <EmptyState
              title="暂无操作记录"
              hint="创建或修改打样单后，关键动作（状态/版次/优先级/审核/交期/工作动态）会自动记录在这里"
            />
          )}
          {logs.map(l => {
            const meta = ACTION_META[l.action] || { icon: Circle, color: 'var(--text-3)', label: l.action || '操作' };
            const Icon = meta.icon;
            return (
              <div key={l.id} style={{ display: 'flex', gap: 12, padding: '10px 20px', alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: meta.color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Icon size={14} color={meta.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{l.detail || meta.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{fmtLogTime(l.created_at)}{l.operator && l.operator !== 'system' ? ` · ${l.operator}` : ''}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};

export default OperationLogsModal;
