import React, { useMemo } from 'react';
import {
  Layout, Plus, FileText, Database, CheckCircle2, Circle,
  GripVertical, ChevronUp, ChevronDown, AlertCircle, FilterX
} from 'lucide-react';
import PdfThumb from '../common/PdfThumb';
import ExportButton from '../common/ExportButton';
import SmartSelect from '../common/SmartSelect';
import { exportTasksToExcel, getTaskListFileName } from '../../utils/exportTasks';
import { peopleByRole } from '../../utils/people';

const getNodeIcon = (status) => {
  if (status === 'done' || status === 'completed') return <CheckCircle2 size={14} color="#4ade80" />;
  if (status === 'active') return <AlertCircle size={14} color="var(--accent)" />;
  return <Circle size={14} color="var(--text-4)" />;
};

// 版次批次状态元数据（与 SampleRunList / 后端 sampleRuns.cjs 保持一致）
const RUN_STATUS_META = {
  waiting_material: { label: '待安排', color: 'var(--text-2)' }, // REQ-030 改词
  pattern_making: { label: '打版中', color: 'var(--accent)' },
  sample_making: { label: '样衣中', color: '#fbbf24' },
  pending_confirm: { label: '待审版', color: '#a78bfa' }, // REQ-030 改词
  done: { label: '已完成', color: '#4ade80' },
};
const PRIO_RANK = { 'S': 3, 'A': 2, 'B': 1, 'C': 0 }; // REQ-030 优先级 S/A/B/C
/** 取任务的批次列表（兼容迁移前旧字段，无 runs 时用 task 顶层字段拼一条） */
const taskRuns = (t) => {
  if (Array.isArray(t.runs) && t.runs.length) return t.runs;
  if (t.sample_type) return [{ sample_type: t.sample_type, size: t.size, sample_color: t.sample_color, sample_count: t.sample_count, priority: t.priority, status: '' }];
  return [];
};
/** 任务涉及的全部版次 */
const taskRunTypes = (t) => [...new Set(taskRuns(t).map(r => r.sample_type).filter(Boolean))];
/** 任务的最高优先级（批次中取最高，无批次回退顶层 priority）
 *  G11 优先级单主：权威数据在 sample_runs.priority；后端 attachRuns 已按「批次最高档 S>A>B>C，无批次回退 B」
 *  投影出 `t.priority`。前端此处规则与之**完全一致**，故看板分组/筛选（走批次）与列表/技术包导出
 *  （走投影后的 t.priority）结果必然相同，不再出现「看板与导出优先级不一致」。 */
const taskTopPriority = (t) => {
  const ps = taskRuns(t).map(r => r.priority).filter(Boolean);
  if (!ps.length) return t.priority || 'B'; // REQ-030 默认 B（后端同口径投影，非旧 tasks 列）
  return ps.sort((a, b) => (PRIO_RANK[b] ?? 1) - (PRIO_RANK[a] ?? 1))[0];
};

/** REQ-027：款级分栏口径 = 后端 derived_status（最新未完成版次，sort_order 最大）实时推导，不再依赖可能过期的 task.status
 *  done=全部批次已完成 / doing=最新版次打版中·样衣中·待审版 / todo=未开始·待安排·无批次 */
const derivedCol = (t) => {
  const d = t.derived_status;
  if (d === 'done') return 'done';
  if (d === 'pattern_making' || d === 'sample_making' || d === 'pending_confirm') return 'doing';
  return 'todo';
};

/**
 * 逾期判定（REQ-027 权威口径：交期基准 = 最新未完成版次预期完成时间）
 * 基准优先级：最新版次 top_run.expected_date → 该款全部批次中最早的预期 → 款级 expected_date（旧数据兜底）→ 无则 none
 * 完成判定（REQ-025）：款级 derived_status=done（全部批次已完成）→ 不算逾期
 * state: overdue(已逾期) / today(今日到期) / soon(3天内到期) / ok(正常) / none(无交期或已完结)
 */
function getOverdueInfo(task) {
  if (task.status === 'done' || task.status === 'completed') return { state: 'none', days: 0 };
  if (task.derived_status === 'done') return { state: 'none', days: 0 };
  let dueStr = task.top_run?.expected_date || '';
  if (!dueStr && Array.isArray(task.runs) && task.runs.length) {
    const dates = task.runs.map(r => r.expected_date).filter(Boolean).sort();
    dueStr = dates[0] || '';
  }
  if (!dueStr) dueStr = task.expected_date || '';
  if (!dueStr) return { state: 'none', days: 0, due: '' };
  const m = String(dueStr).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return { state: 'none', days: 0, due: dueStr };
  const due = new Date(+m[1], +m[2] - 1, +m[3]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - due) / 86400000);
  if (diff > 0) return { state: 'overdue', days: diff, due: dueStr };
  if (diff === 0) return { state: 'today', days: 0, due: dueStr };
  if (diff >= -3) return { state: 'soon', days: -diff, due: dueStr };
  return { state: 'ok', days: 0, due: dueStr };
}

/** REQ-027 底部进度节点：从最新未完成版次（top_run）真实数据派生（不再展示手填工作动态，与版次条同源 runs）
 *  配料=面料到库 / 跟版=任务开始 / 版师=纸样完成（负责人=款级版师）/ 样衣=实际完工（负责人=批次样衣工）/ 工艺=无对应批次字段 */
function buildRunNodes(task) {
  const top = task.top_run;
  const mk = (label, date, by) => ({ label, date: date || '', by: by || '', status: date ? 'done' : 'pending' });
  return [
    mk('配料', top?.fabric_date, ''),
    mk('跟版', top?.start_date, ''),
    mk('版师', top?.pattern_date, task.pattern_maker),
    mk('样衣', top?.finish_date, top?.sample_maker),
    mk('工艺', '', ''),
  ];
}

