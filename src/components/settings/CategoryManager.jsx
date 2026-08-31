import React, { useState } from 'react';
import { X, Check, Edit2, Plus } from 'lucide-react';

/** 款式分类库管理（绑定号型规格 + 双击编辑） */
const CategoryManager = ({ items = [], sizeGroups = [], onChange }) => {
  const [input, setInput] = useState({ name: '', size_group_id: '' });
  const [editIdx, setEditIdx] = useState(-1);
  const [editVal, setEditVal] = useState({ name: '', size_group_id: '' });

  const add = () => {
    if (!input.name) return;
    const newItem = { name: input.name, size_group_id: input.size_group_id || null };
    onChange([...items.filter(i => (typeof i === 'string' ? i : i.name) !== input.name), newItem]);
    setInput({ name: '', size_group_id: '' });
  };

  const startEdit = (idx) => {
    const obj = typeof items[idx] === 'string' ? { name: items[idx], size_group_id: '' } : items[idx];
    setEditIdx(idx);
    setEditVal({ name: obj.name, size_group_id: obj.size_group_id || '' });
  };

  const confirmEdit = () => {
    if (!editVal.name) return;
    const updated = [...items];
    updated[editIdx] = { name: editVal.name, size_group_id: editVal.size_group_id || null };
    onChange(updated);
    setEditIdx(-1);
  };

  return (
    <div className="glass-inner setting-card-compact">
      <div className="card-mini-head">
        <span className="card-mini-title">款式分类库 (绑定号型规格)</span>
        <span className="card-mini-count">{items.length}</span>
      </div>
      <div className="category-list-wrapper custom-scrollbar">
        {items.map((item, idx) => {
          const obj = typeof item === 'string' ? { name: item } : item;
          const group = sizeGroups.find(g => g.id == obj.size_group_id);
          if (editIdx === idx) {
            return (
              <div key={idx} className="category-item-row" style={{ flexDirection: 'column', gap: 6 }}>
                <input className="cat-edit-input" value={editVal.name} onChange={e => setEditVal({ ...editVal, name: e.target.value })} autoFocus />
                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <select style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 11, outline: 'none' }} value={editVal.size_group_id} onChange={e => setEditVal({ ...editVal, size_group_id: e.target.value })}>
                    <option value="">不绑定</option>
                    {sizeGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <button className="btn-icon-xs" style={{ color: '#4ade80' }} onClick={confirmEdit}><Check size={12} /></button>
                  <button className="btn-icon-xs" onClick={() => setEditIdx(-1)}><X size={12} /></button>
                </div>
              </div>
            );
          }
          return (
            <div key={idx} className="category-item-row">
              <span className="cat-name" onDoubleClick={() => startEdit(idx)} title="双击编辑" style={{ cursor: 'pointer' }}>{obj.name}</span>
              <span className="cat-group-tag">{group ? group.name : '未绑定号型'}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-icon-xs" onClick={() => startEdit(idx)}><Edit2 size={10} /></button>
                <button className="tag-del" onClick={() => onChange(items.filter((_, i) => i !== idx))}><X size={12} /></button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="add-row-enhanced">
        <input style={{ flex: 2 }} value={input.name} onChange={e => setInput({ ...input, name: e.target.value })} placeholder="分类名称..." onKeyDown={e => e.key === 'Enter' && add()} />
        <select style={{ flex: 1.5 }} value={input.size_group_id} onChange={e => setInput({ ...input, size_group_id: e.target.value })}>
          <option value="">绑定号型系列</option>
          {sizeGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button className="btn-add-mini" onClick={add}><Plus size={14} /></button>
      </div>
    </div>
  );
};

export default CategoryManager;
