/**
 * 测试用数据库夹具（G9）
 * ------------------------------------------------------------------
 * 所有测试都在**独立临时库**中运行，绝不触碰 `server/database.sqlite`（用户真实生产数据）。
 *
 * 关键约束（HANDBOOK §6.3）：better-sqlite3 原生二进制为 Electron ABI 132，
 * 因此 `require('../../server/db.cjs')` 只允许在 Electron 运行时（ELECTRON_RUN_AS_NODE=1）
 * 下发生——见 vitest.config.mjs 与 package.json 的 test:unit 脚本。
 *
 * 用法：
 *   import { createTempDb, cleanupTempDb } from '../helpers/dbHarness.js';
 *   const env = createTempDb('gs-migrations');
 *   // env = { root, dbPath, uploadsDir, db, dbModule, require }
 *   ... 造数 / 断言 ...
 *   cleanupTempDb(env);   // afterAll 清理，保证可重复运行
 */
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/** 以测试文件自身位置为基准的 Node 原生 require（用于加载 CJS 服务层，绕过 Vite 转换） */
export const require = createRequire(import.meta.url);

/**
 * 在系统临时目录下创建一个全新的测试环境（临时库 + 临时 uploads 目录）并初始化数据库。
 * 会自动关闭上一轮连接，避免 Windows 下文件句柄未释放导致清理失败。
 *
 * @param {string} tag - 临时目录前缀（便于排障识别来源）
 * @param {{ init?: boolean }} [opts] - init=false 时只建目录与 raw 连接入口，不跑初始化
 * @returns {{ root: string, dbPath: string, uploadsDir: string,
 *             db: import('better-sqlite3').Database,
 *             dbModule: any, require: NodeRequire }}
 */
export function createTempDb(tag = 'gs-test', opts = {}) {
  const { init = true } = opts;
  const dbModule = require('../../server/db.cjs');

  // 关闭上一次遗留的连接（若已初始化），否则 Windows 会锁住临时库文件
  try {
    dbModule.getDb().close();
  } catch {
    /* 尚未初始化，忽略 */
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${tag}-`));
  const dbPath = path.join(root, 'database.sqlite');
  const uploadsDir = path.join(root, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  process.env.DB_PATH = dbPath;
  process.env.UPLOADS_DIR = uploadsDir;

  let db = null;
  if (init) {
    db = dbModule.initDatabase(dbPath, uploadsDir);
  }
  return { root, dbPath, uploadsDir, db, dbModule, require };
}

/**
 * 创建一个裸 better-sqlite3 连接（不经 db.cjs / 不跑迁移），
 * 供「历史版本库夹具」在其上写入旧结构。调用方负责 close()。
 *
 * @param {string} dbPath
 * @returns {import('better-sqlite3').Database}
 */
export function openRaw(dbPath) {
  const Database = require('better-sqlite3');
  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  return raw;
}

/**
 * 递归删除临时目录（幂等）。Windows 句柄未释放时静默忽略，保证测试可重复运行。
 * @param {{ root: string }|string} target
 */
export function cleanupTempDb(target) {
  const root = typeof target === 'string' ? target : target && target.root;
  if (!root) return;
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* Windows 句柄未释放时忽略；临时目录会被系统后续回收 */
  }
}

/**
 * 就地重新初始化同一个测试库（先关旧连接再开新连接），
 * 用于「升级迁移」类测试：改库 → 重跑迁移 → 断言。
 * @param {ReturnType<typeof createTempDb>} env
 */
export function reinit(env) {
  try {
    env.dbModule.getDb().close();
  } catch {
    /* 忽略 */
  }
  env.db = env.dbModule.initDatabase(env.dbPath, env.uploadsDir);
  return env;
}

/** 把某表的所有列名取出（断言结构用） */
export function columnsOf(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

/** 某表是否存在 */
export function tableExists(db, table) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return !!row;
}

/** 某表的全部索引名 */
export function indexesOf(db, table) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%'")
    .all(table)
    .map((r) => r.name);
}
