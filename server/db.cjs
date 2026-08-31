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
          sample_type TEXT DEFAULT '',
          sample_color TEXT DEFAULT '',
          size TEXT DEFAULT '',
          sample_count INTEGER DEFAULT 1,
          fabric_date TEXT DEFAULT '',
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
