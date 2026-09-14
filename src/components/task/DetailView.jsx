import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Layout, Trash2, History, Edit2, Edit3, Upload, Plus, FolderOpen } from 'lucide-react';
import PdfThumb from '../common/PdfThumb';
import PdfPickerModal from '../common/PdfPickerModal';
import ConfirmModal from '../common/ConfirmModal';
import VersionHistoryModal from '../common/VersionHistoryModal';
import DatePicker from '../common/DatePicker';
import SizeTable from '../size-table/SizeTable';
import SmartSelect from '../common/SmartSelect';
import ExportButton from '../common/ExportButton';
import BomEditor from '../bom/BomEditor';
import ProcessEditor from '../process/ProcessEditor';
import DrawingLibrary from '../drawing/DrawingLibrary';
import SampleRunList from './SampleRunList';
import { exportTechPack, getTechPackFileName } from '../../utils/exportTechPack';
import { exportTechPackPdf, getTechPackPdfFileName } from '../../utils/exportTechPackPdf';
import { fetchBomItems, fetchProcessItems, fetchRuns, updateRun } from '../../api';
import { peopleByRole } from '../../utils/people';

const years = ['2023', '2024', '2025', '2026', '2027'];
const seasons = ['春', '夏', '秋', '冬'];
const months = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

