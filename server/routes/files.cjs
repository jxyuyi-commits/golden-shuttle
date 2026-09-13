// 文件(File) 路由：HTTP 适配层
const fileService = require('../services/files.cjs');

function registerFileRoutes(app) {
  // 上传设计稿（PDF/图片/专业格式，base64）——白名单 + 大小上限在服务层校验
  app.post('/api/upload-pdf', (req, res) => {
    try {
      const { filename, data } = req.body || {};
      res.json(fileService.save(filename, data));
    } catch (err) {
      // 校验类错误（扩展名/大小/内容）由服务层带 statusCode=400，不落盘
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // 用本地默认程序打开文件
  app.post('/api/open-pdf', (req, res) => {
    try {
      const { url } = req.body || {};
      res.json(fileService.openLocally(url));
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : (err.statusCode || 500);
      res.status(status).json({ error: err.message });
    }
  });
}

module.exports = { registerFileRoutes };
