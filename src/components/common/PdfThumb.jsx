import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileText, FolderOpen } from 'lucide-react';
import { API } from '../../api/client';
import { openFileLocally } from '../../api';
import { renderPdfThumb, isImageFile } from '../../utils/pdf';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tif', 'tiff'];

/** 从 URL/文件名提取小写扩展名 */
function getExt(url) {
  if (!url) return '';
  const clean = url.split('?')[0].split('/').pop();
  return clean.includes('.') ? clean.split('.').pop().toLowerCase() : '';
}

/**
 * 图纸/设计稿缩略图：
 * - 图片：直接显示
 * - PDF：pdf.js 渲染首页，单击放大、双击本地打开
 * - 其他专业格式（dxf/pla/prj 等）：通用文件占位（图标+扩展名），单击用系统默认软件打开
 */
const PdfThumb = ({ pdfUrl, objectFit = 'cover', enlargeActionItems, interactive = true }) => {
  const [thumb, setThumb] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [svgText, setSvgText] = useState('');
  const clickTimeout = useRef(null);

  const fullUrl = pdfUrl ? (pdfUrl.startsWith('http') ? pdfUrl : `${API}${pdfUrl}`) : '';
  const ext = getExt(fullUrl);
  const isImage = !!fullUrl && (isImageFile(fullUrl) || IMAGE_EXTS.includes(ext));
  const isPdf = !!fullUrl && ext === 'pdf';
  const isVectorThumb = !!fullUrl && (ext === 'emf' || ext === 'dxf'); // 后端生成真实缩略图
  const isGeneric = !!fullUrl && !isImage && !isPdf && !isVectorThumb;
  const thumbUrl = isVectorThumb ? `${API}/api/drawing-thumb?url=${encodeURIComponent(fullUrl)}` : '';

  useEffect(() => {
    if (!pdfUrl || isImage || isGeneric || isVectorThumb) return; // 图片直显，矢量/专业格式走缩略图或占位
    setLoading(true);
    renderPdfThumb(fullUrl)
      .then(setThumb)
      .catch(() => setThumb(null))
      .finally(() => setLoading(false));
  }, [pdfUrl, isImage, isGeneric, isVectorThumb]);

  // DXF 缩略图为 SVG：拉取文本用于内联渲染（img 对 SVG 在 flex 中固有尺寸异常）
  useEffect(() => {
    if (!isVectorThumb || ext !== 'dxf' || !thumbUrl) { setSvgText(''); return; }
    let alive = true;
    fetch(thumbUrl)
      .then(r => (r.ok ? r.text() : ''))
      .then(t => { if (alive && t.startsWith('<svg')) setSvgText(t); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isVectorThumb, ext, thumbUrl]);

  const openNative = () => openFileLocally(fullUrl).catch(console.error);

  const previewSrc = isImage ? fullUrl : isVectorThumb ? thumbUrl : thumb;

  const handleInteract = (e) => {
    if (!interactive) return; // 弹窗/选择场景：不拦截点击，冒泡给卡片选择
    e.preventDefault();
    e.stopPropagation();
    if (!pdfUrl) return;
    if (enlarged) return;

    if (clickTimeout.current) {
      // 300ms 内第二次单击 = 双击 → 本地软件打开（所有格式统一）
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      openNative();
    } else {
      clickTimeout.current = setTimeout(() => {
        clickTimeout.current = null;
        setEnlarged(true); // 单击 → 放大预览（无预览格式显示占位）
      }, 300);
    }
  };

  const interactiveProps = pdfUrl ? {
    onClick: handleInteract,
    title: '单击放大预览，双击用本地软件打开',
  } : {};

  return (
    <>
      {isImage ? (
        <img src={fullUrl} alt="图纸预览（单击放大，双击编辑）" style={{ width: '100%', height: '100%', objectFit: objectFit, borderRadius: 8, cursor: pdfUrl ? 'pointer' : 'default' }} {...interactiveProps} />
      ) : isPdf ? (
        loading ? (
          <div className="pdf-loading">渲染中…</div>
        ) : thumb ? (
          <img src={thumb} alt="PDF 预览（单击放大，双击编辑）" style={{ width: '100%', height: '100%', objectFit: objectFit, borderRadius: 8, cursor: pdfUrl ? 'pointer' : 'default' }} {...interactiveProps} />
        ) : (
          <div className="pdf-empty">
            <Upload size={22} className="pdf-empty-icon" />
            <span className="pdf-empty-text">请上传设计稿</span>
            <span className="pdf-empty-hint">进入详情可上传</span>
          </div>
        )
      ) : isVectorThumb ? (
        thumbFailed ? (
          <div className="generic-file" style={{ width: '100%', height: '100%', cursor: 'pointer', userSelect: 'none' }} {...interactiveProps}>
            <FileText size={34} color="#a78bfa" />
            <div className="generic-ext">{ext.toUpperCase()}</div>
            <div className="generic-hint"><FolderOpen size={13} /> 单击本地打开</div>
          </div>
        ) : (
          <img
            src={thumbUrl}
            alt={`${ext.toUpperCase()} 预览（单击放大，双击本地打开）`}
            onError={() => setThumbFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: objectFit, borderRadius: 8, background: '#fff', cursor: pdfUrl ? 'pointer' : 'default' }}
            {...interactiveProps}
          />
        )
      ) : isGeneric ? (
        <div className="generic-file" style={{ width: '100%', height: '100%', cursor: 'pointer', userSelect: 'none' }} {...interactiveProps}>
          <FileText size={34} color="#a78bfa" />
          <div className="generic-ext">{ext.toUpperCase()}</div>
          <div className="generic-hint"><FolderOpen size={13} /> 单击本地打开</div>
        </div>
      ) : (
        <div className="pdf-empty">
          <Upload size={22} className="pdf-empty-icon" />
          <span className="pdf-empty-text">请上传设计稿</span>
          <span className="pdf-empty-hint">进入详情可上传</span>
        </div>
      )}

      {enlarged && createPortal(
        <div
          className="overlay"
          onClick={(e) => { e.stopPropagation(); setEnlarged(false); }}
          style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh' }}
        >
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', maxWidth: '100%', maxHeight: '100%' }} onClick={e => e.stopPropagation()}>
            {isGeneric ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '48px 56px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                <FileText size={56} color="#a78bfa" />
                <div style={{ fontSize: 22, fontWeight: 800, color: '#c4b5fd' }}>{ext.toUpperCase()}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>该格式无在线预览，双击卡片可调用本地软件打开</div>
              </div>
            ) : ext === 'dxf' && svgText ? (
              <div
                className="drawing-svg-preview"
                onClick={e => e.stopPropagation()}
                dangerouslySetInnerHTML={{ __html: svgText }}
              />
            ) : (
              <img
                src={previewSrc}
                style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
                alt="大图预览"
              />
            )}
            <button
              className="btn-icon"
              style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '50%', padding: '8px', transform: 'translate(50%, -50%)', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); setEnlarged(false); }}
            >
              <X size={24} />
            </button>
            {enlargeActionItems && enlargeActionItems.length > 0 && (
              <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                {enlargeActionItems.map(item => (
                  <button
                    key={item.label}
                    className="pdf-enlarge-btn"
                    onClick={(e) => { e.stopPropagation(); setEnlarged(false); if (item.onClick) item.onClick(); }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default PdfThumb;
