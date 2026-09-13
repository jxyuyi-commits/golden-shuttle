// 工艺单（Tech Pack）导出：单张打样单 → 专业格式多sheet Excel
// 基于 exceljs，配色/布局严格对照行业标准工艺单
// Sheet：基本信息 / 尺寸规格 / 物料清单(BOM) / 工艺指示
//
// 数据与业务逻辑统一来自 ./techPackModel（与 PDF 版共用同一来源，改动只需改一处）；
// 本文件只保留**本路径特有的渲染**：exceljs 样式、argb 配色、列宽/行高、斑马纹、边框。
// ⚠️ 本文件的色值（argb）、斑马纹（C6E0B4）、边框（404040）与 PDF 版**有意不同**，勿与他人「对齐」。
import ExcelJS from 'exceljs';
import {
  BOM_HEADERS,
  PROCESS_HEADERS,
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
  buildSizeHeaders,
  buildSizeRows,
  buildSizeNote,
  buildBomRows,
  buildProcessRows,
  buildTechPackFileName,
} from './techPackModel';

/* ──────────────────────────────────────────────
   配色（墨绿系，行业标准工艺单风格）—— Excel argb 取值
   语义键统一取自 techPackModel.COLOR_ROLES；色值仅本文件持有。
   ────────────────────────────────────────────── */
const COLOR_VALUES = {
  titleBg:    'FF1F4538',  // 标题栏 深墨绿（接近黑绿）
  titleFont:  'FFFFFFFF',  // 标题白字
  headerBg:   'FF8FB57A',  // 表头 浅绿
  headerFont: 'FF1A3328',  // 表头深绿字
  zebraBg:    'FFC6E0B4',  // 斑马纹 浅绿（明显）
  sectionBg:  'FFE2EFDA',  // 分类列 浅绿
  totalBg:    'FFFFF2CC',  // 合计行 浅黄
  totalFont:  'FFCC0000',  // 合计金额 红
  border:     'FF404040',  // 边框 深灰（接近黑，清晰）
  noteFont:   'FFCC0000',  // 备注 红
  dataFont:   'FF262626',  // 正文 深灰
};
const C = pickColors(COLOR_VALUES);

const thinBorder = {
  top: { style: 'thin', color: { argb: C.border } },
  left: { style: 'thin', color: { argb: C.border } },
  bottom: { style: 'thin', color: { argb: C.border } },
  right: { style: 'thin', color: { argb: C.border } },
};

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** 标题行：合并、深墨绿底、白字粗体18号、居中、行高52 */
function setTitle(sheet, range, text) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  cell.value = text;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.titleBg } };
  cell.font = { bold: true, color: { argb: C.titleFont }, size: 18, name: '微软雅黑' };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  const rowNum = parseInt(range.split(':')[0].replace(/[A-Z]/g, ''));
  sheet.getRow(rowNum).height = 52;
}

/** 表头行：浅绿底、深绿粗体11号、居中、边框、行高36 */
function setHeader(sheet, rowNum, headers) {
  const row = sheet.getRow(rowNum);
  row.values = headers;
  row.height = 36;
  for (let c = 1; c <= headers.length; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
    cell.font = { bold: true, color: { argb: C.headerFont }, size: 11, name: '微软雅黑' };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }
}

/** 数据行样式：边框、字体、可选斑马纹 */
function styleDataRow(row, colCount, opts = {}) {
  const { zebra = false, centerCols = [], align = 'left' } = opts;
  row.height = 30;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.border = thinBorder;
    cell.font = { size: 11, name: '微软雅黑', color: { argb: C.dataFont } };
    if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebraBg } };
    cell.alignment = {
      horizontal: centerCols.includes(c) ? 'center' : align,
      vertical: 'middle',
      wrapText: true
    };
  }
}

/* ──────────────────────────────────────────────
   Sheet1：基本信息（分类 | 字段 | 内容）
   ────────────────────────────────────────────── */
