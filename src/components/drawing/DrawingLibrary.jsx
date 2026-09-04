// 图纸资料库：集中管理款式的设计稿/参考图/成衣图/纸样/唛架图等资料
// 支持：点击选择 / 拖拽 / 复制粘贴 上传，不限文件格式（图片/PDF/专业软件文件 dxf/pla/prj 等）
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Loader2, X, Upload, FileText, ClipboardPaste } from 'lucide-react';
import PdfThumb from '../common/PdfThumb';
import {
  fetchDrawings, createDrawing, updateDrawing, deleteDrawing, uploadDesignFile
} from '../../api';

export const DRAWING_CATEGORIES = ['设计稿', '参考图', '成衣图', '纸样', '唛架图'];

// 各分类徽章配色
const CATEGORY_COLORS = {
  '设计稿': '#38bdf8',
  '参考图': '#f472b6',
  '成衣图': '#fb923c',
  '纸样': '#a78bfa',
  '唛架图': '#34d399',
};

const inputStyle = {
  background: 'rgba(2,6,23,0.45)',
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '7px 10px', borderRadius: 6, color: '#e2e8f0',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box'
};

/** 格式化文件大小 */
function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 图纸资料库：卡片网格 + 分类筛选 + 上传弹窗（拖拽/粘贴/多选），挂靠在打样单下 */
const DrawingLibrary = ({ taskId }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('全部');
  const [showUpload, setShowUpload] = useState(false);
  const [upCategory, setUpCategory] = useState('设计稿');
  const [upFiles, setUpFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchDrawings(taskId)); }
    catch (e) { alert('加载图纸资料失败: ' + e.message); }
    finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

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
    // 按 name+size 去重
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

  // 图纸区域拖拽
  const handleRootDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    collectFiles(e.dataTransfer?.files);
  };

  // 全局粘贴：图纸资料 tab 激活时，粘贴文件（文件管理器复制 / 截图）→ 预填上传弹窗
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

  const handleUpload = async () => {
    if (upFiles.length === 0) { alert('请选择要上传的文件'); return; }
    setBusy(true);
    try {
      for (const file of upFiles) {
        const { url } = await uploadDesignFile(file);
        await createDrawing({
          task_id: taskId,
          category: upCategory,
          title: file.name.replace(/\.[^.]+$/, ''),
          filename: file.name,
          url,
        });
      }
      await load();
      setShowUpload(false);
      setUpFiles([]);
      setUpCategory('设计稿');
    } catch (e) { alert('上传失败: ' + e.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确认删除该图纸资料？')) return;
    try { await deleteDrawing(id); await load(); }
    catch (e) { alert('删除失败: ' + e.message); }
  };

  // 切换分类：本地即时更新 + 立即持久化（PATCH）
  const handleCategoryChange = (d, value) => {
    setField(d.id, 'category', value);
    updateDrawing(d.id, { category: value }).catch(e => alert('分类保存失败: ' + e.message));
  };

  const filtered = filter === '全部' ? items : items.filter(d => d.category === filter);

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
      onDragLeave={e => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={handleRootDrop}
    >
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.7)', borderRadius: 20, zIndex: 5, pointerEvents: 'none' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#c4b5fd', background: 'rgba(2,6,23,0.8)', padding: '18px 34px', borderRadius: 12, border: '1px dashed rgba(167,139,250,0.6)' }}>
            松开鼠标上传（支持任意格式，可多选）
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="section-title" style={{ borderLeftColor: '#a78bfa', marginBottom: 8 }}>
            <div>图纸资料</div>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>集中管理设计稿 / 参考图 / 成衣图 / 纸样 / 唛架图等资料 · 共 {items.length} 份</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {['全部', ...DRAWING_CATEGORIES].map(c => (
              <button
                key={c}
                className="btn-icon-sm"
                onClick={() => setFilter(c)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: filter === c ? '1px solid rgba(167,139,250,0.6)' : '1px solid rgba(255,255,255,0.1)',
                  background: filter === c ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
                  color: filter === c ? '#c4b5fd' : '#94a3b8', fontWeight: 600,
                }}
              >
                {c}
              </button>
            ))}
            <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
              <ClipboardPaste size={12} /> 支持拖拽 / Ctrl+V 粘贴 / 任意格式
            </span>
          </div>
        </div>
        <button className="btn-blue-sm" onClick={() => { setUpFiles([]); setShowUpload(true); }}>
          <Plus size={14} /> 上传资料
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>加载中…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          {items.length === 0
            ? '暂无图纸资料：点击「上传资料」、拖拽文件到本区域，或 Ctrl+V 粘贴（图片/PDF/专业软件文件均可）'
            : `「${filter}」分类暂无资料`}
        </div>
      ) : (
        <div className="drawing-grid">
          {filtered.map(d => (
            <div key={d.id} className="drawing-card">
              <div className="drawing-thumb">
                <PdfThumb pdfUrl={d.url} />
                <select
                  className="drawing-cat-sel"
                  value={d.category || '设计稿'}
                  title="点击修改分类"
                  onChange={e => handleCategoryChange(d, e.target.value)}
                  style={{
                    background: `${CATEGORY_COLORS[d.category] || '#38bdf8'}22`,
                    color: CATEGORY_COLORS[d.category] || '#38bdf8',
                    borderColor: `${CATEGORY_COLORS[d.category] || '#38bdf8'}44`,
                  }}
                >
                  {DRAWING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  className="drawing-del"
                  title="删除"
                  onClick={() => handleDelete(d.id)}
                >
                  <Trash2 size={14} />
                </button>
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

      {showUpload && createPortal(
        <div className="overlay" onClick={() => { if (!busy) setShowUpload(false); }} style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh' }}>
          <div
            className="glass"
            onClick={e => e.stopPropagation()}
            style={{ width: 480, maxWidth: '100%', padding: 28, maxHeight: '85vh', overflow: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>上传图纸资料</div>
              <button className="btn-icon" onClick={() => setShowUpload(false)} disabled={busy}><X size={18} /></button>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label>资料分类</label>
              <select value={upCategory} onChange={e => setUpCategory(e.target.value)}>
                {DRAWING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* 拖拽放置区：点击选择 / 拖入 / 粘贴 */}
            <div
              className="drawing-dropzone"
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); collectFiles(e.dataTransfer?.files); }}
              style={{ borderColor: upFiles.length ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.15)' }}
            >
              <Upload size={26} color="#a78bfa" />
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

            {/* 待上传文件列表 */}
            {upFiles.length > 0 && (
              <div className="drawing-uplist">
                {upFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="drawing-uplist-row">
                    <FileText size={14} color="#a78bfa" />
                    <span className="uplist-name" title={f.name}>{f.name}</span>
                    <span className="uplist-size">{fmtSize(f.size)}</span>
                    <button
                      className="btn-icon"
                      title="移除"
                      onClick={() => setUpFiles(prev => prev.filter((_, x) => x !== i))}
                      disabled={busy}
                      style={{ color: '#ef4444', padding: 2 }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button className="btn-ghost" onClick={() => setShowUpload(false)} disabled={busy} style={{ padding: '8px 18px', fontSize: 13 }}>取消</button>
              <button className="btn-blue" onClick={handleUpload} disabled={busy || upFiles.length === 0} style={{ padding: '8px 18px', fontSize: 13 }}>
                {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {busy ? `上传中 ${upFiles.length} 个…` : `确认上传（${upFiles.length}）`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DrawingLibrary;
