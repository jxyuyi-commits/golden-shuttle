// 工艺单（Tech Pack）PDF 导出：基于 pdfmake + 思源黑体（中文 vfs 动态加载）
// 与 Excel 版 exportTechPack.js 共用同一套业务字段逻辑（工具函数保持一致，勿单独改造成漂移）
// 版式：A4；基本信息 + 尺寸规格竖版，物料清单(BOM) + 工艺指示横向
import { timestamp } from './exporter';

/* ──────────────────────────────────────────────
   配色（墨绿系，与 Excel 版一致）
   ────────────────────────────────────────────── */
const C = {
  titleBg:   '#1F4538',  // 标题栏 深墨绿
  headerBg:  '#8FB57A',  // 表头 浅绿
  headerFont:'#1A3328',
  zebraBg:   '#EDF4E7',  // 斑马纹 极浅绿
  sectionBg: '#E2EFDA',  // 分类列 浅绿
  totalBg:   '#FFF2CC',  // 合计行 浅黄
  totalFont: '#CC0000',  // 合计金额 红
  border:    '#8A8A8A',  // 边框 灰
  noteFont:  '#CC0000',  // 备注 红
  dataFont:  '#262626',
};

/* ──────────────────────────────────────────────
   工具函数（与 exportTechPack.js 保持一致）
   ────────────────────────────────────────────── */
const NODE_STATUS_CN = { pending: '待开始', active: '进行中', completed: '已完成', done: '已完成' };
const STATUS_CN = { done: '已完结', doing: '打版中', pending: '待处理', todo: '待处理' };
const DASH = '—';

