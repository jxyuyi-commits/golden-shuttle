/**
 * 模块 1／5：迁移引擎（server/db.cjs#runMigrations）回归（G9）
 * ------------------------------------------------------------------
 * 覆盖两条关键路径：
 *   A. 空库直建：全新库跑完全部迁移后，`_migrations` 记录与代码定义**完全一致**，
 *      关键表/列/索引齐备；重复初始化幂等（不重复执行、不重复登记）。
 *   B. 脱敏老库升级回归：构造若干「历史版本库」夹具（裸 legacy 结构 / 只跑到 v19 / 只跑到 v15），
 *      升级到最新后断言**数据未丢、结构正确、语义迁移到位**。
 *
 * ⚠️ 全程使用 os.tmpdir() 下的独立临时库，绝不读写 `server/database.sqlite`（用户真实生产数据）。
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTempDb, cleanupTempDb, reinit, openRaw,
  columnsOf, tableExists, indexesOf,
} from '../helpers/dbHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 从源码 `server/db.cjs` 的 migrations 数组解析出全部版本号（与实现同口径，避免手写漂移） */
function codeMigrationVersions() {
  const src = fs.readFileSync(path.join(ROOT, 'server', 'db.cjs'), 'utf8');
  const start = src.indexOf('const migrations = [');
  const end = src.indexOf('\n];', start);
  const region = src.slice(start, end);
  return [...region.matchAll(/version:\s*(\d+)/g)].map((m) => Number(m[1]));
}

/** 库内已登记的迁移版本（升序） */
function recordedVersions(db) {
  return db.prepare('SELECT version FROM _migrations ORDER BY version ASC').all().map((r) => r.version);
}

// 所有测试共用一组环境，统一在最后清理
const envs = [];
afterAll(() => {
  for (const e of envs) cleanupTempDb(e);
});

describe('模块 1：迁移引擎 · 空库直建路径', () => {
  it('全新库跑完全部迁移后，_migrations 与代码定义逐条一致、无缺号无重复', () => {
    const env = createTempDb('gs-mig-fresh');
    envs.push(env);
    const expected = codeMigrationVersions();

    expect(expected.length).toBeGreaterThan(0);
    expect(expected).toEqual([...expected].sort((a, b) => a - b)); // 代码侧版本号递增且唯一
    expect(new Set(expected).size).toBe(expected.length);

    const recorded = recordedVersions(env.db);
    expect(recorded).toEqual(expected); // 逐条一致（含最新版本）
    // 每条迁移恰好登记一次（PRIMARY KEY 已保证，此处显式断言计数）
    expect(env.db.prepare('SELECT COUNT(*) AS c FROM _migrations').get().c).toBe(expected.length);
  });

  it('关键表 / 列 / 索引在空库直建后齐备（含 v12/v16/v17/v18 新增结构）', () => {
    const env = createTempDb('gs-mig-schema');
    envs.push(env);
    const db = env.db;

    for (const t of [
      'styles', 'tasks', 'measurement_templates', 'settings', 'size_groups',
      'bom_items', 'process_items', 'drawings', 'operation_logs',
      'sample_runs', 'task_versions', '_migrations',
    ]) {
      expect(tableExists(db, t), `表 ${t} 应存在`).toBe(true);
    }

    // 死列清理：tasks 不得再有旧批次列（v4/v12），也不得有 v21 删除的 5 个死列；styles 不得再有 size_group_id
    const taskCols = columnsOf(db, 'tasks');
    for (const dead of ['standard_size', 'sample_type', 'sample_color', 'size', 'sample_count', 'fabric_date',
      'order_no', 'audit_status', 'audit_comment', 'size_data', 'priority']) {
      expect(taskCols, `tasks.${dead} 应已被清理`).not.toContain(dead);
    }
    expect(columnsOf(db, 'styles')).not.toContain('size_group_id');

    // 新增列必须到位
    expect(columnsOf(db, 'styles')).toContain('pattern_maker'); // v17
    for (const col of ['updated_at', 'image_url', 'fabric_req', 'trim_req', 'process_req']) {
      expect(taskCols, `tasks.${col} 应存在`).toContain(col);
    }
    const runCols = columnsOf(db, 'sample_runs');
    for (const col of ['size_data', 'linked_drawing_ids', 'pattern_maker', 'sample_maker',
      'order_no', 'audit_status', 'audit_comment', 'pattern_date', 'accessory_date']) {
      expect(runCols, `sample_runs.${col} 应存在`).toContain(col);
    }
    expect(columnsOf(db, 'drawings')).toEqual(
      expect.arrayContaining(['kind', 'file_hash', 'version', 'group_id'])
    );
    expect(columnsOf(db, 'measurement_templates')).toContain('is_required');
    expect(indexesOf(db, 'sample_runs')).toContain('idx_sample_runs_order_no');
  });

  it('重复初始化（模拟二次启动）幂等：迁移不重复执行、登记数不变', () => {
    const env = createTempDb('gs-mig-idem');
    envs.push(env);
    const before = recordedVersions(env.db);

    reinit(env); // 等价于第二次启动

    const after = recordedVersions(env.db);
    expect(after).toEqual(before);
    expect(env.db.prepare('SELECT COUNT(*) AS c FROM _migrations').get().c).toBe(before.length);
  });
});

