import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileText, FolderOpen } from 'lucide-react';
import { API } from '../../api/client';
import { openFileLocally } from '../../api';
import { renderPdfThumb, isImageFile } from '../../utils/pdf';
import { thumbQueue } from '../../utils/thumbQueue';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tif', 'tiff'];

/** 从 URL/文件名提取小写扩展名 */
function getExt(url) {
  if (!url) return '';
  const clean = url.split('?')[0].split('/').pop();
  return clean.includes('.') ? clean.split('.').pop().toLowerCase() : '';
}

/** XML 文本响应是否为真实 SVG（用于内联渲染） */
const isSvgText = (t) => typeof t === 'string' && t.trimStart().startsWith('<svg');

/**
 * 图纸/设计稿缩略图：
 * - 图片：直接显示（原生 loading="lazy"，进入视口交由浏览器惰性加载）
 * - PDF：pdf.js 渲染首页（U20：**进入视口才渲染**，走并发 ≤2 队列；离开视口保留结果）；
 *        渲染失败/文件缺失优雅降级为文件占位，不刷 console
 * - 其他专业格式（dxf/pla/prj 等）：通用文件占位（图标+扩展名），单击用系统默认软件打开
 *
 * U20 生命周期：
 * 1. 用 IntersectionObserver 观察本组件根节点，**首次进入视口**置 inView 并解绑观察；
 * 2. PDF 渲染经 thumbQueue 入队（并发 ≤2），排队/渲染中显示轻占位；
 * 3. 卸载时解绑观察并 cancel() 队列位置，避免内存泄漏与悬挂 Promise。
 */
