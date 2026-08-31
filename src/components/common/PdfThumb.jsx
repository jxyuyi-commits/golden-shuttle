import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload } from 'lucide-react';
import { API } from '../../api/client';
import { openFileLocally } from '../../api';
import { renderPdfThumb, isImageFile } from '../../utils/pdf';

/** PDF/图片设计稿缩略图：单击放大预览，双击用本地程序打开 */
const PdfThumb = ({ pdfUrl, objectFit = 'cover' }) => {
  const [thumb, setThumb] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const clickTimeout = useRef(null);

  const fullUrl = pdfUrl ? (pdfUrl.startsWith('http') ? pdfUrl : `${API}${pdfUrl}`) : '';
  const isImage = !!fullUrl && isImageFile(fullUrl);

  useEffect(() => {
    if (!pdfUrl || isImage) return; // 图片直接用 src 显示，无需 PDF 渲染
    setLoading(true);
    renderPdfThumb(fullUrl)
      .then(setThumb)
      .catch(() => setThumb(null))
      .finally(() => setLoading(false));
  }, [pdfUrl]);

  const handleInteract = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pdfUrl) return;
    if (enlarged) return;

    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      const fullUrl = pdfUrl.startsWith('http') ? pdfUrl : `${API}${pdfUrl}`;
      openFileLocally(fullUrl).catch(console.error);
    } else {
      clickTimeout.current = setTimeout(() => {
        clickTimeout.current = null;
        if (thumb) setEnlarged(true);
      }, 300);
    }
  };

  const interactiveProps = pdfUrl ? {
    onClick: handleInteract,
    title: '单击放大预览，双击用本地程序(如 Acrobat)编辑',
  } : {};

  const previewSrc = isImage ? fullUrl : thumb;

  return (
    <>
      {isImage ? (
        <img src={fullUrl} alt="设计稿（单击放大，双击编辑）" style={{ width: '100%', height: '100%', objectFit: objectFit, borderRadius: 8, cursor: pdfUrl ? 'pointer' : 'default' }} {...interactiveProps} />
      ) : loading ? (
        <div className="pdf-loading">渲染中…</div>
      ) : thumb ? (
        <img src={thumb} alt="PDF 预览（单击放大，双击编辑）" style={{ width: '100%', height: '100%', objectFit: objectFit, borderRadius: 8, cursor: pdfUrl ? 'pointer' : 'default' }} {...interactiveProps} />
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
