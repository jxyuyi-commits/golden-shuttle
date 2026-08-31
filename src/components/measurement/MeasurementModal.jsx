import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { fetchMeasurementTemplates } from '../../api';

/** 部位预设选择弹窗（SizeTable 内部使用） */
const MeasurementModal = ({ isOpen, onClose, onConfirm, categories = [] }) => {
  const [activeCat, setActiveCat] = useState(categories[0] || '');
  const [templates, setTemplates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (!isOpen || !activeCat) return;
    fetchMeasurementTemplates(activeCat).then(setTemplates).catch(() => setTemplates([]));
  }, [isOpen, activeCat]);

  const toggle = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleConfirm = () => {
    onConfirm(templates.filter(t => selectedIds.includes(t.id)));
    onClose();
    setSelectedIds([]);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content glass">
        <div className="modal-header">
          <div style={{ fontSize: 18, fontWeight: 800 }}>选择尺寸部位</div>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="modal-sidebar">
            {categories.map(cat => (
              <div key={cat} className={`side-nav-item ${activeCat === cat ? 'active' : ''}`} onClick={() => setActiveCat(cat)}>
                {cat}
              </div>
            ))}
          </div>
          <div className="modal-main">
            <div className="template-grid">
              {templates.map(t => (
                <div key={t.id} className={`template-card ${selectedIds.includes(t.id) ? 'selected' : ''}`} onClick={() => toggle(t.id)}>
                  <div className="tcard-name">{t.name}</div>
                  <div className="tcard-meta">方法: {t.method || '---'}</div>
                  <div className="tcard-meta">误差: {t.tolerance || '---'}</div>
                </div>
              ))}
              {templates.length === 0 && (
                <div style={{ color: '#475569', padding: 32, textAlign: 'center', gridColumn: '1/-1' }}>
                  该分类下暂无预设，请先在「设置」中添加
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <div style={{ fontSize: 13, color: '#94a3b8' }}>已选 {selectedIds.length} 个</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-ghost" onClick={onClose}>取消</button>
            <button className="btn-blue" onClick={handleConfirm} disabled={selectedIds.length === 0}>确认选择</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MeasurementModal;
