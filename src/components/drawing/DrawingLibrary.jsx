// 图纸资料库：集中管理款式的技术图纸、纸样、放码图等资料
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Loader2, X, Upload } from 'lucide-react';
import PdfThumb from '../common/PdfThumb';
import {
  fetchDrawings, createDrawing, updateDrawing, deleteDrawing, uploadDesignFile
} from '../../api';

export const DRAWING_CATEGORIES = ['设计稿', '技术图纸', '纸样', '放码图'];

// 各分类徽章配色
const CATEGORY_COLORS = {
  '设计稿': '#38bdf8',
  '技术图纸': '#a78bfa',
  '纸样': '#fbbf24',
  '放码图': '#34d399',
};

const inputStyle = {
  background: 'rgba(2,6,23,0.45)',
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '7px 10px', borderRadius: 6, color: '#e2e8f0',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box'
};

/** 图纸资料库：卡片网格 + 分类筛选 + 上传弹窗，挂靠在打样单下 */
const DrawingLibrary = ({ taskId }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('全部');
  const [showUpload, setShowUpload] = useState(false);
  const [upCategory, setUpCategory] = useState('设计稿');
  const [upFile, setUpFile] = useState(null);

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

  const handleUpload = async () => {
    if (!upFile) { alert('请选择要上传的文件'); return; }
    setBusy(true);
    try {
      const { url } = await uploadDesignFile(upFile);
      await createDrawing({
        task_id: taskId,
        category: upCategory,
        title: upFile.name.replace(/\.[^.]+$/, ''),
        filename: upFile.name,
        url,
      });
      await load();
      setShowUpload(false);
      setUpFile(null);
      setUpCategory('设计稿');
    } catch (e) { alert('上传失败: ' + e.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确认删除该图纸资料？')) return;
    try { await deleteDrawing(id); await load(); }
    catch (e) { alert('删除失败: ' + e.message); }
  };

  const filtered = filter === '全部' ? items : items.filter(d => d.category === filter);

  return (
    <div className="glass" style={{ gridColumn: '1/-1', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="section-title" style={{ borderLeftColor: '#a78bfa', marginBottom: 8 }}>
            <div>图纸资料</div>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>集中管理技术图纸 / 纸样 / 放码图等资料 · 共 {items.length} 份</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          </div>
        </div>
        <button className="btn-blue-sm" onClick={() => setShowUpload(true)}>
          <Plus size={14} /> 上传资料
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>加载中…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          {items.length === 0
            ? '暂无图纸资料，点击右上角「上传资料」添加设计稿 / 技术图纸 / 纸样 / 放码图'
            : `「${filter}」分类暂无资料`}
        </div>
      ) : (
        <div className="drawing-grid">
          {filtered.map(d => (
            <div key={d.id} className="drawing-card">
              <div className="drawing-thumb">
                <PdfThumb pdfUrl={d.url} />
                <span className="drawing-badge" style={{ background: `${CATEGORY_COLORS[d.category] || '#38bdf8'}22`, color: CATEGORY_COLORS[d.category] || '#38bdf8', borderColor: `${CATEGORY_COLORS[d.category] || '#38bdf8'}44` }}>
                  {d.category || '设计稿'}
                </span>
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
        <div className="overlay" onClick={() => setShowUpload(false)} style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh' }}>
          <div className="glass" onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>上传图纸资料</div>
              <button className="btn-icon" onClick={() => setShowUpload(false)}><X size={18} /></button>
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>资料分类</label>
              <select value={upCategory} onChange={e => setUpCategory(e.target.value)}>
                {DRAWING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>选择文件（图片 / PDF）</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={e => setUpFile(e.target.files[0])}
                style={{ background: 'rgba(2,6,23,0.45)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 8, padding: 10, color: '#94a3b8', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            {upFile && (
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16, wordBreak: 'break-all' }}>
                {upFile.name}（{(upFile.size / 1024).toFixed(0)} KB）
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-ghost" onClick={() => setShowUpload(false)} style={{ padding: '8px 18px', fontSize: 13 }}>取消</button>
              <button className="btn-blue" onClick={handleUpload} disabled={busy} style={{ padding: '8px 18px', fontSize: 13 }}>
                {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 确认上传
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
