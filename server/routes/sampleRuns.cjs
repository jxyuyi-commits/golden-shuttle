// 版次批次（sample_runs）路由：HTTP 适配层，业务逻辑在 services/sampleRuns.cjs
const runService = require('../services/sampleRuns.cjs');

function registerSampleRunRoutes(app) {
  // 某款单下的全部批次
  app.get('/api/tasks/:taskId/runs', (req, res) => {
    try {
      res.json(runService.listByTask(req.params.taskId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 新增批次
  app.post('/api/tasks/:taskId/runs', (req, res) => {
    try {
      const result = runService.create(req.params.taskId, req.body || {});
      res.json(result);
    } catch (err) {
      console.error('[POST Run]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 更新批次
  app.patch('/api/runs/:id', (req, res) => {
    try {
      const row = runService.update(req.params.id, req.body || {});
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      console.error('[PATCH Run]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 删除批次
  app.delete('/api/runs/:id', (req, res) => {
    try {
      res.json(runService.remove(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerSampleRunRoutes };
