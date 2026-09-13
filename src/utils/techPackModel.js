// 工艺单（Tech Pack）共享数据模型：Excel（exportTechPack.js）与 PDF（exportTechPackPdf.js）
// 两条导出路径的唯一「数据与逻辑」来源。
//
// ⚠️ 边界（重要，勿越界）：
//   本模块只承载**数据与业务逻辑**（字段取值、尺寸表推导、BOM 合计、状态语义映射、文件名构造…），
//   **刻意不承载任何渲染取值**。两条路径的渲染取值本来就不一致、且是有意为之：
//     · 颜色格式：Excel 用 argb（如 'FF1F4538'）；PDF 用 hex（如 '#1F4538'）
//     · 斑马纹：  Excel 'C6E0B4'           ↔ PDF 'EDF4E7'
//     · 边框：    Excel '404040'           ↔ PDF '8A8A8A'
//   因此**不要**把颜色表合并成一份共用常量、不要「顺手统一」色值；列宽、字号、行高、
//   斑马纹、边框同理。可以共享的只是颜色的**语义键与语义映射**（见 COLOR_ROLES / pickColors），
//   具体色值仍留在各自文件里。
//
//   同理，各字段的「空值 → 占位符」渲染规则也**有意不同**，务必按原样保留：
//     · Excel val(v)：'' / null / undefined → '—'（DASH）
//     · PDF   cell(v)：'' → ''（保持空串）；null / undefined → '—'
//   故本模块只输出**原始数据**，由各文件自行套用各自的 val/cell 规则，勿在此处统一。
//
// 依赖：仅 ./exporter 的 timestamp（文件名用）。无 exceljs / pdfmake 依赖。
import { timestamp } from './exporter';

/* ──────────────────────────────────────────────
   状态 / 占位符语义映射（纯数据）
   ────────────────────────────────────────────── */

/** 工作动态节点状态 → 中文 */
export const NODE_STATUS_CN = { pending: '待开始', active: '进行中', completed: '已完成', done: '已完成' };

/** 看板状态 → 中文 */
export const STATUS_CN = { done: '已完结', doing: '打版中', pending: '待处理', todo: '待处理' };

/** 空值占位符 */
export const DASH = '—';

/**
 * 配色**语义角色**表：role → 含义。
 * 两条导出路径共用这一套语义键（防止键名各自漂移），但**具体色值各自持有**，
 * 且故意不同（Excel argb / PDF hex）。本表不含任何色值。
 */
export const COLOR_ROLES = {
  titleBg: '标题栏底色',
  titleFont: '标题栏文字色',
  headerBg: '表头底色',
  headerFont: '表头文字色（亦作分类列文字色）',
  zebraBg: '斑马纹底色',
  sectionBg: '分类列底色',
  totalBg: '合计行底色',
  totalFont: '合计金额文字色',
  border: '边框色',
  noteFont: '备注文字色',
  dataFont: '正文文字色',
};

/**
 * 按共用语义角色表过滤本文件提供的色值：
 * 只保留 COLOR_ROLES 中存在的键，从而保证两版导出的 `C` 键名同源（值仍各自持有）。
 * @param {Record<string,string>} values 本文件的具体色值（键名 = COLOR_ROLES 的角色名）
 * @returns {Record<string,string>}
 */
export function pickColors(values) {
  const out = {};
  for (const role of Object.keys(COLOR_ROLES)) {
    if (Object.prototype.hasOwnProperty.call(values, role)) out[role] = values[role];
  }
  return out;
}

/* ──────────────────────────────────────────────
   通用工具函数
   ────────────────────────────────────────────── */

/**
 * 日期归一化：'2026-9-1' / '2026/9/1' / '2026.9.1' → 'YYYY-MM-DD'；
 * '9/1' 这类缺年补 fallbackYear（缺省当年）；无法识别则原样返回。空值 → ''。
 * @param {unknown} d
 * @param {string|number} [fallbackYear]
 * @returns {string}
 */
export function formatDate(d, fallbackYear) {
  if (!d) return '';
  const s = String(d).trim();
  if (!s) return '';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{1,2})[/.](\d{1,2})$/);
  if (m2) {
    const y = fallbackYear || new Date().getFullYear();
    return `${y}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
  }
  return s;
}

/** 清理公差格式："(±) 0.5" → "0.5"，"±0.5" → "0.5"；空值 → '' */
export function cleanTolerance(t) {
  if (!t) return '';
  return String(t).replace(/[（(]?\s*[±＋+]\s*[）)]?\s*/g, '').trim();
}

/** 解析 size_data（可能是 JSON 字符串）→ 数组；非法则 [] */
export function parseSizeData(task) {
  let sd = task?.size_data;
  if (typeof sd === 'string') {
    try {
      sd = JSON.parse(sd || '[]');
    } catch {
      sd = [];
    }
  }
  return Array.isArray(sd) ? sd : [];
}

/** 解析单行的 size_values（可能是 JSON 字符串）→ 对象；非法则 {} */
export function parseSizeValues(v) {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v || '{}');
    } catch {
      return {};
    }
  }
  return v || {};
}

/** 空值 → DASH（供各渲染器自行决定是否套用；PDF 的 cell() 对 '' 例外） */
export function val(v) {
  if (v === null || v === undefined || v === '') return DASH;
  return v;
}

/** 统一数组化：非数组 → []（BOM / 工艺清单的通用入口） */
export function asList(items) {
  return Array.isArray(items) ? items : [];
}

/**
 * 触发浏览器下载（Excel 与 PDF 两条路径共用）。
 * 注意：与 exporter.js 的 downloadBlob 有意不同——此处延迟 1s 撤销 URL，
 * 避免部分环境仍在使用该 URL 时被过早回收。
 * @param {Blob} blob
 * @param {string} fileName
 */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ──────────────────────────────────────────────
   REQ-005：尺寸表归属版次（批次级权威）
   ────────────────────────────────────────────── */

/**
 * run 为当前选中批次，覆盖导出用的尺寸表/尺码/件数。
 * @param {object} task
 * @param {object|null|undefined} run
 * @returns {object} 覆盖后的 task（无 run 时原样返回）
 */
export function applyRunOverride(task, run) {
  if (!run) return task;
  return {
    ...task,
    size: run.size || task.size,
    sample_count: run.sample_count || task.sample_count,
    size_data: run.size_data || task.size_data,
  };
}

/* ──────────────────────────────────────────────
   一、基本信息（分类 | 字段 | 内容）—— 纯数据
   ────────────────────────────────────────────── */

/**
 * 组装基本信息 sections（含款基础信息/打样信息/日期/工作动态/说明与反馈）。
 * 返回值仅含文案数据，不含任何样式；顺序即渲染顺序。
 * @param {object} task
 * @returns {{ name: string, items: [string, unknown][] }[]}
 */
export function buildInfoSections(task) {
  const year = task.year || '';
  let cleanNote = task.note || '';
  if (cleanNote.startsWith('工作动态：') || cleanNote.startsWith('工作动态:')) cleanNote = '';

  const sections = [
    { name: '款式基础信息', items: [
      ['款号', task.style_no], ['款式名称', task.title], ['类别', task.category],
      ['品牌', task.brand], ['设计师', task.designer],
      ['时段', [task.year, task.season, task.month].filter(Boolean).join(' ')],
    ] },
    { name: '打样信息', items: [
      ['版单号', task.order_no], ['版次', task.sample_type], ['样衣颜色', task.sample_color],
      ['尺码', task.size], ['件数', task.sample_count ? `${task.sample_count}件` : ''],
      ['优先级', task.priority], ['审核状态', task.audit_status],
      ['看板状态', STATUS_CN[task.status] || task.status || ''],
    ] },
    { name: '日期', items: [
      ['面料到库日期', formatDate(task.fabric_date, year)],
      ['任务开始日期', formatDate(task.start_date, year)],
      ['预计完工日期', formatDate(task.expected_date, year)],
      ['实际完工日期', formatDate(task.finish_date, year)],
    ] },
  ];

  sections.push({ name: '工作动态', items: buildTimelineItems(task.progress_nodes, year) });

  sections.push({ name: '说明与反馈', items: [
    ['款式说明/打样重点', cleanNote], ['物料要求', task.fabric_req],
    ['辅料要求', task.trim_req], ['工艺建议/注意事项', task.process_req],
    ['审版意见/修改反馈', task.audit_comment],
  ] });

  return sections;
}

/**
 * 工作动态行：[节点名, 汇总文案]。无记录时返回 [['无记录','']]。
 * 汇总文案 = 「状态 日期」｜「负责人:X；备注」（各段为空则省略）。
 * @param {object[]} nodes progress_nodes
 * @param {string|number} year 缺年日期的补全年份
 * @returns {[string, string][]}
 */
export function buildTimelineItems(nodes, year) {
  const list = Array.isArray(nodes) ? nodes : [];
  if (!list.length) return [['无记录', '']];
  return list.map((n) => {
    const st = NODE_STATUS_CN[n.status] || n.status || '';
    const date = formatDate(n.date, year);
    const meta = [st, date].filter(Boolean).join(' ');
    const extra = [n.by ? `负责人:${n.by}` : '', n.note || ''].filter(Boolean).join('；');
    return [n.label || '（未命名）', [meta, extra].filter(Boolean).join('｜')];
  });
}

/* ──────────────────────────────────────────────
   二、尺寸规格 —— 纯数据推导
   ────────────────────────────────────────────── */

/**
 * 从尺寸表推导尺码列 key 顺序：逐行取 size_values 的键，跳过 `*_manual`，跨行去重保序。
 * @param {object[]} sizeData
 * @returns {string[]}
 */
export function deriveSizeKeys(sizeData) {
  const keys = [];
  for (const row of sizeData) {
    for (const k of Object.keys(parseSizeValues(row.size_values))) {
      if (k.endsWith('_manual')) continue;
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

/** 基码：task.size → 第二码 → 第一码 → 'M' */
export function deriveBaseSize(task, sizeKeys) {
  return task.size || sizeKeys[1] || sizeKeys[0] || 'M';
}

/** 尺码汇总：'S/M/L三码'（无码 → '—'） */
export function sizeSummaryLabel(sizeKeys) {
  return sizeKeys.length ? `${sizeKeys.join('/')}三码` : '—';
}

/** 尺寸表标题（Excel 与 PDF 共用文案）：'二、尺寸规格（基码M，S/M/L三码）' */
export function buildSizeTitle(task, sizeKeys) {
  return `二、尺寸规格（基码${deriveBaseSize(task, sizeKeys)}，${sizeSummaryLabel(sizeKeys)}）`;
}

/** 尺寸表表头（含各码列） */
export function buildSizeHeaders(sizeKeys) {
  return ['序号', '部位', '测量方法', ...sizeKeys.map((k) => `${k}(cm)`), '档差(cm)', '公差(±cm)'];
}

/**
 * 尺寸表数据行（原始数据；空值占位由各渲染器自行处理）：
 *   { index, name, method, values: 各码原始值, grading, tolerance: 已 cleanTolerance }
 * @param {object[]} sizeData
 * @param {string[]} sizeKeys
 */
export function buildSizeRows(sizeData, sizeKeys) {
  return sizeData.map((row, i) => {
    const sv = parseSizeValues(row.size_values);
    return {
      index: i + 1,
      name: row.name,
      method: row.method,
      values: sizeKeys.map((k) => sv[k] ?? ''),
      grading: row.grading ?? '',
      tolerance: cleanTolerance(row.tolerance),
    };
  });
}

/** 尺寸表底部备注文案（Excel 与 PDF 完全一致） */
export function buildSizeNote(baseSize, sizeCount) {
  return `备注：基码${baseSize}，共${sizeCount}码；公差按品牌基线执行（衣长±0.5／胸围±1／袖长±0.5／其余±0.3），具体以封样确认样衣为准。`;
}

/* ──────────────────────────────────────────────
   三、物料清单 BOM —— 纯数据 + 合计
   ────────────────────────────────────────────── */

/**
 * BOM 行 + 合计：单耗/单价按 parseFloat 解析（非法 → 0），小计 = 单耗×单价
 * （非 0 时保留 2 位小数，为 0 时留空 ''）；totalCost = 全部小计之和（保留 2 位）。
 * @param {object[]} items
 * @returns {{ rows: object[], totalCost: number }}
 */
export function buildBomRows(items) {
  const list = asList(items);
  let totalCost = 0;
  const rows = list.map((b, i) => {
    const usage = parseFloat(b.usage) || 0;
    const price = parseFloat(b.price) || 0;
    const subtotal = usage * price;
    totalCost += subtotal;
    return {
      index: i + 1,
      category: b.category,
      name: b.name,
      spec: b.spec,
      color: b.color,
      unit: b.unit,
      usage,
      supplier: b.supplier,
      price,
      subtotal: subtotal ? Number(subtotal.toFixed(2)) : '',
      note: b.note,
    };
  });
  return { rows, totalCost: Number(totalCost.toFixed(2)) };
}

/** BOM 表头（11 列） */
export const BOM_HEADERS = ['序号', '类别', '物料名称', '规格', '颜色', '单位', '单耗', '供应商', '单价(元)', '小计(元)', '备注'];

/* ──────────────────────────────────────────────
   四、工艺指示 —— 纯数据
   ────────────────────────────────────────────── */

/** 工艺指示表头（6 列） */
export const PROCESS_HEADERS = ['序号', '工艺分类', '工艺名称', '工艺要求', '质量标准', '备注'];

/**
 * 工艺指示行：{ index, section, name, requirement, standard, note }
 * @param {object[]} items
 */
export function buildProcessRows(items) {
  return asList(items).map((p, i) => ({
    index: i + 1,
    section: p.section,
    name: p.name,
    requirement: p.requirement,
    standard: p.standard,
    note: p.note,
  }));
}

/* ──────────────────────────────────────────────
   文件名
   ────────────────────────────────────────────── */

/**
 * 工艺单文件名：`工艺单_<款号><_版单号>_<时间戳>.<ext>`。
 * Excel 与 PDF 仅扩展名不同，故共用同一构造逻辑。
 * @param {object} task
 * @param {string} ext 扩展名（'xlsx' / 'pdf'）
 * @returns {string}
 */
export function buildTechPackFileName(task, ext) {
  const styleNo = task?.style_no || 'unknown';
  const orderNo = task?.order_no || '';
  return `工艺单_${styleNo}${orderNo ? '_' + orderNo : ''}_${timestamp()}.${ext}`;
}
