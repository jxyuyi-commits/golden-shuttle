#!/usr/bin/env node
/**
 * doc-stats.cjs —— 文档防漂移统计脚本
 * ------------------------------------------------------------------
 * 目标：把「可机器验证的计数」从文档里赶出去，改由本脚本从源码实测生成，
 *       并回填到 docs/PROJECT_HANDBOOK.md 的 <!-- STATS:BEGIN/END --> 区块。
 *
 * 用法：
 *   node scripts/doc-stats.cjs            # 计算并回填 HANDBOOK（默认）
 *   node scripts/doc-stats.cjs --check    # 只校验 STATS 区块与源码是否一致（不一致 exit 1，供 doc:check / pre-commit）
 *   node scripts/doc-stats.cjs --json     # 只打印 JSON，不回填
 *
 * 约束：
 *   - 纯文件扫描 + 正则解析，**不 require better-sqlite3**（避免 ABI 失败）。
 *   - 唯一可能的外部命令是只读的 `git ls-files`，且**默认不执行**，需显式设 DOC_STATS_GIT=1 才启用。
 *     这样在「禁止执行 git 命令」的环境里默认完全无障碍；统计 git 跟踪文件数时属只读、不做任何变更。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HANDBOOK = path.join(ROOT, 'docs', 'PROJECT_HANDBOOK.md');
const SRC_EXT = new Set(['.js', '.jsx', '.cjs', '.mjs']);

const argv = process.argv.slice(2);
const MODE_CHECK = argv.includes('--check');
const MODE_JSON = argv.includes('--json');

/** 递归遍历目录，收集匹配扩展名的文件（跳过 node_modules / uploads / .git / 构建产物） */
function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'uploads') continue;
      walk(full, acc);
    } else if (e.isFile()) {
      if (SRC_EXT.has(path.extname(e.name))) acc.push(full);
    }
  }
  return acc;
}

/** 统计一个文件的「视觉行数」：按 \n 切分，忽略结尾空行 */
function countLines(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const lines = txt.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

function countFiles(dir, ext) {
  try {
    return fs.readdirSync(dir).filter((f) => path.extname(f) === ext).length;
  } catch {
    return 0;
  }
}

/** 从 server/db.cjs 的 migrations 数组解析版本 */
function migrationStats() {
  const db = fs.readFileSync(path.join(ROOT, 'server', 'db.cjs'), 'utf8');
  const start = db.indexOf('const migrations = [');
  const end = start >= 0 ? db.indexOf('\n];', start) : -1;
  const region = start >= 0 && end > start ? db.slice(start, end) : db;
  const versions = [...region.matchAll(/version:\s*(\d+)/g)].map((m) => Number(m[1]));
  return {
    latest: versions.length ? Math.max(...versions) : 0,
    count: versions.length,
  };
}

/** src/api/index.js 导出的绑定数（export const / export function） */
function apiExportCount() {
  try {
    const s = fs.readFileSync(path.join(ROOT, 'src', 'api', 'index.js'), 'utf8');
    return [...s.matchAll(/^export\s+(?:const|function)\s+/gm)].length;
  } catch {
    return 0;
  }
}

function gitTrackedCount() {
  if (process.env.DOC_STATS_GIT !== '1') return null; // 默认不执行 git
  try {
    const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
    return out.split('\n').filter(Boolean).length;
  } catch {
    return null;
  }
}

function collect() {
  const srcFiles = [
    ...walk(path.join(ROOT, 'src')),
    ...walk(path.join(ROOT, 'server')),
  ];
  const totalLines = srcFiles.reduce((n, f) => n + countLines(f), 0);
  const mig = migrationStats();
  return {
    generatedAt: new Date().toISOString(),
    srcFileCount: srcFiles.length,
    srcLineCount: totalLines,
    routesCount: countFiles(path.join(ROOT, 'server', 'routes'), '.cjs'),
    servicesCount: countFiles(path.join(ROOT, 'server', 'services'), '.cjs'),
    migrationLatest: mig.latest,
    migrationCount: mig.count,
    apiExportCount: apiExportCount(),
    gitTrackedCount: gitTrackedCount(),
  };
}

const BEGIN = '<!-- STATS:BEGIN (由 scripts/doc-stats.cjs 生成，请勿手改) -->';
const END = '<!-- STATS:END -->';

function render(stats) {
  const gitCell = stats.gitTrackedCount === null
    ? '（设 DOC_STATS_GIT=1 后生成）'
    : String(stats.gitTrackedCount);
  const d = new Date(stats.generatedAt);
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return [
    BEGIN,
    `> 以下计数由 \`node scripts/doc-stats.cjs\` 从源码实测生成（生成于 ${ts}）；手工改动会被 \`--check\` 判为漂移。`,
    '',
    '| 计数项 | 值 |',
    '| --- | --- |',
    `| 源码文件数（src/ + server/，.js/.jsx/.cjs/.mjs） | ${stats.srcFileCount} |`,
    `| 源码总行数（同上范围） | ${stats.srcLineCount} |`,
    `| \`server/routes/*.cjs\` | ${stats.routesCount} |`,
    `| \`server/services/*.cjs\` | ${stats.servicesCount} |`,
    `| 迁移最大版本（\`server/db.cjs\` migrations） | ${stats.migrationLatest} |`,
    `| 迁移条目数 | ${stats.migrationCount} |`,
    `| \`src/api/index.js\` 导出绑定数 | ${stats.apiExportCount} |`,
    `| git 跟踪文件数 | ${gitCell} |`,
    END,
  ].join('\n');
}

function readHandbook() {
  return fs.readFileSync(HANDBOOK, 'utf8');
}

function extractBlock(text) {
  const m = text.match(/<!-- STATS:BEGIN[\s\S]*?<!-- STATS:END -->/);
  return m ? m[0] : null;
}

function main() {
  const stats = collect();

  if (MODE_JSON) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const block = render(stats);

  if (MODE_CHECK) {
    const existing = extractBlock(readHandbook());
    if (!existing) {
      console.error('[doc:check] 未在 docs/PROJECT_HANDBOOK.md 找到 STATS 区块。');
      process.exit(1);
    }
    // 忽略生成时间行的影响：只在计数行不一致时报错
    const strip = (s) => s.split('\n').filter((l) => !l.includes('生成于') && l.startsWith('|')).join('\n');
    if (strip(existing) !== strip(block)) {
      console.error('[doc:check] STATS 区块与源码不一致（文档漂移）！');
      console.error('--- 文档现有 ---\n' + strip(existing));
      console.error('--- 源码实测 ---\n' + strip(block));
      console.error('运行 `node scripts/doc-stats.cjs` 以回填。');
      process.exit(1);
    }
    console.log('[doc:check] STATS 区块与源码一致 ✓');
    return;
  }

  // 默认：回填
  let text = readHandbook();
  if (!extractBlock(text)) {
    console.error('[doc-stats] 未找到 STATS 区块，请在 HANDBOOK 中先放置 BEGIN/END 标记。');
    process.exit(1);
  }
  text = text.replace(/<!-- STATS:BEGIN[\s\S]*?<!-- STATS:END -->/, block);
  fs.writeFileSync(HANDBOOK, text, 'utf8');
  console.log('[doc-stats] 已回填 docs/PROJECT_HANDBOOK.md 的 STATS 区块：');
  console.log(block);
}

main();