function buildInfoSheet(workbook, task) {
  const sheet = workbook.addWorksheet('基本信息');
  const COLS = 3;
  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 20;
  sheet.getColumn(3).width = 70;

  setTitle(sheet, 'A1:C1', '一、基本信息');
  setHeader(sheet, 2, ['分类', '字段', '内容']);

  const sections = buildInfoSections(task);

  let rowNum = 3;
  for (const sec of sections) {
    const startRow = rowNum;
    for (const [key, value] of sec.items) {
      const row = sheet.getRow(rowNum);
      row.getCell(1).value = sec.name;
      row.getCell(2).value = key;
      row.getCell(3).value = val(value);
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.sectionBg } };
      row.getCell(1).font = { bold: true, size: 11, name: '微软雅黑', color: { argb: C.headerFont } };
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).font = { size: 11, name: '微软雅黑', color: { argb: C.dataFont } };
      row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      row.getCell(3).font = { size: 11, name: '微软雅黑', color: { argb: C.dataFont } };
      row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      for (let c = 1; c <= COLS; c++) row.getCell(c).border = thinBorder;
      row.height = 30;
      rowNum++;
    }
    if (sec.items.length > 1) sheet.mergeCells(`A${startRow}:A${rowNum - 1}`);
  }
  return sheet;
}

/* ──────────────────────────────────────────────
   Sheet2：尺寸规格（严格对照行业标准）
   列：序号 | 部位 | 测量方法 | S(cm) | M(cm) | L(cm) | 档差(cm) | 公差(±cm)
   斑马纹 + 底部红色备注
   ────────────────────────────────────────────── */
function buildSizeSheet(workbook, task) {
  const sheet = workbook.addWorksheet('尺寸规格');
  const data = parseSizeData(task);

  const sizeKeys = deriveSizeKeys(data);
  const baseSize = deriveBaseSize(task, sizeKeys);
  const colCount = 3 + sizeKeys.length + 2; // 序号+部位+测量方法 + 尺码列 + 档差+公差

  // 列宽
  sheet.getColumn(1).width = 8;    // 序号
  sheet.getColumn(2).width = 20;   // 部位
  sheet.getColumn(3).width = 50;   // 测量方法
  for (let i = 0; i < sizeKeys.length; i++) sheet.getColumn(4 + i).width = 10;
  sheet.getColumn(4 + sizeKeys.length).width = 11;     // 档差
  sheet.getColumn(5 + sizeKeys.length).width = 12;     // 公差

  const lastCol = colLetter(colCount);
  setTitle(sheet, `A1:${lastCol}1`, buildSizeTitle(task, sizeKeys));

  setHeader(sheet, 2, buildSizeHeaders(sizeKeys));

  if (!data.length) {
    const row = sheet.getRow(3);
    row.getCell(1).value = '（暂无尺寸数据）';
    sheet.mergeCells(`A3:${lastCol}3`);
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= colCount; c++) row.getCell(c).border = thinBorder;
    return sheet;
  }

  // 数据行：斑马纹
  const centerCols = [1, ...sizeKeys.map((_, i) => 4 + i), 4 + sizeKeys.length, 5 + sizeKeys.length];
  buildSizeRows(data, sizeKeys).forEach((row, i) => {
    const r = sheet.getRow(3 + i);
    r.getCell(1).value = row.index;
    r.getCell(2).value = val(row.name);
    r.getCell(3).value = val(row.method);
    sizeKeys.forEach((k, ki) => { r.getCell(4 + ki).value = row.values[ki]; });
    r.getCell(4 + sizeKeys.length).value = row.grading;
    r.getCell(5 + sizeKeys.length).value = row.tolerance;
    styleDataRow(r, colCount, { zebra: i % 2 === 1, centerCols });
  });

  // 底部备注行（红色小字，合并）
  const noteRowNum = 3 + data.length;
  const noteRow = sheet.getRow(noteRowNum);
  sheet.mergeCells(`A${noteRowNum}:${lastCol}${noteRowNum}`);
  noteRow.getCell(1).value = buildSizeNote(baseSize, sizeKeys.length);
  noteRow.getCell(1).font = { size: 10, name: '微软雅黑', color: { argb: C.noteFont } };
  noteRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
  for (let c = 1; c <= colCount; c++) noteRow.getCell(c).border = thinBorder;
  noteRow.height = 60;

  return sheet;
}

/* ──────────────────────────────────────────────
   Sheet3：物料清单 BOM
   ────────────────────────────────────────────── */
function buildBomSheet(workbook, items) {
  const sheet = workbook.addWorksheet('物料清单');
  const list = asList(items);
  const colCount = 11;

  [7, 11, 22, 16, 10, 8, 8, 14, 10, 10, 30].forEach((w, i) => sheet.getColumn(i + 1).width = w);

  setTitle(sheet, 'A1:K1', '三、物料清单（BOM）');
  setHeader(sheet, 2, BOM_HEADERS);

  if (!list.length) {
    const row = sheet.getRow(3);
    row.getCell(1).value = '（暂无物料数据）';
    sheet.mergeCells('A3:K3');
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= colCount; c++) row.getCell(c).border = thinBorder;
    return sheet;
  }

  const centerCols = [1, 6, 7, 9, 10];
  const { rows: bomRows, totalCost } = buildBomRows(list);
  bomRows.forEach((b, i) => {
    const r = sheet.getRow(3 + i);
    r.getCell(1).value = b.index;
    r.getCell(2).value = val(b.category);
    r.getCell(3).value = val(b.name);
    r.getCell(4).value = val(b.spec);
    r.getCell(5).value = val(b.color);
    r.getCell(6).value = val(b.unit);
    r.getCell(7).value = b.usage || '';
    r.getCell(8).value = val(b.supplier);
    r.getCell(9).value = b.price || '';
    r.getCell(10).value = b.subtotal;
    r.getCell(11).value = val(b.note);
    styleDataRow(r, colCount, { zebra: i % 2 === 1, centerCols });
  });

  // 合计行
  const tr = sheet.getRow(3 + list.length);
  sheet.mergeCells(`A${3 + list.length}:I${3 + list.length}`);
  tr.getCell(1).value = '单件成本合计';
  tr.getCell(1).font = { bold: true, size: 12, name: '微软雅黑', color: { argb: C.headerFont } };
  tr.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  tr.getCell(10).value = totalCost;
  tr.getCell(10).font = { bold: true, size: 12, name: '微软雅黑', color: { argb: C.totalFont } };
  tr.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
  tr.getCell(11).value = '';
  for (let c = 1; c <= colCount; c++) {
    tr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalBg } };
    tr.getCell(c).border = thinBorder;
  }
  tr.height = 32;
  return sheet;
}

/* ──────────────────────────────────────────────
   Sheet4：工艺指示
   ────────────────────────────────────────────── */
function buildProcessSheet(workbook, items) {
  const sheet = workbook.addWorksheet('工艺指示');
  const list = asList(items);
  const colCount = 6;

  sheet.getColumn(1).width = 7;
  sheet.getColumn(2).width = 13;
  sheet.getColumn(3).width = 20;
  sheet.getColumn(4).width = 60;
  sheet.getColumn(5).width = 35;
  sheet.getColumn(6).width = 24;

  setTitle(sheet, 'A1:F1', '四、工艺指示');
  setHeader(sheet, 2, PROCESS_HEADERS);

  if (!list.length) {
    const row = sheet.getRow(3);
    row.getCell(1).value = '（暂无工艺数据）';
    sheet.mergeCells('A3:F3');
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= colCount; c++) row.getCell(c).border = thinBorder;
    return sheet;
  }

  buildProcessRows(list).forEach((p, i) => {
    const r = sheet.getRow(3 + i);
    r.getCell(1).value = p.index;
    r.getCell(2).value = val(p.section);
    r.getCell(3).value = val(p.name);
    r.getCell(4).value = val(p.requirement);
    r.getCell(5).value = val(p.standard);
    r.getCell(6).value = val(p.note);
    styleDataRow(r, colCount, { zebra: i % 2 === 1, centerCols: [1], align: 'left' });
    // 工艺要求/质量标准用 top 对齐
    r.getCell(4).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    r.getCell(5).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    r.height = 40;
  });
  return sheet;
}

/* ──────────────────────────────────────────────
   下载 / 文件名 / 总入口
   ────────────────────────────────────────────── */
export function getTechPackFileName(task) {
  return buildTechPackFileName(task, 'xlsx');
}

export async function exportTechPack(task, bomItems, processItems, run) {
  // REQ-005 尺寸表归属版次：run 为当前选中批次，覆盖导出用的尺寸表/尺码/件数（批次级权威）
  task = applyRunOverride(task, run);
  if (!task) return;
  const workbook = new ExcelJS.Workbook();
  buildInfoSheet(workbook, task);
  buildSizeSheet(workbook, task);
  buildBomSheet(workbook, bomItems);
  buildProcessSheet(workbook, processItems);
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = getTechPackFileName(task);
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
  return fileName;
}
