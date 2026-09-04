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
const PdfThumb = ({ pdfUrl, objectFit = 'cover' }) => {
  const [thumb, setThumb] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const clickTimeout = useRef(null);

  const fullUrl = pdfUrl ? (pdfUrl.startsWith('http') ? pdfUrl : `${API}${pdfUrl}`) : '';
  const ext = getExt(fullUrl);
  const isImage = !!fullUrl && (isImageFile(fullUrl) || IMAGE_EXTS.includes(ext));
  const isPdf = !!fullUrl && ext === 'pdf';
  const isGeneric = !!fullUrl && !isImage && !isPdf;

  useEffect(() => {
    if (!pdfUrl || isImage || isGeneric) return; // 图片直显，专业格式用占位
    setLoading(true);
    renderPdfThumb(fullUrl)
      .then(setThumb)
      .catch(() => setThumb(null))
      .finally(() => setLoading(false));
  }, [pdfUrl, isImage, isGeneric]);

  const openNative = () => openFileLocally(fullUrl).catch(console.error);

  const handleInteract = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pdfUrl) return;
    // 非图片/PDF 的专业文件：单击直接用系统默认软件打开
    if (isGeneric) { openNative(); return; }
    if (enlarged) return;

    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      openNative();
    } else {
      clickTimeout.current = setTimeout(() => {
        clickTimeout.current = null;
        if (thumb) setEnlarged(true);
      }, 300);
    }
  };

  const interactiveProps = pdfUrl ? {
    onClick: handleInteract,
    title: isGeneric
      ? `单击用本地软件打开 .${ext} 文件`
      : '单击放大预览，双击用本地程序(如 Acrobat)编辑',
  } : {};

  const previewSrc = isImage ? fullUrl : thumb;

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
          <div className="pdf-empty"><Upload size={32} /><span>请上传设计稿</span></div>
        )
      ) : isGeneric ? (
        <div className="generic-file" style={{ width: '100%', height: '100%', cursor: 'pointer', userSelect: 'none' }} {...interactiveProps}>
          <FileText size={34} color="#a78bfa" />
          <div className="generic-ext">{ext.toUpperCase()}</div>
          <div className="generic-hint"><FolderOpen size={13} /> 单击本地打开</div>
        </div>
      ) : (
        <div className="pdf-empty"><Upload size={32} /><span>请上传设计稿</span></div>
      )}

      {enlarged && createPortal(
        <div
          className="overlay"
          onClick={(e) => { e.stopPropagation(); setEnlarged(false); }}
          style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh' }}
        >
          <div style={{ position: 'relative', display: 'flex', maxWidth: '100%', maxHeight: '100%' }} onClick={e => e.stopPropagation()}>
            <img
              src={previewSrc}
              style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
              alt="大图预览"
            />
            <button
              className="btn-icon"
              style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '50%', padding: '8px', transform: 'translate(50%, -50%)', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); setEnlarged(false); }}
            >
              <X size={24} />
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default PdfThumb;
