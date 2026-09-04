// 图纸专业格式缩略图生成：
//  - EMF → PNG（Windows 原生 System.Drawing，矢量保真）
//  - DXF → SVG（解析服装 CAD 纸样轮廓 POLYLINE/VERTEX，纯 Node 无依赖）
// 生成结果缓存到 server/uploads/thumbs/，同名文件不重复生成。
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { getUploadsDir } = require('../db.cjs');
const { resolvePath } = require('./files.cjs');

const THUMB_DIR = null; // 弃用：模块加载时 getUploadsDir 可能未初始化，缓存目录改为每次调用时惰性计算

/** 惰性获取缩略图缓存目录（server/uploads/thumbs/），避免模块加载早于 initDatabase 时落到项目根 */
function getThumbDir() {
  const uploads = getUploadsDir() || path.join(__dirname, '..', 'uploads');
  return path.resolve(uploads, 'thumbs');
}

/* ────────────────────────── DXF → SVG ────────────────────────── */

/**
 * 解析 DXF 文件，提取纸样轮廓折线
 * 适配服装 CAD 常见输出（AutoCAD R12 AC1009）：
 *  - BLOCKS 段内的 BLOCK：块名 + POLYLINE/VERTEX/SEQEND 轮廓
 *  - ENTITIES 段内的 INSERT：引用块名
 * @param {Buffer} buffer - DXF 文件内容
 * @returns {{polylines: Array<Array<[number,number]>>, blocks: Object}}
 */
function parseDxf(buffer) {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    pairs.push([lines[i].trim(), lines[i + 1]]);
  }

  const blocks = {};      // 块名 -> 折线数组
  const inserts = [];     // ENTITIES 引用的块名
  const loosePolys = [];  // ENTITIES 段内直接出现的折线
  let section = null;
  let curBlock = null;
  let curPoly = null;
  let blockOfPoly = null;

  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    const v = (value || '').trim();
    if (code === '0') {
      if (v === 'SECTION') {
        // 下一对是段名
        if (i + 1 < pairs.length && pairs[i + 1][0] === '2') {
          section = pairs[i + 1][1].trim();
          i++;
        }
      } else if (v === 'ENDSEC') {
        section = null; curBlock = null;
      } else if (v === 'BLOCK') {
        // 下一对 code 2 是块名
        let name = null;
        for (let j = i + 1; j < Math.min(i + 6, pairs.length); j++) {
          if (pairs[j][0] === '2') { name = pairs[j][1].trim(); break; }
        }
        curBlock = name || `block_${Object.keys(blocks).length}`;
        if (!blocks[curBlock]) blocks[curBlock] = [];
        blockOfPoly = curBlock;
      } else if (v === 'ENDBLK') {
        curBlock = null; blockOfPoly = null;
      } else if (v === 'POLYLINE') {
        curPoly = [];
      } else if (v === 'SEQEND') {
        if (curPoly && curPoly.length) {
          if (blockOfPoly && blocks[blockOfPoly]) blocks[blockOfPoly].push(curPoly);
          else loosePolys.push(curPoly);
        }
        curPoly = null;
      } else if (v === 'INSERT') {
        for (let j = i + 1; j < Math.min(i + 6, pairs.length); j++) {
          if (pairs[j][0] === '2') { inserts.push(pairs[j][1].trim()); break; }
        }
      } else if (v === 'EOF') {
        break;
      }
    } else if (code === '10' && curPoly) {
      // VERTEX 的 X 坐标：新顶点
      curPoly.push([parseFloat(value), NaN]);
    } else if (code === '20' && curPoly) {
      // VERTEX 的 Y 坐标：补到最后一个顶点
      if (curPoly.length) curPoly[curPoly.length - 1][1] = parseFloat(value);
    }
  }
  return { blocks, inserts, loosePolys };
}

/**
 * 取最终要绘制的折线集：优先 ENTITIES 引用的块，其次全部块/游离折线
 */
function collectPolylines(parsed) {
  const out = [];
  const used = new Set();
  for (const name of parsed.inserts) {
    if (parsed.blocks[name] && !used.has(name)) {
      out.push(...parsed.blocks[name]);
      used.add(name);
    }
  }
  if (out.length === 0) {
    for (const key of Object.keys(parsed.blocks)) {
      if (!used.has(key)) out.push(...parsed.blocks[key]);
    }
    out.push(...parsed.loosePolys);
  }
  return out;
}

/** DXF → SVG 字符串；无法解析出轮廓时返回 null */
function dxfToSvg(buffer) {
  const polylines = collectPolylines(parseDxf(buffer));
  const pts = polylines.flat();
  if (!pts.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (!isFinite(x) || !isFinite(y)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (!isFinite(minX)) return null;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = span * 0.02 + 0.2;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  // DXF 的 Y 轴向上，SVG 的 Y 轴向下，翻转
  const paths = polylines
    .map(poly => {
      const d = poly
        .map((p, i) => {
          if (!isFinite(p[0]) || !isFinite(p[1])) return '';
          return (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ' ' + (maxY - p[1]).toFixed(2);
        })
        .filter(Boolean)
        .join(' ');
      return d ? `<path d="${d} Z" fill="none" stroke="#1e293b" stroke-width="${Math.max(0.5, span / 500)}" vector-effect="non-scaling-stroke"/>` : '';
    })
    .filter(Boolean)
    .join('');
  if (!paths) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}" height="${h.toFixed(2)}" viewBox="${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}">${paths}</svg>`;
}

/* ────────────────────────── EMF → PNG ────────────────────────── */

const PS_SCRIPT = `param([string]$InPath,[string]$OutPath,[int]$MaxSide)
Add-Type -AssemblyName System.Drawing
$src=[System.Drawing.Image]::FromFile($InPath)
$ratio=[Math]::Min(1.0,$MaxSide/[Math]::Max($src.Width,$src.Height))
$w=[Math]::Max(1,[int]($src.Width*$ratio))
$h=[Math]::Max(1,[int]($src.Height*$ratio))
$bmp=New-Object System.Drawing.Bitmap($w,$h)
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.InterpolationMode='HighQualityBicubic'
$g.DrawImage($src,0,0,$w,$h)
$bmp.Save($OutPath,[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose();$src.Dispose()
`;

function emfToPng(emfPath, outPath, maxSide = 1000) {
  return new Promise((resolve, reject) => {
    const dir = getThumbDir();
    const scriptPath = path.join(dir, '_emf2png.ps1');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    fs.writeFileSync(scriptPath, PS_SCRIPT);
    const child = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
      emfPath, outPath, String(maxSide),
    ], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`EMF 转换失败 code=${code} ${stderr}`));
    });
  });
}

/* ────────────────────────── 统一入口 ────────────────────────── */

/**
 * 为上传的图纸生成/取回缩略图文件（磁盘路径）
 * @param {string} url - 如 /uploads/xxx.emf
 * @returns {Promise<string|null>} 缩略图绝对路径；不支持/失败返回 null
 */
async function getThumb(url) {
  const abs = resolvePath(url);
  if (!abs) return null;
  const ext = path.extname(abs).toLowerCase();
  const dir = getThumbDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const base = path.basename(abs, path.extname(abs));
  if (ext === '.emf') {
    const out = path.join(dir, `${base}.png`);
    if (fs.existsSync(out)) return out;
    try { await emfToPng(abs, out); return out; } catch (e) { console.error('[Thumb EMF]', e.message); return null; }
  }
  if (ext === '.dxf') {
    const out = path.join(dir, `${base}.svg`);
    if (fs.existsSync(out)) return out;
    try {
      const svg = dxfToSvg(fs.readFileSync(abs));
      if (!svg) return null;
      fs.writeFileSync(out, svg);
      return out;
    } catch (e) { console.error('[Thumb DXF]', e.message); return null; }
  }
  return null;
}

module.exports = { getThumb, dxfToSvg, parseDxf, emfToPng };
