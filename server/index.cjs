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
const { registerThumbRoutes } = require('./routes/thumbs.cjs');
const { registerSampleRunRoutes } = require('./routes/sampleRuns.cjs');
const { registerVersionRoutes } = require('./routes/versions.cjs');
const { recalcAllTaskStatus } = require('./services/tasks.cjs');

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
app.use(express.json({ limit: '100mb' })); // 支持 base64 大文件（含 dxf 等专业格式）

// 请求日志：仅记录 method + path + 响应状态 + 耗时(ms)，默认不记录 body
// （body 含备注/设计稿等隐私内容，且 base64 大文件完整 JSON.stringify 会阻塞主线程）。
// 如需排查 body：显式设置 LOG_BODY=1；序列化前先按体积判断，超出阈值只记字节数，绝不完整序列化超大 body。
const LOG_BODY = process.env.LOG_BODY === '1';
const LOG_BODY_MAX_BYTES = 2000; // 超过此体积不序列化 body，仅记 [body omitted]
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    let bodyInfo = '';
    if (LOG_BODY && req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
      const approxBytes = Number(req.headers['content-length']) || 0;
      if (approxBytes > LOG_BODY_MAX_BYTES) {
        bodyInfo = ` body=[body omitted: ${approxBytes} bytes]`;
      } else {
        let json = '';
        try { json = JSON.stringify(req.body); } catch { json = '[unserializable]'; }
        bodyInfo = ` body=${json.slice(0, 300)}`;
      }
    }
    console.log(`[REQ] ${new Date().toISOString().slice(11, 19)} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms${bodyInfo}`);
  });
  next();
});

// ── 服务启动封装 ─────────────────────────────────────────────
function startServer(overridePort, dbPath, uploadsPath) {
  // 初始化数据库和文件目录
  initDatabase(dbPath, uploadsPath);

  // REQ-025：存量款级状态按新口径（完成=全部批次已完成）重算归位，幂等
  try { recalcAllTaskStatus(); console.log('[REQ-025] 款级状态已按新口径重算'); } catch (e) { console.log('[REQ-025] 重算跳过: ' + e.message); }

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
  registerThumbRoutes(app);
  registerSampleRunRoutes(app);
  registerVersionRoutes(app);

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
