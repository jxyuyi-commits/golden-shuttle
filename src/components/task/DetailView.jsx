import React, { useState, useRef } from 'react';
import { Layout, Trash2, History, Edit2, Upload, Plus, FolderOpen } from 'lucide-react';
import PdfThumb from '../common/PdfThumb';
import PdfPickerModal from '../common/PdfPickerModal';
import ConfirmModal from '../common/ConfirmModal';
import VersionHistoryModal from '../common/VersionHistoryModal';
import SizeTable from '../size-table/SizeTable';
import SmartSelect from '../common/SmartSelect';
import ExportButton from '../common/ExportButton';
import BomEditor from '../bom/BomEditor';
import ProcessEditor from '../process/ProcessEditor';
import DrawingLibrary from '../drawing/DrawingLibrary';
import SampleRunList from './SampleRunList';
import { exportTechPack, getTechPackFileName } from '../../utils/exportTechPack';
import { exportTechPackPdf, getTechPackPdfFileName } from '../../utils/exportTechPackPdf';
import { fetchBomItems, fetchProcessItems } from '../../api';
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

  // 自动保存（REQ-006③ 修订）：工作动态条目输入防抖 400ms 提交，镜像最新 progress_nodes
  const progressRef = useRef(task.progress_nodes || []);
  progressRef.current = task.progress_nodes || [];
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

  const getSizeList = () => {
    const grp = getSizeGroup();
    return grp ? grp.size_list.split(',').map(s => s.trim()) : ['S', 'M', 'L', 'XL', 'XXL'];
  };

  return (
    <div>
      <header className="top-bar glass">
        <div className="detail-breadcrumb">
          <div className="logo sidebar-hotzone" onClick={onOpenSidebar} onMouseEnter={onOpenSidebar} style={{ marginRight: 20 }}>
            <Layout size={28} color="#38bdf8" />
          </div>
          <div>
            <div className="bc-sub">
              <span className="bc-link" onClick={onBack}>主页</span>
              <span className="bc-sep"> / </span>
              <span className="bc-link" onClick={onBack}>打样需求单</span>
              <span className="bc-sep"> / </span>
              <span className="bc-current">编辑</span>
            </div>
            <div className="bc-title">修改打样需求单 — {task.style_no || task.title}</div>
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
              return exportTechPack(task, bom, proc);
            }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(56,189,248,0.2)', background: 'rgba(56,189,248,0.1)', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
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
              return exportTechPackPdf(task, bom, proc);
            }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.1)', color: '#34d399', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          />
          <button
            className="btn-ghost-sm"
            onClick={() => setShowVersions(true)}
            title="历史版本：查看快照/对比/回滚"
            style={{ color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)', padding: '6px 12px', borderRadius: 8 }}
          >
            <History size={14} /> 历史版本
          </button>
          <button
            className="btn-ghost-sm"
            onClick={onDelete}
            style={{ color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '6px 12px', borderRadius: 8 }}
          >
            <Trash2 size={14} /> 删除单据
          </button>
        </div>
      </header>

      <div className="tab-bar glass">
        <div className={`tab ${detailTab === 'base' ? 'active' : ''}`} onClick={() => onSetDetailTab('base')}>基本信息</div>
        <div className={`tab ${detailTab === 'drawing' ? 'active' : ''}`} onClick={() => onSetDetailTab('drawing')}>图纸资料</div>
        <div className={`tab ${detailTab === 'size' ? 'active' : ''}`} onClick={() => onSetDetailTab('size')}>尺寸指标</div>
        <div className={`tab ${detailTab === 'bom' ? 'active' : ''}`} onClick={() => onSetDetailTab('bom')}>物料清单</div>
        <div className={`tab ${detailTab === 'process' ? 'active' : ''}`} onClick={() => onSetDetailTab('process')}>工艺指示</div>
      </div>

      <div className="detail-content custom-scrollbar">
        {detailTab === 'drawing' && <DrawingLibrary taskId={task.id} />}
        {detailTab === 'bom' && <BomEditor taskId={task.id} key={`bom-${task.id}-${bomTick}`} />}
        {detailTab === 'process' && <ProcessEditor taskId={task.id} />}
        {detailTab === 'size' && (
          <div className="glass" style={{ gridColumn: '1/-1', padding: 32 }}>
            <SizeTable
              data={task.size_data || []}
              onChange={val => { onSetField('size_data', val); onCommitField('size_data', val); }}
              updatedAt={task.updated_at}
              standardSize={task.size || 'M'}
              sizeGroup={getSizeGroup()}
              measurementCategories={settings.measurementCategories || []}
              styleId={task.style_id}
              currentTaskId={task.id}
              category={task.category}
            />
          </div>
        )}

        <div className="form-panel glass" style={{ display: detailTab === 'base' ? '' : 'none' }}>
          <div className="section-title" style={{ borderLeftColor: '#f43f5e', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>款式信息 <span>(款级共享 · 同款各版次同步生效，编辑保存即全局生效)</span></div>
            <button type="button" className="btn-icon" onClick={() => onSetIsStyleEditing(!isStyleEditing)} style={{ background: isStyleEditing ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)', borderRadius: 4, padding: 4 }}>
              <Edit2 size={16} color={isStyleEditing ? '#38bdf8' : '#94a3b8'} />
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
            <div className="field"></div>
            <div className="field">
              <label>年度</label>
              <select value={task.year || ''} onChange={e => { onSetField('year', e.target.value); onCommitField('year', e.target.value); }}>
                <option value="">请选择</option>
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div className="field">
              <label>季节</label>
              <select value={task.season || ''} onChange={e => { onSetField('season', e.target.value); onCommitField('season', e.target.value); }}>
                <option value="">请选择</option>
                {seasons.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>波段</label>
              <select value={task.month || ''} onChange={e => { onSetField('month', e.target.value); onCommitField('month', e.target.value); }}>
                <option value="">请选择</option>
                {months.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 32, borderLeftColor: '#fbbf24' }}>
            打样批次 <span>(同款各版次并行，板师工作单元；各自独立打样单号与审核)</span>
          </div>
          <SampleRunList taskId={task.id} settings={settings} category={task.category} onStatusSync={onStatusSync} />

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
              style={dragPdf ? { borderColor: 'rgba(56,189,248,0.75)', background: 'rgba(56,189,248,0.06)' } : undefined}
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
                  <button className="pdf-action-btn" title="从图纸资料库选择设计稿" onClick={e => { e.stopPropagation(); setShowPdfPicker(true); }}>
                    <FolderOpen size={14} />
                    <span>从资料库选</span>
                  </button>
                </div>
              )}

              {task.pdf_url && (
                <div className="pdf-hover-actions">
                  <button className="pdf-action-btn" title="上传新文件更换设计稿" onClick={e => { e.stopPropagation(); pdfInputRef.current?.click(); }}>
                    <Upload size={14} />
                    <span>更换</span>
                  </button>
                  <button className="pdf-action-btn" title="从图纸资料库选择已有设计稿" onClick={e => { e.stopPropagation(); setShowPdfPicker(true); }}>
                    <FolderOpen size={14} />
                    <span>从资料库选</span>
                  </button>
                  <button
                    className="pdf-action-btn"
                    title="移除设计稿"
                    onClick={e => { e.stopPropagation(); setConfirmPdfRemove(true); }}
                  >
                    <Trash2 size={14} />
                    <span>移除</span>
                  </button>
                </div>
              )}

              {dragPdf && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.78)', borderRadius: 12, zIndex: 5, pointerEvents: 'none' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#7dd3fc', background: 'rgba(2,6,23,0.85)', padding: '12px 24px', borderRadius: 10, border: '1px dashed rgba(56,189,248,0.6)' }}>
                    松开鼠标{task.pdf_url ? '更换' : '上传'}设计稿
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="glass side-box" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>工作动态</div>
              <button type="button" className="btn-blue-sm" onClick={() => {
                const next = [...(task.progress_nodes || []), { label: '', status: 'pending', date: '', by: '', note: '' }];
                onSetField('progress_nodes', next); commitNodesNow(next);
              }}>
                <Plus size={14} /> 添加事件
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
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
                    className="icon-btn-danger"
                    title="删除该事件"
                    onClick={() => setConfirmNode(i)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="tl-sub">
                  <div className="t-status-wrap">
                    <select
                      className="t-status-sel"
                      value={node.status}
                      onChange={e => {
                        const nodes = [...(task.progress_nodes || [])];
                        nodes[i] = { ...nodes[i], status: e.target.value };
                        onSetField('progress_nodes', nodes); commitNodesNow(nodes);
                      }}
                    >
                      <option value="done">已完成</option>
                      <option value="active">进行中</option>
                      <option value="pending">待开始</option>
                    </select>
                  </div>
                  <input
                    type="date"
                    className="tl-date"
                    value={node.date || ''}
                    onChange={e => { onSetNodeField(i, 'date', e.target.value); scheduleNodeCommit(); }}
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
              <div style={{ padding: '18px 0', textAlign: 'center', color: '#475569', fontSize: 12 }}>
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
          onRolledBack={() => { setBomTick(t => t + 1); onStatusSync && onStatusSync(); }}
        />
      )}

      {/* REQ-006② 删除确认 */}
      {confirmPdfRemove && (
        <ConfirmModal
          title="移除设计稿"
          message="确定移除该设计稿吗？\n（图纸资料库中的文件不会被删除）"
          onConfirm={() => { onPdfRemove(); setConfirmPdfRemove(false); }}
          onCancel={() => setConfirmPdfRemove(false)}
        />
      )}
      {confirmNode !== null && (
        <ConfirmModal
          title="删除工作动态条目"
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
    </div>
  );
};

export default DetailView;
