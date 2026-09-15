import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Loader2, Link2, X, Ruler, Package, FileText } from 'lucide-react';
import SmartSelect from '../common/SmartSelect';
import ConfirmModal from '../common/ConfirmModal';
import DatePicker from '../common/DatePicker';
import EmptyState from '../common/EmptyState';
import { toast } from '../common/Toast';
import { fetchRuns, createRun, updateRun, deleteRun, fetchDrawings } from '../../api';
import { peopleByRole } from '../../utils/people';
import { RUN_STATUS_LIST } from '../../constants/terms';

// 批次状态枚举收敛至 src/constants/terms.js → RUN_STATUS_LIST（U12）
const RUN_STATUS = RUN_STATUS_LIST;
// 阻塞原因（独立字段）
const BLOCKERS = [
  { key: 'none', label: '无阻塞' },
  { key: 'short_material', label: '欠面辅料' },
  { key: 'wait_designer', label: '待设计师确认' },
  { key: 'wait_tech', label: '待工艺单' },
  { key: 'other', label: '其他' },
];
const PRIORITIES = ['C', 'B', 'A', 'S']; // REQ-030 优先级四级（S 最高）
// REQ-030 优先级值色：S 红 / A 橙 / B 品牌色 / C 中性
const prioColor = (v) => v === 'S' ? 'var(--color-danger-rose)' : v === 'A' ? 'var(--color-orange-400)' : v === 'B' ? 'var(--accent)' : 'var(--text)';
const AUDIT_STATUSES = ['未提交', '待审核', '已通过', '已驳回'];
const auditColor = (s) => (s === '已通过' ? 'var(--run-done)' : s === '已驳回' ? 'var(--color-danger-text)' : s === '待审核' ? 'var(--run-sample)' : 'var(--text-2)');
const statusColor = (k) => RUN_STATUS.find(s => s.key === k)?.color || 'var(--text-2)';

/**
 * 版次批次列表：一款单下多个打样批次（板师工作单元），内联增删改、即时保存
 * REQ-018：批次卡片表单按 5 组分区（①版次基本属性 ②进度 ③纸样相关 ④样衣相关 ⑤资料），
 *   新增纸样完成时间 pattern_date、辅料到库时间 accessory_date；样衣完成时间=实际完工 finish_date
 * @param {string|number} taskId 款单 id
 * @param {object} settings 系统设置（sampleTypes / sizeGroups / category 联动尺码）
 * @param {string} category 当前款单品类（用于联动尺码选项）
 * @param {function} onStatusSync 批次状态变化后回调（款级状态已自动同步，通知父组件刷新）
 * @param {function} onRunsChanged 批次增删后回调（通知父级刷新，尺寸页新增版次即时可见）
 * @param {function} onOpenSizeTable 打开该批次尺寸表（锁定版次）
 * @param {function} onOpenBom 跳转物料清单 Tab
 * @param {function} onOpenDrawings 跳转图纸资料 Tab
 */
