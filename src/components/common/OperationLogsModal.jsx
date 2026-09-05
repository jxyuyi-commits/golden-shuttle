import React, { useEffect, useState } from 'react';
import { X, Plus, ArrowUp, Tag, AlertCircle, CheckCircle2, Clock, FileText, Circle } from 'lucide-react';
import { fetchLogs } from '../../api';

// 动作 → 图标/颜色/短标签
const ACTION_META = {
  create: { icon: Plus, color: '#38bdf8', label: '创建' },
  status: { icon: ArrowUp, color: '#4ade80', label: '状态' },
  sample_type: { icon: Tag, color: '#a78bfa', label: '版次' },
  priority: { icon: AlertCircle, color: '#f59e0b', label: '优先级' },
  audit: { icon: CheckCircle2, color: '#2dd4bf', label: '审核' },
  expected_date: { icon: Clock, color: '#fb923c', label: '交期' },
  node: { icon: FileText, color: '#94a3b8', label: '动态' },
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
    <div className="overlay" onClick={onClose}>
      <div className="glass" style={{ width: 560, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>操作日志</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>关键动作 · 最近 {logs.length} 条</span>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0', minHeight: 160 }}>
          {loading && <div style={{ padding: 28, textAlign: 'center', color: '#64748b', fontSize: 13 }}>加载中…</div>}
          {error && <div style={{ padding: 28, textAlign: 'center', color: '#f87171', fontSize: 13 }}>加载失败：{error}</div>}
          {!loading && !error && logs.length === 0 && (
            <div style={{ padding: 36, textAlign: 'center', color: '#64748b', fontSize: 13, lineHeight: 1.8 }}>
              暂无操作记录。
              <br />创建或修改打样单后，关键动作（状态/版次/优先级/审核/交期/工作动态）会自动记录在这里。
            </div>
          )}
          {logs.map(l => {
            const meta = ACTION_META[l.action] || { icon: Circle, color: '#64748b', label: l.action || '操作' };
            const Icon = meta.icon;
            return (
              <div key={l.id} style={{ display: 'flex', gap: 12, padding: '10px 20px', alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: meta.color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Icon size={14} color={meta.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>{l.detail || meta.label}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fmtLogTime(l.created_at)}{l.operator && l.operator !== 'system' ? ` · ${l.operator}` : ''}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OperationLogsModal;
