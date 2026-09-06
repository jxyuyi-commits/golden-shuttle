// 款式(Styles) 路由：HTTP 适配层
const styleService = require('../services/styles.cjs');

function registerStyleRoutes(app) {
  app.get('/api/styles', (req, res) => {
    try {
      const { style_no } = req.query;
      if (style_no) {
        return res.json(styleService.findByNo(style_no));
      }
      res.json(styleService.listAll());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // REQ-004 ①：款式基本信息独立编辑（款级权威，同款所有打样单同步）
  app.put('/api/styles/:id', (req, res) => {
    try {
      const updated = styleService.update(req.params.id, req.body || {});
      if (!updated) return res.status(404).json({ error: '款式不存在' });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerStyleRoutes };
