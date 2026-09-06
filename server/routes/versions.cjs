// 历史版本路由（REQ-011）：列表 / 单版详情 / 回滚
const versions = require('../services/versions.cjs');

const registerVersionRoutes = (app) => {
  // 版本列表（不含快照正文，倒序）
  app.get('/api/tasks/:id/versions', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    res.json(versions.list(id));
  });

  // 单版详情（含快照）
  app.get('/api/tasks/:id/versions/:vid', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const vid = parseInt(req.params.vid, 10);
    const row = versions.get(id, vid);
    if (!row) return res.status(404).json({ error: 'version not found' });
    let snap = null;
    try { snap = JSON.parse(row.snapshot); } catch { /* ignore */ }
    res.json({ id: row.id, version_no: row.version_no, summary: row.summary, created_at: row.created_at, snapshot: snap });
  });

  // 回滚到指定版本（回滚本身生成新版本）
  app.post('/api/tasks/:id/versions/:vid/rollback', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const vid = parseInt(req.params.vid, 10);
    const result = versions.rollback(id, vid);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });
};

module.exports = { registerVersionRoutes };
