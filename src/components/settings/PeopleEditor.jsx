import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { PEOPLE_ROLES } from '../../utils/people';

const roleColor = (r) => (
  r === '设计师' ? 'rgba(56,189,248,0.18)'
  : r === '版师' ? 'rgba(167,139,250,0.18)'
  : r === '样衣工' ? 'rgba(52,211,153,0.18)'
  : 'rgba(148,163,184,0.18)'
);

/**
 * 人员预设编辑器（REQ-006，取代原「设计师库」）：
 * 人员 = 姓名 + 角色集（设计师/版师/样衣工，角色可自定义添加、可多角色）
 * 数据：[{ name, roles: [] }]
 */
const PeopleEditor = ({ people, onChange }) => {
  const [input, setInput] = useState('');
  const [roleInputFor, setRoleInputFor] = useState(null); // 正在输入角色的人员 name
  const [roleInput, setRoleInput] = useState('');

  const addPerson = () => {
    const v = input.trim();
    if (!v || people.some(p => p.name === v)) return;
    onChange([...people, { name: v, roles: [] }]);
    setInput('');
  };

  const removePerson = (p) => {
    if (!window.confirm(`确认移除人员「${p.name}」？仅移出预设，历史单据中的记录不受影响。`)) return;
    onChange(people.filter(x => x.name !== p.name));
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

  return (
    <div className="glass-inner setting-card-compact">
      <div className="card-mini-head">
        <span className="card-mini-title">人员预设</span>
        <span className="card-mini-count">{people.length}</span>
      </div>
      <div style={{ fontSize: 11, color: '#64748b', margin: '-2px 0 8px' }}>
        姓名 + 角色（设计师 / 版师 / 样衣工…，一人可多角色，角色可自定义）
      </div>
      <div className="people-list custom-scrollbar">
        {people.length === 0 && <span className="tag-empty-mini">未配置人员，在下方添加</span>}
        {people.map(p => (
          <div key={p.name} className="people-row">
            <span className="people-name">{p.name}</span>
            <span className="people-roles">
              {p.roles.map(r => (
                <span key={r} className="tag-mini" style={{ background: roleColor(r) }}>
                  {r}
                  <button className="tag-del" onClick={() => removeRole(p, r)}><X size={10} /></button>
                </span>
              ))}
              {roleInputFor === p.name ? (
                <input
                  className="people-role-input"
                  value={roleInput}
                  autoFocus
                  placeholder="新角色"
                  onChange={e => setRoleInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addRole(p, roleInput); if (e.key === 'Escape') { setRoleInputFor(null); setRoleInput(''); } }}
                  onBlur={() => { if (roleInput.trim()) addRole(p, roleInput); else { setRoleInputFor(null); setRoleInput(''); } }}
                />
              ) : (
                <button className="people-add-role" title="添加角色" onClick={() => { setRoleInputFor(p.name); setRoleInput(''); }}>
                  <Plus size={11} /> 角色
                </button>
              )}
              {roleInputFor !== p.name && suggestRoles(p).length > 0 && (
                <span className="people-suggest">
                  {suggestRoles(p).map(r => (
                    <button key={r} className="people-suggest-btn" onClick={() => addRole(p, r)}>+{r}</button>
                  ))}
                </span>
              )}
            </span>
            <button className="tag-del" title="移除人员" onClick={() => removePerson(p)}><X size={11} /></button>
          </div>
        ))}
      </div>
      <div className="add-row-mini">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="添加人员姓名"
          onKeyDown={e => e.key === 'Enter' && addPerson()} />
        <button className="btn-add-mini" onClick={addPerson}><Plus size={14} /></button>
      </div>
    </div>
  );
};

export default PeopleEditor;
