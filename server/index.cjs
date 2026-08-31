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

const app = express();
const port = 3001;

app.use(cors());
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
    const server = app.listen(p, () => {
      console.log(`PatternMaster Backend running at http://localhost:${p}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
