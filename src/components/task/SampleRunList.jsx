import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import SmartSelect from '../common/SmartSelect';
import { fetchRuns, createRun, updateRun, deleteRun } from '../../api';

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
const statusLabel = (k) => RUN_STATUS.find(s => s.key === k)?.label || k;
const statusColor = (k) => RUN_STATUS.find(s => s.key === k)?.color || '#94a3b8';

/**
 * 版次批次列表：一款单下多个打样批次（板师工作单元），内联增删改、即时保存
 * @param {string|number} taskId 款单 id
 * @param {object} settings 系统设置（sampleTypes / sizeGroups / category 联动尺码）
 * @param {string} category 当前款单品类（用于联动尺码选项）
 */
const SampleRunList = ({ taskId, settings, category }) => {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchRuns(taskId);
      setRuns(list || []);
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
    return id;
  };

  const removeRun = async (r) => {
    if (!window.confirm(`确认删除「${r.sample_type || '未命名版次'} ${r.size || ''} ${r.sample_color || ''}」批次？删除后不可恢复。`)) return;
    await deleteRun(r.id);
    load();
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
              <label>负责人（板师/样衣工）</label>
              <input
                value={r.assignee || ''}
                placeholder="谁负责这个批次"
                onChange={e => setRuns(prev => prev.map(x => x.id === r.id ? { ...x, assignee: e.target.value } : x))}
                onBlur={e => patch(r.id, { assignee: e.target.value })}
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
        </div>
      ))}

      <button type="button" className="run-add-btn" onClick={addRun}>
        <Plus size={15} /> 新增打样批次
      </button>
    </div>
  );
};

export default SampleRunList;
