// BOM 物料清单 路由：HTTP 适配层，业务逻辑在 services/bom.cjs
const bomService = require('../services/bom.cjs');

function registerBomRoutes(app) {
  app.get('/api/bom', (req, res) => {
    try {
      if (!req.query.task_id) return res.status(400).json({ error: 'task_id required' });
      res.json(bomService.listByTask(req.query.task_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/bom', (req, res) => {
    try {
      if (!req.body.task_id) return res.status(400).json({ error: 'task_id required' });
      const id = bomService.create(req.body);
      res.json({ id });
    } catch (err) {
      console.error('[POST BOM]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/bom/:id', (req, res) => {
    try {
      res.json(bomService.update(req.params.id, req.body));
    } catch (err) {
      console.error('[PATCH BOM]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/bom/:id', (req, res) => {
    try {
      res.json(bomService.remove(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 整体替换（前端整表保存）
  app.put('/api/bom/task/:taskId', (req, res) => {
    try {
      res.json(bomService.replaceAll(req.params.taskId, req.body || []));
    } catch (err) {
      console.error('[PUT BOM]', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerBomRoutes };
