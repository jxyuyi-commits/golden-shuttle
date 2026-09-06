const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/** @type {import('better-sqlite3').Database | null} */
let db = null;
/** @type {string} */
let UPLOADS_DIR = '';
/** @type {string} */
let DB_PATH = '';

/**
 * 检查表中是否存在指定列
 * @param {string} table - 表名
 * @param {string} column - 列名
 * @returns {boolean}
 */
function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

/**
 * 列不存在时添加列（幂等）
 * @param {string} table - 表名
 * @param {string} column - 列名
 * @param {string} definition - 列定义（如 'TEXT DEFAULT \'\''）
 */
function addColumnIfNotExists(table, column, definition) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[DB] Added column: ${table}.${column}`);
  }
}

/**
 * 删除死列（SQLite >= 3.35）
 * @param {string} table - 表名
 * @param {string} column - 列名
 */
function dropColumnIfExists(table, column) {
  if (columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    console.log(`[DB] Dropped dead column: ${table}.${column}`);
  }
}

// ── 版本化迁移定义 ──────────────────────────────────────────
// 每个迁移有 version（唯一递增）和 up() 函数
// _migrations 表记录已执行的版本，确保每个迁移只执行一次
const migrations = [
  {
    version: 1,
    description: '初始建表',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS styles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          style_no TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          brand TEXT DEFAULT '',
          designer TEXT DEFAULT '',
          year TEXT DEFAULT '',
          season TEXT DEFAULT '',
          month TEXT DEFAULT '',
          category TEXT DEFAULT '',
          pdf_url TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          style_id INTEGER NOT NULL,
          order_no TEXT DEFAULT '',
          priority TEXT DEFAULT '中',
          start_date TEXT DEFAULT '',
          expected_date TEXT DEFAULT '',
          finish_date TEXT DEFAULT '',
          audit_status TEXT DEFAULT '待审核',
          audit_comment TEXT DEFAULT '',
          status TEXT DEFAULT 'todo',
          progress_nodes TEXT DEFAULT '[]',
          image_url TEXT DEFAULT '',
          fabric_req TEXT DEFAULT '',
          trim_req TEXT DEFAULT '',
          process_req TEXT DEFAULT '',
          note TEXT DEFAULT '',
          size_data TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(style_id) REFERENCES styles(id)
        );

        CREATE TABLE IF NOT EXISTS measurement_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL,
          code TEXT DEFAULT '',
          name TEXT NOT NULL,
          method TEXT DEFAULT '',
          tolerance TEXT DEFAULT '',
          grading_rule TEXT DEFAULT '',
          sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS size_groups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          size_list TEXT NOT NULL,
          is_default INTEGER DEFAULT 0
        );
      `);
    }
  },
  {
    version: 2,
    description: '补充列（历史遗留迁移）',
    up: () => {
      addColumnIfNotExists('tasks', 'updated_at', 'DATETIME');
      addColumnIfNotExists('tasks', 'size_data', "TEXT DEFAULT '[]'");
      addColumnIfNotExists('tasks', 'image_url', "TEXT DEFAULT ''");
      addColumnIfNotExists('tasks', 'fabric_req', "TEXT DEFAULT ''");
      addColumnIfNotExists('tasks', 'trim_req', "TEXT DEFAULT ''");
      addColumnIfNotExists('tasks', 'process_req', "TEXT DEFAULT ''");
      addColumnIfNotExists('styles', 'updated_at', 'DATETIME');
      addColumnIfNotExists('measurement_templates', 'is_required', 'INTEGER DEFAULT 0');
      // 注意：不再添加 standard_size 和 size_group_id（死列，见 v4 清理）
    }
  },
  {
    version: 3,
    description: '添加查询索引',
    up: () => {
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_style_id ON tasks(style_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_measurement_category ON measurement_templates(category)');
    }
  },
  {
    version: 4,
    description: '清理死列：tasks.standard_size, styles.size_group_id',
    up: () => {
      dropColumnIfExists('tasks', 'standard_size');
      dropColumnIfExists('styles', 'size_group_id');
    }
  },
  {
    version: 5,
    description: '新增 BOM 物料清单 + 工艺指示 两张表',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS bom_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          category TEXT DEFAULT '主料',
          name TEXT DEFAULT '',
          spec TEXT DEFAULT '',
          color TEXT DEFAULT '',
          unit TEXT DEFAULT '',
          usage REAL DEFAULT 0,
          supplier TEXT DEFAULT '',
          price REAL DEFAULT 0,
          note TEXT DEFAULT '',
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS process_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          section TEXT DEFAULT '部位工艺',
          name TEXT DEFAULT '',
          requirement TEXT DEFAULT '',
          standard TEXT DEFAULT '',
          note TEXT DEFAULT '',
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_bom_task_id ON bom_items(task_id);
        CREATE INDEX IF NOT EXISTS idx_process_task_id ON process_items(task_id);
      `);
    }
  },
  {
    version: 6,
    description: '新增图纸资料 drawings 表（技术图纸/纸样/放码图等）',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS drawings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          category TEXT DEFAULT '设计稿',
          title TEXT DEFAULT '',
          filename TEXT DEFAULT '',
          url TEXT DEFAULT '',
          note TEXT DEFAULT '',
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_drawings_task_id ON drawings(task_id);
      `);
    }
  },
  {
    version: 7,
    description: '图纸资料分类细化：技术图纸→参考图、放码图→唛架图',
    up: () => {
      db.exec(`
        UPDATE drawings SET category = '参考图' WHERE category = '技术图纸';
        UPDATE drawings SET category = '唛架图' WHERE category = '放码图';
      `);
    }
  },
  {
    version: 8,
    description: '图纸资料版本管控：kind/file_hash/version/group_id + 历史数据归组',
    up: () => {
      db.exec(`
        ALTER TABLE drawings ADD COLUMN kind TEXT DEFAULT 'output';
        ALTER TABLE drawings ADD COLUMN file_hash TEXT DEFAULT '';
        ALTER TABLE drawings ADD COLUMN version INTEGER DEFAULT 1;
        ALTER TABLE drawings ADD COLUMN group_id INTEGER;
      `);
      // 历史数据：kind 按分类推断；同 task+同名+同 kind 归入同一版本组（按 id 序赋 version）
      const refCats = ['参考图', '成衣图'];
      const rows = db.prepare('SELECT id, task_id, category, filename FROM drawings').all();
      for (const r of rows) {
        const kind = refCats.includes(r.category) ? 'reference' : 'output';
        db.prepare('UPDATE drawings SET kind = ? WHERE id = ?').run(kind, r.id);
      }
      // 按 (task_id, kind, filename) 分组：group_id = 组内最小 id，version 按 id 递增
      const groups = db.prepare(`
        SELECT task_id, kind, filename, MIN(id) as gid FROM drawings
        GROUP BY task_id, kind, filename
      `).all();
      for (const g of groups) {
        const members = db.prepare(`
          SELECT id FROM drawings
          WHERE task_id = ? AND kind = ? AND filename = ?
          ORDER BY id ASC
        `).all(g.task_id, g.kind, g.filename);
        members.forEach((m, i) => {
          db.prepare('UPDATE drawings SET group_id = ?, version = ? WHERE id = ?')
            .run(g.gid, i + 1, m.id);
        });
      }
    }
  },
  {
    version: 9,
    description: '操作日志：operation_logs 表',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS operation_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER,
          action TEXT NOT NULL,
          detail TEXT DEFAULT '',
          operator TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_operation_logs_task ON operation_logs(task_id);
        CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON operation_logs(created_at);
      `);
    }
  },
  {
    version: 10,
    description: '版次批次 sample_runs 表 + 存量同款重复单合并（一单一款）',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sample_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          sample_type TEXT DEFAULT '',
          size TEXT DEFAULT '',
          sample_color TEXT DEFAULT '',
          sample_count INTEGER DEFAULT 1,
          priority TEXT DEFAULT '中',
          status TEXT DEFAULT 'waiting_material',
          blocker TEXT DEFAULT 'none',
          pattern_maker TEXT DEFAULT '',
          sample_maker TEXT DEFAULT '',
          fabric_date TEXT DEFAULT '',
          start_date TEXT DEFAULT '',
          expected_date TEXT DEFAULT '',
          finish_date TEXT DEFAULT '',
          note TEXT DEFAULT '',
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sample_runs_task ON sample_runs(task_id);
      `);

      // 1) 为每个现有 task 用其批次字段建一条 sample_run（task.status 粗略映射批次状态）
      const tasks = db.prepare('SELECT * FROM tasks').all();
      const insRun = db.prepare(`
        INSERT INTO sample_runs
          (task_id, sample_type, size, sample_color, sample_count, priority, status,
           fabric_date, start_date, expected_date, finish_date, note, sort_order)
        VALUES (@task_id, @sample_type, @size, @sample_color, @sample_count, @priority, @status,
                @fabric_date, @start_date, @expected_date, @finish_date, @note, @sort_order)
      `);
      const mapStatus = (s) => s === 'done' ? 'done' : s === 'doing' || s === 'in_progress' ? 'pattern_making' : 'waiting_material';
      for (const t of tasks) {
        insRun.run({
          task_id: t.id,
          sample_type: t.sample_type || '',
          size: t.size || '',
          sample_color: t.sample_color || '',
          sample_count: t.sample_count || 1,
          priority: t.priority || '中',
          status: mapStatus(t.status),
          fabric_date: t.fabric_date || '',
          start_date: t.start_date || '',
          expected_date: t.expected_date || '',
          finish_date: t.finish_date || '',
          note: '',
          sort_order: t.id,
        });
      }

      // 2) 同款重复单合并：style_id 相同的多张单，保留最小 id 为主单，其余单的子数据归并后删除
      const groups = db.prepare(`
        SELECT style_id, GROUP_CONCAT(id) AS ids FROM tasks
        WHERE style_id IS NOT NULL
        GROUP BY style_id HAVING COUNT(*) > 1
      `).all();
      const reassign = (table, fromId, toId) => {
        db.prepare(`UPDATE ${table} SET task_id = ? WHERE task_id = ?`).run(toId, fromId);
      };
      for (const g of groups) {
        const ids = g.ids.split(',').map(Number).sort((a, b) => a - b);
        const mainId = ids[0];
        for (const dupId of ids.slice(1)) {
          // 先归并所有子数据到主单（必须在删单前，避免 ON DELETE CASCADE 级联删除）
          reassign('sample_runs', dupId, mainId);
          reassign('drawings', dupId, mainId);
          reassign('bom_items', dupId, mainId);
          reassign('process_items', dupId, mainId);
          reassign('operation_logs', dupId, mainId);
          // 主单 status 取更"靠前"的进度（doing 优先于 todo，done 最后）
          const main = db.prepare('SELECT status FROM tasks WHERE id = ?').get(mainId);
          const dup = db.prepare('SELECT status FROM tasks WHERE id = ?').get(dupId);
          const rank = { todo: 0, in_progress: 1, doing: 1, done: 2 };
          if ((rank[dup.status] ?? 0) > (rank[main.status] ?? 0)) {
            db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(dup.status, mainId);
          }
          db.prepare('DELETE FROM tasks WHERE id = ?').run(dupId);
          console.log(`[DB v10] merged task ${dupId} -> main task ${mainId} (style_id=${g.style_id})`);
        }
        // 主单内批次重排 sort_order
        const runs = db.prepare('SELECT id FROM sample_runs WHERE task_id = ? ORDER BY sort_order ASC, id ASC').all(mainId);
        runs.forEach((r, i) => db.prepare('UPDATE sample_runs SET sort_order = ? WHERE id = ?').run(i, r.id));
      }
    }
  },
  {
    version: 11,
    description: 'sample_runs 加 linked_drawing_ids（批次绑定的图纸资料版本，JSON 数组）',
    up: () => {
      const cols = db.prepare("PRAGMA table_info(sample_runs)").all().map(c => c.name);
      if (!cols.includes('linked_drawing_ids')) {
        db.exec("ALTER TABLE sample_runs ADD COLUMN linked_drawing_ids TEXT DEFAULT '[]'");
      }
    }
  },
  {
    version: 12,
    description: '清理 tasks 旧批次字段（sample_type/sample_color/size/sample_count/fabric_date，权威数据已在 sample_runs，v10 迁移已落位）',
    up: () => {
      const LEGACY_COLS = ['sample_type', 'sample_color', 'size', 'sample_count', 'fabric_date'];
      for (const col of LEGACY_COLS) dropColumnIfExists('tasks', col);
    }
  },
  {
    version: 13,
    description: '批次负责人拆分版师/样衣工（sample_runs 加 pattern_maker/sample_maker；旧 assignee 值并入版师后删除，REQ-003②）',
    up: () => {
      const cols = db.prepare("PRAGMA table_info(sample_runs)").all().map(c => c.name);
      if (!cols.includes('pattern_maker')) db.exec("ALTER TABLE sample_runs ADD COLUMN pattern_maker TEXT DEFAULT ''");
      if (!cols.includes('sample_maker')) db.exec("ALTER TABLE sample_runs ADD COLUMN sample_maker TEXT DEFAULT ''");
      if (cols.includes('assignee')) {
        // 原单一「负责人」语义更接近版师（打版阶段主导），并入 pattern_maker 后删列
        db.exec("UPDATE sample_runs SET pattern_maker = assignee WHERE assignee IS NOT NULL AND assignee != '' AND pattern_maker = ''");
        dropColumnIfExists('sample_runs', 'assignee');
      }
    }
  }
];

// ── 迁移执行器 ──────────────────────────────────────────────
function runMigrations() {
  // 创建迁移记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      description TEXT,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const executed = new Set(
    db.prepare('SELECT version FROM _migrations').all().map(r => r.version)
  );

  for (const migration of migrations) {
    if (executed.has(migration.version)) continue;

    console.log(`[DB] Running migration v${migration.version}: ${migration.description}`);
    const run = db.transaction(() => {
      migration.up();
      db.prepare('INSERT INTO _migrations (version, description) VALUES (?, ?)')
        .run(migration.version, migration.description);
    });
    run();
    console.log(`[DB] Migration v${migration.version} complete.`);
  }

  console.log(`[DB] All migrations up to date (latest: v${migrations[migrations.length - 1].version}).`);
}

/**
 * 初始化数据库连接、执行版本化迁移
 * @param {string} [dbPath] - 数据库文件路径（可覆盖默认值，用于测试库）
 * @param {string} [uploadsPath] - 上传目录路径（可覆盖默认值）
 * @returns {import('better-sqlite3').Database}
 */
function initDatabase(dbPath, uploadsPath) {
  DB_PATH = dbPath || process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
  UPLOADS_DIR = uploadsPath || process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  console.log('[DB] Connecting to:', DB_PATH);
  console.log('[DB] Uploads dir:', UPLOADS_DIR);

  db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  runMigrations();

  return db;
}

/**
 * 获取数据库实例（须先 initDatabase）
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

/**
 * 获取上传目录
 * @returns {string}
 */
function getUploadsDir() {
  return UPLOADS_DIR;
}

module.exports = { initDatabase, getDb, getUploadsDir };
