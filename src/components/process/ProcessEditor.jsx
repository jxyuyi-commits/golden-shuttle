// 工艺指示编辑器：行内编辑 + 防抖自动保存（输入停顿约 400ms 自动提交）
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  fetchProcessItems, createProcessItem, updateProcessItem, deleteProcessItem
} from '../../api';

const SECTIONS = ['部位工艺', '缝制工艺', '后整理', '特殊工艺', '其他'];

const cellStyle = {
  background: 'rgba(2,6,23,0.45)',
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '7px 10px', borderRadius: 6, color: '#e2e8f0',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box'
};

/** 工艺指示：一表多行，挂靠在打样单下 */
const ProcessEditor = ({ taskId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await fetchProcessItems(taskId)); }
    catch (e) { alert('加载工艺指示失败: ' + e.message); }
    finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  const setField = (id, field, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // 防抖自动保存：输入停顿后提交最新值，避免快速连续编辑丢字段
  const timersRef = useRef({});
  const scheduleCommit = (id, field, value) => {
    const key = `${id}-${field}`;
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(async () => {
      try { await updateProcessItem(id, { [field]: value }); }
      catch (e) { alert('保存失败: ' + e.message); }
    }, 400);
  };

  const handleAdd = async () => {
    setBusy(true);
    try {
      await createProcessItem({ task_id: taskId, section: '部位工艺' });
      await load();
    } catch (e) { alert('添加失败: ' + e.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确认删除该工艺指示？')) return;
    try { await deleteProcessItem(id); await load(); }
    catch (e) { alert('删除失败: ' + e.message); }
  };

  return (
    <div className="glass" style={{ gridColumn: '1/-1', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ borderLeftColor: '#f59e0b' }}>
          <div>工艺指示</div>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>编辑后自动保存 · 共 {rows.length} 项</span>
        </div>
        <button className="btn-blue-sm" onClick={handleAdd} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} 添加工艺
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>加载中…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          暂无工艺指示，点击右上角「添加工艺」开始记录
        </div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
            <thead>
              <tr>
                {['序号', '分类', '工艺项目', '工艺要求 / 做法', '标准 / 参数', '备注', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, color: '#64748b', background: '#0f172a', borderBottom: '2px solid rgba(56,189,248,0.15)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '8px 8px', color: '#94a3b8', textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ padding: 6, width: 110 }}>
                    <select style={cellStyle} value={row.section || '部位工艺'} onChange={e => { setField(row.id, 'section', e.target.value); scheduleCommit(row.id, 'section', e.target.value); }}>
                      {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 6, width: 150 }}>
                    <input style={cellStyle} value={row.name || ''} placeholder="工艺项目（如：领口罗纹）" onChange={e => { setField(row.id, 'name', e.target.value); scheduleCommit(row.id, 'name', e.target.value); }} />
                  </td>
                  <td style={{ padding: 6, width: 260 }}>
                    <input style={cellStyle} value={row.requirement || ''} placeholder="工艺要求 / 做法" onChange={e => { setField(row.id, 'requirement', e.target.value); scheduleCommit(row.id, 'requirement', e.target.value); }} />
                  </td>
                  <td style={{ padding: 6, width: 200 }}>
                    <input style={cellStyle} value={row.standard || ''} placeholder="标准 / 参数（如：针距3针/cm）" onChange={e => { setField(row.id, 'standard', e.target.value); scheduleCommit(row.id, 'standard', e.target.value); }} />
                  </td>
                  <td style={{ padding: 6, width: 140 }}>
                    <input style={cellStyle} value={row.note || ''} placeholder="备注" onChange={e => { setField(row.id, 'note', e.target.value); scheduleCommit(row.id, 'note', e.target.value); }} />
                  </td>
                  <td style={{ padding: 6, textAlign: 'center' }}>
                    <button className="btn-icon-sm" onClick={() => handleDelete(row.id)} title="删除" style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProcessEditor;
