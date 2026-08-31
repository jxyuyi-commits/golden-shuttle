// 文件(File) 路由：HTTP 适配层
const fileService = require('../services/files.cjs');

function registerFileRoutes(app) {
  // 上传设计稿（PDF/图片，base64）
  app.post('/api/upload-pdf', (req, res) => {
    try {
      const { filename, data } = req.body;
      res.json(fileService.save(filename, data));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 用本地默认程序打开文件
  app.post('/api/open-pdf', (req, res) => {
    try {
      const { url } = req.body;
      res.json(fileService.openLocally(url));
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 500)
        .json({ error: err.message });
    }
  });
}

module.exports = { registerFileRoutes };
