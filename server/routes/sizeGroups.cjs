// 号型规格系列(Size Groups) 路由：HTTP 适配层
const sizeGroupService = require('../services/sizeGroups.cjs');

function registerSizeGroupRoutes(app) {
  app.get('/api/size-groups', (req, res) => {
    try { res.json(sizeGroupService.list()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/size-groups', (req, res) => {
    try {
      const id = sizeGroupService.create(req.body);
      res.json({ id, success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/size-groups/:id', (req, res) => {
    try { res.json(sizeGroupService.update(req.params.id, req.body)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/size-groups/:id', (req, res) => {
    try { res.json(sizeGroupService.remove(req.params.id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
}

module.exports = { registerSizeGroupRoutes };
