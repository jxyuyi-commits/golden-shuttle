/**
 * 安全回归测试：上传白名单 / 大小上限 / 路径穿越 / 本机打开策略（G2+G3 核心验收点）
 *
 * 背景：修复前 `openLocally` 用 `exec(`start "" "${path}"`)` 拼接字符串执行，
 *       且 `resolvePath` 仅 `url.split('/').pop()` 不防 Windows 反斜杠穿越，
 *       构成「上传 → 本机执行」的 RCE 链路。
 *
 * 本脚本用独立临时库/上传目录（不触碰生产数据），验证 4 组断言：
 *   A 路径穿越（含 Windows 反斜杠变体）必须被拒绝
 *   B 可执行/脚本类扩展名不得进入上传白名单
 *   C 单文件 50MB 上限与合法格式放行
 *   D 本机打开：历史遗留危险文件拒绝、路径穿越拒绝、不存在文件明确报错
 *
 * 运行（Electron 运行时，ABI 132）：
 *   ELECTRON_RUN_AS_NODE=1 npx electron scripts/test-upload-security.cjs
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = path.join(os.tmpdir(), `gs-upload-sec-${Date.now()}`);
const UPLOADS = path.join(TMP, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
process.env.DB_PATH = path.join(TMP, 'database.sqlite');
process.env.UPLOADS_DIR = UPLOADS;

const dbModule = require('../server/db.cjs');
const files = require('../server/services/files.cjs');
dbModule.initDatabase();

// 预置一个真实文件，用于验证「合法文件可解析」与「绝对 URL 形态可解析」
const okPdfUrlForInvariant = '/uploads/ok.pdf';
fs.writeFileSync(path.join(UPLOADS, 'ok.pdf'), 'dummy');

let failed = 0;
function check(name, cond, extra = '') {
  if (!cond) failed++;
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
}
/** 期望抛出错误；返回 {threw, message, statusCode} */
function expectThrow(fn) {
  try { fn(); return { threw: false }; }
  catch (e) { return { threw: true, message: e.message, statusCode: e.statusCode }; }
}

console.log('\n════ A. 路径穿越必须被拒绝（含 Windows 反斜杠变体） ════');
const traversalPayloads = [
  '/uploads/..\\..\\..\\Windows\\System32\\calc.exe',
  '/uploads/../../../etc/passwd',
  '/uploads/..%5C..%5Cwin.ini',
  '/uploads/....//win.ini',
  'C:\\Windows\\win.ini',
];
for (const p of traversalPayloads) {
  const r = expectThrow(() => files.resolvePath(p));
  check(`拒绝 ${p}`, r.threw, r.threw ? `→ ${r.message}` : '!! 未抛错，存在穿越风险');
}
check('穿越类错误统一为 400', expectThrow(() => files.resolvePath('/uploads/..\\x')).statusCode === 400);

// 核心不变量：任何入参要么抛错，要么解析结果必须落在 uploadsDir 内（绝不允许逃逸）
console.log('  ── 不变量：解析结果永不出 uploadsDir ──');
const UPLOADS_ABS = path.resolve(UPLOADS) + path.sep;
const invariantInputs = [
  '/uploads/sub/dir/file.pdf',            // 多段：会被压平到 uploads 根，但不得逃逸
  '/uploads/ok.pdf',
  `http://127.0.0.1:3001/uploads/${path.basename(okPdfUrlForInvariant)}`,
  'http://127.0.0.1:3001/uploads/../../../Windows/win.ini',   // 绝对 URL 里的穿越同样要拦住
  '/uploads/./ok.pdf',
  '/uploads//ok.pdf',
];
for (const p of invariantInputs) {
  let resolved = null, threw = null;
  try { resolved = files.resolvePath(p); } catch (e) { threw = e.message; }
  const safe = threw !== null || resolved === null || path.resolve(resolved).startsWith(UPLOADS_ABS);
  check(`不出 uploadsDir：${p}`, safe, threw ? `→ 抛错(${threw})` : resolved === null ? '→ null' : `→ ${path.basename(resolved)}`);
}
check('绝对 URL 形态（前端 PdfThumb 实际入参）可正常解析',
  files.resolvePath(`http://127.0.0.1:3001/uploads/${path.basename(okPdfUrlForInvariant)}`) !== undefined);

