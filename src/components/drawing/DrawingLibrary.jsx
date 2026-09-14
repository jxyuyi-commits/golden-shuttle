// 图纸资料库：集中管理款式的设计稿/参考图/成衣图/纸样/唛架图等资料
// 版本管控：参考资料(reference) 防冗余（同内容去重）；工作成果(output) 可追溯（同名迭代自动升版本）
// 支持：点击选择 / 拖拽 / 复制粘贴 上传，不限文件格式
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Loader2, X, Upload, FileText, ClipboardPaste, History, AlertTriangle } from 'lucide-react';
import ConfirmModal from '../common/ConfirmModal';
import SmartSelect from '../common/SmartSelect';
import PdfThumb from '../common/PdfThumb';
import {
  fetchDrawings, fetchDrawingGroup, createDrawing, updateDrawing,
  deleteDrawing, deleteDrawingGroup, uploadDesignFile,
} from '../../api';

// DRAWING_CATEGORIES 为本组件内部及导出给同模块使用的分类常量；拆分独立文件会引入无谓耦合，
// 故保留同文件导出并说明：禁用 fast-refresh「仅导出组件」约束（不影响生产构建/HMR 正确性）。
// eslint-disable-next-line react-refresh/only-export-components
export const DRAWING_CATEGORIES = ['设计稿', '参考图', '成衣图', '纸样', '唛架图'];

// 各分类徽章配色
const CATEGORY_COLORS = {
  '设计稿': 'var(--accent)',
  '参考图': '#f472b6',
  '成衣图': '#fb923c',
  '纸样': '#a78bfa',
  '唛架图': '#34d399',
};

// 参考资料分类（防冗余，不建版本）
const REFERENCE_CATEGORIES = ['参考图', '成衣图'];
const isReference = (category) => REFERENCE_CATEGORIES.includes(category);

// 文件类型标签配色：按大类区分，一眼可辨
const TYPE_COLORS = {
  png: '#22c55e', jpg: '#22c55e', jpeg: '#22c55e', gif: '#22c55e', webp: '#22c55e',
  bmp: '#22c55e', svg: '#22c55e', avif: '#22c55e', tif: '#22c55e', tiff: '#22c55e',
  pdf: '#ef4444',
  dxf: '#f59e0b',
  emf: '#94a3b8',
  pla: '#a78bfa', prj: '#a78bfa', zprj: '#a78bfa', zpac: '#a78bfa',
};
const typeColor = (ext) => TYPE_COLORS[ext] || 'var(--text-3)';

/** 从 URL 提取文件扩展名（小写） */
function fileExtOf(url, filename) {
  const src = url || filename || '';
  const clean = src.split('?')[0].split('/').pop();
  return clean.includes('.') ? clean.split('.').pop().toLowerCase() : '';
}

const inputStyle = {
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  padding: '7px 10px', borderRadius: 6, color: 'var(--text)',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box'
};

