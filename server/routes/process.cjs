// 工艺指示 路由：HTTP 适配层，业务逻辑在 services/process.cjs
const processService = require('../services/process.cjs');

function registerProcessRoutes(app) {
  app.get('/api/process', (req, res) => {
    try {
      if (!req.query.task_id) return res.status(400).json({ error: 'task_id required' });
      res.json(processService.listByTask(req.query.task_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/process', (req, res) => {
    try {
      if (!req.body.task_id) return res.status(400).json({ error: 'task_id required' });
      const id = processService.create(req.body);
      res.json({ id });
    } catch (err) {
      console.error('[POST Process]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/process/:id', (req, res) => {
    try {
      res.json(processService.update(req.params.id, req.body));
    } catch (err) {
      console.error('[PATCH Process]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/process/:id', (req, res) => {
    try {
      res.json(processService.remove(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 整体替换（前端整表保存）
  app.put('/api/process/task/:taskId', (req, res) => {
    try {
      res.json(processService.replaceAll(req.params.taskId, req.body || []));
    } catch (err) {
      console.error('[PUT Process]', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerProcessRoutes };
