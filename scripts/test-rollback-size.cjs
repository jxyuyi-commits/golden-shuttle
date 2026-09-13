/**
 * 端到端回归测试：版本回滚的尺寸表恢复语义（G1 核心验收点）
 *
 * 背景：修复前 `rollback()` 用「快照 runs[].size_data 键是否存在」猜测快照形态，
 *       而 `buildSnapshot()` 恒为每个批次写入该键 → 判据恒真 → 旧快照分支成死代码。
 *       修复后改为以 `snapVersion` 字段是否存在做确定性判别。
 *
 * 本脚本用独立临时库（不触碰生产库），端到端验证 5 组断言：
 *   A 新快照必须携带 snapVersion 字段
 *   B【核心】多批次回滚：改写全部批次尺寸表 → 回滚 → 每个批次都必须逐字恢复
 *   C 用户主动清空的空尺寸表（[]）必须被如实恢复，不得被误判为 legacy 而写错批次
 *   D legacy 分支真实可达：无 snapVersion 的旧快照 → 尺寸表写回该款首个批次
 *   E diffSummary 判据与 rollback 对齐（无变更不误报，变更不漏报）
 *
 * 运行（必须走 Electron 运行时，ABI 132；勿用系统 node，better-sqlite3 ABI 不匹配）：
 *   ELECTRON_RUN_AS_NODE=1 npx electron scripts/test-rollback-size.cjs
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = path.join(os.tmpdir(), `gs-rollback-test-${Date.now()}`);
fs.mkdirSync(TMP, { recursive: true });
// 必须在 require('../server/db.cjs') 之前指向临时库
process.env.DB_PATH = path.join(TMP, 'database.sqlite');
process.env.UPLOADS_DIR = path.join(TMP, 'uploads');

const dbModule = require('../server/db.cjs');
const versions = require('../server/services/versions.cjs');

let failed = 0;
const results = [];
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
  if (!cond) failed++;
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
}
const j = (v) => JSON.stringify(v);

dbModule.initDatabase();

const db = dbModule.getDb();

// ── 造数：1 款 + 1 任务 + 2 批次（sort_order 1 / 2，尺寸表各不相同） ──
const SD_A = [{ name: '胸围', tol: '±1', S: 88, M: 92 }];
const SD_B = [{ name: '腰围', tol: '±1', S: 70, M: 74 }];

const styleId = db.prepare("INSERT INTO styles (style_no, title, category) VALUES ('TEST-SD-001', '尺寸表回归测试款', '裙')").run().lastInsertRowid;
const taskId = db.prepare("INSERT INTO tasks (style_id, note) VALUES (?, '回归测试')").run(styleId).lastInsertRowid;
const run1 = db.prepare('INSERT INTO sample_runs (task_id, size, sort_order, size_data) VALUES (?, ?, ?, ?)').run(taskId, 'S', 1, j(SD_A)).lastInsertRowid;
const run2 = db.prepare('INSERT INTO sample_runs (task_id, size, sort_order, size_data) VALUES (?, ?, ?, ?)').run(taskId, 'M', 2, j(SD_B)).lastInsertRowid;

const readRun = (id) => db.prepare('SELECT id, size, sort_order, size_data FROM sample_runs WHERE id = ?').get(id);
const readSnap = (vid) => JSON.parse(db.prepare('SELECT snapshot FROM task_versions WHERE id = ?').get(vid).snapshot);
/** 让上一条版本「过期」，使下一次 capture 新建而非合并（合并窗口 5 分钟） */
const expireLast = () => db.prepare(
  "UPDATE task_versions SET created_at = datetime('now','localtime','-10 minutes') WHERE id = (SELECT MAX(id) FROM task_versions WHERE task_id = ?)"
).run(taskId);

console.log('\n════ A. 新快照必须携带 snapVersion ════');
const snapA = versions.buildSnapshot(taskId);
check('buildSnapshot 写入 snapVersion', Object.prototype.hasOwnProperty.call(snapA, 'snapVersion'), `实际值=${j(snapA.snapVersion)}`);
check('snapVersion === 16', snapA.snapVersion === 16);
check('新快照仍保留 legacy task 级 size_data 字段', Object.prototype.hasOwnProperty.call(snapA, 'size_data'));
check('各批次尺寸表随快照记录', j(snapA.runs.map(r => r.size_data)) === j([SD_A, SD_B]), `runs=${j(snapA.runs.map(r => r.size_data))}`);

console.log('\n════ B.【核心】多批次回滚：改写全部批次后必须逐批恢复 ════');
const v1 = versions.capture(taskId);
check('capture 成功建版本', !!v1 && !!v1.id, `v${v1 && v1.version_no} id=${v1 && v1.id}`);
check('v1 快照含 snapVersion', readSnap(v1.id).snapVersion === 16);

const SD_A_NEW = [{ name: '胸围', tol: '±2', S: 999, M: 999 }];
const SD_B_NEW = [{ name: '腰围', tol: '±2', S: 888, M: 888 }];
db.prepare('UPDATE sample_runs SET size_data = ? WHERE id = ?').run(j(SD_A_NEW), run1);
db.prepare('UPDATE sample_runs SET size_data = ? WHERE id = ?').run(j(SD_B_NEW), run2);
console.log(`  [改写前] 批次1=${j(SD_A)}  批次2=${j(SD_B)}`);
console.log(`  [改写后] 批次1=${readRun(run1).size_data}  批次2=${readRun(run2).size_data}`);

versions.rollback(taskId, v1.id);
const r1b = readRun(run1).size_data;
const r2b = readRun(run2).size_data;
console.log(`  [回滚后] 批次1=${r1b}  批次2=${r2b}`);
check('批次1（sort_order 最小）已恢复', j(JSON.parse(r1b)) === j(SD_A));
check('批次2（非首批次）已恢复 ← 修复前此断言必失败', j(JSON.parse(r2b)) === j(SD_B));
check('回滚未把 task 级空数组污染到批次', j(JSON.parse(r1b)) !== '[]' && j(JSON.parse(r2b)) !== '[]');

console.log('\n════ C. 用户主动清空的尺寸表必须如实恢复（不得误判为 legacy） ════');
db.prepare('UPDATE sample_runs SET size_data = ? WHERE id = ?').run('[]', run2);
expireLast();
const v2 = versions.capture(taskId);
check('v2 快照含 snapVersion', readSnap(v2.id).snapVersion === 16);
check('v2 记录了批次2 的空尺寸表', j(readSnap(v2.id).runs.find(r => r.id === run2).size_data) === '[]');

db.prepare('UPDATE sample_runs SET size_data = ? WHERE id = ?').run(j([{ name: '后续修改', S: 1 }]), run2);
versions.rollback(taskId, v2.id);
const r2c = JSON.parse(readRun(run2).size_data);
console.log(`  [回滚后] 批次2=${j(r2c)}  批次1=${readRun(run1).size_data}`);
check('批次2 恢复为空数组（如实恢复，非旧分支猜测）', j(r2c) === '[]');
check('批次1 未被本次回滚波及', j(JSON.parse(readRun(run1).size_data)) === j(SD_A));
check('空数组未被写入首批次（漏判 legacy 的特征）', j(JSON.parse(readRun(run1).size_data)) !== '[]');

console.log('\n════ D. legacy 分支真实可达（修复前为死代码） ════');
const SD_LEGACY = [{ name: '旧结构尺寸', tol: '±1', S: 111 }];
const bareRuns = db.prepare('SELECT id, order_no, sample_type, size, sample_color, sample_count, status, pattern_maker, sample_maker, audit_status, audit_comment FROM sample_runs WHERE task_id = ? ORDER BY sort_order ASC, id ASC').all(taskId);
const legacySnap = {
  // 注意：rollback 的 styles 写入使用命名参数（versions.cjs:153），键必须齐全，
  // 故这里按旧版 buildSnapshot 的真实输出形态补全 9 个款式字段。
  task: {
    style_no: 'TEST-SD-001', title: '尺寸表回归测试款', brand: '', designer: '',
    year: '', season: '', month: '', category: '裙', pdf_url: '',
    progress_nodes: [], fabric_req: '', trim_req: '', process_req: '', note: '',
    priority: '中', start_date: '', expected_date: '', finish_date: '',
  },
  size_data: SD_LEGACY,          // 旧结构：尺寸表在 task 级
  bom: [],
  runs: bareRuns,                 // 旧结构：批次对象没有 size_data 键
  saved_at: new Date().toISOString(),
  // 刻意不含 snapVersion
};
check('构造的 legacy 快照确实无 snapVersion', legacySnap.snapVersion === undefined);
const legacyId = db.prepare("INSERT INTO task_versions (task_id, version_no, snapshot, summary, created_at) VALUES (?, ?, ?, 'legacy 手工快照', datetime('now','localtime'))")
  .run(taskId, 9001, JSON.stringify(legacySnap)).lastInsertRowid;

db.prepare('UPDATE sample_runs SET size_data = ? WHERE id = ?').run(j([{ name: '回滚前占位' }]), run1);
db.prepare('UPDATE sample_runs SET size_data = ? WHERE id = ?').run(j([{ name: '批次2占位' }]), run2);
versions.rollback(taskId, legacyId);
const r1d = JSON.parse(readRun(run1).size_data);
const r2d = JSON.parse(readRun(run2).size_data);
console.log(`  [回滚后] 批次1=${j(r1d)}  批次2=${j(r2d)}`);
check('legacy 快照：尺寸表写回首个批次（sort_order 最小）', j(r1d) === j(SD_LEGACY));
check('legacy 快照：非首批次不被写入', j(r2d) === j([{ name: '批次2占位' }]));

console.log('\n════ E. diffSummary 判据与 rollback 对齐 ════');
const snapSame = versions.buildSnapshot(taskId);
check('快照无变更时不误报「尺寸表」', !versions.diffSummary(snapSame, versions.buildSnapshot(taskId)).includes('尺寸表'));
db.prepare('UPDATE sample_runs SET size_data = ? WHERE id = ?').run(j([{ name: '变更检测', S: 5 }]), run2);
const summary = versions.diffSummary(snapSame, versions.buildSnapshot(taskId));
console.log(`  [摘要] ${summary}`);
check('批次尺寸表变更时检出「尺寸表」', summary.includes('尺寸表'));
// 旧快照 vs 新快照：判据必须落在各自形态上，不得互相误报
const oldSide = { size_data: SD_LEGACY, runs: bareRuns };
check('legacy vs 新快照 可正常比较（不抛错）', typeof versions.diffSummary(oldSide, versions.buildSnapshot(taskId)) === 'string');

console.log('\n════════════════════════════════════════');
const total = results.length;
console.log(failed === 0
  ? `✅ 全部通过：${total - failed}/${total}`
  : `❌ 存在失败：${total - failed}/${total} 通过，${failed} 失败`);
console.log(`临时库：${TMP}`);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows 句柄未释放时忽略 */ }
process.exit(failed === 0 ? 0 : 1);
