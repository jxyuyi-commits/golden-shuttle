// 文件(File) 业务服务层：设计稿存储与本地打开
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { getUploadsDir } = require('../db.cjs');

// 上传扩展名白名单（大小写不敏感）。已包含需求指定集合，
// 并补充本行业（服装打版/设计）常见专业格式，避免误伤用户既有上传能力：
//   .tif/.tiff（扫描件） .svg（矢量） .psd（Photoshop 设计稿）
//   .ai/.eps（Illustrator 矢量稿件） .cdr（CorelDRAW，打版/印花稿常用）
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp',
  '.dxf', '.emf', '.pla', '.prj', '.zprj', '.zpac',
  '.tif', '.tiff', '.svg', '.psd', '.ai', '.eps', '.cdr',
]);

// 单文件大小上限：50MB（按 base64 解码后的字节数判定）
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// 禁止用本地程序打开的危险扩展名（纵深防御）：即使 uploads 中已存在历史遗留的可执行/脚本文件，
// 也一律拒绝本机打开，彻底切断「上传即执行」链。普通文档/图纸格式不受影响。
const BLOCKED_OPEN_EXTENSIONS = new Set([
  '.exe', '.com', '.scr', '.pif', '.bat', '.cmd', '.msi', '.msp', '.cpl', '.hta',
  '.jar', '.js', '.jse', '.vbs', '.vbe', '.wsf', '.wsh', '.ps1', '.ps1xml', '.psm1', '.psd1',
  '.lnk', '.url', '.reg', '.dll', '.sys', '.ocx', '.sh', '.bash', '.run', '.app', '.apk', '.gadget', '.inf', '.scf',
]);

/**
 * 构造带 HTTP 状态码的业务错误（供路由层映射为 4xx）
 * @param {string} message - 中文错误信息
 * @param {number} statusCode - HTTP 状态码（默认 400）
 * @returns {Error}
 */
function badRequest(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * 上传前校验：扩展名白名单 + 单文件大小上限（不落盘）
 * @param {string} filename - 原始文件名
 * @param {string} data - base64 编码内容
 * @returns {number} 解码后的字节数
 */
function assertUploadAllowed(filename, data) {
  const name = typeof filename === 'string' ? filename : '';
  const ext = path.extname(name).toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    throw badRequest(`不支持的文件类型：${ext || '（无扩展名）'}。允许的格式：${[...ALLOWED_EXTENSIONS].join(' ')}`);
  }
  if (typeof data !== 'string' || data.length === 0) {
    throw badRequest('缺少文件内容（data）');
  }
  const byteLength = Buffer.byteLength(data, 'base64');
  if (byteLength > MAX_UPLOAD_BYTES) {
    const mb = (byteLength / 1024 / 1024).toFixed(1);
    throw badRequest(`文件过大：${mb}MB，单文件上限 50MB`);
  }
  return byteLength;
}

