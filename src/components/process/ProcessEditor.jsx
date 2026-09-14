// 工艺指示编辑器：行内编辑 + 防抖自动保存（输入停顿约 400ms 自动提交）
// REQ-014：长文本列（工艺要求/做法、标准/参数、备注）改自动撑高 textarea；表头支持拖拽调列宽（localStorage 记忆）
// REQ-028：行拖拽排序——拖序号列手柄自由上下移行，松手即按新顺序自动保存 sort_order
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import {
  fetchProcessItems, createProcessItem, updateProcessItem, deleteProcessItem
} from '../../api';
import ConfirmModal from '../common/ConfirmModal';
import SmartSelect from '../common/SmartSelect';

const SECTIONS = ['部位工艺', '缝制工艺', '后整理', '特殊工艺', '其他'];

const cellStyle = {
  padding: '7px 10px', borderRadius: 6, color: 'var(--text-2)',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box'
};

// REQ-014 长文本输入：自动撑高 textarea（行随内容增长，超 5 行出内部滚动）
const textareaStyle = {
  ...cellStyle,
  height: 'auto', minHeight: 34, maxHeight: 130,
  resize: 'none', overflowY: 'auto', overflowX: 'hidden',
  lineHeight: 1.5, fontFamily: 'inherit', display: 'block'
};

/** 单行工艺：React.memo 隔离——输入时仅本行重渲染，不重建整表（卡顿根治） */
const ProcessRow = React.memo(({ row, idx, onField, widths, dragIdx, onDragStartRow, onDropRow }) => {
  const set = (field, value) => onField(row.id, field, value);
  const tdStyle = (w) => ({ padding: 6, width: w, minWidth: w });
  const isDragging = dragIdx === idx;
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--bg-hover)',
        background: isDragging ? 'var(--accent-soft)' : 'transparent',
        opacity: isDragging ? 0.7 : 1
      }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={e => { e.preventDefault(); onDropRow(idx); }}
    >
      <td style={{ padding: '8px 4px', color: 'var(--text-2)', textAlign: 'center', width: 44, minWidth: 44 }}>
        <span
          draggable
          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); onDragStartRow(idx); }}
          title="按住拖动调整顺序"
          style={{ cursor: 'grab', color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', padding: '2px 3px', borderRadius: 4 }}
        >
          <GripVertical size={14} />
        </span>
        <span style={{ marginLeft: 3, fontSize: 12 }}>{idx + 1}</span>
      </td>
      <td style={tdStyle(widths.section)}>
        <SmartSelect className="tbl-ss" style={{ width: '100%' }} allowCustom={false} value={row.section || ''} onChange={v => set('section', v)} options={SECTIONS} placeholder="部位工艺" />
      </td>
      <td style={tdStyle(widths.name)}>
        <input style={cellStyle} value={row.name || ''} placeholder="工艺项目（如：领口罗纹）" onChange={e => set('name', e.target.value)} />
      </td>
      <td style={tdStyle(widths.requirement)}>
        <textarea
          style={textareaStyle}
          rows={1}
          ref={el => { if (el) autoGrow(el); }}
          value={row.requirement || ''}
          placeholder="工艺要求 / 做法（可多行）"
          onChange={e => set('requirement', e.target.value)}
          onInput={e => autoGrow(e.target)}
        />
      </td>
      <td style={tdStyle(widths.standard)}>
        <textarea
          style={textareaStyle}
          rows={1}
          ref={el => { if (el) autoGrow(el); }}
          value={row.standard || ''}
          placeholder="标准 / 参数（如：针距3针/cm）"
          onChange={e => set('standard', e.target.value)}
          onInput={e => autoGrow(e.target)}
        />
      </td>
      <td style={tdStyle(widths.note)}>
        <textarea
          style={textareaStyle}
          rows={1}
          ref={el => { if (el) autoGrow(el); }}
          value={row.note || ''}
          placeholder="备注"
          onChange={e => set('note', e.target.value)}
          onInput={e => autoGrow(e.target)}
        />
      </td>
      <td style={{ padding: 6, textAlign: 'center', width: widths.action }}>
        <button className="btn--icon-danger" onClick={() => onField(row.id, '__delete')} title="删除">
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
});

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
  } catch { /* 忽略：localStorage 不可用或数据损坏 */ }
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
  const [dragIdx, setDragIdx] = useState(null); // REQ-028 当前拖拽行下标
  const rowsRef = useRef([]); // REQ-028 拖拽排序时读最新 rows（避免闭包过期）
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // REQ-014 拖拽列宽：更新 state 并记忆到 localStorage
  const setColWidth = useCallback((key, w) => {
    setColWidths(prev => {
      const next = { ...prev, [key]: w };
      try { localStorage.setItem(COL_KEY, JSON.stringify(next)); } catch { /* 忽略：localStorage 不可用或数据损坏 */ }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProcessItems(taskId);
      // REQ-028 按 sort_order 升序渲染（后端若已排序也兼容）
      setRows([...data].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    }
    catch (e) { alert('加载工艺指示失败: ' + e.message); }
    finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  const timersRef = useRef({});
  // 稳定引用：行级 memo 依赖它不变，否则每行都会重渲染
  const handleField = useCallback((id, field, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    if (field === '__delete') { setConfirmDelId(id); return; }
    const key = `${id}-${field}`;
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(async () => {
      try { await updateProcessItem(id, { [field]: value }); }
      catch (e) { alert('保存失败: ' + e.message); }
    }, 400);
  }, []);

  // REQ-028 行拖拽排序：松手后重排并逐行持久化新 sort_order
  const onDragStartRow = useCallback((idx) => { setDragIdx(idx); }, []);
  const onDropRow = useCallback((targetIdx) => {
    if (dragIdx == null || dragIdx === targetIdx) { setDragIdx(null); return; }
    const from = dragIdx;
    setDragIdx(null);
    const next = [...rowsRef.current];
    const [moved] = next.splice(from, 1);
    next.splice(targetIdx, 0, moved);
    next.forEach((r, i) => {
      if (r.sort_order !== i) {
        updateProcessItem(r.id, { sort_order: i }).catch(e => alert('排序保存失败: ' + e.message));
      }
    });
    setRows(next.map((r, i) => ({ ...r, sort_order: i })));
  }, [dragIdx]);


  const handleAdd = async () => {
    setBusy(true);
    try {
      await createProcessItem({ task_id: taskId, section: '部位工艺', sort_order: rows.length });
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
    background: 'var(--bg-elev)', borderBottom: '2px solid var(--border)',
    whiteSpace: 'nowrap', width: w, position: 'relative', minWidth: w
  });

  return (
    <div className="glass" style={{ gridColumn: '1/-1', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ borderLeftColor: 'var(--color-warn)' }}>
          <div>工艺指示</div>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>编辑后自动保存 · 共 {rows.length} 项 · 拖动行首手柄可排序 · 拖动表头右侧竖线可调列宽</span>
        </div>
        <button className="btn--primary btn--sm" onClick={handleAdd} disabled={busy}>
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
                <ProcessRow key={row.id} row={row} idx={idx} onField={handleField} widths={colWidths} dragIdx={dragIdx} onDragStartRow={onDragStartRow} onDropRow={onDropRow} />
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
