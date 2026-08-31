import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

/** 基础列表编辑器（标签云 + 双击编辑 + 删除） */
const SettingListEditor = ({ label, items, onChange }) => {
  const [input, setInput] = useState('');
  const [editIdx, setEditIdx] = useState(-1);
  const [editVal, setEditVal] = useState('');

  const add = () => {
    const v = input.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setInput('');
  };

  const confirmEdit = () => {
    const v = editVal.trim();
    if (!v) return;
    const updated = [...items];
    updated[editIdx] = v;
    onChange(updated);
    setEditIdx(-1);
  };

  return (
    <div className="glass-inner setting-card-compact">
      <div className="card-mini-head">
        <span className="card-mini-title">{label}</span>
        <span className="card-mini-count">{items.length}</span>
      </div>
      <div className="tag-cloud-mini custom-scrollbar">
        {items.map((item, idx) => (
          editIdx === idx ? (
            <span key={item} className="tag-mini" style={{ padding: '2px 4px' }}>
              <input
                style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: 11, fontWeight: 700, width: 60, outline: 'none' }}
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditIdx(-1); }}
                onBlur={confirmEdit}
                autoFocus
              />
            </span>
          ) : (
            <span key={item} className="tag-mini" onDoubleClick={() => { setEditIdx(idx); setEditVal(item); }} title="双击编辑" style={{ cursor: 'pointer' }}>
              {item}
              <button className="tag-del" onClick={() => onChange(items.filter(i => i !== item))}><X size={10} /></button>
            </span>
          )
        ))}
        {items.length === 0 && <span className="tag-empty-mini">未配置...</span>}
      </div>
      <div className="add-row-mini">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder={`添加${label.replace('库', '')}`}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn-add-mini" onClick={add}><Plus size={14} /></button>
      </div>
    </div>
  );
};

export default SettingListEditor;