/** 生成安全文件名（保留扩展名，剔除非法字符） */
function safeFileName(filename) {
  return `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
}

/**
 * 保存 base64 上传文件到 uploads 目录
 * @param {string} filename - 原始文件名
 * @param {string} data - base64 编码内容
 * @returns {{url: string, hash: string, size: number}} url 访问地址 + SHA-256 指纹 + 字节数
 */
function save(filename, data) {
  if (!filename || !data) throw badRequest('缺少文件名或文件内容');
  assertUploadAllowed(filename, data);
  const safeName = safeFileName(filename);
  const filePath = path.join(getUploadsDir(), safeName);
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(filePath, buffer);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  return { url: `/uploads/${safeName}`, hash, size: buffer.length };
}

/**
 * 解析上传 URL 为磁盘绝对路径（路径硬化，防目录穿越）
 *
 * ⚠️ 入参两种形态都必须接受，勿收紧为「仅 /uploads/<单段名>」：
 *   1) 相对形态 `/uploads/x.pdf`（DB 中 pdf_url 的存量形态）
 *   2) 绝对形态 `http://127.0.0.1:<port>/uploads/x.pdf`
 *      （前端 PdfThumb 派生 fullUrl 后直接调 /api/open-pdf，见 PdfThumb.jsx:31,63）
 * 安全边界不依赖「路径段数」，而是靠：拒绝 `\` 与 `..` → 只取 basename → 断言解析结果
 * 仍落在 uploadsDir 内（下方 startsWith 校验）。多段输入会被静默压平到 uploadsDir 根下，
 * 不构成越权（能引用的仍只有 uploads 内已存在的文件）。
 *
 * @param {string} url - 上传地址（相对或绝对形态均可）
 * @returns {string|null} 绝对路径，文件不存在返回 null；非法路径抛错
 */
function resolvePath(url) {
  if (!url || typeof url !== 'string') return null;
  // 硬化：拒绝反斜杠与 .. 穿越（Windows 下 url.split('/').pop() 无法拦截 "..\\"），
  // 只接受 basename，解析后断言仍位于 uploads 目录内（不做简单字符串 replace）
  if (url.includes('\\') || url.includes('..')) {
    throw badRequest('非法文件路径', 400);
  }
  const filename = path.basename(url.split('/').pop() || '');
  if (!filename || filename === '.' || filename === '..') {
    throw badRequest('非法文件路径', 400);
  }
  const uploadsDir = path.resolve(getUploadsDir());
  const absolutePath = path.resolve(uploadsDir, filename);
  // 断言解析结果确实落在 uploads 目录内（单一真实来源，防穿越）
  if (!absolutePath.startsWith(uploadsDir + path.sep)) {
    throw badRequest('非法文件路径', 400);
  }
  return fs.existsSync(absolutePath) ? absolutePath : null;
}

/**
 * 用本地默认程序打开文件
 * @param {string} url - 如 /uploads/xxx.pdf
 * @returns {{success: boolean}}
 */
function openLocally(url) {
  const absolutePath = resolvePath(url);
  if (!absolutePath) throw new Error('File not found on disk');
  // 纵深防御：历史遗留的可执行/脚本文件也不允许本机打开（G2 载荷①：uploads 下的 .exe 必须拒绝）
  if (BLOCKED_OPEN_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
    throw badRequest('安全策略：不允许用本地程序打开该类型文件');
  }
  // 优先使用 Electron shell.openPath（无 shell 注入面）；非 Electron 环境回退 execFile + 数组参数，
  // 彻底消除 exec(`start "" "${path}"`) 的引号/&/| 字符串拼接注入面。
  let electronShell = null;
  try {
    // Electron 主进程可用；ELECTRON_RUN_AS_NODE 或纯 Node 下为 undefined/抛错，回退 execFile
    electronShell = require('electron').shell;
  } catch {
    electronShell = null;
  }
  if (electronShell && typeof electronShell.openPath === 'function') {
    electronShell.openPath(absolutePath)
      .then((errMsg) => { if (errMsg) console.error('[Open Native Error]', errMsg); })
      .catch((err) => console.error('[Open Native Error]', err));
    return { success: true };
  }
  // 非 Electron 环境（如纯 Node 单跑后端）回退：使用 rundll32 的 FileProtocolHandler
  // 调起系统默认程序。刻意 NOT 使用 `cmd.exe /c start "" <path>`——Node 在 Windows 下
  // 的参数转义不处理 `&`/`^`/`|` 等 cmd 元字符，路径一旦落到 cmd 命令行就仍存在二次解析面
  // （本目录下文件名虽由 safeFileName 生成、不含此类字符，但不把安全性建立在调用方约束上）。
  // execFile + 数组参数经 CreateProcess 直接传递 argv，不经过任何 shell。
  execFile('rundll32.exe', ['url.dll,FileProtocolHandler', absolutePath], (err) => {
    if (err) console.error('[Open Native Error]', err);
  });
  return { success: true };
}

module.exports = { save, resolvePath, openLocally };
