// 通用数据导出引擎：Excel（多 sheet）
// 依赖：exceljs（渲染进程可用；工艺单 exportTechPack.js 已同用此库）。
// 所有导出场景（看板列表等）统一走这里。
//
// 历史：原实现基于 SheetJS(xlsx)。G16 迁至 exceljs，以移除 xlsx 依赖、
// 消除其已知 CVE（CVE-2023-30533 原型污染 / CVE-2024-22363 ReDoS），并统一导出栈。
// 迁移验收口径：与迁移前导出**逐单元格 值+类型 完全等价**（空白单元格同样保持为
// 空白——见 normalizeCell 注释），外加以 '=' 开头的字符串不得被当作公式。
import ExcelJS from 'exceljs';

/** 触发浏览器下载 */
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** sheet 名最多 31 字符，去除 Excel 非法字符 */
function sanitizeSheetName(name) {
  const cleaned = String(name).replace(/[\\/?*[\]:]/g, '').slice(0, 31);
  return cleaned || 'Sheet';
}

/**
 * 单元格值归一化：**保持原始类型，杜绝任何隐式推断**。
 * - number  → number（数字单元格，含 0 / 负数 / 小数）
 * - 空值（null / undefined / 空串 ''）→ null（写为**空白单元格**）
 *     迁移前 SheetJS 的 aoa_to_sheet 对 '' 即产出空白单元格，故此处同样落空白，
 *     以保证逐格等价、且空值绝不会变成 0 / NaN / Date（Excel 侧 ISBLANK 语义一致）。
 * - 其它   → 原样字符串（含以 '=' 开头、含换行的多行、形如日期的文本）
 *     exceljs 的 addRow 只按 JS 类型建格，不会把字符串解析成公式或日期（已实测）。
 */
function normalizeCell(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  return String(value);
}

/**
 * 按内容估算列宽（中文按 2 字符，上限 60，下限 8）。
 * 直接产出 exceljs 的列定义 `{ width }`（width 与旧 SheetJS 的 `!cols[].wch` 同为「字符数」量纲，可直接沿用）。
 */
function autoWidthCols(rows) {
  if (!rows || !rows.length) return [];
  const colCount = Math.max(...rows.map(r => r.length));
  const cols = [];
  for (let c = 0; c < colCount; c++) {
    let max = 0;
    for (const row of rows) {
      const cell = row[c];
      if (cell == null) continue;
      const s = String(cell);
      let w = 0;
      for (const ch of s) w += ch.charCodeAt(0) > 255 ? 2 : 1;
      max = Math.max(max, w);
    }
    cols.push({ width: Math.min(Math.max(max + 3, 8), 60) });
  }
  return cols;
}

/**
 * 导出 Excel（可含多个工作表）。
 * @param {{ fileName: string, sheets: { name: string, rows: any[][] }[] }} opts
 *   多 sheet；sheet 名经 sanitizeSheetName 清洗；列宽由 autoWidthCols 换算。
 * @returns {Promise<void>} exceljs 的 writeBuffer() 为异步，故本函数为 async ——
 *   调用方需 await（迁移前为同步、无返回值；此处仅「何时完成」由同步变异步）。
 */
export async function exportExcel({ fileName, sheets }) {
  const workbook = new ExcelJS.Workbook();
  for (const s of sheets) {
    const rows = s.rows || [];
    const worksheet = workbook.addWorksheet(sanitizeSheetName(s.name));
    const cols = autoWidthCols(rows);
    if (cols.length) worksheet.columns = cols;
    for (const row of rows) {
      worksheet.addRow(Array.isArray(row) ? row.map(normalizeCell) : row);
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    fileName
  );
}

/** 当前时间戳用于文件名：20260828_1530 */
export function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
