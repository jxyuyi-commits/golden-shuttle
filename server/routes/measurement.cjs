// 尺寸部位预设(Measurement Templates) 路由：HTTP 适配层
const measurementService = require('../services/measurements.cjs');

function registerMeasurementRoutes(app) {
  app.get('/api/measurement-templates', (req, res) => {
    try { res.json(measurementService.list(req.query.category)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/measurement-templates', (req, res) => {
    try { res.json(measurementService.upsert(req.body)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/measurement-templates/:id', (req, res) => {
    try { res.json(measurementService.remove(req.params.id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
}

module.exports = { registerMeasurementRoutes };