describe('模块 1：迁移引擎 · 脱敏老库升级回归', () => {
  it('裸 legacy 库（无 _migrations、旧结构、含旧批次列）一路升到最新：数据未丢、结构正确', () => {
    const env = createTempDb('gs-mig-legacy', { init: false });
    envs.push(env);

    // ── 造夹具：模拟「版本化迁移系统之前」的老库（脱敏、合成数据） ──
    const SD = [{ name: '胸围', tol: '±1', S: 88, M: 92 }];
    const raw = openRaw(env.dbPath);
    raw.exec(`
      CREATE TABLE styles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        style_no TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        brand TEXT DEFAULT '', designer TEXT DEFAULT '',
        year TEXT DEFAULT '', season TEXT DEFAULT '', month TEXT DEFAULT '',
        category TEXT DEFAULT '', pdf_url TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        style_id INTEGER NOT NULL,
        order_no TEXT DEFAULT '',
        priority TEXT DEFAULT '中',
        start_date TEXT DEFAULT '', expected_date TEXT DEFAULT '', finish_date TEXT DEFAULT '',
        audit_status TEXT DEFAULT '待审核', audit_comment TEXT DEFAULT '',
        status TEXT DEFAULT 'todo',
        progress_nodes TEXT DEFAULT '[]',
        sample_type TEXT DEFAULT '', size TEXT DEFAULT '', sample_color TEXT DEFAULT '',
        sample_count INTEGER DEFAULT 1, fabric_date TEXT DEFAULT '',
        size_data TEXT DEFAULT '[]',
        note TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
      CREATE TABLE measurement_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL, name TEXT NOT NULL,
        method TEXT DEFAULT '', tolerance TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0
      );
    `);
    const styleId = raw.prepare(
      "INSERT INTO styles (style_no, title, category) VALUES ('LEGACY-001', '历史款（脱敏）', '裙')"
    ).run().lastInsertRowid;
    const taskId = raw.prepare(`
      INSERT INTO tasks (style_id, priority, size_data, sample_type, size, sample_color, sample_count, note)
      VALUES (?, '高', ?, '头样', 'M', '黑', 2, '老库备注')
    `).run(styleId, JSON.stringify(SD)).lastInsertRowid;
    raw.prepare(
      "INSERT INTO measurement_templates (category, name, tolerance, sort_order) VALUES ('裙', '胸围', '±1', 1)"
    ).run();
    // 裸库：不建 _migrations
    expect(tableExists(raw, '_migrations')).toBe(false);
    raw.close();

    // ── 升级：跑全部迁移 ──
    const db = env.dbModule.initDatabase(env.dbPath, env.uploadsDir);
    env.db = db;

    // A1 版本登记与代码定义一致
    expect(recordedVersions(db)).toEqual(codeMigrationVersions());

    // A2 数据未丢：款式 / 单据 / 尺寸模板都还在，且关键字段值保留
    expect(db.prepare('SELECT COUNT(*) AS c FROM styles').get().c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c).toBe(1);
    const style = db.prepare('SELECT * FROM styles WHERE id = ?').get(styleId);
    expect(style.style_no).toBe('LEGACY-001');
    expect(style.title).toBe('历史款（脱敏）');
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    expect(task.note).toBe('老库备注');

    // A3 结构正确：旧批次列已清，新列已补
    const taskCols = columnsOf(db, 'tasks');
    for (const dead of ['sample_type', 'size', 'sample_color', 'sample_count', 'fabric_date']) {
      expect(taskCols, `tasks.${dead} 应被 v12 清理`).not.toContain(dead);
    }
    expect(taskCols).toEqual(expect.arrayContaining(['updated_at', 'image_url', 'fabric_req']));

    // A4 v10：老单据已生成 1 条批次；v14：批次拿到 PO 单号
    const runs = db.prepare('SELECT * FROM sample_runs WHERE task_id = ? ORDER BY sort_order ASC, id ASC').all(taskId);
    expect(runs.length).toBe(1);
    expect(runs[0].order_no).toBe('PO-LEGACY-001-V0');

    // A5 v16：任务级尺寸表已下沉到首个批次；v21 后 tasks.size_data 连列一并物理删除
    expect(JSON.parse(runs[0].size_data)).toEqual(SD);
    expect(taskCols).not.toContain('size_data');

    // A6 v20：旧优先级中文 → 新档位（高→A，权威数据在批次）
    expect(runs[0].priority).toBe('A');
    // A6' v21：tasks 的 order_no/audit_status/audit_comment/priority 亦已随列一并删除
    for (const dead of ['order_no', 'audit_status', 'audit_comment', 'priority']) {
      expect(taskCols, `tasks.${dead} 应被 v21 物理删除`).not.toContain(dead);
    }

    // A7 v2/v17 结构性补列
    expect(columnsOf(db, 'measurement_templates')).toContain('is_required');
    expect(columnsOf(db, 'styles')).toContain('pattern_maker');
    expect(db.prepare('SELECT name FROM measurement_templates').get().name).toBe('胸围');
  });

  it('只跑到 v20 的库升级到 v21：款级状态按批次归位、tasks 5 个死列被物理删除、批次数据不丢', () => {
    const env = createTempDb('gs-mig-v20');
    envs.push(env);
    let db = env.db;

    // ── 造数：一个款式 + 三张单，覆盖「doing / done / todo」三种归位结果 ──
    const styleId = db.prepare("INSERT INTO styles (style_no, title) VALUES ('V20-001', 'v20 库款')").run().lastInsertRowid;
    // 单①：两批次（V0 done + V1 pattern_making）→ 最新未完成批次=打版中 → doing
    const taskDoing = db.prepare("INSERT INTO tasks (style_id, status, note) VALUES (?, 'done', '留存')").run(styleId).lastInsertRowid;
    db.prepare("INSERT INTO sample_runs (task_id, priority, status, sort_order, order_no) VALUES (?, 'C', 'done', 0, 'PO-V20-001-V0')").run(taskDoing);
    db.prepare("INSERT INTO sample_runs (task_id, priority, status, sort_order, order_no) VALUES (?, 'S', 'pattern_making', 1, 'PO-V20-001-V1')").run(taskDoing);
    // 单②：单批次 done → 全部完成 → done
    const taskDone = db.prepare("INSERT INTO tasks (style_id, status, note) VALUES (?, 'todo', '完成单')").run(styleId).lastInsertRowid;
    db.prepare("INSERT INTO sample_runs (task_id, priority, status, sort_order, order_no) VALUES (?, 'B', 'done', 0, 'PO-V20-001-V2')").run(taskDone);
    // 单③：无批次 → 未开始 → todo
    const taskTodo = db.prepare("INSERT INTO tasks (style_id, status, note) VALUES (?, 'done', '空单')").run(styleId).lastInsertRowid;

    // ── 模拟 v20 库：把 v21 将删除的 5 列加回（等价于 v20 时代的 tasks schema）──
    db.exec(`
      ALTER TABLE tasks ADD COLUMN order_no TEXT DEFAULT '';
      ALTER TABLE tasks ADD COLUMN audit_status TEXT DEFAULT '';
      ALTER TABLE tasks ADD COLUMN audit_comment TEXT DEFAULT '';
      ALTER TABLE tasks ADD COLUMN size_data TEXT DEFAULT '[]';
      ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT '中';
    `);
    db.prepare("UPDATE tasks SET order_no='PO-V20-001-V0', audit_status='已通过', audit_comment='通过', size_data=?, priority='S' WHERE id=?")
      .run(JSON.stringify([{ name: '胸围' }]), taskDoing);
    // 回退到 v20：仅删除 v21 登记（v20 已执行过，无需重跑）
    db.prepare('DELETE FROM _migrations WHERE version = 21').run();
    expect(recordedVersions(db)).not.toContain(21);

    // ── 升级到 v21 ──
    reinit(env);
    db = env.db;

    expect(recordedVersions(db)).toContain(21);
    // 5 列已物理删除
    const taskCols = columnsOf(db, 'tasks');
    for (const dead of ['order_no', 'audit_status', 'audit_comment', 'size_data', 'priority']) {
      expect(taskCols, `tasks.${dead} 应被 v21 物理删除`).not.toContain(dead);
    }
    // 款级状态归位（纯 SQL，与 syncTaskStatus 同口径）
    const statusOf = (id) => db.prepare('SELECT status FROM tasks WHERE id = ?').get(id).status;
    expect(statusOf(taskDoing)).toBe('doing'); // 最新未完成批次=打版中
    expect(statusOf(taskDone)).toBe('done');   // 全部批次已完成
    expect(statusOf(taskTodo)).toBe('todo');   // 无批次
    // 批次数据未丢（权威优先级/单号仍在批次）
    const runs = db.prepare('SELECT * FROM sample_runs WHERE task_id = ? ORDER BY sort_order ASC').all(taskDoing);
    expect(runs.length).toBe(2);
    expect(runs[1].priority).toBe('S');
    expect(runs[1].order_no).toBe('PO-V20-001-V1');
    // 其它数据不受影响
    expect(db.prepare('SELECT note FROM tasks WHERE id = ?').get(taskDoing).note).toBe('留存');
    expect(db.prepare('SELECT title FROM styles WHERE id = ?').get(styleId).title).toBe('v20 库款');
  });

  it('只跑到 v15 的库升级到 v16+：task 级尺寸表迁移到首个批次，后续迁移幂等重入', () => {
    const env = createTempDb('gs-mig-v15');
    envs.push(env);
    let db = env.db;

    const SD = [{ name: '腰围', tol: '±1', S: 70, M: 74 }];
    const styleId = db.prepare("INSERT INTO styles (style_no, title) VALUES ('V15-001', 'v15 库款')").run().lastInsertRowid;
    const taskId = db.prepare('INSERT INTO tasks (style_id, note) VALUES (?, ?)').run(styleId, 'v15 单').lastInsertRowid;
    const run1 = db.prepare("INSERT INTO sample_runs (task_id, size, status, sort_order) VALUES (?, 'S', 'waiting_material', 0)").run(taskId).lastInsertRowid;
    const run2 = db.prepare("INSERT INTO sample_runs (task_id, size, status, sort_order) VALUES (?, 'M', 'waiting_material', 1)").run(taskId).lastInsertRowid;

    // 回退到 v15：把 v16/v21 会删除的 task 级列加回、尺寸表放回 task 级、批次尺寸表清空、删除 v16+ 登记
    db.exec(`
      ALTER TABLE tasks ADD COLUMN size_data TEXT DEFAULT '[]';
      ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT '中';
    `);
    db.prepare('UPDATE tasks SET size_data = ? WHERE id = ?').run(JSON.stringify(SD), taskId);
    db.prepare("UPDATE sample_runs SET size_data = '[]' WHERE task_id = ?").run(taskId);
    db.prepare('DELETE FROM _migrations WHERE version >= 16').run();
    expect(recordedVersions(db).some((v) => v >= 16)).toBe(false);

    // 升级
    reinit(env);
    db = env.db;

    expect(recordedVersions(db)).toEqual(codeMigrationVersions());
    // v16 口径：迁移到 sort_order 最小的首个批次
    const first = db.prepare('SELECT size_data FROM sample_runs WHERE id = ?').get(run1);
    expect(JSON.parse(first.size_data)).toEqual(SD);
    // 非首批次不被写入
    expect(db.prepare('SELECT size_data FROM sample_runs WHERE id = ?').get(run2).size_data).toBe('[]');
    // v16 迁移后清空 + v21 再删列：tasks.size_data 列已不存在
    expect(columnsOf(db, 'tasks')).not.toContain('size_data');
  });
});
