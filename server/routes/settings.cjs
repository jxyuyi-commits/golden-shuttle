// 系统设置(Settings) 路由：HTTP 适配层
const settingsService = require('../services/settings.cjs');

function registerSettingsRoutes(app) {
  app.get('/api/settings', (req, res) => {
    try { res.json(settingsService.getAll()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/settings', (req, res) => {
    try {
      const { key, value } = req.body;
      res.json(settingsService.set(key, value));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}

module.exports = { registerSettingsRoutes };
