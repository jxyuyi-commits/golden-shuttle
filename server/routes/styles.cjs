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
}

module.exports = { registerStyleRoutes };
