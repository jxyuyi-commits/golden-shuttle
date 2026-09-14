import React, { useCallback, useState } from 'react';
import { X, FolderOpen, Check } from 'lucide-react';
import { fetchDrawings } from '../../api';
import PdfThumb from './PdfThumb';
import Modal from './Modal';
import EmptyState from './EmptyState';
import useSoftRetry from '../../hooks/useSoftRetry';

/**
 * 从图纸资料库选择设计稿：
 * 列出当前打样单图纸资料中「设计稿」分类的卡片（按版本组合并，取最新版），
 * 点击选中 → onSelect(url) 设为该款式设计稿。
 */
const PdfPickerModal = ({ taskId, currentUrl, onSelect, onClose }) => {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);

  // U16 柔性超时：加载失败自动递减倒计时重试（5s/10s/15s），超过 3 次转「立即重试」手动兜底，永不硬失败
  const loadDesigns = useCallback(async () => {
    if (!taskId) { setItems([]); return; } // 无 taskId 时（初始化同步）直接给空列表，立即结束加载态
    const list = await fetchDrawings(taskId);
    // 按 group_id 聚合：每组取最新版本（无 group_id 的记录独立显示）
    const map = new Map();
    for (const d of list || []) {
      if (d.category !== '设计稿') continue;
      const key = d.group_id ?? `single-${d.id}`;
      const cur = map.get(key);
      if (!cur || (d.version || 0) >= (cur.version || 0)) map.set(key, d);
    }
    setItems([...map.values()].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')));
  }, [taskId]);
  const { loading, error, countdown, retry } = useSoftRetry(loadDesigns, { baseDelay: 5, maxAttempts: 3 });

  return (
    <Modal onClose={onClose} overlayClassName="overlay overlay-show" ariaLabel="从图纸资料选择设计稿">
      <div className="glass" style={{ width: 520, maxWidth: '92vw', maxHeight: '78vh', display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderOpen size={16} color="var(--accent)" />
            <span style={{ fontSize: 15, fontWeight: 800 }}>从图纸资料选择设计稿</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>共 {items.length} 份</span>
          </div>
          <button className="btn--icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
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
          {!loading && !error && items.length === 0 && (
            <EmptyState
              title="暂无「设计稿」分类的图纸资料"
              hint="可到下方「图纸资料」tab 上传设计稿，或直接拖拽文件到设计稿区域"
            />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
            {items.map(d => {
              const isCurrent = currentUrl === d.url;
              const isSelected = selected === d.url;
              return (
                <div
                  key={d.group_id ?? d.id}
                  onClick={() => setSelected(d.url)}
                  title={d.filename || '设计稿'}
                  style={{
                    cursor: 'pointer', borderRadius: 10, overflow: 'hidden', position: 'relative',
                    border: '1px solid var(--border-strong)', transition: 'border-color .15s, box-shadow .15s',
                    background: 'var(--bg-elev)',
                    ...(isSelected
                      ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-soft-2)' }
                      : isCurrent ? { borderColor: 'var(--accent-soft-2)' } : {}),
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = isSelected || isCurrent ? 'var(--accent)' : 'var(--accent-soft-2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isSelected ? 'var(--accent)' : isCurrent ? 'var(--accent-soft-2)' : 'var(--border-strong)'; }}
                >
                  <div style={{ height: 130 }}>
                    <PdfThumb pdfUrl={d.url} interactive={false} />
                  </div>
                  {isCurrent && (
                    <div style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={13} color="var(--bg)" />
                    </div>
                  )}
                  {d.version > 1 && (
                    <div style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 10, color: 'var(--text-2)', background: 'var(--bg-elev-2)', borderRadius: 6, padding: '2px 6px' }}>V{d.version}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {selected ? (<>已选择：<span style={{ color: 'var(--text)' }}>{items.find(x => x.url === selected)?.filename || ''}</span></>) : (<>点击卡片选择要更换的设计稿</>)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ padding: '7px 14px', fontSize: 13 }} onClick={onClose}>取消</button>
            <button
              className="btn--primary"
              style={{ padding: '7px 14px', fontSize: 13, opacity: selected ? 1 : 'var(--control-disabled-opacity)', cursor: selected ? 'pointer' : 'var(--control-disabled-cursor)' }}
              disabled={!selected}
              onClick={() => { if (selected) { onSelect(selected); onClose(); } }}
            >
              确认更换
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PdfPickerModal;
