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

  // REQ-019：人员改名，事务内同步全站引用（预设/款式设计师/批次版师·样衣工）
  app.patch('/api/people/rename', (req, res) => {
    try {
      const { oldName, newName } = req.body || {};
      res.json(settingsService.renamePerson(oldName, newName));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}

module.exports = { registerSettingsRoutes };