/** 打样需求单详情视图：基本信息/尺寸指标 + 设计稿 + 进度节点 */
const DetailView = ({
  task,
  settings,
  detailTab,
  isStyleEditing,
  onBack,
  onOpenSidebar,
  onDelete,
  onSetDetailTab,
  onSetIsStyleEditing,
  onSetField,
  onSetNodeField,
  onCommitField,
  onPdfUpload,
  onPdfSelect,
  onPdfRemove,
  pdfSyncState,
  onStatusSync,
}) => {
  const [dragPdf, setDragPdf] = useState(false);
  const [showPdfPicker, setShowPdfPicker] = useState(false);
  const [confirmNode, setConfirmNode] = useState(null); // REQ-006② 待删除工作动态条目 index
  const [confirmPdfRemove, setConfirmPdfRemove] = useState(false); // REQ-006② 移除设计稿确认
  const [showVersions, setShowVersions] = useState(false); // REQ-011 历史版本弹窗
  const [bomTick, setBomTick] = useState(0); // REQ-011 回滚后强制 BomEditor 重拉
  const pdfInputRef = useRef(null);

  // REQ-005 尺寸表归属版次：款内批次 + 当前编辑版次（修订2：入口=批次卡片，进入后锁定不可切换）
  const [runs, setRuns] = useState([]);
  const [sizeRunId, setSizeRunId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);        // 尺寸页操作反馈（导入结果）

  const reloadRuns = () => {
    if (!task?.id) return;
    fetchRuns(task.id)
      .then(list => {
        const arr = list || [];
        setRuns(arr);
        // REQ-005 修订3：未指定批次时默认展示「最新编辑的尺寸表」（updated_at 最新，其次 id 最大）
        setSizeRunId(prev => {
          if (prev && arr.some(r => r.id == prev)) return prev;
          const latest = [...arr].sort((a, b) => {
            const t = String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
            return t !== 0 ? t : (b.id || 0) - (a.id || 0);
          })[0];
          return latest?.id ?? null;
        });
      })
      .catch(() => {});
  };

  // reloadRuns 每次渲染重建；纳入依赖会每渲染重跑，语义上仅需 task 变化时重拉（功能正确，避免请求循环）。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reloadRuns(); }, [task?.id]);

  // 操作反馈提示：3 秒自动消失
  useEffect(() => {
    if (!toastMsg) return undefined;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // REQ-005 修订2：进入尺寸页时拉取最新批次
  const handleSetTab = (t) => {
    if (t === 'size') reloadRuns();
    onSetDetailTab(t);
  };

  const selectedRun = runs.find(r => r.id == sizeRunId) || runs[0] || null;

  // 稳定引用：SizeTable 行级 memo 依赖 onChange 引用不变，否则每键全表重渲染。
  // 因此依赖仅取 selectedRun?.id（仅切换版次时重建）；纳入完整 selectedRun 会破坏该稳定性。
  const handleSizeChange = useCallback((val) => {
    if (!selectedRun) return;
    setRuns(prev => prev.map(r => r.id === selectedRun.id ? { ...r, size_data: val } : r));
    updateRun(selectedRun.id, { size_data: val }).catch(() => {});
  }, [selectedRun?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- 仅取 id 保持回调引用稳定（切换版次才重建）

  // REQ-005 修订2：从批次卡片「尺寸表」入口进入——绑定该版次并打开尺寸页
  const handleOpenSizeTable = (run) => {
    if (!run) return;
    setSizeRunId(run.id);
    reloadRuns(); // 拉取最新批次列表，确保该批次数据为最新
    onSetDetailTab('size');
  };

  // REQ-005 修订2：跨版次对比后导入——在对比视图确认数据合适后，整体导入到当前版次
  const importFromCompare = async (srcRun) => {
    if (!selectedRun || !srcRun) return;
    const srcRows = Array.isArray(srcRun.size_data) ? srcRun.size_data : [];
    if (srcRows.length === 0) {
      setToastMsg('对比版次暂无尺寸数据，无法导入');
      return;
    }
    try {
      await updateRun(selectedRun.id, { size_data: srcRows });
      setRuns(prev => prev.map(r => r.id === selectedRun.id ? { ...r, size_data: srcRows } : r));
      onStatusSync && onStatusSync();
      setToastMsg(`已从「${srcRun.order_no || '未编号'}」导入 ${srcRows.length} 行尺寸数据到当前版次，原数据已覆盖`);
    } catch {
      setToastMsg('导入失败，请重试');
    }
  };

  // 自动保存（REQ-006③ 修订）：工作动态条目输入防抖 400ms 提交，镜像最新 progress_nodes
  const progressRef = useRef(task.progress_nodes || []);
  // 渲染期禁止写 ref（react-hooks/refs）：改在提交后同步，定时回调运行时读到即为最新值
  useEffect(() => { progressRef.current = task.progress_nodes || []; }, [task.progress_nodes]);
  const nodeCommitTimer = useRef(null);
  const scheduleNodeCommit = () => {
    if (nodeCommitTimer.current) clearTimeout(nodeCommitTimer.current);
    nodeCommitTimer.current = setTimeout(() => onCommitField('progress_nodes', progressRef.current), 400);
  };
  const commitNodesNow = (nodes) => {
    if (nodeCommitTimer.current) { clearTimeout(nodeCommitTimer.current); nodeCommitTimer.current = null; }
    onCommitField('progress_nodes', nodes);
  };

  const getSizeGroup = () => {
    const catObj = settings.categories.find(c => (typeof c === 'string' ? c : c.name) === task.category);
    if (catObj && typeof catObj !== 'string' && catObj.size_group_id) {
      return settings.sizeGroups.find(g => g.id == catObj.size_group_id);
    }
    return null;
  };

  return (
    <div>
      <header className="top-bar glass">
        <div className="detail-breadcrumb">
          <div className="logo sidebar-hotzone" onClick={onOpenSidebar} onMouseEnter={onOpenSidebar} style={{ marginRight: 20 }}>
            <Layout size={28} color="var(--accent)" />
          </div>
          <div>
            <div className="bc-sub">
              <span className="bc-link" onClick={onBack}>主页</span>
              <span className="bc-sep"> / </span>
              <span className="bc-link" onClick={onBack}>打样需求单</span>
              <span className="bc-sep"> / </span>
              <span className="bc-current">编辑</span>
            </div>
            <div className="bc-title">{task.style_no || ''}{task.style_no && task.title ? ' ' : ''}{task.title || ''}</div>
          </div>
        </div>
        <div className="header-ops-v4">
          <ExportButton
            label="导出工艺单"
            title="导出工艺单"
            confirmText={`将导出打样单「${task.style_no} ${task.title}」的完整工艺单，含 4 个工作表：基本信息（款式/打样/日期/工作动态/说明）、尺寸指标、物料清单(BOM)、工艺指示。`}
            fileName={getTechPackFileName(task)}
            onExport={async () => {
              const [bom, proc] = await Promise.all([
                fetchBomItems(task.id).catch(() => []),
                fetchProcessItems(task.id).catch(() => [])
              ]);
              return exportTechPack(task, bom, proc, selectedRun); // REQ-005 按当前批次导出尺寸表
            }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--accent-soft-2)', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          />
          <ExportButton
            label="导出PDF"
            title="导出工艺单 PDF"
            confirmText={`将导出打样单「${task.style_no} ${task.title}」的工艺单 PDF（A4：基本信息 / 尺寸规格 / 物料清单 / 工艺指示）。`}
            fileName={getTechPackPdfFileName(task)}
            onExport={async () => {
              const [bom, proc] = await Promise.all([
                fetchBomItems(task.id).catch(() => []),
                fetchProcessItems(task.id).catch(() => [])
              ]);
              return exportTechPackPdf(task, bom, proc, selectedRun); // REQ-005 按当前批次导出尺寸表
            }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--accent-soft-2)', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          />
          <button
            className="btn--ghost btn--sm"
            onClick={() => setShowVersions(true)}
            title="历史版本：查看快照/对比/回滚"
            style={{ color: 'var(--text-2)', border: '1px solid var(--border-weak)', padding: '6px 12px', borderRadius: 8 }}
          >
            <History size={14} /> 历史版本
          </button>
          <button
            className="btn--ghost btn--sm btn--ghost-danger"
            onClick={onDelete}
            style={{ border: '1px solid var(--border-weak)', padding: '6px 12px', borderRadius: 8 }}
          >
            <Trash2 size={14} /> 删除单据
          </button>
        </div>
      </header>

      <div className="tab-bar glass">
        <div className={`tab ${detailTab === 'base' ? 'active' : ''}`} onClick={() => handleSetTab('base')}>基本信息</div>
        <div className={`tab ${detailTab === 'drawing' ? 'active' : ''}`} onClick={() => handleSetTab('drawing')}>图纸资料</div>
        <div className={`tab ${detailTab === 'size' ? 'active' : ''}`} onClick={() => handleSetTab('size')}>尺寸指标</div>
        <div className={`tab ${detailTab === 'bom' ? 'active' : ''}`} onClick={() => handleSetTab('bom')}>物料清单</div>
        <div className={`tab ${detailTab === 'process' ? 'active' : ''}`} onClick={() => handleSetTab('process')}>工艺指示</div>
      </div>

      <div className="detail-content custom-scrollbar">
        {detailTab === 'drawing' && <DrawingLibrary taskId={task.id} />}
        {detailTab === 'bom' && <BomEditor taskId={task.id} key={`bom-${task.id}-${bomTick}`} />}
        {detailTab === 'process' && <ProcessEditor taskId={task.id} />}
        {detailTab === 'size' && (
          <div className="glass" style={{ gridColumn: '1/-1', padding: 32 }}>
            {/* REQ-005① 尺寸表绑定当前编辑版次：入口=批次卡片「尺寸表」，进入后锁定该版次（修订2） */}
            {selectedRun && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-2)' }}>
                <Edit3 size={15} color="var(--accent)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>当前编辑版次（已锁定）：</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{selectedRun.order_no || '未编号'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>（{selectedRun.sample_type || '未知版次'} · {selectedRun.size || '无码'}）</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>本页仅编辑该版次尺寸表 · 修改自动保存 · 各版次数据隔离，如需编辑其它版次请返回基本信息页从其批次卡片进入</span>
              </div>
            )}
            {toastMsg && (
              <div style={{ fontSize: 12, color: 'var(--run-done)', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', padding: '6px 12px', borderRadius: 8, marginBottom: 16 }}>
                {toastMsg}
              </div>
            )}
            <SizeTable
              data={selectedRun?.size_data || []}
              onChange={handleSizeChange}
              updatedAt={task.updated_at}
              standardSize={selectedRun?.size || 'M'}
              sizeGroup={getSizeGroup()}
              measurementCategories={settings.measurementCategories || []}
              category={task.category}
              compareRuns={runs.filter(r => r.id !== selectedRun?.id)}
              onImportCompare={importFromCompare}
            />
          </div>
        )}

        <div className="form-panel glass" style={{ display: detailTab === 'base' ? '' : 'none' }}>
          <div className="section-title" style={{ borderLeftColor: 'var(--color-danger-rose)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>款式信息 <span>(款级共享 · 同款各版次同步生效，编辑保存即全局生效)</span></div>
            <button type="button" className="btn--icon" onClick={() => onSetIsStyleEditing(!isStyleEditing)} style={{ background: isStyleEditing ? 'var(--accent-soft-2)' : 'var(--border-weak)', borderRadius: 4, padding: 4 }}>
              <Edit2 size={16} color={isStyleEditing ? 'var(--accent)' : 'var(--text-2)'} />
            </button>
          </div>
          <div className="field-grid" style={{ pointerEvents: isStyleEditing ? 'auto' : 'none', opacity: isStyleEditing ? 1 : 0.65, transition: '0.2s' }}>
            <div className="field">
              <label>款式编号</label>
              <input value={task.style_no || ''} disabled style={{ opacity: 0.6 }} />
            </div>
            <div className="field">
              <label>款式名称</label>
              <input value={task.title || ''} onChange={e => onSetField('title', e.target.value)} onBlur={e => onCommitField('title', e.target.value)} />
            </div>
            <div className="field">
              <label>款式类别</label>
              <SmartSelect value={task.category} onChange={v => { onSetField('category', v); onCommitField('category', v); }} options={settings.categories} />
            </div>
            <div className="field">
              <label>品牌</label>
              <SmartSelect value={task.brand} onChange={v => { onSetField('brand', v); onCommitField('brand', v); }} options={settings.brands} />
            </div>
            <div className="field">
              <label>设计师</label>
              <SmartSelect value={task.designer} onChange={v => { onSetField('designer', v); onCommitField('designer', v); }} options={peopleByRole(settings.people, '设计师')} />
            </div>
            <div className="field">
              <label>版师</label>
              <SmartSelect value={task.pattern_maker || ''} onChange={v => { onSetField('pattern_maker', v); onCommitField('pattern_maker', v); }} options={peopleByRole(settings.people, '版师')} placeholder="选择版师或输入" />
            </div>
            <div className="field">
              <label>年度</label>
              <SmartSelect value={task.year || ''} onChange={v => { onSetField('year', v); onCommitField('year', v); }} options={years} placeholder="请选择" allowCustom={false} />
            </div>
            <div className="field">
              <label>季节</label>
              <SmartSelect value={task.season || ''} onChange={v => { onSetField('season', v); onCommitField('season', v); }} options={seasons} placeholder="请选择" allowCustom={false} />
            </div>
            <div className="field">
              <label>波段</label>
              <SmartSelect value={task.month || ''} onChange={v => { onSetField('month', v); onCommitField('month', v); }} options={months} placeholder="请选择" allowCustom={false} />
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 32, borderLeftColor: 'var(--run-sample)' }}>
            打样批次 <span>(同款各版次并行，板师工作单元；各自独立打样单号与审核)</span>
          </div>
          <SampleRunList taskId={task.id} settings={settings} category={task.category} onStatusSync={onStatusSync} onRunsChanged={reloadRuns} onOpenSizeTable={handleOpenSizeTable} onOpenBom={() => handleSetTab('bom')} onOpenDrawings={() => handleSetTab('drawing')} />

          <div className="section-title" style={{ marginTop: 32 }}>打样说明与工艺反馈</div>
          <div className="textarea-group">
            {[
              { label: '款式说明 / 打样重点', key: 'note' },
              { label: '物料 / 辅料要求', key: 'fabric_req' },
              { label: '工艺建议 / 制作注意事项', key: 'process_req' },
            ].map(({ label, key }) => (
              <div key={key} className="field">
                <label>{label}</label>
                <textarea value={task[key] || ''} onChange={e => onSetField(key, e.target.value)} onBlur={e => onCommitField(key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        <div className="side-panel" style={{ display: detailTab === 'base' ? '' : 'none' }}>
          <div className="glass side-box">
            <div className="section-title">设计稿 PDF</div>
            {pdfSyncState === 'syncing' && <div className="pdf-sync-tip">正在同步到图纸资料库…</div>}
            {pdfSyncState === 'ok' && <div className="pdf-sync-tip ok">已同步到图纸资料库</div>}
            {pdfSyncState && pdfSyncState.error && <div className="pdf-sync-tip err">同步失败：{pdfSyncState.error}</div>}
            <div
              className="pdf-upload-zone"
              style={dragPdf ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
              onClick={() => { if (!task.pdf_url) pdfInputRef.current?.click(); }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (!dragPdf) setDragPdf(true); }}
              onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragPdf(true); }}
              onDragLeave={e => { e.preventDefault(); e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget)) setDragPdf(false); }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragPdf(false); const f = e.dataTransfer?.files?.[0]; if (f) onPdfUpload(f); }}
              title={task.pdf_url ? '' : '点击或拖拽上传设计稿'}
            >
              <div className="pdf-preview-wrap">
                <PdfThumb
                  key={task.pdf_url || 'empty'}
                  pdfUrl={task.pdf_url}
                  enlargeActionItems={[
                    { label: '更换设计稿', icon: <Upload size={14} />, onClick: () => pdfInputRef.current?.click() },
                    { label: '从资料库选', icon: <FolderOpen size={14} />, onClick: () => setShowPdfPicker(true) },
                  ]}
                />
              </div>
              <input ref={pdfInputRef} type="file" hidden onChange={e => { onPdfUpload(e.target.files[0]); e.target.value = ''; }} />

              {!task.pdf_url && (
                <div className="pdf-empty-hover-tip">点击或拖拽上传，支持任意格式</div>
              )}

              {!task.pdf_url && (
                <div className="pdf-hover-actions">
                  <button className="btn--ghost btn--sm btn--pdf" title="从图纸资料库选择设计稿" onClick={e => { e.stopPropagation(); setShowPdfPicker(true); }}>
                    <FolderOpen size={14} />
                    <span>从资料库选</span>
                  </button>
                </div>
              )}

              {task.pdf_url && (
                <div className="pdf-hover-actions">
                  <button className="btn--ghost btn--sm btn--pdf" title="上传新文件更换设计稿" onClick={e => { e.stopPropagation(); pdfInputRef.current?.click(); }}>
                    <Upload size={14} />
                    <span>更换</span>
                  </button>
                  <button className="btn--ghost btn--sm btn--pdf" title="从图纸资料库选择已有设计稿" onClick={e => { e.stopPropagation(); setShowPdfPicker(true); }}>
                    <FolderOpen size={14} />
                    <span>从资料库选</span>
                  </button>
                  <button
                    className="btn--ghost btn--sm btn--pdf btn--ghost-danger"
                    title="移除设计稿"
                    onClick={e => { e.stopPropagation(); setConfirmPdfRemove(true); }}
                  >
                    <Trash2 size={14} />
                    <span>移除</span>
                  </button>
                </div>
              )}

              {dragPdf && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-strong)', borderRadius: 12, zIndex: 5, pointerEvents: 'none' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', background: 'var(--overlay-strong)', padding: '12px 24px', borderRadius: 10, border: '1px dashed rgba(200,169,110,0.6)' }}>
                    松开鼠标{task.pdf_url ? '更换' : '上传'}设计稿
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="glass side-box" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>工作动态</div>
              <button type="button" className="btn--primary btn--sm" onClick={() => {
                const next = [...(task.progress_nodes || []), { label: '', status: 'pending', date: '', by: '', note: '' }];
                onSetField('progress_nodes', next); commitNodesNow(next);
              }}>
                <Plus size={14} /> 添加事件
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
              按项目推进逐条记录，可自由增删改；看板状态单独控制，互不影响
            </div>
            {(task.progress_nodes || []).map((node, i) => (
              <div key={i} className="timeline-row">
                <div className="tl-main">
                  <input
                    className="tl-label-input"
                    value={node.label || ''}
                    placeholder="事件名称（如：完成头样）"
                    onChange={e => { onSetNodeField(i, 'label', e.target.value); scheduleNodeCommit(); }}
                  />
                  <button
                    type="button"
                    className="btn--icon-danger"
                    title="删除该事件"
                    onClick={() => setConfirmNode(i)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="tl-sub">
                  <div className="t-status-wrap">
                    <SmartSelect
                      className="t-status-ss"
                      value={node.status}
                      onChange={v => {
                        const nodes = [...(task.progress_nodes || [])];
                        nodes[i] = { ...nodes[i], status: v };
                        onSetField('progress_nodes', nodes); commitNodesNow(nodes);
                      }}
                      options={[{ key: 'done', label: '已完成' }, { key: 'active', label: '进行中' }, { key: 'pending', label: '待开始' }]}
                      allowCustom={false}
                      placeholder="状态"
                    />
                  </div>
                  <DatePicker
                    className="tl-date"
                    value={node.date || ''}
                    onChange={v => { onSetNodeField(i, 'date', v); scheduleNodeCommit(); }}
                  />
                  <input
                    className="tl-by"
                    value={node.by || ''}
                    placeholder="负责人"
                    onChange={e => { onSetNodeField(i, 'by', e.target.value); scheduleNodeCommit(); }}
                  />
                </div>
              </div>
            ))}
            {(task.progress_nodes || []).length === 0 && (
              <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                暂无工作动态，点击「添加事件」开始记录项目推进
              </div>
            )}
          </div>
        </div>
      </div>
      {showPdfPicker && (
        <PdfPickerModal
          taskId={task.id}
          currentUrl={task.pdf_url}
          onSelect={url => { onPdfSelect(url); setShowPdfPicker(false); }}
          onClose={() => setShowPdfPicker(false)}
        />
      )}

      {/* REQ-011 历史版本 */}
      {showVersions && (
        <VersionHistoryModal
          task={task}
          onClose={() => setShowVersions(false)}
          onRolledBack={() => { setBomTick(t => t + 1); onStatusSync && onStatusSync(); fetchRuns(task.id).then(list => setRuns(list || [])).catch(() => {}); }}
        />
      )}

      {/* REQ-006② 删除确认 */}
      {confirmPdfRemove && (
        <ConfirmModal
          title="移除设计稿"
          tone="danger"
          confirmText="确认移除"
          message="确定移除该设计稿吗？\n（图纸资料库中的文件不会被删除）"
          onConfirm={() => { onPdfRemove(); setConfirmPdfRemove(false); }}
          onCancel={() => setConfirmPdfRemove(false)}
        />
      )}
      {confirmNode !== null && (
        <ConfirmModal
          title="删除工作动态条目"
          tone="danger"
          confirmText="确认删除"
          message={`确定删除「${(task.progress_nodes || [])[confirmNode]?.label || '未命名事件'}」这条记录？`}
          onConfirm={() => {
            const next = (task.progress_nodes || []).filter((_, x) => x !== confirmNode);
            onSetField('progress_nodes', next);
            commitNodesNow(next);
            setConfirmNode(null);
          }}
          onCancel={() => setConfirmNode(null)}
        />
      )}

      {/* REQ-005 修订2：导入已并入跨版次对比视图（SizeTable 内确认），此处无需额外弹窗 */}
    </div>
  );
};

export default DetailView;
