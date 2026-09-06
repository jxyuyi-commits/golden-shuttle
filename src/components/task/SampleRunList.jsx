import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Loader2, Link2, X } from 'lucide-react';
import SmartSelect from '../common/SmartSelect';
import { fetchRuns, createRun, updateRun, deleteRun, fetchDrawings } from '../../api';

// 批次状态（板师手动推进）
export const RUN_STATUS = [
  { key: 'waiting_material', label: '待配料', color: '#94a3b8' },
  { key: 'pattern_making', label: '打版中', color: '#38bdf8' },
  { key: 'sample_making', label: '样衣中', color: '#fbbf24' },
  { key: 'pending_confirm', label: '待确认', color: '#a78bfa' },
  { key: 'done', label: '已完成', color: '#4ade80' },
];
// 阻塞原因（独立字段）
const BLOCKERS = [
  { key: 'none', label: '无阻塞' },
  { key: 'short_material', label: '欠面辅料' },
  { key: 'wait_designer', label: '待设计师确认' },
  { key: 'wait_tech', label: '待工艺单' },
  { key: 'other', label: '其他' },
];
const PRIORITIES = ['低', '中', '高', '紧急'];
const AUDIT_STATUSES = ['未提交', '待审核', '已通过', '已驳回'];
const auditColor = (s) => (s === '已通过' ? '#4ade80' : s === '已驳回' ? '#f87171' : s === '待审核' ? '#fbbf24' : '#94a3b8');
const statusLabel = (k) => RUN_STATUS.find(s => s.key === k)?.label || k;
const statusColor = (k) => RUN_STATUS.find(s => s.key === k)?.color || '#94a3b8';

/**
 * 版次批次列表：一款单下多个打样批次（板师工作单元），内联增删改、即时保存
 * @param {string|number} taskId 款单 id
 * @param {object} settings 系统设置（sampleTypes / sizeGroups / category 联动尺码）
 * @param {string} category 当前款单品类（用于联动尺码选项）
 * @param {function} onStatusSync 批次状态变化后回调（款级状态已自动同步，通知父组件刷新）
 */
const SampleRunList = ({ taskId, settings, category, onStatusSync }) => {
  const [runs, setRuns] = useState([]);
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [manageId, setManageId] = useState(null); // 当前展开"管理绑定"的批次 id

  const load = useCallback(async () => {
    try {
      const [list, drs] = await Promise.all([fetchRuns(taskId), fetchDrawings(taskId).catch(() => [])]);
      setRuns(list || []);
      setDrawings(drs || []);
    } catch (e) {
      console.error('加载批次失败', e);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // 品类联动尺码（与详情页同款逻辑）
  const getSizeList = () => {
    const catObj = (settings.categories || []).find(c => (typeof c === 'string' ? c : c.name) === category);
    if (catObj && typeof catObj !== 'string' && catObj.size_group_id) {
      const grp = (settings.sizeGroups || []).find(g => g.id == catObj.size_group_id);
      if (grp) return grp.size_list.split(',').map(s => s.trim());
    }
    return ['S', 'M', 'L', 'XL', 'XXL'];
  };

  // 本地即时更新 + PATCH 持久化（select/date 即时；文本由 onBlur 调用）
  const patch = async (id, patchData, localValue) => {
    setRuns(prev => prev.map(r => (r.id === id ? { ...r, ...patchData } : r)));
    setSavingId(id);
    try {
      await updateRun(id, patchData);
      // 状态变化会触发款级 status 自动同步，通知父组件刷新
      if (patchData.status) onStatusSync?.();
    } catch (e) {
      console.error('批次保存失败', e);
      load(); // 失败回滚为服务端状态
    } finally {
      setSavingId(null);
    }
  };

  const addRun = async () => {
    const sampleType = settings.sampleTypes?.[0] || '胚样';
    const { id } = await createRun(taskId, { sample_type: sampleType, status: 'waiting_material' });
    await load();
    onStatusSync?.();
    return id;
  };

  // ── 资料版本绑定 ──
  const parseLinkedIds = (r) => {
    try { return JSON.parse(r.linked_drawing_ids || '[]'); } catch { return []; }
  };
  // drawings 按 group_id 分组（同组=同一文件的不同版本）
  const drawingGroups = (() => {
    const map = {};
    for (const d of drawings) {
      const gid = d.group_id || `g_${d.id}`;
      const name = d.filename || d.title || '未命名';
      if (!map[gid]) map[gid] = { group_id: gid, file_name: name, versions: [] };
      map[gid].versions.push(d);
    }
    return Object.values(map).sort((a, b) => (a.file_name || '').localeCompare(b.file_name || ''));
  })();
  const drawingById = (id) => drawings.find(d => d.id === id);

  const toggleLink = async (run, drawingId) => {
    const ids = parseLinkedIds(run);
    const next = ids.includes(drawingId) ? ids.filter(x => x !== drawingId) : [...ids, drawingId];
    await patch(run.id, { linked_drawing_ids: JSON.stringify(next) });
  };

  const removeRun = async (r) => {
    if (!window.confirm(`确认删除「${r.sample_type || '未命名版次'} ${r.size || ''} ${r.sample_color || ''}」批次？删除后不可恢复。`)) return;
    await deleteRun(r.id);
    load();
    onStatusSync?.();
  };

  if (loading) {
    return <div style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>批次加载中…</div>;
  }

  return (
    <div className="run-list">
      {runs.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '8px 0 4px' }}>
          暂无打样批次，点击下方按钮新增（一款可并行胚样、头版样等多个批次）
        </div>
      )}
      {runs.map((r, idx) => (
        <div key={r.id} className="run-card" data-blocked={r.blocker && r.blocker !== 'none' ? '1' : '0'}>
          {r.order_no && (
            <div className="run-order-no" title="本版次打样单号（款内 V 编号，删除批次不重排）">
              打样单号：<em>{r.order_no}</em>
            </div>
          )}
          <div className="run-card-head">
            <div className="run-card-title">
              <span className="run-idx">#{idx + 1}</span>
              <div style={{ width: 150 }}>
                <SmartSelect
                  value={r.sample_type || ''}
                  onChange={v => patch(r.id, { sample_type: v })}
                  options={settings.sampleTypes || []}
                  placeholder="选择版次"
                />
              </div>
              <span className="run-status-dot" style={{ background: statusColor(r.status) }} />
              <select
                className="run-status-select"
                value={r.status}
                onChange={e => patch(r.id, { status: e.target.value })}
                style={{ color: statusColor(r.status) }}
              >
                {RUN_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {savingId === r.id && <Loader2 size={13} className="run-spin" />}
            </div>
            <button type="button" className="run-del-btn" title="删除批次" onClick={() => removeRun(r)}>
              <Trash2 size={14} />
            </button>
          </div>

          <div className="run-grid">
            <div className="field">
              <label>尺码</label>
              <select value={r.size || ''} onChange={e => patch(r.id, { size: e.target.value })}>
                <option value="">选择尺码</option>
                {getSizeList().map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>样衣颜色</label>
              <input
                value={r.sample_color || ''}
                placeholder="如：黑色"
                onChange={e => setRuns(prev => prev.map(x => x.id === r.id ? { ...x, sample_color: e.target.value } : x))}
                onBlur={e => patch(r.id, { sample_color: e.target.value })}
              />
            </div>
            <div className="field">
              <label>打样件数</label>
              <input
                type="number" min="1" value={r.sample_count || 1}
                onChange={e => setRuns(prev => prev.map(x => x.id === r.id ? { ...x, sample_count: e.target.value } : x))}
                onBlur={e => patch(r.id, { sample_count: e.target.value })}
              />
            </div>
            <div className="field">
              <label>优先级</label>
              <select value={r.priority || '中'} onChange={e => patch(r.id, { priority: e.target.value })}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label>版师</label>
              <input
                value={r.pattern_maker || ''}
                placeholder="谁负责打版"
                onChange={e => setRuns(prev => prev.map(x => x.id === r.id ? { ...x, pattern_maker: e.target.value } : x))}
                onBlur={e => patch(r.id, { pattern_maker: e.target.value })}
              />
            </div>
            <div className="field">
              <label>样衣工</label>
              <input
                value={r.sample_maker || ''}
                placeholder="谁负责做样衣"
                onChange={e => setRuns(prev => prev.map(x => x.id === r.id ? { ...x, sample_maker: e.target.value } : x))}
                onBlur={e => patch(r.id, { sample_maker: e.target.value })}
              />
            </div>
            <div className="field">
              <label>阻塞原因</label>
              <select
                value={r.blocker || 'none'}
                onChange={e => patch(r.id, { blocker: e.target.value })}
                style={r.blocker && r.blocker !== 'none' ? { color: '#f87171' } : undefined}
              >
                {BLOCKERS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
            <div className="field"><label>面料到库</label><input type="date" value={r.fabric_date || ''} onChange={e => patch(r.id, { fabric_date: e.target.value })} /></div>
            <div className="field"><label>任务开始</label><input type="date" value={r.start_date || ''} onChange={e => patch(r.id, { start_date: e.target.value })} /></div>
            <div className="field"><label>预计完工</label><input type="date" value={r.expected_date || ''} onChange={e => patch(r.id, { expected_date: e.target.value })} /></div>
            <div className="field"><label>实际完工</label><input type="date" value={r.finish_date || ''} onChange={e => patch(r.id, { finish_date: e.target.value })} /></div>
            <div className="field">
              <label>审核状态</label>
              <select
                value={r.audit_status || '未提交'}
                onChange={e => patch(r.id, { audit_status: e.target.value })}
                style={{ color: auditColor(r.audit_status || '未提交') }}
              >
                {AUDIT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>审版意见</label>
              <input
                value={r.audit_comment || ''}
                placeholder="本版次审版意见 / 修改点（各版次独立）"
                onChange={e => setRuns(prev => prev.map(x => x.id === r.id ? { ...x, audit_comment: e.target.value } : x))}
                onBlur={e => patch(r.id, { audit_comment: e.target.value })}
              />
            </div>
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>批次备注</label>
            <input
              value={r.note || ''}
              placeholder="本批次的特殊说明"
              onChange={e => setRuns(prev => prev.map(x => x.id === r.id ? { ...x, note: e.target.value } : x))}
              onBlur={e => patch(r.id, { note: e.target.value })}
            />
          </div>

          {/* 绑定资料版本 */}
          <div className="run-linked-section">
            <div className="run-linked-head">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#cbd5e1' }}>
                <Link2 size={13} /> 绑定资料版本
              </span>
              <button
                type="button"
                className="run-linked-manage"
                onClick={() => setManageId(manageId === r.id ? null : r.id)}
              >
                {manageId === r.id ? '收起' : '管理绑定'}
              </button>
            </div>
            <div className="run-linked-tags">
              {parseLinkedIds(r).length === 0 && <span style={{ color: '#64748b', fontSize: 12 }}>未绑定（本批次使用哪版纸样/唛架）</span>}
              {parseLinkedIds(r).map(id => {
                const d = drawingById(id);
                if (!d) return null;
                return (
                  <span key={id} className="run-linked-tag">
                    {d.filename || d.title || '未命名'} <span style={{ color: '#38bdf8' }}>V{d.version}</span>
                    <button type="button" onClick={() => toggleLink(r, id)} title="移除绑定"><X size={11} /></button>
                  </span>
                );
              })}
            </div>
            {manageId === r.id && (
              <div className="run-linked-picker">
                {drawingGroups.length === 0 && <div style={{ color: '#64748b', fontSize: 12 }}>该款暂无图纸资料，请先在「图纸资料」页上传</div>}
                {drawingGroups.map(g => (
                  <div key={g.group_id} className="run-linked-group">
                    <div className="run-linked-group-title">{g.file_name}</div>
                    <div className="run-linked-vers">
                      {g.versions.map(v => (
                        <label key={v.id} className="run-linked-ver">
                          <input
                            type="checkbox"
                            checked={parseLinkedIds(r).includes(v.id)}
                            onChange={() => toggleLink(r, v.id)}
                          />
                          <span>V{v.version}</span>
                          <span style={{ color: '#64748b' }}>({v.category || '未分类'})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      <button type="button" className="run-add-btn" onClick={addRun}>
        <Plus size={15} /> 新增打样批次
      </button>
    </div>
  );
};

export default SampleRunList;
