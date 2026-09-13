// 工艺单（Tech Pack）PDF 导出：基于 pdfmake + 思源黑体（中文 vfs 动态加载）
// 版式：A4；基本信息 + 尺寸规格竖版，物料清单(BOM) + 工艺指示横向
//
// 数据与业务逻辑统一来自 ./techPackModel（与 Excel 版共用同一来源，改动只需改一处）；
// 本文件只保留**本路径特有的渲染**：pdfmake 文档定义、hex 配色、列宽、字号、斑马纹、边框。
// ⚠️ 本文件的色值（hex）、斑马纹（EDF4E7）、边框（8A8A8A）与 Excel 版**有意不同**，勿与他人「对齐」。
import {
  DASH,
  pickColors,
  val,
  asList,
  parseSizeData,
  downloadBlob,
  applyRunOverride,
  buildInfoSections,
  deriveSizeKeys,
  deriveBaseSize,
  buildSizeTitle,
  buildSizeRows,
  buildSizeNote,
  buildBomRows,
  buildProcessRows,
  BOM_HEADERS,
  PROCESS_HEADERS,
  buildTechPackFileName,
} from './techPackModel';

/* ──────────────────────────────────────────────
   配色（墨绿系，与 Excel 版语义一致，但取值格式为 hex）
   语义键统一取自 techPackModel.COLOR_ROLES；色值仅本文件持有。
   ────────────────────────────────────────────── */
const COLOR_VALUES = {
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
const C = pickColors(COLOR_VALUES);

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
  const sections = buildInfoSections(task);

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
  const sizeKeys = deriveSizeKeys(data);
  const baseSize = deriveBaseSize(task, sizeKeys);

  const widths = [20, 66, '*', ...sizeKeys.map(() => 36), 34, 38];
  const body = [buildSizeHeaderRow(sizeKeys)];

  if (!data.length) {
    body.push([{ text: '（暂无尺寸数据）', colSpan: widths.length, style: 'td', alignment: 'center', fillColor: C.zebraBg }, ...Array(widths.length - 1).fill({})]);
  } else {
    buildSizeRows(data, sizeKeys).forEach((row, i) => {
      const fill = i % 2 === 1 ? C.zebraBg : null;
      const line = [
        cell(row.index, { align: 'center', fill }),
        cell(row.name, { fill }),
        cell(row.method, { fill }),
        ...row.values.map((v) => cell(v, { align: 'center', fill })),
        cell(row.grading, { align: 'center', fill }),
        cell(row.tolerance, { align: 'center', fill }),
      ];
      body.push(line);
    });
  }

  // 底部红色备注
  body.push([{
    text: buildSizeNote(baseSize, sizeKeys.length),
    colSpan: widths.length, style: 'td', color: C.noteFont, fontSize: 8,
  }, ...Array(widths.length - 1).fill({})]);

  return {
    table: { widths, body },
    layout: tableLayout,
    margin: [0, 2, 0, 6],
  };
}

/** 尺寸表表头行（部位/测量方法左对齐，其余居中） */
function buildSizeHeaderRow(sizeKeys) {
  const headers = ['序号', '部位', '测量方法', ...sizeKeys.map((k) => `${k}(cm)`), '档差(cm)', '公差(±cm)'];
  return headers.map((h) => th(h, h === '部位' || h === '测量方法' ? 'left' : 'center'));
}

/* ──────────────────────────────────────────────
   三、物料清单 BOM（横向）
   ────────────────────────────────────────────── */
function buildBomContent(items) {
  const list = asList(items);
  const widths = [22, 52, 92, 62, 48, 30, 38, 72, 42, 42, '*'];
  const body = [BOM_HEADERS.map((h, i) => th(h, [0, 5, 6, 8, 9].includes(i) ? 'center' : 'left'))];

  if (!list.length) {
    body.push([{ text: '（暂无物料数据）', colSpan: widths.length, style: 'td', alignment: 'center' }, ...Array(widths.length - 1).fill({})]);
  } else {
    const { rows, totalCost } = buildBomRows(list);
    rows.forEach((b, i) => {
      const fill = i % 2 === 1 ? C.zebraBg : null;
      body.push([
        cell(b.index, { align: 'center', fill }),
        cell(b.category, { fill }),
        cell(b.name, { fill }),
        cell(b.spec, { fill }),
        cell(b.color, { fill }),
        cell(b.unit, { align: 'center', fill }),
        cell(b.usage || '', { align: 'center', fill }),
        cell(b.supplier, { fill }),
        cell(b.price || '', { align: 'center', fill }),
        cell(b.subtotal, { align: 'center', fill }),
        cell(b.note, { fill }),
      ]);
    });
    // 合计行
    body.push([
      // colSpan=9 的 cell 后必须提供 8 个占位 cell（pdfmake 规则：colSpan N 需跟 N-1 个占位）
      { text: '单件成本合计', colSpan: 9, style: 'td', alignment: 'right', bold: true, color: C.headerFont, fillColor: C.totalBg, fontSize: 10 },
      {}, {}, {}, {}, {}, {}, {}, {},
      { text: totalCost, style: 'td', alignment: 'center', bold: true, color: C.totalFont, fillColor: C.totalBg, fontSize: 10 },
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
  const list = asList(items);
  const widths = [22, 78, 120, '*', 180, 120];
  const body = [PROCESS_HEADERS.map((h) => th(h, h === '序号' ? 'center' : 'left'))];

  if (!list.length) {
    body.push([{ text: '（暂无工艺数据）', colSpan: widths.length, style: 'td', alignment: 'center' }, ...Array(widths.length - 1).fill({})]);
  } else {
    buildProcessRows(list).forEach((p, i) => {
      const fill = i % 2 === 1 ? C.zebraBg : null;
      body.push([
        cell(p.index, { align: 'center', fill }),
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
   下载 / 文件名 / 文档定义 / 总入口
   ────────────────────────────────────────────── */
export function getTechPackPdfFileName(task) {
  return buildTechPackFileName(task, 'pdf');
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

export async function exportTechPackPdf(task, bomItems, processItems, run) {
  // REQ-005 尺寸表归属版次：run 为当前选中批次，覆盖导出用的尺寸表/尺码/件数（批次级权威）
  task = applyRunOverride(task, run);
  if (!task) return;
  const pdfMake = await getPdfMake();
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 尺寸表章节标题的基码与下方表格/备注、以及 Excel 版统一走 deriveBaseSize（见 buildSizeTitle），
  // 避免「标题写 'M'、自己的备注写 'S'」这类自相矛盾。
  const sizeKeys = deriveSizeKeys(parseSizeData(task));

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
      sectionTitle(buildSizeTitle(task, sizeKeys)),
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
