// 工艺指示编辑器：行内编辑 + 防抖自动保存（输入停顿约 400ms 自动提交）
// REQ-014：长文本列（工艺要求/做法、标准/参数、备注）改自动撑高 textarea；表头支持拖拽调列宽（localStorage 记忆）
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  fetchProcessItems, createProcessItem, updateProcessItem, deleteProcessItem
} from '../../api';
import ConfirmModal from '../common/ConfirmModal';

const SECTIONS = ['部位工艺', '缝制工艺', '后整理', '特殊工艺', '其他'];

const cellStyle = {
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  padding: '7px 10px', borderRadius: 6, color: 'var(--text)',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box'
};

// REQ-014 长文本输入：自动撑高 textarea（行随内容增长，超 5 行出内部滚动）
const textareaStyle = {
  ...cellStyle,
  height: 'auto', minHeight: 34, maxHeight: 130,
  resize: 'none', overflowY: 'auto', overflowX: 'hidden',
  lineHeight: 1.5, fontFamily: 'inherit', display: 'block'
};

const autoGrow = (el) => {
  if (!el) return;
  el.style.height = 'auto';
  const h = Math.min(el.scrollHeight + 2, 130);
  el.style.height = h + 'px';
};

const COL_KEY = 'proc_col_widths_v1';
const DEFAULT_COLS = { section: 110, name: 150, requirement: 320, standard: 200, note: 140, action: 56 };
const loadCols = () => {
  try {
    const s = localStorage.getItem(COL_KEY);
    if (s) return { ...DEFAULT_COLS, ...JSON.parse(s) };
  } catch (e) { /* ignore */ }
  return DEFAULT_COLS;
};

// REQ-014 列宽拖拽手柄：mousedown 起监听 mousemove，实时回调宽度
const ColDragHandle = ({ colKey, width, onWidth }) => {
  const start = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width;
    const move = (ev) => {
      const w = Math.max(80, Math.min(560, startW + ev.clientX - startX));
      onWidth(colKey, w);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  return <span className="col-drag" onMouseDown={start} title="拖拽调整列宽" />;
};

/** 工艺指示：一表多行，挂靠在打样单下 */
const ProcessEditor = ({ taskId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState(null); // REQ-006② 待删除工艺 id
  const [colWidths, setColWidths] = useState(loadCols);

  // REQ-014 拖拽列宽：更新 state 并记忆到 localStorage
  const setColWidth = useCallback((key, w) => {
    setColWidths(prev => {
      const next = { ...prev, [key]: w };
      try { localStorage.setItem(COL_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
      return next;
    });
  }, []);

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

  const doDelete = async () => {
    if (confirmDelId == null) return;
    const id = confirmDelId;
    setConfirmDelId(null);
    try { await deleteProcessItem(id); await load(); }
    catch (e) { alert('删除失败: ' + e.message); }
  };

  const thStyle = (w) => ({
    padding: '10px 8px', textAlign: 'left', fontSize: 12, color: 'var(--text-3)',
    background: 'var(--bg-elev)', borderBottom: '2px solid rgba(56,189,248,0.15)',
    whiteSpace: 'nowrap', width: w, position: 'relative', minWidth: w
  });
  const tdStyle = (w) => ({ padding: 6, width: w, minWidth: w });

  return (
    <div className="glass" style={{ gridColumn: '1/-1', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ borderLeftColor: '#f59e0b' }}>
          <div>工艺指示</div>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>编辑后自动保存 · 共 {rows.length} 项 · 拖动表头右侧竖线可调列宽</span>
        </div>
        <button className="btn-blue-sm" onClick={handleAdd} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} 添加工艺
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>加载中…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          暂无工艺指示，点击右上角「添加工艺」开始记录
        </div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: colWidths.section }} />
              <col style={{ width: colWidths.name }} />
              <col style={{ width: colWidths.requirement }} />
              <col style={{ width: colWidths.standard }} />
              <col style={{ width: colWidths.note }} />
              <col style={{ width: colWidths.action }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...thStyle(44), width: 44, minWidth: 44 }}>序号</th>
                <th style={thStyle(colWidths.section)}>
                  分类
                  <ColDragHandle colKey="section" width={colWidths.section} onWidth={setColWidth} />
                </th>
                <th style={thStyle(colWidths.name)}>
                  工艺项目
                  <ColDragHandle colKey="name" width={colWidths.name} onWidth={setColWidth} />
                </th>
                <th style={thStyle(colWidths.requirement)}>
                  工艺要求 / 做法
                  <ColDragHandle colKey="requirement" width={colWidths.requirement} onWidth={setColWidth} />
                </th>
                <th style={thStyle(colWidths.standard)}>
                  标准 / 参数
                  <ColDragHandle colKey="standard" width={colWidths.standard} onWidth={setColWidth} />
                </th>
                <th style={thStyle(colWidths.note)}>
                  备注
                  <ColDragHandle colKey="note" width={colWidths.note} onWidth={setColWidth} />
                </th>
                <th style={{ ...thStyle(colWidths.action), width: colWidths.action, minWidth: colWidths.action }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--bg-hover)' }}>
                  <td style={{ padding: '8px 8px', color: 'var(--text-2)', textAlign: 'center', width: 44 }}>{idx + 1}</td>
                  <td style={tdStyle(colWidths.section)}>
                    <select style={cellStyle} value={row.section || '部位工艺'} onChange={e => { setField(row.id, 'section', e.target.value); scheduleCommit(row.id, 'section', e.target.value); }}>
                      {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle(colWidths.name)}>
                    <input style={cellStyle} value={row.name || ''} placeholder="工艺项目（如：领口罗纹）" onChange={e => { setField(row.id, 'name', e.target.value); scheduleCommit(row.id, 'name', e.target.value); }} />
                  </td>
                  <td style={tdStyle(colWidths.requirement)}>
                    <textarea
                      style={textareaStyle}
                      rows={1}
                      ref={el => { if (el) autoGrow(el); }}
                      value={row.requirement || ''}
                      placeholder="工艺要求 / 做法（可多行）"
                      onChange={e => { setField(row.id, 'requirement', e.target.value); scheduleCommit(row.id, 'requirement', e.target.value); }}
                      onInput={e => autoGrow(e.target)}
                    />
                  </td>
                  <td style={tdStyle(colWidths.standard)}>
                    <textarea
                      style={textareaStyle}
                      rows={1}
                      ref={el => { if (el) autoGrow(el); }}
                      value={row.standard || ''}
                      placeholder="标准 / 参数（如：针距3针/cm）"
                      onChange={e => { setField(row.id, 'standard', e.target.value); scheduleCommit(row.id, 'standard', e.target.value); }}
                      onInput={e => autoGrow(e.target)}
                    />
                  </td>
                  <td style={tdStyle(colWidths.note)}>
                    <textarea
                      style={textareaStyle}
                      rows={1}
                      ref={el => { if (el) autoGrow(el); }}
                      value={row.note || ''}
                      placeholder="备注"
                      onChange={e => { setField(row.id, 'note', e.target.value); scheduleCommit(row.id, 'note', e.target.value); }}
                      onInput={e => autoGrow(e.target)}
                    />
                  </td>
                  <td style={{ padding: 6, textAlign: 'center', width: colWidths.action }}>
                    <button className="icon-btn-danger" onClick={() => setConfirmDelId(row.id)} title="删除">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelId != null && (
        <ConfirmModal
          title="删除工艺指示"
          message="确定删除该工艺指示吗？\n删除后不可恢复。"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelId(null)}
        />
      )}
    </div>
  );
};

export default ProcessEditor;
