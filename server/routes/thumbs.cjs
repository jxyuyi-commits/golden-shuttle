// 图纸专业格式缩略图路由：GET /api/drawing-thumb?url=/uploads/xxx.emf
// EMF → PNG、DXF → SVG（见 services/thumbs.cjs），带缓存
const path = require('path');
const fs = require('fs');
const { getThumb } = require('../services/thumbs.cjs');

function registerThumbRoutes(app) {
  app.get('/api/drawing-thumb', async (req, res) => {
    const url = req.query.url;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'missing url param' });
    }
    try {
      const thumbPath = await getThumb(url);
      if (!thumbPath) {
        return res.status(404).json({ error: 'thumbnail not available for this format' });
      }
      const ext = path.extname(thumbPath).toLowerCase();
      res.type(ext === '.svg' ? 'image/svg+xml' : 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      fs.createReadStream(thumbPath).pipe(res);
    } catch (e) {
      console.error('[Thumb route]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { registerThumbRoutes };
