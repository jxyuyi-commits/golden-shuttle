const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initDatabase, getUploadsDir } = require('./db.cjs');
const { registerStyleRoutes } = require('./routes/styles.cjs');
const { registerTaskRoutes } = require('./routes/tasks.cjs');
const { registerFileRoutes } = require('./routes/files.cjs');
const { registerMeasurementRoutes } = require('./routes/measurement.cjs');
const { registerSettingsRoutes } = require('./routes/settings.cjs');
const { registerSizeGroupRoutes } = require('./routes/sizeGroups.cjs');
const { registerBomRoutes } = require('./routes/bom.cjs');
const { registerProcessRoutes } = require('./routes/process.cjs');
const { registerDrawingRoutes } = require('./routes/drawings.cjs');

const app = express();
const port = 3001;

// CORS 白名单（P0-2）：仅放行本机回环来源（Vite dev 5173 / 生产同源 3001 / file:// / 无 Origin），
// 拒绝任意外部源，防止任意网页读写本地数据库。
// 注意：cors 库对函数型 origin 采用 (origin, callback) 回调约定，必须调用 callback 放行，否则请求会卡死。
const isAllowedOrigin = (origin, callback) => {
  if (!origin) return callback(null, true); // 同源请求、curl 等无 Origin 头
  try {
    const u = new URL(origin);
    const allowed =
      u.protocol === 'file:' ||
      ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
        (u.port === '' || u.port === '5173' || u.port === '3001'));
    return callback(null, allowed);
  } catch {
    return callback(null, false);
  }
};
app.use(cors({ origin: isAllowedOrigin }));
app.use(express.json({ limit: '50mb' })); // 支持 base64 PDF

// ── 服务启动封装 ─────────────────────────────────────────────
function startServer(overridePort, dbPath, uploadsPath) {
  // 初始化数据库和文件目录
  initDatabase(dbPath, uploadsPath);

  // 注册所有路由
  registerStyleRoutes(app);
  registerTaskRoutes(app);
  registerFileRoutes(app);
  registerMeasurementRoutes(app);
  registerSettingsRoutes(app);
  registerSizeGroupRoutes(app);
  registerBomRoutes(app);
  registerProcessRoutes(app);
  registerDrawingRoutes(app);

  // 静态文件服务
  app.use('/uploads', express.static(getUploadsDir()));

  // 处理打包后的静态资源路径
  const DIST_DIR = path.join(__dirname, '../dist');
  if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    app.get(/(.*)/, (req, res, next) => {
      if (!req.path.startsWith('/api/') && !req.path.startsWith('/uploads/')) {
        res.sendFile(path.join(DIST_DIR, 'index.html'));
      } else {
        next();
      }
    });
  }

  return new Promise((resolve) => {
    const p = overridePort || port;
    // P0-1：仅绑定本机回环地址（localhost），不暴露局域网
    const server = app.listen(p, 'localhost', () => {
      console.log(`PatternMaster Backend running at http://localhost:${p}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
