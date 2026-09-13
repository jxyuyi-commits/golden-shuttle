/**
 * G15 护栏：共享导出数据模型 techPackModel 单元测试
 * ------------------------------------------------------------------
 * techPackModel.js 是工艺单 Excel 与 PDF 两条导出路径的**单一真相源**，
 * 因此直接测它就同时覆盖两条路径；本文件不依赖任何外部基线快照，clone 后即可跑。
 *
 * 覆盖范围：日期/公差/尺寸数据解析、尺码列推导、基码四级回落、尺寸表文案与行结构、
 * BOM 小计与合计（含浮点边界）、工艺行、基本信息 sections 与工作动态、文件名构造，
 * 以及「尺寸表标题基码与备注基码同源」的口径锁定。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  NODE_STATUS_CN,
  STATUS_CN,
  DASH,
  formatDate,
  cleanTolerance,
  parseSizeData,
  parseSizeValues,
  val,
  asList,
  deriveSizeKeys,
  deriveBaseSize,
  sizeSummaryLabel,
  buildSizeTitle,
  buildSizeHeaders,
  buildSizeRows,
  buildSizeNote,
  buildInfoSections,
  buildTimelineItems,
  buildBomRows,
  BOM_HEADERS,
  PROCESS_HEADERS,
  buildProcessRows,
  buildTechPackFileName,
} from '../../src/utils/techPackModel.js';

/* ─────────────── formatDate ─────────────── */
describe('formatDate：日期归一化', () => {
  it('空值（null/undefined/空串/纯空白）→ 空串', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('   ')).toBe('');
  });

  it('已是 YYYY-M-D 形式 → 原样返回（不补零）', () => {
    expect(formatDate('2026-9-1')).toBe('2026-9-1');
    expect(formatDate('2026-09-01')).toBe('2026-09-01');
  });

  it('YYYY/M/D 与 YYYY.M.D → 补零为 YYYY-MM-DD', () => {
    expect(formatDate('2026/9/1')).toBe('2026-09-01');
    expect(formatDate('2026.9.1')).toBe('2026-09-01');
    expect(formatDate('2026/12/31')).toBe('2026-12-31');
  });

  it('缺年 M/D → 用传入的 fallbackYear 补齐', () => {
    expect(formatDate('9/1', '2026')).toBe('2026-09-01');
    expect(formatDate('9.1', 2025)).toBe('2025-09-01');
  });

  it('缺年 M/D 且无 fallbackYear → 用当前年份', () => {
    const y = new Date().getFullYear();
    expect(formatDate('9/1')).toBe(`${y}-09-01`);
  });

  it('无法识别的输入 → 原样返回（去首尾空白）', () => {
    expect(formatDate('下周一到货')).toBe('下周一到货');
    expect(formatDate('  2026年第9周  ')).toBe('2026年第9周');
  });
});

/* ─────────────── cleanTolerance ─────────────── */
describe('cleanTolerance：公差文本清理', () => {
  it('空值 → 空串', () => {
    expect(cleanTolerance(null)).toBe('');
    expect(cleanTolerance(undefined)).toBe('');
    expect(cleanTolerance('')).toBe('');
  });

  it('去掉 (±)／±／＋ 等符号，只留数值文本', () => {
    expect(cleanTolerance('(±) 0.5')).toBe('0.5');
    expect(cleanTolerance('±0.5')).toBe('0.5');
    expect(cleanTolerance('（±）0.3')).toBe('0.3');
    expect(cleanTolerance('+ 1')).toBe('1');
    expect(cleanTolerance('0.5')).toBe('0.5');
    expect(cleanTolerance(0.5)).toBe('0.5');
  });
});

/* ─────────────── parseSizeData / parseSizeValues ─────────────── */
describe('parseSizeData / parseSizeValues：尺寸数据结构解析', () => {
  it('size_data 为 JSON 字符串 → 解析为数组', () => {
    expect(parseSizeData({ size_data: '[{"name":"衣长"}]' })).toEqual([{ name: '衣长' }]);
    expect(parseSizeData({ size_data: '[]' })).toEqual([]);
  });

  it('size_data 已是数组 → 原样返回', () => {
    const arr = [{ name: '衣长' }];
    expect(parseSizeData({ size_data: arr })).toBe(arr);
  });

  it('size_data 为脏值（非法 JSON／非数组／缺失）→ []', () => {
    expect(parseSizeData({ size_data: '{不是数组' })).toEqual([]);
    expect(parseSizeData({ size_data: { a: 1 } })).toEqual([]);
    expect(parseSizeData({ size_data: null })).toEqual([]);
    expect(parseSizeData({})).toEqual([]);
    expect(parseSizeData(null)).toEqual([]);
  });

  it('size_values 为 JSON 字符串 → 对象；非法 → {}', () => {
    expect(parseSizeValues('{"S":100,"M":102}')).toEqual({ S: 100, M: 102 });
    expect(parseSizeValues('坏数据')).toEqual({});
    expect(parseSizeValues('')).toEqual({});
  });

  it('size_values 已是对象 → 原样；null → {}', () => {
    const o = { S: 1 };
    expect(parseSizeValues(o)).toBe(o);
    expect(parseSizeValues(null)).toEqual({});
    expect(parseSizeValues(undefined)).toEqual({});
  });
});

/* ─────────────── val / asList ─────────────── */
describe('val / asList：空值与数组化', () => {
  it('val：null / undefined / 空串 → DASH', () => {
    expect(val(null)).toBe(DASH);
    expect(val(undefined)).toBe(DASH);
    expect(val('')).toBe(DASH);
    expect(DASH).toBe('—');
  });

  it('val：0 与 false 属于「有值」，不替换为 DASH', () => {
    expect(val(0)).toBe(0);
    expect(val(false)).toBe(false);
    expect(val('0')).toBe('0');
    expect(val(100)).toBe(100);
  });

  it('asList：数组原样返回，其它 → []', () => {
    const arr = [1, 2];
    expect(asList(arr)).toBe(arr);
    expect(asList(undefined)).toEqual([]);
    expect(asList(null)).toEqual([]);
    expect(asList({ length: 1 })).toEqual([]);
    expect(asList('abc')).toEqual([]);
  });

  it('状态语义映射常量齐备', () => {
    expect(NODE_STATUS_CN).toEqual({ pending: '待开始', active: '进行中', completed: '已完成', done: '已完成' });
    expect(STATUS_CN).toEqual({ done: '已完结', doing: '打版中', pending: '待处理', todo: '待处理' });
  });
});

/* ─────────────── deriveSizeKeys ─────────────── */
describe('deriveSizeKeys：尺码列 key 推导', () => {
  it('跳过 `*_manual` 键', () => {
    const data = [{ size_values: { S: 1, M: 2, L: 3, S_manual: 9, M_manual: 8 } }];
    expect(deriveSizeKeys(data)).toEqual(['S', 'M', 'L']);
  });

  it('跨行去重且保持首次出现顺序', () => {
    const data = [
      { size_values: { M: 1, S: 2 } },
      { size_values: { S: 9, L: 3 } },
      { size_values: { M: 4, S: 5 } },
    ];
    expect(deriveSizeKeys(data)).toEqual(['M', 'S', 'L']);
  });

  it('支持 size_values 为 JSON 字符串', () => {
    const data = [{ size_values: '{"S":1,"M":2}' }];
    expect(deriveSizeKeys(data)).toEqual(['S', 'M']);
  });

  it('后续行新增的尺码追加到末尾', () => {
    const data = [{ size_values: { S: 1 } }, { size_values: { XL: 1, S: 2 } }];
    expect(deriveSizeKeys(data)).toEqual(['S', 'XL']);
  });

  it('空尺寸表 → []', () => {
    expect(deriveSizeKeys([])).toEqual([]);
  });
});

/* ─────────────── deriveBaseSize 四级回落 ─────────────── */
describe('deriveBaseSize：基码四级回落', () => {
  it('① task.size 优先（非空即用）', () => {
    expect(deriveBaseSize({ size: 'L' }, ['S', 'M', 'L'])).toBe('L');
  });

  it('② task.size 为空 → 回落 sizeKeys[1]', () => {
    expect(deriveBaseSize({ size: '' }, ['XS', 'S', 'M'])).toBe('S');
    expect(deriveBaseSize({}, ['XS', 'S', 'M'])).toBe('S');
  });

  it('③ 无第二码 → 再回落 sizeKeys[0]', () => {
    expect(deriveBaseSize({ size: '' }, ['XS'])).toBe('XS');
    expect(deriveBaseSize({ size: null }, ['XL'])).toBe('XL');
  });

  it('④ 无任何码 → 最后回落 "M"', () => {
    expect(deriveBaseSize({ size: '' }, [])).toBe('M');
    expect(deriveBaseSize({}, [])).toBe('M');
  });
});

