import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Edit2, Trash2, Plus } from 'lucide-react';
import { saveSizeGroups, deleteSizeGroup } from '../../api';

/** 号型规格系列管理（列表 + 新增/编辑弹窗） */
const SizeGroupManager = ({ groups, onChange }) => {
  const [editing, setEditing] = useState(null);

  const save = async () => {
    if (!editing.name || !editing.size_list) return;
    await saveSizeGroups(editing);
    setEditing(null);
    onChange();
  };

  const del = async (id) => {
    if (!window.confirm('确定删除该号型系列？')) return;
    await deleteSizeGroup(id);
    onChange();
  };

  const modal = editing ? createPortal(
    <div className="overlay" onClick={() => setEditing(null)}>
      <div className="modal glass" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><span>{editing.id ? '编辑' : '新增'}号型系列</span><button className="btn-icon" onClick={() => setEditing(null)}><X size={20} /></button></div>
        <div className="field"><label>系列名称 (如: 成人女装号型)</label><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
        <div className="field"><label>尺码组 (英文逗号分隔, 如: S,M,L,XL)</label><textarea style={{ height: 80 }} value={editing.size_list} onChange={e => setEditing({ ...editing, size_list: e.target.value })} /></div>
        <div className="modal-foot"><button className="btn-ghost" onClick={() => setEditing(null)}>取消</button><button className="btn-blue" onClick={save}>确认保存</button></div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div className="glass-inner" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>号型规格系列设定 (如: 165/84, S/M/L)</div>
          <button className="btn-blue-sm" onClick={() => setEditing({ name: '', size_list: '', is_default: 0 })}>+ 新增系列</button>
        </div>
        <div className="size-group-table-wrapper">
          <table className="mini-table">
            <thead><tr><th>名称</th><th>包含尺码</th><th width="80">操作</th></tr></thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.id}>
                  <td style={{ fontWeight: 60 }}>{g.name}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{g.size_list}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-icon-xs" onClick={() => setEditing(g)}><Edit2 size={12} /></button>
                      <button className="btn-icon-xs" style={{ color: '#ef4444' }} onClick={() => del(g.id)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal}
    </>
  );
};

export default SizeGroupManager;