/** 看板/列表双视图：筛选器 + 看板三列 + 任务卡片 + 可配置列表视图 */
const KanbanView = ({
  tasks,
  filters,
  setFilters,
  settings,
  displayMode,
  setDisplayMode,
  kanbanGroupBy,
  setKanbanGroupBy,
  activeDropdown,
  setActiveDropdown,
  listColumns,
  setListColumns,
  sortConfig,
  setSortConfig,
  savedViews,
  setSavedViews,
  activeViewId,
  setActiveViewId,
  onOpenSidebar,
  onNewTask,
  onTaskClick,
}) => {
  // 版次筛选选项 = 版次库预设 ∪ 各批次实际使用值（含自定义值如 V2，保证能筛出）
  const sampleTypeOptions = useMemo(() => {
    const set = new Set(settings.sampleTypes || []);
    (tasks || []).forEach(t => taskRunTypes(t).forEach(x => set.add(x)));
    return [...set];
  }, [settings.sampleTypes, tasks]);

  const filterTasks = (list) => list.filter(t => {
    if (filters.keyword && !(t.title?.includes(filters.keyword) || t.style_no?.includes(filters.keyword))) return false;
    if (filters.category && t.category !== filters.category) return false;
    if (filters.sample_type && !taskRunTypes(t).includes(filters.sample_type)) return false;
    if (filters.designer && t.designer !== filters.designer) return false;
    if (filters.priority && taskTopPriority(t) !== filters.priority) return false;
    // REQ-031 版次状态筛选：存在处于该状态的版次（与分栏口径解耦，存在性匹配）
    if (filters.run_status && !taskRuns(t).some(r => r.status === filters.run_status)) return false;
    return true;
  });

  const getActiveCols = () => {
    if (kanbanGroupBy === 'all') {
      return [{ id: 'all', name: '全部', color: 'var(--accent)' }];
    }
    if (kanbanGroupBy === 'status') {
      return [
        { id: 'todo', name: '待处理', color: 'var(--text-2)' },
        { id: 'doing', name: '打版中', color: 'var(--accent)' },
        { id: 'done', name: '已完结', color: '#4ade80' }
      ];
    }
    if (kanbanGroupBy === 'sample_type') {
      const cols = settings.sampleTypes.map(s => ({ id: s, name: s, color: '#6366f1' }));
      return cols.length ? cols : [{ id: 'none', name: '常规版', color: '#6366f1' }];
    }
    if (kanbanGroupBy === 'priority') {
      return [
        { id: 'S', name: 'S', color: '#f43f5e' }, // REQ-030 四级
        { id: 'A', name: 'A', color: '#fb923c' },
        { id: 'B', name: 'B', color: 'var(--accent)' },
        { id: 'C', name: 'C', color: 'var(--text-2)' }
      ];
    }
    if (kanbanGroupBy === 'overdue') {
      return [
        { id: 'overdue', name: '已逾期', color: '#ef4444' },
        { id: 'today', name: '今日到期', color: '#f59e0b' },
        { id: 'soon', name: '3天内到期', color: '#eab308' },
        { id: 'ok', name: '正常', color: '#4ade80' },
        { id: 'none', name: '无交期/已完结', color: 'var(--text-2)' }
      ];
    }
    return [];
  };
  // 打样单卡片（REQ-024 重开：全部视图与分组视图共用同一卡片渲染，全部视图下卡片直排 grid）
  const renderBentoCard = (task) => {
    const ov = getOverdueInfo(task);
    return (
      <div key={task.id} className="card glass bento-card" onClick={() => onTaskClick(task)} style={{ position: 'relative', ...(ov.state === 'overdue' ? { borderColor: 'rgba(239,68,68,0.55)' } : {}) }}>
        {ov.state === 'overdue' && (
          <div className="bento-overdue-badge" title={`期望交期 ${ov.due}（最新版次），已逾期`}>⚠ 逾期 {ov.days} 天</div>
        )}
        {ov.state === 'today' && (
          <div className="bento-overdue-badge" style={{ background: 'rgba(245,158,11,0.92)' }} title="今日为期望交期（最新版次）">今日到期</div>
        )}
        {ov.state === 'soon' && (
          <div className="bento-overdue-badge" style={{ background: 'rgba(234,179,8,0.85)' }} title={`期望交期 ${ov.due}（最新版次）`}>{ov.days} 天后到期</div>
        )}
        <div className="bento-upper">
          <div className="bento-box bento-left">
            <div className="bento-img-wrap">
              <PdfThumb pdfUrl={task.pdf_url} />
              <div className="bento-badge">👤 {task.designer || '未分配'}</div>
            </div>
          </div>
          <div className="bento-right-col">
            <div className="bento-box bento-tr">
              <span className="bento-style-no">{task.style_no || '—'}</span>
            </div>
            <div className="bento-info-row">
              <div className="bento-box bento-info">
                <div className="bento-title-main" title={task.title}>{task.title || '未命名款式'}</div>
                <div className="bento-row" title={task.style_no}><span>款号：</span>{task.style_no || '—'}</div>
                <div className="bento-row" title={task.category}><span>类别：</span>{task.category || '—'}</div>
                <div className="bento-row" title={task.brand}><span>品牌：</span>{task.brand || '—'}</div>
                <div className="bento-row" title={[task.year, task.season, task.month].filter(Boolean).join(' ')}><span>时段：</span>{[task.year, task.season, task.month].filter(Boolean).join(' ') || '—'}</div>
              </div>
              <div className="bento-box bento-info">
                <div className="bento-order-no" title={task.order_no}>版单：{task.order_no || '—'}</div>
                {(() => {
                  const rs = taskRuns(task);
                  if (!rs.length) return <div className="bento-row"><span>批次：</span><em>未建批次</em></div>;
                  const shown = rs.slice(0, 3);
                  const hidden = rs.length - shown.length;
                  return (
                    <>
                      {shown.map((r, i) => {
                        const meta = RUN_STATUS_META[r.status];
                        const who = r.sample_maker ? [r.sample_maker].filter(Boolean).join(' / ') : '';
                        return (
                          <div className="bento-row bento-run-row" key={i}
                            title={`${r.sample_type || '未命名版次'}${meta ? ' · ' + meta.label : ''}${who ? ' · ' + who : ''}`}>
                            {meta && <span className="bento-run-dot" style={{ background: meta.color }} />}
                            <em>{r.sample_type || '—'}</em>
                            <span className="bento-run-sub">
                              {meta ? meta.label : ''}{r.sample_color ? `·${r.sample_color}` : ''}{r.sample_count ? `·${r.sample_count}件` : ''}{r.size ? `·${r.size}码` : ''}
                            </span>
                          </div>
                        );
                      })}
                      {hidden > 0 && <div className="bento-row"><span></span><em>+{hidden} 个批次</em></div>}
                    </>
                  );
                })()}
                <div className="bento-row"><span>优先：</span><em className={`prio-${taskTopPriority(task) === 'S' ? 'high' : taskTopPriority(task) === 'A' ? 'mid' : 'low'}`}>{taskTopPriority(task)}</em></div>
                <div className="bento-row" title={task.audit_status}><span>审核：</span><em className={`audit-${task.audit_status === '已通过' ? 'pass' : 'wait'}`}>{task.audit_status || '待审核'}</em></div>
              </div>
            </div>
          </div>
        </div>
        <div className="bento-box bento-bottom">
          <div className="bento-nodes">
            {(() => {
              // REQ-027：底部节点=最新未完成版次（top_run）真实数据
              const nodes = buildRunNodes(task);
              return (
                <>
                  {nodes.map((n, i) => (
                    <div key={i} className="bento-node-cell" title={`${n.label}${n.by ? ' · 负责人:' + n.by : ''}${n.date ? '' : ' · 未填'}`}>
                      {getNodeIcon(n.status)}
                      <span className="bento-node-label">{n.label}</span>
                      <span className="bento-node-date">{n.date || '--'}</span>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header className="top-bar glass">
        <div className="logo" onClick={onOpenSidebar}>
          <span className="sidebar-hotzone" onMouseEnter={onOpenSidebar}><Layout size={28} color="var(--accent)" /></span><span>PatternMaster Pro</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn-blue" onClick={onNewTask}>
            <Plus size={16} /> 新建打样单
          </button>
        </div>
      </header>

      {/* 筛选区 */}
      <div style={{ background: 'var(--bg)', padding: '16px 32px 0', flexShrink: 0, zIndex: 100, position: 'relative' }}>
        <div className="glass" style={{ padding: '16px 24px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'nowrap', minWidth: 0, overflow: 'visible' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>数据检索过滤</div>
          <input
            style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 8, color: 'var(--text)', fontSize: 13, minWidth: 200, outline: 'none' }}
            placeholder="输入款号 / 款名搜索"
            value={filters.keyword}
            onChange={e => setFilters({ ...filters, keyword: e.target.value })}
          />
          <SmartSelect
            className="filter-sel"
            placeholder="全部分类"
            allowCustom={false}
            options={[{ key: '', label: '全部分类' }, ...(settings.categories || [])]}
            value={filters.category || ''}
            onChange={v => setFilters({ ...filters, category: v })}
          />
          <SmartSelect
            className="filter-sel"
            placeholder="全部打样版次"
            allowCustom={false}
            options={[{ key: '', label: '全部打样版次' }, ...sampleTypeOptions]}
            value={filters.sample_type || ''}
            onChange={v => setFilters({ ...filters, sample_type: v })}
          />
          <SmartSelect
            className="filter-sel"
            placeholder="全部分派设计师"
            allowCustom={false}
            options={[{ key: '', label: '全部分派设计师' }, ...peopleByRole(settings.people, '设计师')]}
            value={filters.designer || ''}
            onChange={v => setFilters({ ...filters, designer: v })}
          />
          <SmartSelect
            className="filter-sel"
            placeholder="全部优先级"
            allowCustom={false}
            options={[{ key: '', label: '全部优先级' }, 'C', 'B', 'A', 'S']}
            value={filters.priority || ''}
            onChange={v => setFilters({ ...filters, priority: v })}
          />
          <SmartSelect
            className="filter-sel"
            placeholder="全部版次状态"
            options={[{ key: '', label: '全部版次状态' }, ...Object.entries(RUN_STATUS_META).map(([k, m]) => ({ key: k, label: m.label }))]}
            value={filters.run_status || ''}
            onChange={v => setFilters({ ...filters, run_status: v })}
            allowCustom={false}
          />

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* 一键清除所有筛选条件 */}
            <button
              onClick={() => setFilters({ keyword: '', category: '', sample_type: '', designer: '', priority: '', run_status: '' })}
              title="清除所有筛选条件"
              style={{ padding: '7px 12px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
              <FilterX size={14} /> 清除筛选
            </button>
            {/* 导出当前筛选列表（确认 + 反馈） */}
            <ExportButton
              label="导出"
              title="导出打样单列表"
              confirmText={`将导出当前筛选结果（共 ${filterTasks(tasks).length} 条打样单）为 Excel 文件，包含 30 项业务字段。`}
              fileName={getTaskListFileName()}
              onExport={() => {
                const list = filterTasks(tasks);
                if (!list.length) throw new Error('当前筛选结果为空，无可导出数据');
                return exportTasksToExcel(list);
              }}
              style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-2)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}
            />

            <div style={{ display: 'flex', background: 'var(--bg-hover-2)', borderRadius: 8, padding: 2 }}>
              <button
                className={`btn-icon-sm ${displayMode === 'kanban' ? 'active-mode' : ''}`}
                onClick={() => setDisplayMode('kanban')}
                title="看板视图"
                style={{ padding: '6px 12px', borderRadius: 6, background: displayMode === 'kanban' ? 'var(--accent)' : 'transparent', color: displayMode === 'kanban' ? 'var(--accent-text)' : 'var(--text-2)', border: 'none', cursor: 'pointer' }}
              >
                <Layout size={16} />
              </button>
              <button
                className={`btn-icon-sm ${displayMode === 'list' ? 'active-mode' : ''}`}
                onClick={() => setDisplayMode('list')}
                title="列表视图"
                style={{ padding: '6px 12px', borderRadius: 6, background: displayMode === 'list' ? 'var(--accent)' : 'transparent', color: displayMode === 'list' ? 'var(--accent-text)' : 'var(--text-2)', border: 'none', cursor: 'pointer' }}
              >
                <FileText size={16} />
              </button>
            </div>

            {displayMode === 'kanban' && (
              <SmartSelect
                className="groupby-ss"
                allowCustom={false}
                options={[{ key: 'all', label: '关注点：全部' }, { key: 'status', label: '关注点：任务状态' }, { key: 'sample_type', label: '关注点：版次进度' }, { key: 'priority', label: '关注点：优先级' }, { key: 'overdue', label: '关注点：逾期情况' }]}
                value={kanbanGroupBy}
                onChange={setKanbanGroupBy}
              />
            )}

            {displayMode === 'list' && (
              <div style={{ display: 'flex', gap: 8 }}>
                {/* 视图保存下拉 */}
                <div className="smart-select">
                  <div className="ss-display" style={{ padding: '7px 12px', fontSize: 12, background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-2)', color: 'var(--accent)' }} onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'views' ? null : 'views'); }}>
                    <Database size={13} /> <span>{savedViews.find(v => v.id === activeViewId)?.name || '默认列表'}</span>
                  </div>
                  {activeDropdown === 'views' && (
                    <div className="ss-dropdown" style={{ right: 0, width: 180 }}>
                      {savedViews.map(v => (
                        <div key={v.id} className="ss-option" onClick={() => { setActiveViewId(v.id); setListColumns(prev => prev.map(c => ({ ...c, visible: v.columns.find(vc => vc.id === c.id)?.visible ?? false }))); setActiveDropdown(null); }}>
                          {v.name}
                        </div>
                      ))}
                      <div className="ss-divider">新建工作区</div>
                      <div className="ss-option" onClick={() => { const n = prompt('视图名为?'); if (n) { setSavedViews([...savedViews, { id: Date.now().toString(), name: n, columns: listColumns.map(c => ({ id: c.id, visible: c.visible })) }]); setActiveDropdown(null); } }}>
                        <Plus size={14} /> 保存当前配置
                      </div>
                    </div>
                  )}
                </div>

                {/* 字段配置下拉 */}
                <div style={{ position: 'relative', zIndex: 2000 }}>
                  <div
                    className="op-btn"
                    onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'columns' ? null : 'columns'); }}
                    title="自定义显示列"
                  >
                    <Layout size={16} />
                    <span style={{ fontSize: 11, marginLeft: 4, whiteSpace: 'nowrap' }}>显示列 ({listColumns.filter(c => c.visible).length})</span>
                  </div>
                  {activeDropdown === 'columns' && (
                    <div className="ss-dropdown" style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 12, width: 240,
                      background: 'var(--bg-elev-2)', border: '1px solid var(--border-strong)',
                      borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
                      padding: 16, zIndex: 10000, maxHeight: 500, overflow: 'auto'
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-4)', marginBottom: 12, padding: '0 4px', display: 'flex', justifyContent: 'space-between' }}>
                        字段排序与显示
                        <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setActiveDropdown(null)}>关闭</span>
                      </div>
                      {listColumns.map((col, idx) => (
                        <div
                          key={col.id}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', idx); }}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const dragIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                            if (dragIdx === idx || isNaN(dragIdx)) return;
                            const next = [...listColumns];
                            const [moved] = next.splice(dragIdx, 1);
                            next.splice(idx, 0, moved);
                            setListColumns(next);
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                          onClick={e => e.stopPropagation()}
                        >
                          <div
                            onClick={() => setListColumns(prev => prev.map(c => c.id === col.id ? { ...c, visible: !c.visible } : c))}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: col.visible ? 'var(--accent-soft)' : 'transparent', color: col.visible ? 'var(--accent)' : 'var(--text-2)', fontSize: 12 }}
                          >
                            {col.visible ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                            {col.label}
                          </div>
                          <div style={{ padding: 4, cursor: 'grab', color: 'var(--text-4)' }} title="拖拽排序">
                            <GripVertical size={14} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 看板视图主体 */}
      {displayMode === 'kanban' && (kanbanGroupBy === 'all' ? (
        // REQ-024 重开：「全部」视图卡片直排自适应多列（grid auto-fill），顶部检索过滤照常叠加
        <div className="board custom-scrollbar" style={{
          flex: 1, overflow: 'auto', padding: '0 32px 32px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))', // REQ-032 卡片最小宽度 500px
          gap: 24, alignContent: 'start',
        }}>
          {filterTasks(tasks).map(task => renderBentoCard(task))}
        </div>
      ) : (
        <div className="board custom-scrollbar" style={{ flex: 1, overflow: 'auto', padding: '0 32px 32px' }}>
          {getActiveCols().map(col => {
            const colTasks = filterTasks(tasks).filter(t => {
              if (kanbanGroupBy === 'status' && derivedCol(t) !== col.id) return false;
              if (kanbanGroupBy === 'sample_type' && !taskRunTypes(t).includes(col.id)) return false;
              if (kanbanGroupBy === 'priority' && taskTopPriority(t) !== col.id) return false;
              if (kanbanGroupBy === 'overdue' && (getOverdueInfo(t).state === 'none' ? 'none' : getOverdueInfo(t).state) !== col.id) return false;
              return true;
            });
            return (
              <div key={col.id} className="col" style={{ width: 500, flex: '0 0 500px', boxSizing: 'border-box' }}>
                <div className="col-title" style={{
                  position: 'sticky', top: 0, zIndex: 50,
                  background: 'var(--bg)', width: '100%',
                  padding: '24px 0 16px', margin: 0,
                  boxSizing: 'border-box',
                  borderBottom: '1px solid var(--border-weak)'
                }}>
                  <span className="dot" style={{ background: col.color }} />
                  {col.name}
                  <span className="badge">{colTasks.length}</span>
                </div>
                <div className="col-body">
                  {colTasks.map(task => renderBentoCard(task))}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* 列表视图主体 */}
      {displayMode === 'list' && (() => {
        const visibleCols = listColumns.filter(c => c.visible);
        let accLeft = 60;
        let stopSticky = false;
        const stickyCols = visibleCols.map(col => {
          const isSticky = !stopSticky;
          const colLeft = accLeft;
          const w = col.id === 'image' ? 120 : (col.id === 'action' ? 80 : 160);
          if (isSticky) accLeft += w;
          if (col.id === 'category') stopSticky = true;
          return { ...col, isSticky, left: colLeft, width: w };
        });

        return (
          <div style={{ flex: 1, overflow: 'auto', padding: '0 32px 32px' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }} onClick={() => setActiveDropdown(null)}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 13, background: 'var(--bg-elev)', padding: '14px 10px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)', width: 60, whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)' }}>
                    序号
                  </th>
                  {stickyCols.map(col => (
                    <th
                      key={col.id}
                      style={{
                        padding: '14px 20px', textAlign: 'left', fontSize: 13, color: 'var(--text-3)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap !important',
                        width: col.width,
                        position: 'sticky',
                        top: 0,
                        left: col.isSticky ? col.left : 'auto',
                        zIndex: col.isSticky ? 12 : 10,
                        background: 'var(--bg-elev)',
                        borderBottom: '2px solid var(--border)'
                      }}
                      onClick={() => {
                        const isAsc = sortConfig.key === col.id && sortConfig.direction === 'asc';
                        setSortConfig({ key: col.id, direction: isAsc ? 'desc' : 'asc' });
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {col.label}
                        {sortConfig.key === col.id && (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filterTasks(tasks)
                  .sort((a, b) => {
                    const valA = a[sortConfig.key] || '';
                    const valB = b[sortConfig.key] || '';
                    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                  })
                  .map((task, idx) => (
                    <tr key={task.id} className="list-row" style={{ borderBottom: '1px solid var(--bg-hover)' }}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 11, background: 'var(--bg-elev)', borderRight: '1px solid var(--border-weak)', textAlign: 'center', fontSize: 13, color: 'var(--text-2)', padding: '10px' }}>
                        {idx + 1}
                      </td>
                      {stickyCols.map(col => (
                        <td key={col.id} style={{
                          padding: '16px 20px', fontSize: 13, color: 'var(--text-2)',
                          whiteSpace: 'nowrap !important',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          position: col.isSticky ? 'sticky' : 'static',
                          left: col.isSticky ? col.left : 'auto',
                          zIndex: col.isSticky ? 10 : 1,
                          background: col.isSticky ? 'var(--bg-elev)' : 'transparent',
                          borderRight: col.isSticky ? '1px solid var(--border-weak)' : 'none'
                        }}>
                          {col.id === 'image' ? (
                            <div style={{ width: 80, height: 110, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-elev-2)' }}>
                              <PdfThumb pdfUrl={task.pdf_url} objectFit="contain" />
                            </div>
                          ) : col.id === 'action' ? (
                            <button className="btn-blue-sm" style={{ padding: '6px 16px' }} onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}>详情</button>
                          ) : col.id === 'priority' ? (
                            <span className={`prio-${taskTopPriority(task) === 'S' ? 'high' : taskTopPriority(task) === 'A' ? 'mid' : 'low'}`} style={{ fontSize: 11, fontWeight: 700 }}>
                              {taskTopPriority(task)}
                            </span>
                          ) : col.id === 'status_text' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="dot" style={{ background: derivedCol(task) === 'done' ? '#4ade80' : derivedCol(task) === 'doing' ? 'var(--accent)' : 'var(--text-2)' }} />
                              {derivedCol(task) === 'done' ? '已完结' : derivedCol(task) === 'doing' ? '打版中' : '待处理'}
                            </div>
                          ) : col.id === 'created_at' || col.id === 'updated_at' || col.id.endsWith('_date') ? (
                            task[col.id] ? new Date(task[col.id]).toLocaleDateString() : '—'
                          ) : (
                            task[col.id] || '—'
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
};

export default KanbanView;