function formatDate(d, fallbackYear) {
  if (!d) return '';
  const s = String(d).trim();
  if (!s) return '';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{1,2})[\/.](\d{1,2})$/);
  if (m2) {
    const y = fallbackYear || new Date().getFullYear();
    return `${y}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
  }
  return s;
}

function cleanTolerance(t) {
  if (!t) return '';
  return String(t).replace(/[（(]?\s*[±＋+]\s*[）)]?\s*/g, '').trim();
}

function parseSizeData(task) {
  let sd = task?.size_data;
  if (typeof sd === 'string') { try { sd = JSON.parse(sd || '[]'); } catch { sd = []; } }
  return Array.isArray(sd) ? sd : [];
}

function parseSizeValues(v) {
  if (typeof v === 'string') { try { return JSON.parse(v || '{}'); } catch { return {}; } }
  return v || {};
}

function val(v) {
  if (v === null || v === undefined || v === '') return DASH;
  return v;
}

/* ──────────────────────────────────────────────
   pdfmake 动态加载（字体 vfs 较大，Vite 自动拆独立 chunk）
   ────────────────────────────────────────────── */
let pdfMakePromise = null;
async function getPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const [pdfmod, vfsmod] = await Promise.all([
        import('pdfmake/build/pdfmake'),
        import('./pdfTechPackVfs'),
      ]);
      const pdfMake = pdfmod.default || pdfmod;
      // pdfmake 的 VFS 是模块级单例：必须调用 addVirtualFileSystem 写入字体，
      // 仅设置 pdfMake.vfs 属性不生效（createPdf 内部读取 VirtualFileSystem 单例）。
      pdfMake.addVirtualFileSystem(vfsmod.pdfFontVfs);
      pdfMake.addFonts({
        NotoSansSC: {
          normal: 'NotoSansSC-Regular.otf',
          bold: 'NotoSansSC-Regular.otf',
          italics: 'NotoSansSC-Regular.otf',
          bolditalics: 'NotoSansSC-Regular.otf',
        },
      });
      return pdfMake;
    })();
  }
  return pdfMakePromise;
}

/* ──────────────────────────────────────────────
   表格边框布局
   ────────────────────────────────────────────── */
const tableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => C.border,
  vLineColor: () => C.border,
};

const th = (text, align = 'center') => ({
  text, style: 'th', alignment: align,
});

const cell = (text, opts = {}) => ({
  text: text === '' ? '' : val(text),
  style: 'td',
  alignment: opts.align || 'left',
  fillColor: opts.fill,
  fontSize: opts.fontSize,
  color: opts.color,
  bold: opts.bold,
  rowSpan: opts.rowSpan,
});

/* ──────────────────────────────────────────────
   一、基本信息（分类 | 字段 | 内容）
   ────────────────────────────────────────────── */
function buildInfoContent(task) {
  const year = task.year || '';
  let cleanNote = task.note || '';
  if (cleanNote.startsWith('工作动态：') || cleanNote.startsWith('工作动态:')) cleanNote = '';

  const sections = [
    { name: '款式基础信息', items: [
      ['款号', task.style_no], ['款式名称', task.title], ['类别', task.category],
      ['品牌', task.brand], ['设计师', task.designer],
      ['时段', [task.year, task.season, task.month].filter(Boolean).join(' ')],
    ]},
    { name: '打样信息', items: [
      ['版单号', task.order_no], ['版次', task.sample_type], ['样衣颜色', task.sample_color],
      ['尺码', task.size], ['件数', task.sample_count ? `${task.sample_count}件` : ''],
      ['优先级', task.priority], ['审核状态', task.audit_status],
      ['看板状态', STATUS_CN[task.status] || task.status || ''],
    ]},
    { name: '日期', items: [
      ['面料到库日期', formatDate(task.fabric_date, year)],
      ['任务开始日期', formatDate(task.start_date, year)],
      ['预计完工日期', formatDate(task.expected_date, year)],
      ['实际完工日期', formatDate(task.finish_date, year)],
    ]},
  ];

  const nodes = task.progress_nodes || [];
  const timelineItems = nodes.length ? nodes.map(n => {
    const st = NODE_STATUS_CN[n.status] || n.status || '';
    const date = formatDate(n.date, year);
    const meta = [st, date].filter(Boolean).join(' ');
    const extra = [n.by ? `负责人:${n.by}` : '', n.note || ''].filter(Boolean).join('；');
    return [n.label || '（未命名）', [meta, extra].filter(Boolean).join('｜')];
  }) : [['无记录', '']];
  sections.push({ name: '工作动态', items: timelineItems });

  sections.push({ name: '说明与反馈', items: [
    ['款式说明/打样重点', cleanNote], ['物料要求', task.fabric_req],
    ['辅料要求', task.trim_req], ['工艺建议/注意事项', task.process_req],
    ['审版意见/修改反馈', task.audit_comment],
  ]});

  const body = [
    [th('分类'), th('字段', 'left'), th('内容', 'left')],
  ];
  for (const sec of sections) {
    const n = sec.items.length;
    sec.items.forEach(([key, value], idx) => {
      const row = [];
      if (idx === 0) {
        row.push({ text: sec.name, style: 'secCell', alignment: 'center', valign: 'middle', rowSpan: n });
      } else {
        row.push({});
      }
      row.push({ text: key, style: 'td', alignment: 'left' });
      row.push({ text: value === '' || value === null || value === undefined ? DASH : value, style: 'td', alignment: 'left' });
      body.push(row);
    });
  }

  return {
    table: { widths: [56, 92, '*'], body },
    layout: tableLayout,
    margin: [0, 2, 0, 6],
  };
}

/* ──────────────────────────────────────────────
   二、尺寸规格（基码 + 各码）
   ────────────────────────────────────────────── */
function buildSizeContent(task) {
  const data = parseSizeData(task);
  const sizeKeys = [];
  for (const row of data) {
    for (const k of Object.keys(parseSizeValues(row.size_values))) {
      if (k.endsWith('_manual')) continue;
      if (!sizeKeys.includes(k)) sizeKeys.push(k);
    }
  }
  const baseSize = task.size || sizeKeys[1] || sizeKeys[0] || 'M';
  const sizeLabel = sizeKeys.length ? `${sizeKeys.join('/')}三码` : '—';

  const widths = [20, 66, '*', ...sizeKeys.map(() => 36), 34, 38];
  const headers = ['序号', '部位', '测量方法', ...sizeKeys.map(k => `${k}(cm)`), '档差(cm)', '公差(±cm)'];
  const body = [headers.map(h => th(h, h === '部位' || h === '测量方法' ? 'left' : 'center'))];

  if (!data.length) {
    body.push([{ text: '（暂无尺寸数据）', colSpan: widths.length, style: 'td', alignment: 'center', fillColor: C.zebraBg }, ...Array(widths.length - 1).fill({})]);
  } else {
    data.forEach((row, i) => {
      const sv = parseSizeValues(row.size_values);
      const line = [
        cell(i + 1, { align: 'center', fill: i % 2 === 1 ? C.zebraBg : null }),
        cell(row.name, { fill: i % 2 === 1 ? C.zebraBg : null }),
        cell(row.method, { fill: i % 2 === 1 ? C.zebraBg : null }),
        ...sizeKeys.map(k => cell(sv[k] ?? '', { align: 'center', fill: i % 2 === 1 ? C.zebraBg : null })),
        cell(row.grading ?? '', { align: 'center', fill: i % 2 === 1 ? C.zebraBg : null }),
        cell(cleanTolerance(row.tolerance), { align: 'center', fill: i % 2 === 1 ? C.zebraBg : null }),
      ];
      body.push(line);
    });
  }

  // 底部红色备注
  body.push([{
    text: `备注：基码${baseSize}，共${sizeKeys.length}码；公差按品牌基线执行（衣长±0.5／胸围±1／袖长±0.5／其余±0.3），具体以封样确认样衣为准。`,
    colSpan: widths.length, style: 'td', color: C.noteFont, fontSize: 8,
  }, ...Array(widths.length - 1).fill({})]);

  return {
    table: { widths, body },
    layout: tableLayout,
    margin: [0, 2, 0, 6],
  };
}

/* ──────────────────────────────────────────────
   三、物料清单 BOM（横向）
   ────────────────────────────────────────────── */
function buildBomContent(items) {
  const list = Array.isArray(items) ? items : [];
  const widths = [22, 52, 92, 62, 48, 30, 38, 72, 42, 42, '*'];
  const headers = ['序号', '类别', '物料名称', '规格', '颜色', '单位', '单耗', '供应商', '单价(元)', '小计(元)', '备注'];
  const body = [headers.map(h => th(h, [0, 5, 6, 8, 9].includes(headers.indexOf(h)) ? 'center' : 'left'))];

  if (!list.length) {
    body.push([{ text: '（暂无物料数据）', colSpan: widths.length, style: 'td', alignment: 'center' }, ...Array(widths.length - 1).fill({})]);
  } else {
    let totalCost = 0;
    list.forEach((b, i) => {
      const usage = parseFloat(b.usage) || 0;
      const price = parseFloat(b.price) || 0;
      const subtotal = usage * price;
      totalCost += subtotal;
      const fill = i % 2 === 1 ? C.zebraBg : null;
      body.push([
        cell(i + 1, { align: 'center', fill }),
        cell(b.category, { fill }),
        cell(b.name, { fill }),
        cell(b.spec, { fill }),
        cell(b.color, { fill }),
        cell(b.unit, { align: 'center', fill }),
        cell(usage || '', { align: 'center', fill }),
        cell(b.supplier, { fill }),
        cell(price || '', { align: 'center', fill }),
        cell(subtotal ? Number(subtotal.toFixed(2)) : '', { align: 'center', fill }),
        cell(b.note, { fill }),
      ]);
    });
    // 合计行
    body.push([
      // colSpan=9 的 cell 后必须提供 8 个占位 cell（pdfmake 规则：colSpan N 需跟 N-1 个占位）
      { text: '单件成本合计', colSpan: 9, style: 'td', alignment: 'right', bold: true, color: C.headerFont, fillColor: C.totalBg, fontSize: 10 },
      {}, {}, {}, {}, {}, {}, {}, {},
      { text: Number(totalCost.toFixed(2)), style: 'td', alignment: 'center', bold: true, color: C.totalFont, fillColor: C.totalBg, fontSize: 10 },
      {},
    ]);
  }

  return {
    table: { widths, body },
    layout: tableLayout,
    margin: [0, 2, 0, 6],
  };
}

/* ──────────────────────────────────────────────
   四、工艺指示（横向）
   ────────────────────────────────────────────── */
function buildProcessContent(items) {
  const list = Array.isArray(items) ? items : [];
  const widths = [22, 78, 120, '*', 180, 120];
  const headers = ['序号', '工艺分类', '工艺名称', '工艺要求', '质量标准', '备注'];
  const body = [headers.map(h => th(h, h === '序号' ? 'center' : 'left'))];

  if (!list.length) {
    body.push([{ text: '（暂无工艺数据）', colSpan: widths.length, style: 'td', alignment: 'center' }, ...Array(widths.length - 1).fill({})]);
  } else {
    list.forEach((p, i) => {
      const fill = i % 2 === 1 ? C.zebraBg : null;
      body.push([
        cell(i + 1, { align: 'center', fill }),
        cell(p.section, { fill }),
        cell(p.name, { fill }),
        cell(p.requirement, { fill }),
        cell(p.standard, { fill }),
        cell(p.note, { fill }),
      ]);
    });
  }

  return {
    table: { widths, body },
    layout: tableLayout,
    margin: [0, 2, 0, 6],
  };
}

/* ──────────────────────────────────────────────
   下载
   ────────────────────────────────────────────── */
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getTechPackPdfFileName(task) {
  const styleNo = task?.style_no || 'unknown';
  const orderNo = task?.order_no || '';
  return `工艺单_${styleNo}${orderNo ? '_' + orderNo : ''}_${timestamp()}.pdf`;
}

const sectionTitle = (text) => ({
  text,
  style: 'sectionTitle',
  background: C.titleBg,
  color: '#ffffff',
  fontSize: 12.5,
  bold: true,
  lineHeight: 1.9,
  margin: [0, 12, 0, 5],
});

export async function exportTechPackPdf(task, bomItems, processItems) {
  if (!task) return;
  const pdfMake = await getPdfMake();
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const dd = {
    pageSize: 'A4',
    pageMargins: [26, 20, 26, 26],
    defaultStyle: { font: 'NotoSansSC', fontSize: 9, color: C.dataFont },
    info: { title: `工艺单_${task.style_no || ''}` },
    footer: (page, total) => ({
      text: `第 ${page} / ${total} 页    ·    生成时间 ${ts}`,
      alignment: 'center', fontSize: 7.5, color: '#888', margin: [0, 6, 0, 0],
    }),
    styles: {
      mainTitle: { fontSize: 17, bold: true, color: C.titleBg, alignment: 'center', margin: [0, 2, 0, 2] },
      subTitle:  { fontSize: 8.5, color: '#555', alignment: 'center', margin: [0, 0, 0, 4] },
      sectionTitle: { color: '#ffffff', bold: true },
      th: { bold: true, color: C.headerFont, fillColor: C.headerBg, fontSize: 9, margin: [3, 3, 3, 3] },
      td: { fontSize: 8.8, margin: [3, 2.5, 3, 2.5] },
      secCell: { fontSize: 8.8, bold: true, color: C.headerFont, fillColor: C.sectionBg, margin: [3, 2.5, 3, 2.5] },
    },
    content: [
      { text: '工艺单（Tech Pack）', style: 'mainTitle' },
      { text: `款号：${task.style_no || '—'}    款式名称：${task.title || '—'}    品牌：${task.brand || '—'}    类别：${task.category || '—'}`,
        style: 'subTitle' },
      sectionTitle('一、基本信息'),
      buildInfoContent(task),
      sectionTitle(`二、尺寸规格（基码${task.size || 'M'}，${(() => { const keys = []; for (const r of parseSizeData(task)) { for (const k of Object.keys(parseSizeValues(r.size_values))) { if (k.endsWith('_manual')) continue; if (!keys.includes(k)) keys.push(k); } } return keys.length ? `${keys.join('/')}三码` : '—'; })()}）`),
      buildSizeContent(task),
      { text: '三、物料清单（BOM）', style: 'sectionTitle', background: C.titleBg, color: '#fff', bold: true, fontSize: 12.5, lineHeight: 1.9, margin: [0, 12, 0, 5], pageBreak: 'before', pageOrientation: 'landscape' },
      buildBomContent(bomItems),
      { text: '四、工艺指示', style: 'sectionTitle', background: C.titleBg, color: '#fff', bold: true, fontSize: 12.5, lineHeight: 1.9, margin: [0, 14, 0, 5], pageOrientation: 'landscape' },
      buildProcessContent(processItems),
    ],
  };

  // pdfmake 0.3.x 的 getBlob() 是 async 无参方法（返回 Promise<Blob>），直接 await
  const blob = await pdfMake.createPdf(dd).getBlob();
  const fileName = getTechPackPdfFileName(task);
  downloadBlob(blob, fileName);
  return fileName;
}