/* ─────────────── 尺寸表文案与结构 ─────────────── */
describe('尺寸表文案与行结构', () => {
  it('sizeSummaryLabel：有码拼接三码，无码为 —', () => {
    expect(sizeSummaryLabel(['S', 'M', 'L'])).toBe('S/M/L三码');
    expect(sizeSummaryLabel(['XS', 'S', 'M'])).toBe('XS/S/M三码');
    expect(sizeSummaryLabel([])).toBe('—');
  });

  it('buildSizeTitle：标题基码取 deriveBaseSize（不是 task.size||"M"）', () => {
    // task.size 为空且第二码 ≠ 'M'：必须取第二码 'S'
    expect(buildSizeTitle({ size: '' }, ['XS', 'S', 'M'])).toBe('二、尺寸规格（基码S，XS/S/M三码）');
    // task.size 非空优先
    expect(buildSizeTitle({ size: 'L' }, ['S', 'M', 'L'])).toBe('二、尺寸规格（基码L，S/M/L三码）');
    // 无尺寸数据
    expect(buildSizeTitle({ size: 'M' }, [])).toBe('二、尺寸规格（基码M，—）');
  });

  it('buildSizeNote：底部备注文案（基码 + 码数）', () => {
    expect(buildSizeNote('S', 3)).toBe(
      '备注：基码S，共3码；公差按品牌基线执行（衣长±0.5／胸围±1／袖长±0.5／其余±0.3），具体以封样确认样衣为准。'
    );
    expect(buildSizeNote('M', 0)).toContain('基码M，共0码');
  });

  it('buildSizeHeaders：插入各码列于部位/方法之后、档差公差之前', () => {
    expect(buildSizeHeaders(['S', 'M'])).toEqual([
      '序号', '部位', '测量方法', 'S(cm)', 'M(cm)', '档差(cm)', '公差(±cm)',
    ]);
  });

  it('buildSizeRows：序号/各码原始值/grading 保留 0/公差清理/缺码补空串', () => {
    const data = [
      { name: '衣长', method: '后领中点至下摆', size_values: { S: 100, M: 102, S_manual: 99 }, grading: 2, tolerance: '(±) 0.5' },
      { name: '', method: '', size_values: { S: 84 }, grading: 0, tolerance: null },
      { size_values: {} },
    ];
    const keys = deriveSizeKeys(data);
    expect(keys).toEqual(['S', 'M']);
    const rows = buildSizeRows(data, keys);

    expect(rows[0]).toEqual({ index: 1, name: '衣长', method: '后领中点至下摆', values: [100, 102], grading: 2, tolerance: '0.5' });
    // grading === 0 必须保留为 0（不是空串）；缺 M 码补空串；tolerance 空 → ''
    expect(rows[1]).toEqual({ index: 2, name: '', method: '', values: [84, ''], grading: 0, tolerance: '' });
    // 缺 name/method/grading → 保持原始 undefined / ''（占位由各渲染器自行处理）
    expect(rows[2].index).toBe(3);
    expect(rows[2].grading).toBe('');
    expect(rows[2].values).toEqual(['', '']);
  });

  it('【口径锁定】尺寸表标题基码与底部备注基码必须同源（deriveBaseSize）', () => {
    const task = {
      size: '',
      size_data: [{ name: '衣长', method: 'm', size_values: { XS: 98, S: 100, M: 102 }, grading: 2, tolerance: '±0.5' }],
    };
    const keys = deriveSizeKeys(parseSizeData(task));
    const base = deriveBaseSize(task, keys);

    expect(base).toBe('S'); // 不是 'M'
    // 标题（Excel 与 PDF 两条路径都用 buildSizeTitle）与备注必须含同一基码
    expect(buildSizeTitle(task, keys)).toContain(`基码${base}`);
    expect(buildSizeNote(base, keys.length)).toContain(`基码${base}`);
    expect(buildSizeTitle(task, keys)).toBe('二、尺寸规格（基码S，XS/S/M三码）');
    expect(buildSizeNote(base, keys.length)).toContain('备注：基码S，共3码');
  });
});

/* ─────────────── buildBomRows ─────────────── */
describe('buildBomRows：BOM 小计与合计', () => {
  it('空/非数组清单 → rows 空、totalCost 0', () => {
    expect(buildBomRows([])).toEqual({ rows: [], totalCost: 0 });
    expect(buildBomRows(null)).toEqual({ rows: [], totalCost: 0 });
    expect(buildBomRows('x')).toEqual({ rows: [], totalCost: 0 });
  });

  it('小计 = 单耗×单价（非 0 保留 2 位），合计 = 各行小计之和（Number(toFixed(2))）', () => {
    const { rows, totalCost } = buildBomRows([
      { usage: '2.5', price: '12.345' }, // 30.8625 → 30.86
      { usage: '1.5', price: '10' },     // 15
    ]);
    expect(rows[0].subtotal).toBe(30.86);
    expect(rows[1].subtotal).toBe(15);
    // 合计对「未取整的原始小计」求和再取整：30.8625 + 15 = 45.8625 → 45.86
    expect(totalCost).toBe(45.86);
    expect(rows[0].index).toBe(1);
    expect(rows[1].index).toBe(2);
    expect(typeof rows[0].usage).toBe('number');
    expect(typeof rows[0].price).toBe('number');
  });

  it('浮点误差被 toFixed(2) 抹平（0.1 + 0.2 → 0.3 而非 0.30000000000000004）', () => {
    const { rows, totalCost } = buildBomRows([
      { usage: '0.1', price: '1' },
      { usage: '0.2', price: '1' },
    ]);
    expect(rows[0].subtotal).toBe(0.1);
    expect(rows[1].subtotal).toBe(0.2);
    expect(totalCost).toBe(0.3);
  });

  it('单耗/单价为空或非数字 → 按 0 计；小计为 0 时留空串且不影响合计', () => {
    const { rows, totalCost } = buildBomRows([
      { usage: '', price: 10 },   // 0 × 10 = 0 → 小计 ''（空单耗）
      { usage: 'abc', price: '5' }, // NaN → 0 → 小计 ''
      { usage: '3', price: '' },  // 3 × 0 = 0 → 小计 ''
      { usage: 2, price: 4 },     // 8
    ]);
    expect(rows[0].subtotal).toBe('');
    expect(rows[1].subtotal).toBe('');
    expect(rows[2].subtotal).toBe('');
    expect(rows[3].subtotal).toBe(8);
    expect(rows[0].usage).toBe(0);
    expect(rows[3].usage).toBe(2);
    expect(totalCost).toBe(8);
  });

  it('原样透传展示字段（category/name/spec/color/unit/supplier/note）', () => {
    const { rows } = buildBomRows([{ category: '主料', name: '醋酸缎面', spec: '150cm', color: '蓝', unit: '米', supplier: '厂', note: '备注' }]);
    expect(rows[0]).toMatchObject({ category: '主料', name: '醋酸缎面', spec: '150cm', color: '蓝', unit: '米', supplier: '厂', note: '备注' });
  });
});

/* ─────────────── buildProcessRows / 表头常量 ─────────────── */
describe('buildProcessRows 与表头常量', () => {
  it('BOM 表头 11 列、工艺表头 6 列', () => {
    expect(BOM_HEADERS).toEqual(['序号', '类别', '物料名称', '规格', '颜色', '单位', '单耗', '供应商', '单价(元)', '小计(元)', '备注']);
    expect(BOM_HEADERS).toHaveLength(11);
    expect(PROCESS_HEADERS).toEqual(['序号', '工艺分类', '工艺名称', '工艺要求', '质量标准', '备注']);
    expect(PROCESS_HEADERS).toHaveLength(6);
  });

  it('工艺行结构 + 空/非数组清单', () => {
    const rows = buildProcessRows([
      { section: '车缝', name: '合侧缝', requirement: '来去缝 1cm', standard: '线迹顺直', note: '' },
      {},
    ]);
    expect(rows[0]).toEqual({ index: 1, section: '车缝', name: '合侧缝', requirement: '来去缝 1cm', standard: '线迹顺直', note: '' });
    expect(rows[1]).toEqual({ index: 2, section: undefined, name: undefined, requirement: undefined, standard: undefined, note: undefined });
    expect(buildProcessRows(null)).toEqual([]);
  });
});

/* ─────────────── buildInfoSections / buildTimelineItems ─────────────── */
describe('基本信息 sections 与工作动态', () => {
  const task = {
    style_no: 'A1', title: '连衣裙', category: '裙', brand: 'GOLDEN', designer: '李',
    year: '2026', season: '秋冬', month: '11月',
    order_no: 'PO-1', sample_type: '复版', sample_color: '蓝', size: 'M', sample_count: 3,
    priority: 'A', audit_status: '已审核', status: 'doing',
    fabric_date: '2026-09-01', start_date: '2026/9/5', expected_date: '2026.10.20', finish_date: '',
    note: '工作动态：应被清空的旧备注',
    fabric_req: 'F', trim_req: 'T', process_req: 'P', audit_comment: 'C',
    progress_nodes: [{ label: '打版', status: 'completed', date: '2026-09-10', by: '张师傅', note: '初版完成' }],
  };

  it('五个 section 且顺序固定', () => {
    expect(buildInfoSections(task).map((s) => s.name)).toEqual([
      '款式基础信息', '打样信息', '日期', '工作动态', '说明与反馈',
    ]);
  });

  it('时段拼接、件数带单位、看板状态走 STATUS_CN 映射', () => {
    const sections = buildInfoSections(task);
    const find = (sec, key) => sections.find((s) => s.name === sec).items.find(([k]) => k === key)[1];
    expect(find('款式基础信息', '时段')).toBe('2026 秋冬 11月');
    expect(find('打样信息', '件数')).toBe('3件');
    expect(find('打样信息', '看板状态')).toBe('打版中');
    expect(find('打样信息', '优先级')).toBe('A');
  });

  it('件数为 0/缺省 → 空串（不显示 0件）', () => {
    const sections = buildInfoSections({ ...task, sample_count: 0 });
    expect(sections.find((s) => s.name === '打样信息').items.find(([k]) => k === '件数')[1]).toBe('');
  });

  it('日期字段走 formatDate（含缺年补全）', () => {
    const sections = buildInfoSections(task);
    const find = (key) => sections.find((s) => s.name === '日期').items.find(([k]) => k === key)[1];
    expect(find('面料到库日期')).toBe('2026-09-01');
    expect(find('任务开始日期')).toBe('2026-09-05');
    expect(find('预计完工日期')).toBe('2026-10-20');
    expect(find('实际完工日期')).toBe('');
  });

  it('note 以「工作动态：/工作动态:」开头 → 清空为 ""', () => {
    for (const prefix of ['工作动态：', '工作动态:']) {
      const sections = buildInfoSections({ ...task, note: `${prefix}旧内容` });
      expect(sections.find((s) => s.name === '说明与反馈').items.find(([k]) => k === '款式说明/打样重点')[1]).toBe('');
    }
    const normal = buildInfoSections({ ...task, note: '普通说明' });
    expect(normal.find((s) => s.name === '说明与反馈').items.find(([k]) => k === '款式说明/打样重点')[1]).toBe('普通说明');
  });

  it('工作动态：节点映射（状态/日期/负责人/备注 拼接）', () => {
    const sections = buildInfoSections(task);
    const timeline = sections.find((s) => s.name === '工作动态').items;
    expect(timeline).toEqual([['打版', '已完成 2026-09-10｜负责人:张师傅；初版完成']]);
  });

  it('buildTimelineItems：无节点 → [["无记录",""]]；未知状态 → 原样；缺名 → （未命名）', () => {
    expect(buildTimelineItems([], '2026')).toEqual([['无记录', '']]);
    expect(buildTimelineItems(null, '2026')).toEqual([['无记录', '']]);
    expect(buildTimelineItems([{ status: 'weird_x' }], '2026')).toEqual([['（未命名）', 'weird_x']]);
    // 节点无状态无日期无负责人无备注 → 汇总文案为空串
    expect(buildTimelineItems([{ label: 'N' }], '2026')).toEqual([['N', '']]);
  });
});

/* ─────────────── buildTechPackFileName ─────────────── */
describe('buildTechPackFileName：文件名构造', () => {
  it('xlsx 与 pdf 主干一致，仅扩展名不同（冻结时间）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T15:30:00'));
    try {
      const task = { style_no: 'A1', order_no: 'PO-1' };
      const xlsx = buildTechPackFileName(task, 'xlsx');
      const pdf = buildTechPackFileName(task, 'pdf');
      expect(xlsx).toBe('工艺单_A1_PO-1_20260914_1530.xlsx');
      expect(pdf).toBe('工艺单_A1_PO-1_20260914_1530.pdf');
      // 直接守卫「两条路径的文件名不会各自漂移」
      expect(xlsx.replace(/\.xlsx$/, '')).toBe(pdf.replace(/\.pdf$/, ''));
    } finally {
      vi.useRealTimers();
    }
  });

  it('缺款号 → unknown；缺版单号 → 不产生多余下划线', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T15:30:00'));
    try {
      expect(buildTechPackFileName({}, 'pdf')).toBe('工艺单_unknown_20260914_1530.pdf');
      expect(buildTechPackFileName({ style_no: 'A1' }, 'xlsx')).toBe('工艺单_A1_20260914_1530.xlsx');
      expect(buildTechPackFileName(null, 'xlsx')).toBe('工艺单_unknown_20260914_1530.xlsx');
    } finally {
      vi.useRealTimers();
    }
  });
});
