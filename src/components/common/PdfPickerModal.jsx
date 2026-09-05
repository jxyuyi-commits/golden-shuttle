import React, { useEffect, useState } from 'react';
import { X, FolderOpen, Check } from 'lucide-react';
import { fetchDrawings } from '../../api';
import PdfThumb from './PdfThumb';

/**
 * 从图纸资料库选择设计稿：
 * 列出当前打样单图纸资料中「设计稿」分类的卡片（按版本组合并，取最新版），
 * 点击选中 → onSelect(url) 设为该款式设计稿。
 */
const PdfPickerModal = ({ taskId, currentUrl, onSelect, onClose }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!taskId) { setLoading(false); return; }
    fetchDrawings(taskId)
      .then(list => {
        // 按 group_id 聚合：每组取最新版本（无 group_id 的记录独立显示）
        const map = new Map();
        for (const d of list || []) {
          if (d.category !== '设计稿') continue;
          const key = d.group_id ?? `single-${d.id}`;
          const cur = map.get(key);
          if (!cur || (d.version || 0) >= (cur.version || 0)) map.set(key, d);
        }
        setItems([...map.values()].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [taskId]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="glass" style={{ width: 520, maxWidth: '92vw', maxHeight: '78vh', display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderOpen size={16} color="#38bdf8" />
            <span style={{ fontSize: 15, fontWeight: 800 }}>从图纸资料选择设计稿</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>共 {items.length} 份</span>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading && <div style={{ padding: 28, textAlign: 'center', color: '#64748b', fontSize: 13 }}>加载中…</div>}
          {error && <div style={{ padding: 28, textAlign: 'center', color: '#f87171', fontSize: 13 }}>加载失败：{error}</div>}
          {!loading && !error && items.length === 0 && (
            <div style={{ padding: 36, textAlign: 'center', color: '#64748b', fontSize: 13, lineHeight: 1.8 }}>
              暂无「设计稿」分类的图纸资料。
              <br />可到下方「图纸资料」tab 上传设计稿，或直接拖拽文件到设计稿区域。
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
            {items.map(d => (
              <div
                key={d.group_id ?? d.id}
                onClick={() => onSelect(d.url)}
                title={d.filename || '设计稿'}
                style={{
                  cursor: 'pointer', borderRadius: 10, overflow: 'hidden', position: 'relative',
                  border: '1px solid rgba(255,255,255,0.1)', transition: 'border-color .15s',
                  background: '#0f172a',
                  ...(currentUrl === d.url ? { borderColor: '#38bdf8', boxShadow: '0 0 0 1px rgba(56,189,248,0.5)' } : {}),
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = currentUrl === d.url ? '#38bdf8' : 'rgba(56,189,248,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = currentUrl === d.url ? '#38bdf8' : 'rgba(255,255,255,0.1)'; }}
              >
                <div style={{ height: 130 }}>
                  <PdfThumb pdfUrl={d.url} />
                </div>
                {currentUrl === d.url && (
                  <div style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={13} color="#020617" />
                  </div>
                )}
                {d.version > 1 && (
                  <div style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 10, color: '#cbd5e1', background: 'rgba(2,6,23,0.75)', borderRadius: 6, padding: '2px 6px' }}>V{d.version}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfPickerModal;
