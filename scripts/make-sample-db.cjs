#!/usr/bin/env node
/**
 * make-sample-db.cjs —— 生成「空白示例库」（仅表结构，业务数据 0 行）
 * ------------------------------------------------------------------
 * 背景（批5 G18）：安装包此前通过 build.extraResources 直接打包了用户真实
 *   生产库 server/database.sqlite（含真实款号/批次/工艺/物料）与真实设计稿
 *   server/uploads，导致「私有生产数据随安装包外泄」。改造后改为随包分发一个
 *   「表结构齐全、业务数据 0 行」的空白库，用户首次安装得到的是干净环境。
 *
 * 关键设计：
 *   1) 复用 server/db.cjs 的 initDatabase() —— 即跑完整 migrations 从零建库，
 *      **绝不复制真实库**，从而保证示例库表结构永远与代码版本同步。
 *   2) 幂等：每次运行先清旧产物（主库 + 迁移前自动备份 + 事务侧车文件），再重建。
 *   3) 生成后只读重开自校验，并在 stdout 打印全部表行数，便于人工/CI 核对。
 *
 * 运行（better-sqlite3 为 Electron ABI，必须走 electron-as-node）：
 *   cross-env ELECTRON_RUN_AS_NODE=1 electron scripts/make-sample-db.cjs
 *   或直接：npm run sample:db
 *
 * 输出：server/seed/database.sqlite（该文件纳入 git，供 electron-builder 打包）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { initDatabase } = require('../server/db.cjs');

const ROOT = path.resolve(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'server', 'seed');
const SAMPLE_DB = path.join(SEED_DIR, 'database.sqlite');
// initDatabase 需要一个 uploads 目录参数；用系统临时目录，绝不污染仓库与真实数据。
const TMP_UPLOADS = path.join(os.tmpdir(), `gs-sample-uploads-${Date.now()}`);

// 业务（数据）表：空白示例库要求这些表行数严格为 0。
const BUSINESS_TABLES = [
  'styles',
  'tasks',
  'sample_runs',
  'drawings',
  'bom_items',
  'process_items',
  'operation_logs',
];

// 事务侧车文件命名（回滚日志等）与迁移前自动备份命名，生成空库后一并清理。
const SIDECAR_RE = /^database\.sqlite(-journal|-wal|-shm)$/;
const BACKUP_PREFIX = 'database.sqlite.bak-';

/**
 * 清理 SEED_DIR 内的残留产物。
 * @param {boolean} includeMain - 为 true 时连同主库一起删除（幂等重建用）；
 *                               为 false 时只删侧车/备份，保留刚生成的主库。
 */
function cleanSeedDir(includeMain) {
  if (!fs.existsSync(SEED_DIR)) return;
  for (const name of fs.readdirSync(SEED_DIR)) {
    const isMain = name === 'database.sqlite';
    if ((isMain && includeMain) || SIDECAR_RE.test(name) || name.startsWith(BACKUP_PREFIX)) {
      fs.rmSync(path.join(SEED_DIR, name), { force: true });
    }
  }
}

/**
 * 从 server/db.cjs 的 migrations 数组解析代码侧最新迁移版本号
 * （与 scripts/doc-stats.cjs 的解析口径一致，保证自校验基准同源）。
 * @returns {number} 最新迁移版本号，解析不到则为 0
 */
function codeLatestMigration() {
  const src = fs.readFileSync(path.join(ROOT, 'server', 'db.cjs'), 'utf8');
  const start = src.indexOf('const migrations = [');
  const end = start >= 0 ? src.indexOf('\n];', start) : -1;
  const region = start >= 0 && end > start ? src.slice(start, end) : src;
  const versions = [...region.matchAll(/version:\s*(\d+)/g)].map((m) => Number(m[1]));
  return versions.length ? Math.max(...versions) : 0;
}

function main() {
  fs.mkdirSync(SEED_DIR, { recursive: true });

  // 1) 幂等：先清掉上一次运行留下的主库与残留
  cleanSeedDir(true);
  console.log(`[sample-db] 目标空白库：${SAMPLE_DB}`);

  // 2) 跑完整 migrations 从零建库（绝不复制真实库）
  const db = initDatabase(SAMPLE_DB, TMP_UPLOADS);
  db.close();

  // 3) 迁移前会自动备份（新库 mtime 非空时可能触发），空库无需回滚副本，清掉
  cleanSeedDir(false);

  // 4) 只读重开自校验 + 统计全部表行数
  const ro = new Database(SAMPLE_DB, { readonly: true, fileMustExist: true });
  const tables = ro
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);

  const counts = {};
  for (const t of tables) {
    counts[t] = ro.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  }
  const dbMax = ro.prepare('SELECT MAX(version) AS m FROM _migrations').get().m || 0;
  ro.close();

  const expected = codeLatestMigration();

  // 5) 打印统计
  console.log('\n[sample-db] 各表行数：');
  for (const t of tables) {
    console.log(`  ${t.padEnd(22)} ${counts[t]}`);
  }
  console.log(`\n[sample-db] _migrations 最大版本 = v${dbMax}（代码最新 = v${expected}）`);

  // 6) 断言：版本一致 + 业务表全部为 0 行
  const errors = [];
  if (dbMax !== expected) {
    errors.push(`迁移版本不一致：库 v${dbMax} ≠ 代码 v${expected}`);
  }
  for (const t of BUSINESS_TABLES) {
    if (!(t in counts)) {
      errors.push(`业务表缺失：${t}`);
    } else if (counts[t] !== 0) {
      errors.push(`业务表 ${t} 非空：${counts[t]} 行`);
    }
  }

  // 7) 清理临时 uploads 目录
  try {
    fs.rmSync(TMP_UPLOADS, { recursive: true, force: true });
  } catch {
    /* Windows 句柄未释放时忽略 */
  }

  if (errors.length) {
    console.error('\n[sample-db] ❌ 校验失败：');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('\n[sample-db] ✅ 空白示例库已生成并通过校验（业务数据 0 行）。');
}

main();
