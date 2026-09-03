import React from 'react';
import { ArrowLeft, Layout, Trash2, Check, Save, Edit2, Upload, Plus } from 'lucide-react';
import PdfThumb from '../common/PdfThumb';
import SizeTable from '../size-table/SizeTable';
import SmartSelect from '../common/SmartSelect';
import ExportButton from '../common/ExportButton';
import BomEditor from '../bom/BomEditor';
import ProcessEditor from '../process/ProcessEditor';
import { exportTechPack, getTechPackFileName } from '../../utils/exportTechPack';
import { fetchBomItems, fetchProcessItems } from '../../api';

const years = ['2023', '2024', '2025', '2026', '2027'];
const seasons = ['春', '夏', '秋', '冬'];
const months = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

/** 打样需求单详情视图：基本信息/尺寸指标 + 设计稿 + 进度节点 */
const DetailView = ({
  task,
  settings,
  detailTab,
  isStyleEditing,
  saveStatus,
  onBack,
  onOpenSidebar,
  onDelete,
  onSave,
  onSetDetailTab,
  onSetIsStyleEditing,
  onSetField,
  onSetNodeField,
  onPdfUpload,
}) => {
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
          <button className="btn-icon" onClick={onBack}><ArrowLeft size={20} /></button>
          <div className="logo" onClick={onOpenSidebar} style={{ marginLeft: -10, marginRight: 20 }}>
            <Layout size={28} color="#38bdf8" />
          </div>
          <div>
            <div className="bc-sub">主页 / 打样需求单 / 编辑</div>
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
          <button
            className="btn-ghost-sm"
            onClick={onDelete}
            style={{ color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '6px 12px', borderRadius: 8 }}
          >
            <Trash2 size={14} /> 删除单据
          </button>
          {saveStatus === 'saved' && <span className="saved-tip" style={{ padding: '4px 12px' }}><Check size={14} /> 已保存</span>}
          <button className="btn-ghost" style={{ padding: '8px 20px' }} onClick={onBack}>取消</button>
          <button className="btn-blue" onClick={onSave} disabled={saveStatus === 'saving'}>
            <Save size={16} /> {saveStatus === 'saving' ? '保存中…' : '保存'}
          </button>
        </div>
      </header>

      <div className="tab-bar glass">
        <div className={`tab ${detailTab === 'base' ? 'active' : ''}`} onClick={() => onSetDetailTab('base')}>基本信息</div>
        <div className={`tab ${detailTab === 'size' ? 'active' : ''}`} onClick={() => onSetDetailTab('size')}>尺寸指标</div>
        <div className={`tab ${detailTab === 'bom' ? 'active' : ''}`} onClick={() => onSetDetailTab('bom')}>物料清单</div>
        <div className={`tab ${detailTab === 'process' ? 'active' : ''}`} onClick={() => onSetDetailTab('process')}>工艺指示</div>
      </div>

      <div className="detail-content custom-scrollbar">
        {detailTab === 'bom' && <BomEditor taskId={task.id} />}
        {detailTab === 'process' && <ProcessEditor taskId={task.id} />}
        {detailTab === 'size' && (
          <div className="glass" style={{ gridColumn: '1/-1', padding: 32 }}>
            <SizeTable
              data={task.size_data || []}
              onChange={val => onSetField('size_data', val)}
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
            <div>款式基础信息 <span>(同款号各版次共享修改)</span></div>
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
              <input value={task.title || ''} onChange={e => onSetField('title', e.target.value)} />
            </div>
            <div className="field">
              <label>款式类别</label>
              <SmartSelect value={task.category} onChange={v => onSetField('category', v)} options={settings.categories} />
            </div>
            <div className="field">
              <label>品牌</label>
              <SmartSelect value={task.brand} onChange={v => onSetField('brand', v)} options={settings.brands} />
            </div>
            <div className="field">
              <label>设计师</label>
              <SmartSelect value={task.designer} onChange={v => onSetField('designer', v)} options={settings.designers} />
            </div>
            <div className="field"></div>
            <div className="field">
              <label>年度</label>
              <select value={task.year || ''} onChange={e => onSetField('year', e.target.value)}>
                <option value="">请选择</option>
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div className="field">
              <label>季节</label>
              <select value={task.season || ''} onChange={e => onSetField('season', e.target.value)}>
                <option value="">请选择</option>
                {seasons.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>波段</label>
              <select value={task.month || ''} onChange={e => onSetField('month', e.target.value)}>
                <option value="">请选择</option>
                {months.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 40, borderLeftColor: '#38bdf8' }}>打样信息 <span>(仅当前单号独立有效)</span></div>
          <div className="field-grid">
            <div className="field">
              <label>打样单号</label>
              <input value={task.order_no || ''} onChange={e => onSetField('order_no', e.target.value)} />
            </div>
            <div className="field">
              <label>版次</label>
              <SmartSelect value={task.sample_type} onChange={v => onSetField('sample_type', v)} options={settings.sampleTypes} />
            </div>
            <div className="field">
              <label>打样需求优先级</label>
              <select value={task.priority || '中'} onChange={e => onSetField('priority', e.target.value)}>
                <option value="低">低</option>
                <option value="中">中</option>
                <option value="高">高</option>
                <option value="紧急">紧急</option>
              </select>
            </div>
            <div className="field">
              <label>样衣颜色</label>
              <input value={task.sample_color || ''} onChange={e => onSetField('sample_color', e.target.value)} placeholder="如：黑色" />
            </div>
            <div className="field">
              <label>尺码</label>
              <select value={task.size || ''} onChange={e => onSetField('size', e.target.value)}>
                <option value="">选择尺码</option>
                {getSizeList().map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>打样件数</label>
              <input type="number" min="1" value={task.sample_count || 1} onChange={e => onSetField('sample_count', e.target.value)} />
            </div>
            <div className="field"><label>预计完工日期</label><input type="date" value={task.expected_date || ''} onChange={e => onSetField('expected_date', e.target.value)} /></div>
            <div className="field"><label>任务开始日期</label><input type="date" value={task.start_date || ''} onChange={e => onSetField('start_date', e.target.value)} /></div>
            <div className="field"><label>实际完工日期</label><input type="date" value={task.finish_date || ''} onChange={e => onSetField('finish_date', e.target.value)} /></div>
            <div className="field"><label>面料到库日期</label><input type="date" value={task.fabric_date || ''} onChange={e => onSetField('fabric_date', e.target.value)} /></div>
            <div className="field">
              <label>审核状态</label>
              <select value={task.audit_status || ''} onChange={e => onSetField('audit_status', e.target.value)}>
                {settings.auditStatuses.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>看板追踪状态</label>
              <select value={task.status || 'todo'} onChange={e => onSetField('status', e.target.value)}>
                <option value="todo">待处理</option>
                <option value="doing">打版中</option>
                <option value="done">已完结</option>
              </select>
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 32 }}>打样说明与工艺反馈</div>
          <div className="textarea-group">
            {[
              { label: '款式说明 / 打样重点', key: 'note' },
              { label: '物料 / 辅料要求', key: 'fabric_req' },
              { label: '工艺建议 / 制作注意事项', key: 'process_req' },
              { label: '审版意见 / 本次修改点反馈', key: 'audit_comment' },
            ].map(({ label, key }) => (
              <div key={key} className="field">
                <label>{label}</label>
                <textarea value={task[key] || ''} onChange={e => onSetField(key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        <div className="side-panel" style={{ display: detailTab === 'base' ? '' : 'none' }}>
          <div className="glass side-box">
            <div className="section-title">设计稿 PDF</div>
            <div className="pdf-preview-wrap">
              <PdfThumb pdfUrl={task.pdf_url} />
            </div>
            <label className="btn-upload-pdf">
              <Upload size={16} /> 上传设计稿
              <input type="file" accept="image/*,.pdf" hidden onChange={e => onPdfUpload(e.target.files[0])} />
            </label>
            {task.pdf_url && (
              <div className="pdf-actions">
                <button
                  type="button"
                  className="btn-remove-pdf"
                  title="移除当前设计稿"
                  onClick={() => onSetField('pdf_url', '')}
                >
                  <Trash2 size={13} /> 移除设计稿
                </button>
              </div>
            )}
          </div>

          <div className="glass side-box" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>工作动态</div>
              <button type="button" className="btn-blue-sm" onClick={() => onSetField('progress_nodes', [...(task.progress_nodes || []), { label: '', status: 'pending', date: '', by: '', note: '' }])}>
                <Plus size={14} /> 添加事件
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
              按项目推进逐条记录，可自由增删改；看板状态单独控制，互不影响
            </div>
            {(task.progress_nodes || []).map((node, i) => (
              <div key={i} className="timeline-row">
                <div className="t-status-wrap">
                  <select
                    className="t-status-sel"
                    value={node.status}
                    onChange={e => onSetNodeField(i, 'status', e.target.value)}
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
                  onChange={e => onSetNodeField(i, 'date', e.target.value)}
                />
                <input
                  className="tl-label-input"
                  value={node.label || ''}
                  placeholder="事件名称（如：完成头样）"
                  onChange={e => onSetNodeField(i, 'label', e.target.value)}
                />
                <input
                  className="tl-by"
                  value={node.by || ''}
                  placeholder="负责人"
                  onChange={e => onSetNodeField(i, 'by', e.target.value)}
                />
                <button
                  type="button"
                  className="btn-icon"
                  title="删除该事件"
                  style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                  onClick={() => onSetField('progress_nodes', (task.progress_nodes || []).filter((_, x) => x !== i))}
                >
                  <Trash2 size={14} />
                </button>
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
    </div>
  );
};

export default DetailView;