const SampleRunList = ({ taskId, settings, category, onStatusSync, onRunsChanged, onOpenSizeTable, onOpenBom, onOpenDrawings }) => {
  const [runs, setRuns] = useState([]);
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [manageId, setManageId] = useState(null); // 当前展开"管理绑定"的批次 id
  const [confirmRun, setConfirmRun] = useState(null); // REQ-006② 待删除批次（确认弹窗）

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
  const patch = async (id, patchData) => {
    setRuns(prev => prev.map(r => (r.id === id ? { ...r, ...patchData } : r)));
    setSavingId(id);
    try {
      await updateRun(id, patchData);
      // 状态变化会触发款级 status 自动同步，通知父组件刷新
      if (patchData.status) onStatusSync?.();
    } catch (e) {
      console.error('批次保存失败', e);
      // U19：失败回滚 + 用户可见反馈（复用 U17 toast，不新造一套）
      toast.error('批次保存失败，已还原为服务端数据' + (e?.message ? '：' + e.message : ''));
      load(); // 失败回滚为服务端状态
    } finally {
      setSavingId(null);
    }
  };

  const addRun = async () => {
    const sampleType = settings.sampleTypes?.[0] || '胚样';
    // REQ-005① 新批次默认从品类预设生成初始尺寸表（批次内可独立编辑/从上一版次复制覆盖）
    const { id } = await createRun(taskId, { sample_type: sampleType, status: 'waiting_material', init_size_data: true });
    await load();
    onStatusSync?.();
    onRunsChanged?.(); // REQ-005 修订：通知父级刷新批次，尺寸页新增版次即时可见
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

  const askRemoveRun = (r) => setConfirmRun(r);
  const doRemoveRun = () => {
    if (!confirmRun) return;
    const r = confirmRun;
    setConfirmRun(null);
    deleteRun(r.id).then(() => { load(); onStatusSync?.(); onRunsChanged?.(); }).catch(() => { load(); });
  };

  if (loading) {
    return <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 13 }}>批次加载中…</div>;
  }

  return (
    <div className="run-list">
      {runs.length === 0 && (
        <EmptyState compact title="暂无打样批次" hint="点击下方按钮新增" />
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
              <SmartSelect
                value={r.sample_type || ''}
                onChange={v => patch(r.id, { sample_type: v })}
                options={settings.sampleTypes || []}
                placeholder="选择版次"
              />
              <span className="run-status-dot" style={{ background: statusColor(r.status) }} />
              <SmartSelect
                className="run-status-ss"
                value={r.status}
                onChange={v => patch(r.id, { status: v })}
                options={RUN_STATUS}
                placeholder="选择状态"
                allowCustom={false}
                style={{ '--sel-color': statusColor(r.status) }}
              />
              {savingId === r.id && <Loader2 size={13} className="run-spin" />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" className="btn--icon-danger" title="删除批次" onClick={() => askRemoveRun(r)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* ① 版次基本属性：单号/版次在卡片头，以下为尺码/颜色/件数/审核 + 审版意见/备注 */}
          <div className="run-section-title">版次基本属性</div>
          <div className="run-grid">
            <div className="field">
              <label>尺码</label>
              <SmartSelect
                value={r.size || ''}
                onChange={v => patch(r.id, { size: v })}
                options={getSizeList()}
                placeholder="选择尺码"
                allowCustom={false}
              />
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
              <label>审核状态</label>
              <SmartSelect
                value={r.audit_status || '未提交'}
                onChange={v => patch(r.id, { audit_status: v })}
                options={AUDIT_STATUSES}
                placeholder="选择审核状态"
                allowCustom={false}
                style={{ '--sel-color': auditColor(r.audit_status || '未提交') }}
              />
            </div>
          </div>

          {/* ② 进度：当前状态在卡片头，以下为优先级/阻塞原因/任务开始 */}
          <div className="run-section-title">进度</div>
          <div className="run-grid">
            <div className="field">
              <label>优先级</label>
              <SmartSelect
                value={r.priority || 'B'}
                onChange={v => patch(r.id, { priority: v })}
                style={{ '--sel-color': prioColor(r.priority) }}
                options={PRIORITIES}
                placeholder="选择优先级"
                allowCustom={false}
              />
            </div>
            <div className="field">
              <label>阻塞原因</label>
              <SmartSelect
                value={r.blocker || 'none'}
                onChange={v => patch(r.id, { blocker: v })}
                options={BLOCKERS}
                placeholder="选择阻塞原因"
                allowCustom={false}
                style={{ '--sel-color': r.blocker && r.blocker !== 'none' ? 'var(--color-danger-text)' : 'var(--text)' }}
              />
            </div>
            <div className="field"><label>任务开始</label><DatePicker value={r.start_date || ''} onChange={v => patch(r.id, { start_date: v })} /></div>
          </div>

          {/* ③ 纸样相关：REQ-018 新增纸样完成时间 */}
          <div className="run-section-title">纸样相关</div>
          <div className="run-grid">
            <div className="field"><label>纸样完成时间</label><DatePicker value={r.pattern_date || ''} onChange={v => patch(r.id, { pattern_date: v })} /></div>
          </div>

          {/* ④ 样衣相关：样衣完成时间=实际完工 finish_date（REQ-018 用户拍板同字段）；辅料到库为新增列 */}
          <div className="run-section-title">样衣相关</div>
          <div className="run-grid">
            <div className="field">
              <label>样衣工</label>
              <SmartSelect
                value={r.sample_maker || ''}
                onChange={v => patch(r.id, { sample_maker: v })}
                options={peopleByRole(settings.people, '样衣工')}
                placeholder="选择样衣工或输入"
              />
            </div>
            <div className="field"><label>实际完工（样衣完成）</label><DatePicker value={r.finish_date || ''} onChange={v => patch(r.id, { finish_date: v })} /></div>
            <div className="field"><label>预期完成时间</label><DatePicker value={r.expected_date || ''} onChange={v => patch(r.id, { expected_date: v })} /></div>
            <div className="field"><label>面料到库时间</label><DatePicker value={r.fabric_date || ''} onChange={v => patch(r.id, { fabric_date: v })} /></div>
            <div className="field"><label>辅料到库时间</label><DatePicker value={r.accessory_date || ''} onChange={v => patch(r.id, { accessory_date: v })} /></div>
          </div>

          {/* ⑤ 资料：尺寸表（锁定版次）/ 物料清单 / 纸样 */}
          <div className="run-section-title">资料</div>
          <div className="run-materials-row">
            <button
              type="button"
              className="btn--ghost btn--sm btn--accent"
              onClick={() => onOpenSizeTable?.(r)}
              title={`进入「${r.order_no || '本版次'}」的尺寸表（锁定编辑，与其它版次数据隔离）`}
            >
              <Ruler size={13} /> 尺寸表
            </button>
            <button type="button" className="btn--ghost btn--sm btn--accent" onClick={() => onOpenBom?.()} title="查看本款物料清单（BOM）">
              <Package size={13} /> 物料清单
            </button>
            <button type="button" className="btn--ghost btn--sm btn--accent" onClick={() => onOpenDrawings?.()} title="查看本款图纸资料（纸样/唛架）">
              <FileText size={13} /> 纸样
            </button>
          </div>

          {/* REQ-021：审版意见 / 批次备注下移模块底部（收尾字段，位于资料入口之后、绑定资料版本之前） */}
          <div className="field" style={{ marginTop: 10 }}>
            <label>审版意见（各版次独立）</label>
            <textarea
              rows={5}
              value={r.audit_comment || ''}
              placeholder="本版次审版意见 / 修改点，可多行输入，各版次互不影响"
              onChange={e => setRuns(prev => prev.map(x => x.id === r.id ? { ...x, audit_comment: e.target.value } : x))}
              onBlur={e => patch(r.id, { audit_comment: e.target.value })}
            />
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
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)' }}>
                <Link2 size={13} /> 绑定资料版本
              </span>
              <button
                type="button"
                className="btn--ghost btn--sm btn--accent"
                onClick={() => setManageId(manageId === r.id ? null : r.id)}
              >
                {manageId === r.id ? '收起' : '管理绑定'}
              </button>
            </div>
            <div className="run-linked-tags">
              {parseLinkedIds(r).length === 0 && <span style={{ color: 'var(--text-3)', fontSize: 12 }}>未绑定（本批次使用哪版纸样/唛架）</span>}
              {parseLinkedIds(r).map(id => {
                const d = drawingById(id);
                if (!d) return null;
                return (
                  <span key={id} className="run-linked-tag">
                    {d.filename || d.title || '未命名'} <span style={{ color: 'var(--accent)' }}>V{d.version}</span>
                    <button type="button" onClick={() => toggleLink(r, id)} title="移除绑定"><X size={11} /></button>
                  </span>
                );
              })}
            </div>
            {manageId === r.id && (
              <div className="run-linked-picker">
                {drawingGroups.length === 0 && <EmptyState compact title="该款暂无图纸资料" hint="请先在「图纸资料」页上传" />}
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
                          <span style={{ color: 'var(--text-3)' }}>({v.category || '未分类'})</span>
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

      <button type="button" className="btn--primary btn--block btn--dashed" onClick={addRun}>
        <Plus size={15} /> 新增打样批次
      </button>

      {/* REQ-006② 删除批次确认 */}
      {confirmRun && (
        <ConfirmModal
          title="删除打样批次"
          tone="danger"
          confirmText="确认删除"
          message={`确认删除「${confirmRun.sample_type || '未命名版次'} ${confirmRun.size || ''} ${confirmRun.sample_color || ''}」批次（${confirmRun.order_no || ''}）？\n删除后不可恢复。`}
          onConfirm={doRemoveRun}
          onCancel={() => setConfirmRun(null)}
        />
      )}
    </div>
  );
};

export default SampleRunList;
