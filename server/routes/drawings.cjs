// 图纸资料 路由：HTTP 适配层，业务逻辑在 services/drawings.cjs
const drawingService = require('../services/drawings.cjs');

function registerDrawingRoutes(app) {
  app.get('/api/drawings', (req, res) => {
    try {
      if (!req.query.task_id) return res.status(400).json({ error: 'task_id required' });
      res.json(drawingService.listByTask(req.query.task_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/drawings', (req, res) => {
    try {
      if (!req.body.task_id) return res.status(400).json({ error: 'task_id required' });
      const id = drawingService.create(req.body);
      res.json({ id });
    } catch (err) {
      console.error('[POST DRAWINGS]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/drawings/:id', (req, res) => {
    try {
      res.json(drawingService.update(req.params.id, req.body));
    } catch (err) {
      console.error('[PATCH DRAWINGS]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/drawings/:id', (req, res) => {
    try {
      res.json(drawingService.remove(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerDrawingRoutes };
