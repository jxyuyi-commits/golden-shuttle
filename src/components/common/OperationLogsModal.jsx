import React, { useEffect, useState } from 'react';
import { X, Plus, ArrowUp, Tag, AlertCircle, CheckCircle2, Clock, FileText, Circle } from 'lucide-react';
import { fetchLogs } from '../../api';
import Modal from './Modal';
import EmptyState from './EmptyState';

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
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLogs({ limit: 200 })
      .then(setLogs)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
          {error && <div style={{ padding: 28, textAlign: 'center', color: 'var(--color-danger-text)', fontSize: 13 }}>加载失败：{error}</div>}
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
