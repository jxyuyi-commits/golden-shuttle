// BOM 物料清单编辑器：行内编辑 + 防抖自动保存（输入停顿约 400ms 自动提交）
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  fetchBomItems, createBomItem, updateBomItem, deleteBomItem
} from '../../api';
import ConfirmModal from '../common/ConfirmModal';

const CATEGORIES = ['主料', '辅料', '里料', '衬料', '其他'];
const UNITS = ['米', 'kg', '个', '条', '套', '码'];

const cellStyle = {
  background: 'rgba(2,6,23,0.45)',
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '7px 10px', borderRadius: 6, color: '#e2e8f0',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box'
};

/** BOM 物料清单：一表多行，挂靠在打样单下 */
const BomEditor = ({ taskId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState(null); // REQ-006② 待删除物料 id

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await fetchBomItems(taskId)); }
    catch (e) { alert('加载物料清单失败: ' + e.message); }
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
      try { await updateBomItem(id, { [field]: value }); }
      catch (e) { alert('保存失败: ' + e.message); }
    }, 400);
  };

  const handleAdd = async () => {
    setBusy(true);
    try {
      await createBomItem({ task_id: taskId, category: '主料' });
      await load();
    } catch (e) { alert('添加失败: ' + e.message); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (confirmDelId == null) return;
    const id = confirmDelId;
    setConfirmDelId(null);
    try { await deleteBomItem(id); await load(); }
    catch (e) { alert('删除失败: ' + e.message); }
  };

  const totalCost = rows.reduce((s, r) => s + (parseFloat(r.usage) || 0) * (parseFloat(r.price) || 0), 0);

  return (
    <div className="glass" style={{ gridColumn: '1/-1', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ borderLeftColor: '#38bdf8' }}>
          <div>物料清单（BOM）</div>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>编辑后自动保存 · 共 {rows.length} 项</span>
        </div>
        <button className="btn-blue-sm" onClick={handleAdd} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} 添加物料
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>加载中…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          暂无物料，点击右上角「添加物料」开始建立清单
        </div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
            <thead>
              <tr>
                {['序号', '类别', '名称', '规格/成分', '颜色', '单位', '单耗', '供应商', '单价', '小计', '备注', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, color: '#64748b', background: '#0f172a', borderBottom: '2px solid rgba(56,189,248,0.15)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const subtotal = (parseFloat(row.usage) || 0) * (parseFloat(row.price) || 0);
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 8px', color: '#94a3b8', textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ padding: 6, width: 90 }}>
                      <select style={cellStyle} value={row.category || '主料'} onChange={e => { setField(row.id, 'category', e.target.value); scheduleCommit(row.id, 'category', e.target.value); }}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: 6, width: 140 }}>
                      <input style={cellStyle} value={row.name || ''} placeholder="物料名称" onChange={e => { setField(row.id, 'name', e.target.value); scheduleCommit(row.id, 'name', e.target.value); }} />
                    </td>
                    <td style={{ padding: 6, width: 170 }}>
                      <input style={cellStyle} value={row.spec || ''} placeholder="规格/成分" onChange={e => { setField(row.id, 'spec', e.target.value); scheduleCommit(row.id, 'spec', e.target.value); }} />
                    </td>
                    <td style={{ padding: 6, width: 90 }}>
                      <input style={cellStyle} value={row.color || ''} placeholder="颜色" onChange={e => { setField(row.id, 'color', e.target.value); scheduleCommit(row.id, 'color', e.target.value); }} />
                    </td>
                    <td style={{ padding: 6, width: 80 }}>
                      <select style={cellStyle} value={row.unit || ''} onChange={e => { setField(row.id, 'unit', e.target.value); scheduleCommit(row.id, 'unit', e.target.value); }}>
                        <option value="">—</option>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: 6, width: 80 }}>
                      <input style={cellStyle} type="number" step="0.001" value={row.usage ?? ''} placeholder="单耗" onChange={e => { setField(row.id, 'usage', e.target.value); scheduleCommit(row.id, 'usage', e.target.value); }} />
                    </td>
                    <td style={{ padding: 6, width: 120 }}>
                      <input style={cellStyle} value={row.supplier || ''} placeholder="供应商" onChange={e => { setField(row.id, 'supplier', e.target.value); scheduleCommit(row.id, 'supplier', e.target.value); }} />
                    </td>
                    <td style={{ padding: 6, width: 90 }}>
                      <input style={cellStyle} type="number" step="0.01" value={row.price ?? ''} placeholder="单价" onChange={e => { setField(row.id, 'price', e.target.value); scheduleCommit(row.id, 'price', e.target.value); }} />
                    </td>
                    <td style={{ padding: '6px 8px', color: '#38bdf8', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {subtotal ? `¥${subtotal.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: 6, width: 140 }}>
                      <input style={cellStyle} value={row.note || ''} placeholder="备注" onChange={e => { setField(row.id, 'note', e.target.value); scheduleCommit(row.id, 'note', e.target.value); }} />
                    </td>
                    <td style={{ padding: 6, textAlign: 'center' }}>
                      <button className="icon-btn-danger" onClick={() => setConfirmDelId(row.id)} title="删除">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={9} style={{ padding: '12px 8px', textAlign: 'right', color: '#94a3b8', fontSize: 13 }}>
                  单件物料成本合计
                </td>
                <td colSpan={3} style={{ padding: '12px 8px', color: '#38bdf8', fontSize: 15, fontWeight: 800 }}>
                  ¥{totalCost.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {confirmDelId != null && (
        <ConfirmModal
          title="删除物料"
          message={`确定删除该物料吗？（共 ${rows.length} 项）\n删除后不可恢复。`}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelId(null)}
        />
      )}
    </div>
  );
};

export default BomEditor;
