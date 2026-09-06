// REQ-011 历史版本弹窗：版本列表（5 分钟编辑会话合并）→ 单版详情对比（款式/尺寸表/BOM）→ 回滚
import React, { useState, useEffect, useCallback } from 'react';
import { X, History, ArrowLeft, RotateCcw, ChevronRight } from 'lucide-react';
import { fetchVersionHistory, fetchVersionDetail, fetchBomItems, rollbackVersion } from '../../api';
import ConfirmModal from './ConfirmModal';

const STYLE_FIELDS = [
  ['title', '款式名称'], ['category', '款式类别'], ['brand', '品牌'], ['designer', '设计师'],
  ['year', '年度'], ['season', '季节'], ['month', '波段'], ['priority', '优先级'],
  ['note', '打样说明'], ['fabric_req', '面料要求'], ['trim_req', '辅料要求'], ['process_req', '工艺建议'],
];

const fmtTime = (s) => (s || '').replace('T', ' ').slice(0, 16);

/** 款式/任务字段差异（返回有变化的行） */
const diffStyleFields = (snapTask, curTask) =>
  STYLE_FIELDS
    .map(([k, label]) => {
      const a = snapTask?.[k] ?? '';
      const b = curTask?.[k] ?? '';
      return { k, label, a, b, changed: String(a ?? '') !== String(b ?? '') };
    })
    .filter(r => r.changed);

/** 行级对比：按匹配键找新增/删除/变更（供尺寸表与 BOM 复用；比较时排除行 id，变更行附差异字段） */
const diffRows = (oldRows, newRows, keyOf) => {
  const out = [];
  const key = (r) => keyOf(r) || '';
  // 比较时剔除行元数据键（id/时间戳/排序/外键），只比业务字段
  const META_KEYS = ['id', 'task_id', 'created_at', 'updated_at', 'sort_order'];
  const norm = (r) => { if (!r) return null; const o = { ...r }; META_KEYS.forEach(k => delete o[k]); return o; };
  const oldMap = new Map((oldRows || []).map(r => [key(r), r]));
  const newMap = new Map((newRows || []).map(r => [key(r), r]));
  for (const [k, n] of newMap) {
    const o = oldMap.get(k);
    if (!o) { out.push({ key: k, kind: 'add', oldRow: null, newRow: n }); continue; }
    const a = norm(o), b = norm(n);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      const diffKeys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])]
        .filter(f => JSON.stringify(a?.[f]) !== JSON.stringify(b?.[f]));
      out.push({ key: k, kind: 'change', oldRow: o, newRow: n, diffKeys });
    }
  }
  for (const [k, o] of oldMap) {
    if (!newMap.has(k)) out.push({ key: k, kind: 'del', oldRow: o, newRow: null });
  }
  return out;
};

const BOM_FIELD_ZH = { spec: '规格', color: '颜色', unit: '单位', usage: '单耗', supplier: '供应商', price: '单价', note: '备注' };
const SIZE_FIELD_ZH = { tolerance: '公差', grading: '档差', size_values: '各码实测', comment: '备注' };

