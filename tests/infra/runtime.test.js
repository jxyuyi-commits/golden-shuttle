/**
 * 测试框架自证（G9）——证明「DB 相关测试确实跑在 Electron ABI 132 上、且真实执行未被 skip」
 * ------------------------------------------------------------------
 * 这是给整个测试套件做的"地基体检"：
 *   1) 当前运行时的 Node ABI 必须是 132（Electron 34），而非系统 Node 的 127；
 *   2) better-sqlite3 原生模块能被真实实例化并执行 SQL（而不是被 mock 掉）；
 *   3) 走 dbHarness 建立的临时库确实可用，且不会指向生产库。
 * 一旦有人用系统 node 误跑测试，本文件会立刻红灯并给出明确原因。
 */
import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createTempDb, cleanupTempDb } from '../helpers/dbHarness.js';

let env = null;

afterAll(() => {
  cleanupTempDb(env);
});

describe('运行地基：Electron ABI 132 + better-sqlite3 真实可用', () => {
  it('当前进程运行在 Electron 运行时（ABI 132），不是系统 Node（ABI 127）', () => {
    // Electron 34.5.8 → process.versions.modules === '132'
    expect(process.versions.modules).toBe('132');
    // 若此断言失败，说明测试被系统 node 误跑，better-sqlite3 必然加载失败
  });

  it('better-sqlite3 原生模块可真实实例化并执行 SQL', () => {
    const { require } = createTempDb('gs-runtime', { init: false });
    const Database = require('better-sqlite3');
    const mem = new Database(':memory:');
    const version = mem.prepare('SELECT sqlite_version() AS v').get().v;
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
    mem.close();
  });

  it('临时库夹具：初始化成功、指向临时目录、生产库未被触碰', () => {
    env = createTempDb('gs-runtime');
    expect(env.db).toBeTruthy();
    // 临时库路径必须落在系统临时目录内
    const rel = path.relative(path.resolve(os.tmpdir()), path.resolve(env.dbPath));
    expect(rel.startsWith('..')).toBe(false);
    // 生产库（server/database.sqlite）绝不应是本次测试目标
    expect(path.resolve(env.dbPath)).not.toContain(path.resolve('server'));
    expect(fs.existsSync(env.dbPath)).toBe(true);
    // 迁移已落库：_migrations 非空
    const count = env.db.prepare('SELECT COUNT(*) AS c FROM _migrations').get().c;
    expect(count).toBeGreaterThan(0);
  });
});
