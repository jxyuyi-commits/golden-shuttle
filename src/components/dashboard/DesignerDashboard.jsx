import React, { useMemo, useState } from 'react';
import { ArrowLeft, Plus, Layout, BarChart3, PieChart, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

// 款级聚合状态元数据（与后端 tasks.cjs DERIVED_STATUS_LABEL 一致）
const STATUS_META = {
  not_started:      { label: '未开始', color: '#64748b' },
  waiting_material: { label: '待配料', color: '#94a3b8' },
  pattern_making:   { label: '打版中', color: '#38bdf8' },
  sample_making:    { label: '样衣中', color: '#fbbf24' },
  pending_confirm:  { label: '待确认', color: '#a78bfa' },
  done:             { label: '已完成', color: '#4ade80' },
};
const STATUS_ORDER = ['not_started', 'waiting_material', 'pattern_making', 'sample_making', 'pending_confirm', 'done'];

// 统计卡点击筛选：key 对应卡片，match 判定款式是否命中（与 stats 计算口径完全一致，保证卡片数字=筛选结果数）
const STAT_FILTERS = {
  inProgress: { match: (s) => ['pattern_making', 'sample_making', 'pending_confirm'].includes(s) },
  waiting:    { match: (s) => ['waiting_material', 'not_started'].includes(s) },
  done:       { match: (s) => s === 'done' },
};

/**
 * 设计师仪表盘：款级宏观视角（总款数、品类占比、进度分布、款级列表）
 * 数据来自 tasks（含 derived_status 聚合状态 + runs 批次）
 * 顶部统计卡可点击筛选下方「款式开发清单」（REQ-001）
 */
const DesignerDashboard = ({ tasks, settings, onTaskClick, onBack, onOpenSidebar, onNewTask }) => {
  // 清单状态筛选：null=全部 | 'inProgress' | 'waiting' | 'done'；点击「总款数」或再次点击已选中卡片恢复全部
  const [statusFilter, setStatusFilter] = useState(null);

  // 统计
  const stats = useMemo(() => {
    const total = tasks.length;
    const byStatus = {};
    STATUS_ORDER.forEach(k => byStatus[k] = 0);
    let inProgress = 0; // 打版中+样衣中+待确认
    let doneCount = 0;
    const byCategory = {};
    for (const t of tasks) {
      const s = t.derived_status || 'not_started';
      byStatus[s] = (byStatus[s] || 0) + 1;
      if (['pattern_making', 'sample_making', 'pending_confirm'].includes(s)) inProgress++;
      if (s === 'done') doneCount++;
      const cat = t.category || '未分类';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }
    return { total, byStatus, inProgress, doneCount, byCategory };
  }, [tasks]);

  // 清单筛选结果（与卡片数字联动）
  const filteredTasks = useMemo(() => {
    if (!statusFilter) return tasks;
    const f = STAT_FILTERS[statusFilter];
    return tasks.filter(t => f && f.match(t.derived_status || 'not_started'));
  }, [tasks, statusFilter]);

  const toggleFilter = (key) => {
    if (key === 'all') { setStatusFilter(null); return; } // 「总款数」= 恢复全部
    setStatusFilter(prev => (prev === key ? null : key)); // 再次点击已选中卡片 = 恢复全部
  };

  const maxCat = Math.max(1, ...Object.values(stats.byCategory));
  const maxStatus = Math.max(1, ...Object.values(stats.byStatus));
  const catEntries = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);

  const statCards = [
    { filterKey: 'all', label: '总款数', value: stats.total, icon: <BarChart3 size={22} />, color: '#38bdf8' },
    { filterKey: 'inProgress', label: '进行中', value: stats.inProgress, icon: <Clock size={22} />, color: '#fbbf24' },
    { filterKey: 'waiting', label: '待配料/未开始', value: stats.byStatus.waiting_material + stats.byStatus.not_started, icon: <AlertCircle size={22} />, color: '#94a3b8' },
    { filterKey: 'done', label: '已完成(可下大货)', value: stats.doneCount, icon: <CheckCircle2 size={22} />, color: '#4ade80' },
  ];

  return (
    <div className="dashboard-view">
      {/* 顶部栏 */}
      <header className="top-bar glass">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-icon" onClick={onBack} title="返回看板"><ArrowLeft size={20} /></button>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>设计师视角 · 款级宏观</div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>开发总览仪表盘</h2>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn-ghost" onClick={onOpenSidebar}><Layout size={16} /> 菜单</button>
          <button className="btn-blue" onClick={onNewTask}><Plus size={16} /> 新建打样单</button>
        </div>
      </header>

      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        {/* 统计卡片（可点击筛选清单） */}
        <div className="dash-stat-row">
          {statCards.map(c => {
            const active = statusFilter === c.filterKey;
            return (
              <div
                key={c.label}
                className={`dash-stat-card${active ? ' active' : ''}`}
                role="button"
                tabIndex={0}
                title={c.filterKey === 'all' ? '显示全部款式' : '点击筛选款式开发清单，再次点击恢复全部'}
                onClick={() => toggleFilter(c.filterKey)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFilter(c.filterKey); } }}
              >
                <div className="dash-stat-icon" style={{ background: `${c.color}22`, color: c.color }}>{c.icon}</div>
                <div>
                  <div className="dash-stat-value" style={{ color: c.color }}>{c.value}</div>
                  <div className="dash-stat-label">{c.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 两列：品类占比 + 进度分布 */}
        <div className="dash-two-col">
          {/* 品类占比 */}
          <div className="dash-panel glass">
            <div className="dash-panel-title"><PieChart size={16} /> 品类占比</div>
            {catEntries.length === 0 && <div style={{ color: '#64748b', fontSize: 13 }}>暂无数据</div>}
            {catEntries.map(([cat, cnt]) => {
              const pct = Math.round((cnt / stats.total) * 100);
              return (
                <div key={cat} className="dash-bar-row">
                  <div className="dash-bar-label">{cat}</div>
                  <div className="dash-bar-track">
                    <div className="dash-bar-fill" style={{ width: `${(cnt / maxCat) * 100}%`, background: '#38bdf8' }} />
                  </div>
                  <div className="dash-bar-val">{cnt} 款 <span style={{ color: '#64748b' }}>({pct}%)</span></div>
                </div>
              );
            })}
          </div>

          {/* 进度分布 */}
          <div className="dash-panel glass">
            <div className="dash-panel-title"><BarChart3 size={16} /> 开发进度分布</div>
            {STATUS_ORDER.map(k => {
              const cnt = stats.byStatus[k] || 0;
              const meta = STATUS_META[k];
              if (cnt === 0) return null;
              return (
                <div key={k} className="dash-bar-row">
                  <div className="dash-bar-label" style={{ color: meta.color }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: meta.color, marginRight: 6 }} />
                    {meta.label}
                  </div>
                  <div className="dash-bar-track">
                    <div className="dash-bar-fill" style={{ width: `${(cnt / maxStatus) * 100}%`, background: meta.color }} />
                  </div>
                  <div className="dash-bar-val">{cnt} 款</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 款级列表（随统计卡筛选联动） */}
        <div className="dash-panel glass" style={{ marginTop: 20 }}>
          <div className="dash-panel-title">款式开发清单（{filteredTasks.length} 款）</div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>款号</th>
                  <th>款式名称</th>
                  <th>品类</th>
                  <th>设计师</th>
                  <th>当前进度</th>
                  <th>批次数</th>
                  <th>最先进批次</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(t => {
                  const meta = STATUS_META[t.derived_status] || STATUS_META.not_started;
                  const runs = t.runs || [];
                  // 最先进批次
                  let topRun = null;
                  for (const r of runs) {
                    if (!topRun || (RUN_STATUS_RANK[r.status] || 0) > (RUN_STATUS_RANK[topRun.status] || 0)) topRun = r;
                  }
                  return (
                    <tr key={t.id} className="dash-table-row" onClick={() => onTaskClick(t)}>
                      <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{t.style_no || '—'}</td>
                      <td>{t.title || '未命名'}</td>
                      <td>{t.category || '—'}</td>
                      <td>{t.designer || '未分配'}</td>
                      <td>
                        <span className="dash-status-pill" style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}55` }}>
                          {meta.label}
                        </span>
                      </td>
                      <td>{runs.length}</td>
                      <td style={{ fontSize: 12, color: '#94a3b8' }}>
                        {topRun ? `${topRun.sample_type || '—'} · ${STATUS_META[topRun.status]?.label || topRun.status}` : '无批次'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const RUN_STATUS_RANK = { waiting_material: 1, pattern_making: 2, sample_making: 3, pending_confirm: 4, done: 5 };

export default DesignerDashboard;
