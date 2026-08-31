import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Edit2, Trash2, FileText } from 'lucide-react';
import { autoSign } from '../../utils/format';
import { fetchMeasurementTemplates, saveMeasurementTemplate, deleteMeasurementTemplate } from '../../api';

/** 尺寸部位预设管理（品类目录 + 部位明细表格 + 新增/编辑弹窗） */
const MeasurementTemplateManager = ({ categories = [], onCategoriesChange }) => {
  const [activeCat, setActiveCat] = useState(categories[0] || '');
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);
  const [newCatName, setNewCatName] = useState('');
  const [editingCatIndex, setEditingCatIndex] = useState(-1);

  const refresh = useCallback(() => {
    if (!activeCat) return;
    fetchMeasurementTemplates(activeCat).then(setTemplates).catch(() => setTemplates([]));
  }, [activeCat]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!activeCat && categories.length > 0) setActiveCat(categories[0]);
  }, [categories, activeCat]);

  const addCategory = () => {
    if (!newCatName.trim()) return;
    onCategoriesChange([...categories, newCatName.trim()]);
    setNewCatName('');
  };

  const removeCategory = (idx) => {
    if (!window.confirm('确定删除该品类？')) return;
    const next = categories.filter((_, i) => i !== idx);
    onCategoriesChange(next);
    if (activeCat === categories[idx]) setActiveCat(next[0] || '');
  };

  const saveTemplate = () => {
    if (!editing) return;
    const payload = {
      ...editing,
      category: activeCat,
      code: editing.code || editing.name,
      sort_order: editing.sort_order || 0,
      is_required: editing.is_required ? 1 : 0
    };
    saveMeasurementTemplate(payload).then(() => { setEditing(null); refresh(); });
  };

  const deleteTemplate = (id) => {
    if (!window.confirm('确定删除该预设部位？')) return;
    deleteMeasurementTemplate(id).then(refresh);
  };

  return (
    <div className="template-manager-v4 animate-fade-in">
      <div className="sidebar-v4 glass-inner">
        <div className="sidebar-title">品类目录</div>
        <div className="sidebar-add">
          <input placeholder="输入新分类..." value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} />
          <button className="btn-add-circle" onClick={addCategory} title="添加分类"><Plus size={14} /></button>
        </div>
        <div className="sidebar-list custom-scrollbar">
          {categories.map((c, i) => (
            <div key={i} className={`cat-item ${activeCat === c ? 'active' : ''} animate-slide-right`} style={{ animationDelay: `${i * 0.05}s` }} onClick={() => setActiveCat(c)}>
              <div className="cat-item-content">
                {editingCatIndex === i ? (
                  <input autoFocus className="cat-edit-input" value={c}
                    onChange={e => {
                      const list = [...categories]; list[i] = e.target.value;
                      onCategoriesChange(list);
                    }}
                    onBlur={() => setEditingCatIndex(-1)}
                    onKeyDown={e => e.key === 'Enter' && setEditingCatIndex(-1)} />
                ) : (
                  <span className="cat-name" onDoubleClick={() => setEditingCatIndex(i)}>{c}</span>
                )}
              </div>
              <button className="del-btn-mini" onClick={ev => { ev.stopPropagation(); removeCategory(i); }}><Trash2 size={12} /></button>
            </div>
          ))}
          {categories.length === 0 && <div className="empty-tip">暂无分类</div>}
        </div>
      </div>
      <div className="content-v4">
        <div className="content-header-v4 glass-inner">
          <div className="header-info">
            <div className="active-cat-badge">{activeCat || '未选择'}</div>
            <span className="header-title">部位预设明细</span>
          </div>
          <button className="btn-blue btn-sm btn-glow" disabled={!activeCat} onClick={() => setEditing({ name: '', method: '', tolerance: '', grading_rule: '', sort_order: 0 })}>
            <Plus size={14} /> 新增部位
          </button>
        </div>
        <div className="tpl-table-wrapper custom-scrollbar">
          <table className="tpl-table-v4">
            <thead>
              <tr>
                <th style={{ width: 140 }}>部位名称</th>
                <th>测量方法说明</th>
                <th style={{ width: 100 }}>公差范围</th>
                <th style={{ width: 100 }}>放码规则</th>
                <th style={{ width: 80, textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t, idx) => (
                <tr key={t.id} className="animate-fade-in" style={{ animationDelay: `${idx * 0.03}s` }}>
                  <td>
                    <div className="tpl-name-cell">
                      {t.name}
                      {t.is_required === 1 && <span className="badge-req" title="核心必填部位">核心</span>}
                    </div>
                  </td>
                  <td><div className="tpl-method-cell" title={t.method}>{t.method || <span className="text-dim">未填写</span>}</div></td>
                  <td><span className="tpl-tag-blue">{t.tolerance || '-'}</span></td>
                  <td><span className="tpl-tag-blue" style={{ background: 'rgba(56,189,248,0.05)', borderColor: 'rgba(56,189,248,0.1)' }}>{t.grading_rule || '-'}</span></td>
                  <td>
                    <div className="row-ops-v4">
                      <button className="op-btn edit" onClick={() => setEditing({ ...t })}><Edit2 size={14} /></button>
                      <button className="op-btn delete" onClick={() => deleteTemplate(t.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state-v4">
                      <div className="empty-icon"><FileText size={40} /></div>
                      <p>当前分类下暂无预设部位</p>
                      <button className="btn-ghost-sm" onClick={() => setEditing({ name: '', method: '', tolerance: '', grading_rule: '', sort_order: 0 })}>立即添加第一个</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="overlay" style={{ zIndex: 2000 }} onClick={() => setEditing(null)}>
          <div className="modal glass" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>{editing.id ? '编辑' : '新增'}预设部位</span>
              <button onClick={() => setEditing(null)}><X size={20} /></button>
            </div>
            <div className="field">
              <label>部位名称 *</label>
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="如：衣长" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="field">
                <label>公差范围</label>
                <input value={editing.tolerance}
                  onChange={e => setEditing({ ...editing, tolerance: e.target.value })}
                  onBlur={e => setEditing({ ...editing, tolerance: autoSign(e.target.value) })}
                  placeholder="如：±1" />
              </div>
              <div className="field">
                <label>放码规则</label>
                <input value={editing.grading_rule} onChange={e => setEditing({ ...editing, grading_rule: e.target.value })} placeholder="输入数字" />
              </div>
            </div>
            <div className="field">
              <label>测量方法说明</label>
              <textarea rows={3} value={editing.method} onChange={e => setEditing({ ...editing, method: e.target.value })} placeholder="详细描述测量方式" />
            </div>

            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                id="req-checkbox"
                type="checkbox"
                checked={!!editing.is_required}
                onChange={e => setEditing(prev => ({ ...prev, is_required: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="req-checkbox" style={{ margin: 0, cursor: 'pointer', userSelect: 'none' }}>设为该品类的「核心必填部位」</label>
            </div>

            <div className="modal-foot">
              <button className="btn-blue" onClick={saveTemplate} disabled={!editing.name.trim()}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeasurementTemplateManager;