const PdfThumb = ({ pdfUrl, objectFit = 'cover', enlargeActionItems, interactive = true }) => {
  const [thumb, setThumb] = useState(null);
  const [enlarged, setEnlarged] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [inView, setInView] = useState(false);
  const [svgText, setSvgText] = useState('');
  const clickTimeout = useRef(null);
  // 根节点引用（供 IntersectionObserver 观察；回调 ref 保证跨分支切换稳定）
  const hostRef = useRef(null);
  const setHost = useCallback((node) => { hostRef.current = node; }, []);
  // 已入队/已处理的 URL（URL 变化时重新渲染；与 thumb 状态解耦，避免闭包陈旧与死循环）
  const handledUrlRef = useRef(null);

  const fullUrl = pdfUrl ? (pdfUrl.startsWith('http') ? pdfUrl : `${API}${pdfUrl}`) : '';
  const ext = getExt(fullUrl);
  const isImage = !!fullUrl && (isImageFile(fullUrl) || IMAGE_EXTS.includes(ext));
  const isPdf = !!fullUrl && ext === 'pdf';
  const isVectorThumb = !!fullUrl && (ext === 'emf' || ext === 'dxf'); // 后端生成真实缩略图
  const isGeneric = !!fullUrl && !isImage && !isPdf && !isVectorThumb;
  const thumbUrl = isVectorThumb ? `${API}/api/drawing-thumb?url=${encodeURIComponent(fullUrl)}` : '';

  // ── U20-1：PDF 缩略图惰性渲染门控 ──
  // 效果仅在 isPdf 时观察；首次可见即解绑（离开视口不再回退占位、不重复解码）。
  // 无 IntersectionObserver 的环境（旧环境/测试）回退为立即渲染。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isPdf) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const el = hostRef.current;
    if (!el) { setInView(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { root: null, rootMargin: '0px', threshold: 0 });
    io.observe(el);
    return () => { io.disconnect(); setInView(false); };
  }, [isPdf]);

  // ── U20-2：进入视口后经队列渲染 PDF 首页 ──
  // handledUrlRef 记录已处理 URL：URL 变化时重新入队；同 URL 不重复。
  // 渲染成功后离开视口不再重排队列（结果保留）。
  useEffect(() => {
    if (!isPdf || !inView) return undefined;
    if (handledUrlRef.current === fullUrl) return undefined;
    handledUrlRef.current = fullUrl;
    const job = thumbQueue.enqueue(() => renderPdfThumb(fullUrl));
    let alive = true;
    job.promise
      .then((data) => { if (!alive) return; if (data) setThumb(data); else setPdfFailed(true); });
    return () => { alive = false; job.cancel(); };
  }, [isPdf, inView, fullUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // DXF 缩略图为 SVG：拉取文本用于内联渲染（img 对 SVG 在 flex 中固有尺寸异常）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isVectorThumb || ext !== 'dxf' || !thumbUrl) { setSvgText(''); return; }
    let alive = true;
    fetch(thumbUrl)
      .then(r => (r.ok ? r.text() : ''))
      .then(t => { if (alive && isSvgText(t)) setSvgText(t); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isVectorThumb, ext, thumbUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
        <img src={fullUrl} loading="lazy" alt="图纸预览（单击放大，双击编辑）" ref={setHost} style={{ width: '100%', height: '100%', objectFit: objectFit, borderRadius: 8, cursor: pdfUrl ? 'pointer' : 'default' }} {...interactiveProps} />
      ) : isPdf ? (
        thumb ? (
          <img src={thumb} loading="lazy" data-thumb-state="ready" alt="PDF 预览（单击放大，双击编辑）" ref={setHost} style={{ width: '100%', height: '100%', objectFit: objectFit, borderRadius: 8, cursor: pdfUrl ? 'pointer' : 'default' }} {...interactiveProps} />
        ) : pdfFailed ? (
          /* 文件缺失/解析失败：优雅降级为文件占位（无点击交互，不刷 console） */
          <div className="pdf-empty" data-thumb-state="failed" title="设计稿文件不可用（服务器缺失或解析失败），可在详情重新上传" ref={setHost}>
            <FileText size={22} className="pdf-empty-icon" />
            <span className="pdf-empty-text">设计稿缺失</span>
            <span className="pdf-empty-hint">文件不可用，可重新上传</span>
          </div>
        ) : !inView ? (
          /* 未进入视口：轻占位（复用既有 .pdf-empty 样式，无额外视觉噪音） */
          <div className="pdf-empty" data-thumb-state="idle" aria-hidden="true" ref={setHost} />
        ) : (
          /* 已进入视口、排队/渲染中 */
          <div className="pdf-loading" data-thumb-state="loading" ref={setHost}>渲染中…</div>
        )
      ) : isVectorThumb ? (
        thumbFailed ? (
          <div className="generic-file" style={{ width: '100%', height: '100%', cursor: 'pointer', userSelect: 'none' }} {...interactiveProps}>
            <FileText size={34} color="var(--color-info)" />
            <div className="generic-ext">{ext.toUpperCase()}</div>
            <div className="generic-hint"><FolderOpen size={13} /> 单击本地打开</div>
          </div>
        ) : (
          <img
            src={thumbUrl}
            loading="lazy"
            alt={`${ext.toUpperCase()} 预览（单击放大，双击本地打开）`}
            onError={() => setThumbFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: objectFit, borderRadius: 8, background: 'var(--bg-elev)', cursor: pdfUrl ? 'pointer' : 'default' }}
            {...interactiveProps}
          />
        )
      ) : isGeneric ? (
        <div className="generic-file" style={{ width: '100%', height: '100%', cursor: 'pointer', userSelect: 'none' }} {...interactiveProps}>
          <FileText size={34} color="var(--color-info)" />
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
          className="overlay overlay-show"
          onClick={(e) => { e.stopPropagation(); setEnlarged(false); }}
          style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh' }}
        >
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', maxWidth: '100%', maxHeight: '100%' }} onClick={e => e.stopPropagation()}>
            {isGeneric ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 14, padding: '48px 56px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                <FileText size={56} color="var(--color-info)" />
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-violet-300)' }}>{ext.toUpperCase()}</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>该格式无在线预览，双击卡片可调用本地软件打开</div>
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
              className="btn--icon"
              style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: 'var(--text)', borderRadius: '50%', padding: '8px', transform: 'translate(50%, -50%)', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); setEnlarged(false); }}
            >
              <X size={24} />
            </button>
            {enlargeActionItems && enlargeActionItems.length > 0 && (
              <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                {enlargeActionItems.map(item => (
                  <button
                    key={item.label}
                    className="btn--ghost btn--pdf-lg"
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
