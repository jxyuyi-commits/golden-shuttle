// PDF.js 懒加载 + 首页缩略图渲染 + 图片类型判断
// 从 App.jsx 提取，保持原有逻辑不变

let pdfjsLib = null;
let pdfjsLoading = null;

/** 加载 PDF.js（本地依赖，懒加载，不阻塞首屏） */
export const loadPdfJs = async () => {
  if (pdfjsLib) return pdfjsLib;
  if (pdfjsLoading) return pdfjsLoading; // 并发保护
  pdfjsLoading = (async () => {
    const mod = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
    mod.GlobalWorkerOptions.workerSrc = workerUrl;
    pdfjsLib = mod;
    return pdfjsLib;
  })();
  return pdfjsLoading;
};

/**
 * 渲染 PDF 首页为 Data URL（PNG，目标宽度 1200px）。
 *
 * 失败（含设计稿文件缺失 404 / 解析异常）一律**静默降级**返回 null，不抛错、不刷 console
 * —— 由调用方（PdfThumb）据此展示占位。U20 收敛既有「MissingPDFException 控制台报错」。
 * @param {string} pdfUrl 绝对 URL
 * @returns {Promise<string|null>} 成功返回 Data URL，失败返回 null
 */
export const renderPdfThumb = async (pdfUrl) => {
  try {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument(pdfUrl).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const scale = 1200 / viewport.width;
    canvas.width = viewport.width * scale;
    canvas.height = viewport.height * scale;
    await page.render({
      canvasContext: context,
      viewport: page.getViewport({ scale }),
    }).promise;
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

/** 判断 URL 是否为图片文件（支持 jpg/png/gif/webp/bmp/svg） */
export const isImageFile = (url) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url);
