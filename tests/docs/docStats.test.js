/**
 * 文档防漂移：doc-stats 与 PROJECT_HANDBOOK STATS 区块一致性（G9，对应 D2）
 * ------------------------------------------------------------------
 * 目标：断言 `scripts/doc-stats.cjs` 从源码实测出的计数，与 `docs/PROJECT_HANDBOOK.md`
 * 里 `<!-- STATS:BEGIN/END -->` 区块中记录的数字**逐一相等**——即文档不会悄悄漂移。
 * 另独立复算少量最关键的计数（迁移最大版本、routes/services 文件数），避免"自证自洽"。
 *
 * 该脚本纯文件扫描，不 require better-sqlite3；在 Electron 运行时下以
 * `ELECTRON_RUN_AS_NODE=1 electron scripts/doc-stats.cjs` 方式调用（继承当前进程）。
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'doc-stats.cjs');
const HANDBOOK = path.join(ROOT, 'docs', 'PROJECT_HANDBOOK.md');

/** 以 Electron 运行时执行 doc-stats（继承 ELECTRON_RUN_AS_NODE=1），返回 stdout */
function runDocStats(flag) {
  return execFileSync(process.execPath, [SCRIPT, flag], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
}

/** 从 HANDBOOK 的 STATS 区块解析「标签 → 值」映射 */
function statsBlockMap() {
  const text = fs.readFileSync(HANDBOOK, 'utf8');
  const block = text.match(/<!-- STATS:BEGIN[\s\S]*?<!-- STATS:END -->/);
  expect(block, 'docs/PROJECT_HANDBOOK.md 应存在 STATS:BEGIN/END 区块').toBeTruthy();
  const map = {};
  for (const line of block[0].split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const label = cells[1];
    const value = cells[2];
    if (label === '计数项' || label.includes('---')) continue;
    map[label] = value;
  }
  return map;
}

/** 取某标签对应的数值（标签按关键字匹配） */
function valueFor(map, keyword) {
  const key = Object.keys(map).find((k) => k.includes(keyword));
  expect(key, `STATS 区块应含关键字「${keyword}」的行`).toBeTruthy();
  return Number(map[key]);
}

describe('文档防漂移：STATS 区块与源码实测一致', () => {
  it('doc-stats --check 通过（区块与源码无漂移）', () => {
    const out = runDocStats('--check');
    expect(out).toContain('一致');
  });

  it('STATS 区块各项数字 == doc-stats --json 实测值', () => {
    const stats = JSON.parse(runDocStats('--json'));
    const map = statsBlockMap();

    expect(valueFor(map, '源码文件数')).toBe(stats.srcFileCount);
    expect(valueFor(map, '源码总行数')).toBe(stats.srcLineCount);
    expect(valueFor(map, 'routes')).toBe(stats.routesCount);
    expect(valueFor(map, 'services')).toBe(stats.servicesCount);
    expect(valueFor(map, '迁移最大版本')).toBe(stats.migrationLatest);
    expect(valueFor(map, '迁移条目数')).toBe(stats.migrationCount);
    expect(valueFor(map, '导出绑定数')).toBe(stats.apiExportCount);
  });

  it('独立复算关键计数：迁移最大版本 / routes / services 文件数', () => {
    const stats = JSON.parse(runDocStats('--json'));

    // 迁移最大版本：直接从 server/db.cjs 源码取（不依赖 doc-stats 的解析）
    const dbSrc = fs.readFileSync(path.join(ROOT, 'server', 'db.cjs'), 'utf8');
    const versions = [...dbSrc.matchAll(/version:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(stats.migrationLatest).toBe(Math.max(...versions));
    expect(stats.migrationCount).toBe(versions.length);

    // routes / services 文件数：直接数目录
    const countCjs = (dir) => fs.readdirSync(dir).filter((f) => path.extname(f) === '.cjs').length;
    expect(stats.routesCount).toBe(countCjs(path.join(ROOT, 'server', 'routes')));
    expect(stats.servicesCount).toBe(countCjs(path.join(ROOT, 'server', 'services')));
  });
});
