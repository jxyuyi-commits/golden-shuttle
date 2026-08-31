// 通用数据导出引擎：Excel(多sheet) / CSV / JSON
// 依赖：xlsx (SheetJS)。所有导出场景（看板列表、工艺单、BOM、备份）统一走这里。
import * as XLSX from 'xlsx';

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

/** 按内容估算列宽（中文按 2 字符，上限 60） */
function autoWidthCols(rows) {
  if (!rows || !rows.length) return [];
  const colCount = Math.max(...rows.map(r => r.length));
  const widths = [];
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
    widths.push({ wch: Math.min(Math.max(max + 3, 8), 60) });
  }
  return widths;
}

/**
 * 导出 Excel（可含多个工作表）
 * @param {{ fileName: string, sheets: {name:string, rows:any[][]}[] }} opts
 */
export function exportExcel({ fileName, sheets }) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows || []);
    ws['!cols'] = autoWidthCols(s.rows || []);
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(s.name));
  }
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    fileName
  );
}

/** 导出 CSV（UTF-8 BOM 防 Excel 中文乱码） */
export function exportCSV({ fileName, rows }) {
  const ws = XLSX.utils.aoa_to_sheet(rows || []);
  const csv = XLSX.utils.sheet_to_csv(ws);
  downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), fileName);
}

/** 导出 JSON 备份 */
export function exportJSON({ fileName, data }) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), fileName);
}

/** 当前时间戳用于文件名：20260828_1530 */
export function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
