import React, { useState } from 'react';
import { X, Plus, Pencil } from 'lucide-react';
import { PEOPLE_ROLES } from '../../utils/people';
import ConfirmModal from '../common/ConfirmModal';
import { renamePerson } from '../../api';

const roleColor = (r) => (
  r === '设计师' ? 'var(--accent-soft)'
  : r === '版师' ? 'rgba(167,139,250,0.18)'
  : r === '样衣工' ? 'rgba(52,211,153,0.18)'
  : 'var(--bg-hover)'
);

/**
 * 人员预设编辑器（REQ-008，取代原「设计师库」）：
 * 人员 = 姓名 + 角色集（设计师/版师/样衣工，角色可自定义添加、可多角色）
 * 数据：[{ name, roles: [] }]
 * REQ-019：姓名支持重新编辑（点击进入编辑态，Enter/blur 即改即存，Escape 取消，重名校验与新增一致）；
 *   改名经 PATCH /api/people/rename，后端事务同步全站引用（styles.designer / 批次版师·样衣工），
 *   成功后回调 onRenamed 刷新全站。
 */
const PeopleEditor = ({ people, onChange, onRenamed }) => {
  const [input, setInput] = useState('');
  const [roleInputFor, setRoleInputFor] = useState(null); // 正在输入角色的人员行索引
  const [roleInput, setRoleInput] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null); // REQ-006② 待移除人员
  const [editingIdx, setEditingIdx] = useState(null); // REQ-019 正在编辑姓名的行索引
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const addPerson = () => {
    const v = input.trim();
    if (!v || people.some(p => p.name === v)) return;
    onChange([...people, { name: v, roles: [] }]);
    setInput('');
  };

  const doRemovePerson = () => {
    if (!confirmRemove) return;
    onChange(people.filter(x => x.name !== confirmRemove));
    setConfirmRemove(null);
  };

  const addRole = (p, role) => {
    const r = (role || '').trim();
    if (!r || p.roles.includes(r)) return;
    onChange(people.map(x => x.name === p.name ? { ...x, roles: [...x.roles, r] } : x));
    setRoleInputFor(null);
    setRoleInput('');
  };

  const removeRole = (p, role) => {
    onChange(people.map(x => x.name === p.name ? { ...x, roles: x.roles.filter(r => r !== role) } : x));
  };

  const suggestRoles = (p) => PEOPLE_ROLES.filter(r => !p.roles.includes(r));

  // REQ-019：进入姓名编辑态
  const startEditName = (idx) => {
    setEditingIdx(idx);
    setNameDraft(people[idx].name);
  };

  // REQ-019：提交改名（即改即存；重名阻止；成功后同步全站引用并刷新）
  const commitRename = async () => {
    if (editingIdx === null || saving) return;
    const p = people[editingIdx];
    const v = nameDraft.trim();
    if (!v || v === p.name) { setEditingIdx(null); setNameDraft(''); return; }
    if (people.some(x => x.name === v)) return; // 重名校验与新增一致
    const idx = editingIdx;
    const oldName = p.name;
    setEditingIdx(null);
    setNameDraft('');
    setSaving(true);
    try {
      await renamePerson(oldName, v);
      onChange(people.map((x, i) => i === idx ? { ...x, name: v } : x));
      onRenamed?.();
    } catch (e) {
      console.error('改名失败', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-inner setting-card-compact">
      <div className="card-mini-head">
        <span className="card-mini-title">人员预设</span>
        <span className="card-mini-count">{people.length}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', margin: '-2px 0 8px' }}>
        姓名 + 角色（设计师 / 版师 / 样衣工…，一人可多角色，角色可自定义）
      </div>
      <div className="people-list custom-scrollbar">
        {people.length === 0 && <span className="tag-empty-mini">未配置人员，在下方添加</span>}
        {people.map((p, idx) => (
          <div key={idx} className="people-row">
            {editingIdx === idx ? (
              <input
                className="people-name-input"
                value={nameDraft}
                autoFocus
                disabled={saving}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') { setEditingIdx(null); setNameDraft(''); }
                }}
                onBlur={commitRename}
              />
            ) : (
              <span className="people-name" title="点击编辑姓名" onClick={() => startEditName(idx)}>
                {p.name}
                <Pencil size={10} className="people-name-pen" />
              </span>
            )}
            <span className="people-roles">
              {p.roles.map(r => (
                <span key={r} className="tag-mini" style={{ background: roleColor(r) }}>
                  {r}
                  <button className="tag-del" onClick={() => removeRole(p, r)}><X size={10} /></button>
                </span>
              ))}
              {roleInputFor === idx ? (
                <input
                  className="people-role-input"
                  value={roleInput}
                  autoFocus
                  placeholder="新角色"
                  onChange={e => setRoleInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addRole(p, roleInput);
                    if (e.key === 'Escape') { setRoleInputFor(null); setRoleInput(''); }
                  }}
                  onBlur={() => { if (roleInput.trim()) addRole(p, roleInput); else { setRoleInputFor(null); setRoleInput(''); } }}
                />
              ) : (
                <button className="people-add-role" title="添加角色" onClick={() => { setRoleInputFor(idx); setRoleInput(''); }}>
                  <Plus size={11} /> 角色
                </button>
              )}
              {roleInputFor !== idx && suggestRoles(p).length > 0 && (
                <span className="people-suggest">
                  {suggestRoles(p).map(r => (
                    <button key={r} className="people-suggest-btn" onClick={() => addRole(p, r)}>+{r}</button>
                  ))}
                </span>
              )}
            </span>
            <button className="tag-del" title="移除人员" onClick={() => setConfirmRemove(p.name)}><X size={11} /></button>
          </div>
        ))}
      </div>
      <div className="add-row-mini">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="添加人员姓名"
          onKeyDown={e => e.key === 'Enter' && addPerson()} />
        <button className="btn-add-mini" onClick={addPerson}><Plus size={14} /></button>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="移除人员"
          message={`确定将「${confirmRemove}」移出人员预设吗？\n仅移出预设，历史单据中的记录不受影响。`}
          onConfirm={doRemovePerson}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
};

export default PeopleEditor;
