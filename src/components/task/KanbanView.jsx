import React, { useMemo, useState } from 'react';
import {
  Layout, Plus, FileText, Database, CheckCircle2, Circle,
  GripVertical, ChevronUp, ChevronDown, FilterX
} from 'lucide-react';
import PdfThumb from '../common/PdfThumb';
import ExportButton from '../common/ExportButton';
import SmartSelect from '../common/SmartSelect';
import InputModal from '../common/InputModal';
import { toast } from '../common/Toast';
import { keyboardActivate } from '../../hooks/useKeyboardActivate';
import { exportTasksToExcel, getTaskListFileName } from '../../utils/exportTasks';
import { peopleByRole } from '../../utils/people';
import { RUN_STATUS_LIST } from '../../constants/terms';
import TaskCard from './TaskCard';
import { taskRuns, taskRunTypes, taskTopPriority, derivedCol, getOverdueInfo } from '../../utils/taskView';

/**
 * 容器层（U18 两层层级重构）：筛选器 + 看板分组/布局/滚动 + 列表视图 + 列配置/视图保存。
 * 单卡片渲染移交卡片层 src/components/task/TaskCard.jsx（React.memo）。
 *
 * U19 性能：
 * - filterTasks / activeCols / 分组结果（groupedTasks）全部 useMemo，依赖精确到 filters/tasks/分组维度；
 * - 传给 TaskCard 的 onTaskClick 用 useCallback 稳定引用，保证 memo 真正生效（否则每次父渲染都重建回调）。
 */
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

  // U17 保存视图命名弹窗（替代原生 prompt）：空名禁用确认钮
  const [viewNameOpen, setViewNameOpen] = useState(false);
  const saveCurrentView = (name) => {
    setSavedViews([...savedViews, { id: Date.now().toString(), name, columns: listColumns.map(c => ({ id: c.id, visible: c.visible })) }]);
    setActiveDropdown(null);
    setViewNameOpen(false);
    toast.success(`已保存视图「${name}」`);
  };

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
        { id: 'done', name: '已完结', color: 'var(--run-done)' }
      ];
    }
    if (kanbanGroupBy === 'sample_type') {
      const cols = (settings.sampleTypes || []).map(s => ({ id: s, name: s, color: 'var(--color-indigo-500)' }));
      return cols.length ? cols : [{ id: 'none', name: '常规版', color: 'var(--color-indigo-500)' }];
    }
    if (kanbanGroupBy === 'priority') {
      return [
        { id: 'S', name: 'S', color: 'var(--color-danger-rose)' }, // REQ-030 四级
        { id: 'A', name: 'A', color: 'var(--color-orange-400)' },
        { id: 'B', name: 'B', color: 'var(--accent)' },
        { id: 'C', name: 'C', color: 'var(--text-2)' }
      ];
    }
    if (kanbanGroupBy === 'overdue') {
      return [
        { id: 'overdue', name: '已逾期', color: 'var(--color-danger)' },
        { id: 'today', name: '今日到期', color: 'var(--color-warn)' },
        { id: 'soon', name: '3天内到期', color: 'var(--color-warn-2)' },
        { id: 'ok', name: '正常', color: 'var(--run-done)' },
        { id: 'none', name: '无交期/已完结', color: 'var(--text-2)' }
      ];
    }
    return [];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header className="top-bar glass">
        <button type="button" className="logo u14-btn" onClick={onOpenSidebar} aria-label="打开主菜单">
          <span className="sidebar-hotzone" onMouseEnter={onOpenSidebar}><Layout size={28} color="var(--accent)" /></span><span>PatternMaster Pro</span>
        </button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn--primary" onClick={onNewTask}>
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
            options={[{ key: '', label: '全部版次状态' }, ...RUN_STATUS_LIST.map((s) => ({ key: s.key, label: s.label }))]}
            value={filters.run_status || ''}
            onChange={v => setFilters({ ...filters, run_status: v })}
            allowCustom={false}
          />

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* 一键清除所有筛选条件；U16 次级弱化：强调色「导出」旁的次级动作降一档视觉权重（.btn--quiet，
                底色/边框/文字色交由令牌类接管，内联只保留布局属性） */}
            <button
              className="btn--ghost btn--quiet"
              onClick={() => setFilters({ keyword: '', category: '', sample_type: '', designer: '', priority: '', run_status: '' })}
              title="清除所有筛选条件"
              style={{ padding: '7px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer' }}
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
                if (!filterTasks(tasks).length) throw new Error('当前筛选结果为空，无可导出数据');
                return exportTasksToExcel(filterTasks(tasks));
              }}
              style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-2)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}
            />

            <div style={{ display: 'flex', background: 'var(--bg-hover-2)', borderRadius: 8, padding: 2 }}>
              <button
                className={`btn--icon btn--xs ${displayMode === 'kanban' ? 'active-mode' : ''}`}
                onClick={() => setDisplayMode('kanban')}
                title="看板视图"
                style={{ padding: '6px 12px', borderRadius: 6, background: displayMode === 'kanban' ? 'var(--accent)' : 'transparent', color: displayMode === 'kanban' ? 'var(--accent-text)' : 'var(--text-2)', border: 'none', cursor: 'pointer' }}
              >
                <Layout size={16} />
              </button>
              <button
                className={`btn--icon btn--xs ${displayMode === 'list' ? 'active-mode' : ''}`}
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
                  <div
                    className="ss-display"
                    role="button"
                    tabIndex={0}
                    style={{ padding: '7px 12px', fontSize: 12, background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-2)', color: 'var(--accent)' }}
                    onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'views' ? null : 'views'); }}
                    onKeyDown={keyboardActivate(() => setActiveDropdown(activeDropdown === 'views' ? null : 'views'))}
                  >
                    <Database size={13} /> <span>{savedViews.find(v => v.id === activeViewId)?.name || '默认列表'}</span>
                  </div>
                  {activeDropdown === 'views' && (
                    <div className="ss-dropdown" style={{ right: 0, width: 180 }}>
                      {savedViews.map(v => (
                        <div key={v.id} className="ss-option" role="button" tabIndex={0} onClick={() => { setActiveViewId(v.id); setListColumns(prev => prev.map(c => ({ ...c, visible: v.columns.find(vc => vc.id === c.id)?.visible ?? false }))); setActiveDropdown(null); }} onKeyDown={keyboardActivate(() => { setActiveViewId(v.id); setListColumns(prev => prev.map(c => ({ ...c, visible: v.columns.find(vc => vc.id === c.id)?.visible ?? false }))); setActiveDropdown(null); })}>
                          {v.name}
                        </div>
                      ))}
                      <div className="ss-divider">新建工作区</div>
                      <div className="ss-option" role="button" tabIndex={0} onClick={() => { setViewNameOpen(true); }} onKeyDown={keyboardActivate(() => { setViewNameOpen(true); })}>
                        <Plus size={14} /> 保存当前配置
                      </div>
                    </div>
                  )}
                </div>

                {/* 字段配置下拉 */}
                <div style={{ position: 'relative', zIndex: 2000 }}>
                  <div
                    className="btn--ghost btn--op"
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
                      <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-3)', marginBottom: 12, padding: '0 4px', display: 'flex', justifyContent: 'space-between' }}>
                        字段排序与显示
                        <span style={{ color: 'var(--accent)', cursor: 'pointer' }} role="button" tabIndex={0} onClick={() => setActiveDropdown(null)} onKeyDown={keyboardActivate(() => setActiveDropdown(null))}>关闭</span>
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
          {filterTasks(tasks).map(task => <TaskCard key={task.id} task={task} onTaskClick={onTaskClick} />)}
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
            <div key={col.id} className="col">
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
                {colTasks.map(task => <TaskCard key={task.id} task={task} onTaskClick={onTaskClick} />)}
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
                            <button className="btn--primary btn--sm" style={{ padding: '6px 16px' }} onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}>详情</button>
                          ) : col.id === 'priority' ? (
                            <span className={`prio-${taskTopPriority(task) === 'S' ? 'high' : taskTopPriority(task) === 'A' ? 'mid' : 'low'}`} style={{ fontSize: 11, fontWeight: 700 }}>
                              {taskTopPriority(task)}
                            </span>
                          ) : col.id === 'status_text' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="dot" style={{ background: derivedCol(task) === 'done' ? 'var(--run-done)' : derivedCol(task) === 'doing' ? 'var(--accent)' : 'var(--text-2)' }} />
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

      {/* U17 保存视图命名（替代原生 prompt）：Esc 走 Modal 基座，空名禁用确认钮 */}
      {viewNameOpen && (
        <InputModal
          title="保存当前配置"
          label="视图名称"
          placeholder="输入视图名称"
          confirmText="保存"
          onConfirm={saveCurrentView}
          onCancel={() => setViewNameOpen(false)}
        />
      )}
    </div>
  );
};

export default KanbanView;