/** 格式化文件大小 */
function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 图纸资料库：卡片网格（版本聚合）+ 分类筛选 + 上传弹窗 + 版本历史 */
const DrawingLibrary = ({ taskId }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('全部');
  const [showUpload, setShowUpload] = useState(false);
  const [upCategory, setUpCategory] = useState('设计稿');
  const [upFiles, setUpFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  // 版本历史弹窗
  const [groupModal, setGroupModal] = useState(null); // { groupId, versions: [] }
  const [groupLoading, setGroupLoading] = useState(false);
  const [confirmCard, setConfirmCard] = useState(null); // REQ-006② 待删除资料卡
  const [confirmVerId, setConfirmVerId] = useState(null); // 待删除版本 id

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchDrawings(taskId)); }
    catch (e) { alert('加载图纸资料失败: ' + e.message); }
    finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  // 按版本组聚合：每组取 version 最高者作为卡片展示
  const cards = useMemo(() => {
    const byGroup = {};
    items.forEach(d => {
      const key = d.group_id || `solo-${d.id}`;
      if (!byGroup[key]) byGroup[key] = [];
      byGroup[key].push(d);
    });
    return Object.values(byGroup).map(grp => {
      const sorted = [...grp].sort((a, b) => b.version - a.version);
      const latest = sorted[0];
      return { ...latest, _versions: sorted, _versionCount: grp.length };
    }).sort((a, b) => a.id - b.id);
  }, [items]);

  const filtered = filter === '全部' ? cards : cards.filter(d => d.category === filter);

  // 防抖自动保存：标题/备注输入停顿约 400ms 自动提交
  const timersRef = useRef({});
  const scheduleCommit = (id, field, value) => {
    const key = `${id}-${field}`;
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(async () => {
      try { await updateDrawing(id, { [field]: value }); }
      catch (e) { alert('保存失败: ' + e.message); }
    }, 400);
  };

  const setField = (id, field, value) => {
    setItems(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  // ── 文件收集（选择/拖拽/粘贴共用入口）──
  const collectFiles = (files) => {
    const arr = Array.from(files || []).filter(f => f && f.size !== undefined);
    if (arr.length === 0) return;
    setUpFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}-${f.size}`));
      const merged = [...prev];
      for (const f of arr) {
        const key = `${f.name}-${f.size}`;
        if (!seen.has(key)) { seen.add(key); merged.push(f); }
      }
      return merged;
    });
    setShowUpload(true);
  };

  const handleRootDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    collectFiles(e.dataTransfer?.files);
  };

  // 全局粘贴：图纸资料 tab 激活时生效
  useEffect(() => {
    const onPaste = (e) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        collectFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // ── 批量上传：对每个文件 上传→建记录，处理去重/版本冲突 ──
  const handleUpload = async () => {
    if (upFiles.length === 0) { alert('请选择要上传的文件'); return; }
    setBusy(true);
    try {
      const skipped = [];
      const versioned = [];
      for (const file of upFiles) {
        const { url, hash } = await uploadDesignFile(file);
        const payload = {
          task_id: taskId,
          category: upCategory,
          title: file.name.replace(/\.[^.]+$/, ''),
          filename: file.name,
          url,
          hash,
        };
        let res = await createDrawing(payload);
        if (res.conflict === 'duplicate') {
          const ex = res.existing;
          const goForce = window.confirm(
            `「${file.name}」与已有资料内容完全相同（${ex.kind === 'reference' ? '参考资料' : '工作成果'}·${ex.category}·${ex.title} V${ex.version}）。\n\n点击「确定」= 仍新建独立资料（保留重复）；\n点击「取消」= 跳过该文件不重复上传。`
          );
          if (goForce) {
            res = await createDrawing({ ...payload, force: true });
            if (res.conflict) skipped.push(file.name);
          } else {
            skipped.push(file.name);
          }
        }
        if (res.id && res.isNewVersion) {
          versioned.push(`${file.name} → V${res.version}`);
        }
      }
      await load();
      setShowUpload(false);
      setUpFiles([]);
      setUpCategory('设计稿');
      // 汇总提示
      const msgs = [];
      if (versioned.length) msgs.push(`已作为新版本归档：${versioned.join('；')}`);
      if (skipped.length) msgs.push(`已跳过重复文件：${skipped.join('；')}`);
      if (msgs.length) alert(msgs.join('\n'));
    } catch (e) { alert('上传失败: ' + e.message); }
    finally { setBusy(false); }
  };

  // ── 删除：多版本组整组删除（二次确认），单版直接删 ──
  const handleDelete = (card) => setConfirmCard(card);

  const doDeleteCard = async () => {
    if (!confirmCard) return;
    const card = confirmCard;
    setConfirmCard(null);
    try {
      if (card._versionCount > 1) {
        await deleteDrawingGroup(card.group_id);
      } else {
        await deleteDrawing(card.id);
      }
      await load();
    } catch (e) { alert('删除失败: ' + e.message); }
  };

  // ── 版本历史弹窗 ──
  const openGroup = async (card) => {
    setGroupLoading(true);
    setGroupModal({ groupId: card.group_id, versions: card._versions });
    try {
      const v = await fetchDrawingGroup(card.group_id);
      setGroupModal({ groupId: card.group_id, versions: v });
    } catch (e) { alert('加载版本历史失败: ' + e.message); }
    finally { setGroupLoading(false); }
  };

  const handleDeleteVersion = (id) => setConfirmVerId(id);

  const doDeleteVersion = async () => {
    if (confirmVerId == null) return;
    const id = confirmVerId;
    setConfirmVerId(null);
    try { await deleteDrawing(id); setGroupModal(null); await load(); }
    catch (e) { alert('删除失败: ' + e.message); }
  };

  // 切换分类：本地即时更新 + 立即持久化
  const handleCategoryChange = (d, value) => {
    setField(d.id, 'category', value);
    updateDrawing(d.id, { category: value }).catch(e => alert('分类保存失败: ' + e.message));
  };

  return (
    <div
      className="glass drawing-root"
      style={{
        gridColumn: '1/-1', padding: 24,
        outline: dragOver ? '2px dashed rgba(167,139,250,0.7)' : 'none',
        outlineOffset: -6, transition: 'outline 0.15s',
      }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (!dragOver) setDragOver(true); }}
      onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={e => { e.preventDefault(); e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
      onDrop={e => { handleRootDrop(e); setTimeout(() => setDragOver(false), 60); }}
      onDragEnd={() => setDragOver(false)}
    >
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(22,23,25,0.7)', borderRadius: 20, zIndex: 5, pointerEvents: 'none' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-violet-300)', background: 'var(--overlay-strong)', padding: '18px 34px', borderRadius: 12, border: '1px dashed rgba(167,139,250,0.6)' }}>
            松开鼠标上传（支持任意格式，可多选）
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="section-title" style={{ borderLeftColor: 'var(--color-info)', marginBottom: 8 }}>
            <div>图纸资料</div>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>集中管理设计稿 / 参考图 / 成衣图 / 纸样 / 唛架图等资料 · 共 {cards.length} 份</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {['全部', ...DRAWING_CATEGORIES].map(c => (
              <button
                key={c}
                className="btn--icon btn--xs"
                onClick={() => setFilter(c)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: filter === c ? '1px solid rgba(167,139,250,0.6)' : '1px solid var(--border-strong)',
                  background: filter === c ? 'rgba(167,139,250,0.18)' : 'var(--bg-hover)',
                  color: filter === c ? 'var(--color-violet-300)' : 'var(--text-2)', fontWeight: 600,
                }}
              >
                {c}
              </button>
            ))}
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
              <ClipboardPaste size={12} /> 拖拽 / Ctrl+V 粘贴 / 任意格式
            </span>
          </div>
        </div>
        <button className="btn--primary btn--sm" onClick={() => { setUpFiles([]); setShowUpload(true); }}>
          <Plus size={14} /> 上传资料
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>加载中…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          {cards.length === 0
            ? '暂无图纸资料：点击「上传资料」、拖拽文件到本区域，或 Ctrl+V 粘贴（图片/PDF/专业软件文件均可）'
            : `「${filter}」分类暂无资料`}
        </div>
      ) : (
        <div className="drawing-grid">
          {filtered.map(d => (
            <div key={d.group_id || d.id} className="drawing-card">
              <div className="drawing-thumb">
                <PdfThumb pdfUrl={d.url} objectFit="contain" />
                <div className="drawing-badges">
                  <SmartSelect
                    className="drawing-cat-sel"
                    title="点击修改分类"
                    allowCustom={false}
                    value={d.category || '设计稿'}
                    onChange={v => handleCategoryChange(d, v)}
                    options={DRAWING_CATEGORIES}
                    style={{
                      '--cat-color': CATEGORY_COLORS[d.category] || 'var(--accent)',
                    }}
                  />
                  {!isReference(d.category) && d._versionCount > 0 && (
                    <button
                      className="drawing-ver-badge"
                      title="查看版本历史"
                      onClick={() => openGroup(d)}
                      style={{ background: `${CATEGORY_COLORS[d.category] || '#a78bfa'}22`, color: CATEGORY_COLORS[d.category] || '#a78bfa', borderColor: `${CATEGORY_COLORS[d.category] || '#a78bfa'}44` }}
                    >
                      <History size={11} /> V{d.version}{d._versionCount > 1 ? ` · ${d._versionCount}版` : ''}
                    </button>
                  )}
                </div>
                <div className="drawing-corner">
                  {(() => {
                    const ext = fileExtOf(d.url, d.filename);
                    const tc = typeColor(ext);
                    return (
                      <span
                        className="drawing-type-badge"
                        title={`文件类型：${ext.toUpperCase()}`}
                        style={{ background: `${tc}26`, color: tc, borderColor: `${tc}55` }}
                      >
                        {ext.toUpperCase()}
                      </span>
                    );
                  })()}
                  <button
                    className="btn--icon btn--circle btn--danger-dark"
                    title={d._versionCount > 1 ? `删除整组（${d._versionCount} 个版本）` : '删除'}
                    onClick={() => handleDelete(d)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="drawing-meta">
                <input
                  style={inputStyle}
                  value={d.title || ''}
                  placeholder="资料名称"
                  onChange={e => { setField(d.id, 'title', e.target.value); scheduleCommit(d.id, 'title', e.target.value); }}
                />
                <input
                  style={inputStyle}
                  value={d.note || ''}
                  placeholder="备注（可选）"
                  onChange={e => { setField(d.id, 'note', e.target.value); scheduleCommit(d.id, 'note', e.target.value); }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 上传弹窗 */}
      {showUpload && createPortal(
        <div className="overlay overlay-show" onClick={() => { if (!busy) setShowUpload(false); }} style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh' }}>
          <div
            className="glass"
            onClick={e => e.stopPropagation()}
            style={{ width: 480, maxWidth: '100%', padding: 28, maxHeight: '85vh', overflow: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>上传图纸资料</div>
              <button className="btn--icon" onClick={() => setShowUpload(false)} disabled={busy}><X size={18} /></button>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label>资料分类 {isReference(upCategory) ? '（参考资料 · 防冗余）' : '（工作成果 · 可追溯版本）'}</label>
              <SmartSelect value={upCategory} onChange={setUpCategory} options={DRAWING_CATEGORIES} allowCustom={false} placeholder="选择分类" />
            </div>

            <div
              className="drawing-dropzone"
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); collectFiles(e.dataTransfer?.files); }}
              style={{ borderColor: upFiles.length ? 'rgba(167,139,250,0.4)' : 'var(--border-strong)' }}
            >
              <Upload size={26} color="var(--color-info)" />
              <div className="dz-title">点击选择 / 拖拽文件到此处 / Ctrl+V 粘贴</div>
              <div className="dz-sub">支持任意格式：图片、PDF、dxf、pla、prj、Zprj、zpac 等（可多选）</div>
              <label className="dz-btn">
                选择文件
                <input
                  type="file"
                  multiple
                  onChange={e => { collectFiles(e.target.files); e.target.value = ''; }}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {upFiles.length > 0 && (
              <div className="drawing-uplist">
                {upFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="drawing-uplist-row">
                    <FileText size={14} color="var(--color-info)" />
                    <span className="uplist-name" title={f.name}>{f.name}</span>
                    <span className="uplist-size">{fmtSize(f.size)}</span>
                    <button
                      className="btn--icon btn--ghost-danger"
                      title="移除"
                      onClick={() => setUpFiles(prev => prev.filter((_, x) => x !== i))}
                      disabled={busy}
                      style={{ padding: 2 }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button className="btn--ghost" onClick={() => setShowUpload(false)} disabled={busy} style={{ padding: '8px 18px', fontSize: 13 }}>取消</button>
              <button className="btn--primary" onClick={handleUpload} disabled={busy || upFiles.length === 0} style={{ padding: '8px 18px', fontSize: 13 }}>
                {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {busy ? `上传中 ${upFiles.length} 个…` : `确认上传（${upFiles.length}）`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 版本历史弹窗 */}
      {groupModal && createPortal(
        <div className="overlay overlay-show" onClick={() => setGroupModal(null)} style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh' }}>
          <div
            className="glass"
            onClick={e => e.stopPropagation()}
            style={{ width: 560, maxWidth: '100%', padding: 28, maxHeight: '82vh', overflow: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <History size={18} color="var(--color-info)" /> 版本历史
              </div>
              <button className="btn--icon" onClick={() => setGroupModal(null)}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
              共 {groupModal.versions.length} 个版本 · 工作成果可追溯，旧版本保留可随时回看
            </div>
            {groupLoading ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>加载中…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {groupModal.versions.map(v => {
                  const latest = v.version === Math.max(...groupModal.versions.map(x => x.version));
                  return (
                    <div key={v.id} className="drawing-ver-row" style={{ borderColor: latest ? 'rgba(167,139,250,0.5)' : 'var(--bg-hover-2)' }}>
                      <div className="ver-thumb">
                        <PdfThumb pdfUrl={v.url} objectFit="contain" />
                      </div>
                      <div className="ver-info">
                        <div className="ver-title">
                          <span className="ver-no">V{v.version}</span>
                          {(() => {
                            const ext = fileExtOf(v.url, v.filename);
                            const tc = typeColor(ext);
                            return (
                              <span className="drawing-type-badge" style={{ background: `${tc}26`, color: tc, borderColor: `${tc}55` }}>
                                {ext.toUpperCase()}
                              </span>
                            );
                          })()}
                          {latest && <span className="ver-current">当前</span>}
                          <span className="ver-name" title={v.filename}>{v.title || v.filename}</span>
                        </div>
                        <div className="ver-sub">
                          {v.filename} · {v.created_at ? String(v.created_at).replace('T', ' ').slice(0, 16) : ''}
                          {v.note ? ` · ${v.note}` : ''}
                        </div>
                      </div>
                      <div className="ver-actions">
                        <button className="btn--icon-danger" title="删除该版本" onClick={() => handleDeleteVersion(v.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* REQ-006② 删除确认 */}
      {confirmCard && (
        <ConfirmModal
          title="删除图纸资料"
          message={confirmCard._versionCount > 1
            ? `该资料有 ${confirmCard._versionCount} 个版本（V1~V${confirmCard._versionCount}）。\n确认删除整组全部版本？删除后不可恢复。`
            : `确认删除「${confirmCard.title || confirmCard.filename || '该资料'}」？删除后不可恢复。`}
          onConfirm={doDeleteCard}
          onCancel={() => setConfirmCard(null)}
        />
      )}
      {confirmVerId != null && (
        <ConfirmModal
          title="删除版本记录"
          message="确认删除该版本记录？\n删除后不可恢复。"
          onConfirm={doDeleteVersion}
          onCancel={() => setConfirmVerId(null)}
        />
      )}
    </div>
  );
};

export default DrawingLibrary;