const VersionHistoryModal = ({ task, onClose, onRolledBack }) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // 单版详情 { id, version_no, summary, created_at, snapshot }
  const [curBom, setCurBom] = useState([]);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVersions(await fetchVersionHistory(task.id));
      setCurBom(await fetchBomItems(task.id).catch(() => []));
    } finally { setLoading(false); }
  }, [task.id]);

  useEffect(() => { load(); }, [load]);

  const openVersion = async (v) => {
    setBusy(true);
    try {
      const detail = await fetchVersionDetail(task.id, v.id);
      setSelected(detail);
    } catch (e) { alert('加载版本详情失败: ' + e.message); }
    finally { setBusy(false); }
  };

  const doRollback = async () => {
    setConfirmRollback(false);
    setBusy(true);
    try {
      await rollbackVersion(task.id, selected.id);
      alert(`已回滚到 V${selected.version_no}`);
      setSelected(null);
      await load();
      onRolledBack && onRolledBack();
    } catch (e) { alert('回滚失败: ' + e.message); }
    finally { setBusy(false); }
  };

  // 当前快照（对比基准）：款式字段来自 task prop，尺寸表来自 task.size_data
  const curTask = task || {};
  const curSize = curTask.size_data || [];

  return (
    <div className="modal-overlay" style={{ zIndex: 2100 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal glass version-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          {selected ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn-icon" onClick={() => setSelected(null)} title="返回列表"><ArrowLeft size={18} /></button>
              <History size={16} color="#38bdf8" /> 历史版本 V{selected.version_no}
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={16} color="#38bdf8" /> 历史版本 <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>{task.style_no} {task.title}</span>
            </span>
          )}
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        {!selected && (
          <div className="version-body">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>加载中…</div>
            ) : versions.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                暂无历史版本。<br />每次自动保存后生成版本，同一编辑会话（5 分钟内）自动合并为一条。
              </div>
            ) : (
              <div className="version-list custom-scrollbar">
                {versions.map((v, i) => (
                  <div key={v.id} className={`version-item ${i === 0 ? 'latest' : ''}`} onClick={() => openVersion(v)}>
                    <div className="version-item-head">
                      <span className="version-no">V{v.version_no}</span>
                      {i === 0 && <span className="version-latest-tag">最新</span>}
                      <span className="version-time">{fmtTime(v.created_at)}</span>
                    </div>
                    <div className="version-summary">{v.summary || '—'}</div>
                    <ChevronRight size={16} className="version-arrow" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selected && (
          <div className="version-body">
            <div className="version-detail-head">
              <span style={{ color: '#94a3b8', fontSize: 12 }}>记录于 {fmtTime(selected.created_at)} · {selected.summary}</span>
              <button className="btn-danger" onClick={() => setConfirmRollback(true)} disabled={busy}>
                <RotateCcw size={14} /> 回滚到此版本
              </button>
            </div>

            <div className="version-detail custom-scrollbar">
              {/* 款式/任务字段差异 */}
              <div className="section-title" style={{ borderLeftColor: '#38bdf8' }}>款式与任务字段</div>
              {(() => {
                const diffs = diffStyleFields(selected.snapshot?.task, curTask);
                if (!diffs.length) return <div className="version-none">与当前一致</div>;
                return (
                  <table className="mini-table version-diff-table">
                    <thead><tr><th>字段</th><th>版本内值</th><th>当前值</th></tr></thead>
                    <tbody>
                      {diffs.map(d => (
                        <tr key={d.k} className="diff-changed">
                          <td>{d.label}</td>
                          <td className="diff-old">{d.a === '' ? <span className="text-dim">（空）</span> : String(d.a)}</td>
                          <td className="diff-new">{d.b === '' ? <span className="text-dim">（空）</span> : String(d.b)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}

              {/* 尺寸表差异 */}
              <div className="section-title" style={{ borderLeftColor: '#f59e0b', marginTop: 24 }}>尺寸表</div>
              {(() => {
                const rows = diffRows(selected.snapshot?.size_data || [], curSize, r => r.name);
                if (!rows.length) return <div className="version-none">与当前一致</div>;
                return (
                  <table className="mini-table version-diff-table">
                    <thead><tr><th>状态</th><th>部位</th><th>版本内（公差/档差/实测）</th><th>当前（公差/档差/实测）</th></tr></thead>
                    <tbody>
                      {rows.map(r => (
                        <React.Fragment key={r.key}>
                          <tr className={`diff-${r.kind}`}>
                            <td>{r.kind === 'add' ? <span className="diff-badge add">新增</span> : r.kind === 'del' ? <span className="diff-badge del">删除</span> : <span className="diff-badge chg">变更</span>}</td>
                            <td>{r.key}</td>
                            <td className="diff-old">{r.oldRow ? `${r.oldRow.tolerance || '—'} / ${r.oldRow.grading || '—'}` : '—'}</td>
                            <td className="diff-new">{r.newRow ? `${r.newRow.tolerance || '—'} / ${r.newRow.grading || '—'}` : '—'}</td>
                          </tr>
                          {r.kind === 'change' && r.diffKeys?.length > 0 && (
                            <tr className="diff-keys-row">
                              <td colSpan={4}>差异：{r.diffKeys.map(k => SIZE_FIELD_ZH[k] || k).join('、')}</td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                );
              })()}

              {/* BOM 差异 */}
              <div className="section-title" style={{ borderLeftColor: '#34d399', marginTop: 24 }}>物料清单（BOM）</div>
              {(() => {
                const rows = diffRows(selected.snapshot?.bom || [], curBom, r => `${r.category}|${r.name}|${r.spec}`);
                if (!rows.length) return <div className="version-none">与当前一致</div>;
                return (
                  <table className="mini-table version-diff-table">
                    <thead><tr><th>状态</th><th>物料</th><th>版本内（单耗/单价/小计）</th><th>当前（单耗/单价/小计）</th></tr></thead>
                    <tbody>
                      {rows.map(r => (
                        <React.Fragment key={r.key}>
                          <tr className={`diff-${r.kind}`}>
                            <td>{r.kind === 'add' ? <span className="diff-badge add">新增</span> : r.kind === 'del' ? <span className="diff-badge del">删除</span> : <span className="diff-badge chg">变更</span>}</td>
                            <td>{r.oldRow ? `${r.oldRow.category} ${r.oldRow.name}` : `${r.newRow.category} ${r.newRow.name}`}</td>
                            <td className="diff-old">{r.oldRow ? `${r.oldRow.usage || 0}/${r.oldRow.price || 0}` : '—'}</td>
                            <td className="diff-new">{r.newRow ? `${r.newRow.usage || 0}/${r.newRow.price || 0}` : '—'}</td>
                          </tr>
                          {r.kind === 'change' && r.diffKeys?.length > 0 && (
                            <tr className="diff-keys-row">
                              <td colSpan={4}>差异：{r.diffKeys.map(k => BOM_FIELD_ZH[k] || k).join('、')}</td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        )}

        {confirmRollback && (
          <ConfirmModal
            title={`回滚到 V${selected?.version_no}`}
            message={`将把款式信息、尺寸表、物料清单恢复为 V${selected?.version_no} 时的内容（批次状态不受影响）。\n回滚本身会生成一条新版本，可再次回滚撤销。`}
            confirmText="确认回滚"
            onConfirm={doRollback}
            onCancel={() => setConfirmRollback(false)}
          />
        )}
      </div>
    </div>
  );
};

export default VersionHistoryModal;
