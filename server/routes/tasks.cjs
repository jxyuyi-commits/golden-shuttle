// 打样单(Tasks) 路由：HTTP 适配层，业务逻辑在 services/tasks.cjs
const taskService = require('../services/tasks.cjs');

function registerTaskRoutes(app) {
  app.get('/api/tasks', (req, res) => {
    try { res.json(taskService.list()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/tasks/:id', (req, res) => {
    try {
      const row = taskService.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/tasks/versions/:style_id', (req, res) => {
    try { res.json(taskService.versions(req.params.style_id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/tasks', (req, res) => {
    try {
      const newTaskId = taskService.create(req.body);
      res.json({ id: newTaskId });
    } catch (err) {
      console.error('[POST Task]', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/tasks/:id', (req, res) => {
    try {
      const result = taskService.update(req.params.id, req.body);
      if (!result) return res.status(404).json({ error: 'Not found' });
      res.json(result);
    } catch (err) {
      console.error('[PATCH Task]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/tasks/:id', (req, res) => {
    try { res.json(taskService.remove(req.params.id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
}

module.exports = { registerTaskRoutes };
