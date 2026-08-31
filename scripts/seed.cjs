const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../server/database.sqlite');
const db = new Database(DB_PATH);

console.log('正在清空旧数据以避免重复...');
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN size TEXT DEFAULT '';`);
} catch (err) {
  // column might already exist
}

db.exec(`
  DELETE FROM tasks;
  DELETE FROM styles;
  DELETE FROM measurement_templates;
  DELETE FROM sqlite_sequence WHERE name IN ('tasks', 'styles', 'measurement_templates');
`);

const stylesData = [
  { style_no: 'AW26-JK001', title: '极地抗寒羽绒服', brand: 'GOLDEN SHUTTLE', designer: 'YI YU', year: '2026', season: 'AW', month: '10', category: '外套', pdf_url: '' },
  { style_no: 'SS26-DR002', title: '复古法式修身连衣裙', brand: 'GOLDEN SHUTTLE', designer: 'YI YU', year: '2026', season: 'SS', month: '04', category: '连衣裙', pdf_url: '' },
  { style_no: 'SS26-TS003', title: '高支纯棉重磅T恤', brand: 'GOLDEN SHUTTLE', designer: 'YI YU', year: '2026', season: 'SS', month: '05', category: '上衣', pdf_url: '' },
  { style_no: 'AW26-PA004', title: '阔腿西装长裤', brand: 'GOLDEN SHUTTLE', designer: 'YI YU', year: '2026', season: 'AW', month: '09', category: '下装', pdf_url: '' }
];

const insertStyle = db.prepare(`
  INSERT INTO styles (style_no, title, brand, designer, year, season, month, category, pdf_url)
  VALUES (@style_no, @title, @brand, @designer, @year, @season, @month, @category, @pdf_url)
`);

const insertTask = db.prepare(`
  INSERT INTO tasks (
    style_id, order_no, priority, sample_type, sample_color, size, sample_count,
    fabric_date, start_date, expected_date, finish_date, audit_status, audit_comment,
    status, progress_nodes, fabric_req, trim_req, process_req, note
  )
  VALUES (
    @style_id, @order_no, @priority, @sample_type, @sample_color, @size, @sample_count,
    @fabric_date, @start_date, @expected_date, @finish_date, @audit_status, @audit_comment,
    @status, @progress_nodes, @fabric_req, @trim_req, @process_req, @note
  )
`);

db.transaction(() => {
  console.log('正在注入款式数据...');
  stylesData.forEach((style, index) => {
    const info = insertStyle.run(style);
    const styleId = info.lastInsertRowid;

    // 为每个款式生成 1-2 条打样单
    console.log(`正在注入打样单数据 (款号: ${style.style_no})...`);

    // 初版
    insertTask.run({
      style_id: styleId,
      order_no: `PO-${style.style_no}-01`,
      priority: index === 0 ? '高' : '中', // 第一个款设为高优先级
      sample_type: '初版',
      sample_color: '深灰',
      size: 'M',
      sample_count: 1,
      fabric_date: '2026-03-01',
      start_date: '2026-03-02',
      expected_date: '2026-03-10',
      finish_date: '',
      audit_status: index === 1 ? '已通过' : '待审核',
      audit_comment: '',
      status: index === 0 ? 'in_progress' : (index === 1 ? 'done' : 'todo'),
      progress_nodes: JSON.stringify([
        { label: '配料', status: 'done', date: '03/01' },
        { label: '跟版', status: 'done', date: '03/02' },
        { label: '版师', status: index === 0 ? 'active' : (index === 1 ? 'done' : 'pending'), date: '' },
        { label: '样衣', status: index === 1 ? 'done' : 'pending', date: '' },
        { label: '工艺', status: index === 1 ? 'done' : 'pending', date: '' }
      ]),
      fabric_req: '主面料：100%聚酯纤维 / 里料：100%锦纶',
      trim_req: '定制LOGO拉链*1',
      process_req: '袖口需要防风罗纹',
      note: '请务必注意充绒量的均匀度'
    });

    // 部分款式追加复版
    if (index === 0 || index === 2) {
      insertTask.run({
        style_id: styleId,
        order_no: `PO-${style.style_no}-02`,
        priority: '低',
        sample_type: '复版',
        sample_color: '军绿',
        size: 'L',
        sample_count: 2,
        fabric_date: '',
        start_date: '',
        expected_date: '2026-03-25',
        finish_date: '',
        audit_status: '未提交',
        audit_comment: '',
        status: 'todo',
        progress_nodes: JSON.stringify([
          { label: '配料', status: 'pending', date: '' },
          { label: '跟版', status: 'pending', date: '' },
          { label: '版师', status: 'pending', date: '' },
          { label: '样衣', status: 'pending', date: '' },
          { label: '工艺', status: 'pending', date: '' }
        ]),
        fabric_req: '',
        trim_req: '',
        process_req: '根据初版意见修改领口尺寸',
        note: '等初版完成后再启动'
      });
    }
  });
})();

console.log('✅ 测试数据注入完毕！您可以直接刷新浏览器查看效果。');

console.log('正在注入部位预设数据...');
const templates = [
  { category: '针织上装', code: '01', name: '衣长', method: '肩顶至下脚直度', tolerance: '(±) 1', grading_rule: '2' },
  { category: '针织上装', code: '02', name: '胸围', method: '腋下1cm处横量', tolerance: '(±) 1.2', grading_rule: '4' },
  { category: '针织下装', code: '0', name: '裤长', method: '连腰-侧长', tolerance: '(±) 1', grading_rule: '1' },
  { category: '半裙', code: '0', name: '裙长', method: '连腰-侧长', tolerance: '(±) 0.8', grading_rule: '4' },
  { category: '上装', code: '01', name: '衣长', method: '肩顶至下脚直度', tolerance: '(±) 1', grading_rule: '2' },
  { category: '下装', code: '1', name: '前衣长', method: '肩颈点至下脚直度', tolerance: '(±) 1', grading_rule: '1' },
  { category: '下装', code: '1', name: '腰围', method: '橡筋完成度', tolerance: '(±) 1.2', grading_rule: '1.2' },
  { category: '毛衫', code: '01', name: '身长', method: '肩顶直量', tolerance: '(±) 1', grading_rule: '2' }
];

const insertTemplate = db.prepare(`
  INSERT INTO measurement_templates (category, code, name, method, tolerance, grading_rule, sort_order)
  VALUES (@category, @code, @name, @method, @tolerance, @grading_rule, @sort_order)
`);

db.transaction(() => {
  templates.forEach((t, i) => {
    insertTemplate.run({ ...t, sort_order: i });
  });
})();

console.log('✅ 部位预设数据注入完毕！');