console.log('\n════ B. 可执行/脚本类扩展名不得进入白名单 ════');
const payload = Buffer.from('MZ fake').toString('base64');
for (const ext of ['.exe', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.mjs', '.cjs', '.dll', '.scr', '.com', '.msi', '.jar', '.lnk']) {
  const r = expectThrow(() => files.save(`evil${ext}`, payload));
  check(`拒绝上传 evil${ext}`, r.threw && r.statusCode === 400, r.threw ? `→ ${r.message.slice(0, 40)}...` : '!! 未拒绝');
}
check('无扩展名被拒绝', expectThrow(() => files.save('noext', payload)).threw);
check('空 data 被拒绝', expectThrow(() => files.save('ok.pdf', '')).threw);

console.log('\n════ C. 合法格式放行 + 大小写不敏感 + 50MB 上限 ════');
const okPdf = files.save('设计稿.PDF', payload);          // 中文名 + 大写扩展名
check('中文名 + 大写扩展名放行', /^\/uploads\/.+\.PDF$/i.test(okPdf.url), `url=${okPdf.url}`);
check('落盘文件真实存在', fs.existsSync(path.join(UPLOADS, path.basename(okPdf.url))));
check('文件名已净化（无中文/空格残留）', !/[^\x20-\x7E]/.test(path.basename(okPdf.url)) && !/\s/.test(path.basename(okPdf.url)), path.basename(okPdf.url));
for (const ext of ['.dxf', '.psd', '.ai', '.cdr', '.tif']) {
  check(`行业格式 ${ext} 放行`, (() => { try { files.save(`d${ext}`, payload); return true; } catch { return false; } })());
}
// 50MB 边界：1 字节之差
const atLimit = Buffer.alloc(50 * 1024 * 1024, 0x41).toString('base64');
check('恰好 50MB 放行', (() => { try { files.save('limit.pdf', atLimit); return true; } catch (e) { console.log('   ', e.message); return false; } })());
const overLimit = Buffer.alloc(50 * 1024 * 1024 + 1, 0x41).toString('base64');
const big = expectThrow(() => files.save('over.pdf', overLimit));
check('50MB+1 字节被拒绝', big.threw && big.statusCode === 400, big.threw ? `→ ${big.message}` : '');
check('超限文件未落盘', !fs.existsSync(path.join(UPLOADS, 'over.pdf')));

console.log('\n════ D. 本机打开策略 ════');
// 模拟「历史遗留」：直接往 uploads 目录放一个可执行文件（绕过 save 白名单）
fs.writeFileSync(path.join(UPLOADS, 'legacy.exe'), 'MZ');
const legacy = expectThrow(() => files.openLocally('/uploads/legacy.exe'));
check('历史遗留 .exe 拒绝打开', legacy.threw && legacy.statusCode === 400, legacy.threw ? `→ ${legacy.message}` : '!! 未拒绝');
fs.writeFileSync(path.join(UPLOADS, 'legacy.bat'), '@echo off');
check('历史遗留 .bat 拒绝打开', expectThrow(() => files.openLocally('/uploads/legacy.bat')).threw);
check('穿越路径拒绝打开', expectThrow(() => files.openLocally('/uploads/..\\..\\Windows\\System32\\calc.exe')).threw);
const missing = expectThrow(() => files.openLocally('/uploads/nonexistent.pdf'));
check('不存在的文件明确报错（不静默成功）', missing.threw && /not found/i.test(missing.message), missing.threw ? `→ ${missing.message}` : '');
check('空 url 返回 null 而非下载目录', files.resolvePath('') === null);

console.log('\n════════════════════════════════════════');
const total = 6 + 14 + 3 + 5 + 9 + 2 + 4;
console.log(failed === 0 ? `✅ 全部通过（${total}+ 项断言）` : `❌ ${failed} 项失败`);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows 句柄未释放时忽略 */ }
process.exit(failed === 0 ? 0 : 1);
