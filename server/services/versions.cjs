// 历史版本快照服务（REQ-011）：每次自动保存落库后记录版本，5 分钟编辑会话合并；
// 快照范围=款式信息+工作动态+说明+尺寸表+物料清单(BOM)+批次（回滚只恢复款式/尺寸表/BOM，批次为独立工作流不回滚）
const { getDb } = require('../db.cjs');

// 版本合并窗口（毫秒）：同一款 5 分钟内多次保存合并为一条版本
const MERGE_WINDOW_MS = 5 * 60 * 1000;

/** 组装单款全量快照（styles + tasks + sample_runs + bom_items） */
function buildSnapshot(taskId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return null;
  const style = db.prepare('SELECT * FROM styles WHERE id = ?').get(task.style_id);
  const runs = db.prepare('SELECT * FROM sample_runs WHERE task_id = ? ORDER BY sort_order ASC, id ASC').all(taskId);
  const boms = db.prepare('SELECT * FROM bom_items WHERE task_id = ? ORDER BY id ASC').all(taskId);
  const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
  return {
    task: {
      style_no: style?.style_no || '',
      title: style?.title || '',
      brand: style?.brand || '',
      designer: style?.designer || '',
      year: style?.year || '',
      season: style?.season || '',
      month: style?.month || '',
      category: style?.category || '',
      pdf_url: style?.pdf_url || '',
      priority: task.priority || '中',
      start_date: task.start_date || '',
      expected_date: task.expected_date || '',
      finish_date: task.finish_date || '',
      progress_nodes: parse(task.progress_nodes, []),
      fabric_req: task.fabric_req || '',
      trim_req: task.trim_req || '',
      process_req: task.process_req || '',
      note: task.note || '',
    },
    size_data: parse(task.size_data, []),
    bom: boms.map(b => ({
      id: b.id, category: b.category, name: b.name, spec: b.spec, color: b.color,
      unit: b.unit, usage: b.usage, supplier: b.supplier, price: b.price, note: b.note,
    })),
    runs: runs.map(r => ({
      id: r.id, order_no: r.order_no, sample_type: r.sample_type, size: r.size,
      sample_color: r.sample_color, sample_count: r.sample_count, status: r.status,
      pattern_maker: r.pattern_maker, sample_maker: r.sample_maker,
      audit_status: r.audit_status, audit_comment: r.audit_comment,
    })),
    saved_at: new Date().toISOString(),
  };
}

/** 计算两版快照的变更字段摘要（中文标签） */
const FIELD_LABELS = {
  style_no: '款号', title: '款式名称', category: '款式类别', brand: '品牌', designer: '设计师',
  year: '年度', season: '季节', month: '波段', pdf_url: '设计稿',
  priority: '优先级', start_date: '任务开始', expected_date: '预计完工', finish_date: '实际完工',
  progress_nodes: '工作动态', fabric_req: '面料要求', trim_req: '辅料要求', process_req: '工艺建议', note: '打样说明',
  size_data: '尺寸表', bom: '物料清单(BOM)',
};
function diffSummary(prev, next) {
  if (!prev) return '首次快照';
  const changed = [];
  const sections = [
    ['款式信息', ['style_no', 'title', 'category', 'brand', 'designer', 'year', 'season', 'month', 'pdf_url']],
    ['任务字段', ['priority', 'start_date', 'expected_date', 'finish_date', 'progress_nodes', 'fabric_req', 'trim_req', 'process_req', 'note']],
    ['尺寸表', ['size_data']],
    ['物料清单', ['bom']],
  ];
  for (const [label, keys] of sections) {
    const hit = keys.filter(k => JSON.stringify(prev.task?.[k] ?? prev[k]) !== JSON.stringify(next.task?.[k] ?? next[k]));
    if (hit.length) changed.push(`${label}(${hit.map(k => FIELD_LABELS[k] || k).join('/')})`);
  }
  return changed.length ? changed.join('；') : '细节微调';
}

/** 版本号：该款版本序号（1 起，连续） */
function nextVersionNo(taskId) {
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(MAX(version_no), 0) AS m FROM task_versions WHERE task_id = ?').get(taskId);
  return row.m + 1;
}

/**
 * 记录版本（自动保存落库后调用）：5 分钟窗口内合并到上一条版本，否则新建
 */
function capture(taskId) {
  const db = getDb();
  const snap = buildSnapshot(taskId);
  if (!snap) return null;
  const last = db.prepare('SELECT * FROM task_versions WHERE task_id = ? ORDER BY id DESC LIMIT 1').get(taskId);
  const now = Date.now();
  if (last) {
    const lastTime = new Date(last.created_at.replace(' ', 'T')).getTime();
    if (!isNaN(lastTime) && (now - lastTime) < MERGE_WINDOW_MS) {
      const prevSnap = JSON.parse(last.snapshot);
      const summary = diffSummary(prevSnap, snap);
      db.prepare('UPDATE task_versions SET snapshot = ?, summary = ?, created_at = datetime(\'now\',\'localtime\') WHERE id = ?')
        .run(JSON.stringify(snap), summary, last.id);
      return { id: last.id, merged: true, version_no: last.version_no };
    }
  }
  const versionNo = nextVersionNo(taskId);
  const summary = last ? diffSummary(JSON.parse(last.snapshot), snap) : '首次快照';
  // created_at 显式用本地时间（表默认 CURRENT_TIMESTAMP 为 UTC，会导致合并窗口判断错乱）
  const info = db.prepare('INSERT INTO task_versions (task_id, version_no, snapshot, summary, created_at) VALUES (?, ?, ?, ?, datetime(\'now\',\'localtime\'))')
    .run(taskId, versionNo, JSON.stringify(snap), summary);
  return { id: info.lastInsertRowid, merged: false, version_no: versionNo };
}

/** 版本列表（倒序，不含快照正文） */
function list(taskId) {
  return getDb().prepare(
    'SELECT id, version_no, summary, created_at FROM task_versions WHERE task_id = ? ORDER BY id DESC'
  ).all(taskId);
}

/** 单版详情（含快照正文） */
function get(taskId, versionId) {
  return getDb().prepare('SELECT * FROM task_versions WHERE task_id = ? AND id = ?').get(taskId, versionId) || null;
}

/**
 * 回滚到指定版本：恢复款式信息+尺寸表+工作动态/说明+BOM（重建行）；
 * 批次为独立工作流不回滚；回滚本身生成一条新版本（note 标注来源）
 */
function rollback(taskId, versionId) {
  const db = getDb();
  const row = get(taskId, versionId);
  if (!row) return { success: false, error: '版本不存在' };
  const snap = JSON.parse(row.snapshot);

  const tx = db.transaction(() => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) throw new Error('款单不存在');
    // 1) 款式信息（styles）
    const s = snap.task || {};
    db.prepare(`UPDATE styles SET style_no=@style_no, title=@title, brand=@brand, designer=@designer,
      year=@year, season=@season, month=@month, category=@category, pdf_url=@pdf_url, updated_at=CURRENT_TIMESTAMP WHERE id=@id`)
      .run({ ...s, id: task.style_id });
    // 2) 任务字段（尺寸表/工作动态/说明）
    db.prepare(`UPDATE tasks SET size_data=@size_data, progress_nodes=@progress_nodes,
      note=@note, fabric_req=@fabric_req, trim_req=@trim_req, process_req=@process_req,
      priority=@priority, start_date=@start_date, expected_date=@expected_date, finish_date=@finish_date,
      updated_at=CURRENT_TIMESTAMP WHERE id=@id`)
      .run({
        id: taskId,
        size_data: JSON.stringify(snap.size_data || []),
        progress_nodes: JSON.stringify(snap.task?.progress_nodes || []),
        note: s.note || '', fabric_req: s.fabric_req || '', trim_req: s.trim_req || '', process_req: s.process_req || '',
        priority: s.priority || '中', start_date: s.start_date || '', expected_date: s.expected_date || '', finish_date: s.finish_date || '',
      });
    // 3) BOM 重建（删除现有行，按快照重插）
    db.prepare('DELETE FROM bom_items WHERE task_id = ?').run(taskId);
    const insBom = db.prepare(`INSERT INTO bom_items (task_id, category, name, spec, color, unit, usage, supplier, price, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const b of (snap.bom || [])) {
      insBom.run(taskId, b.category || '主料', b.name || '', b.spec || '', b.color || '',
        b.unit || '', b.usage || 0, b.supplier || '', b.price || 0, b.note || '');
    }
  });
  tx();

  // 回滚本身生成新版本（含来源标注）
  const snap2 = buildSnapshot(taskId);
  const versionNo = nextVersionNo(taskId);
  const info = db.prepare('INSERT INTO task_versions (task_id, version_no, snapshot, summary, created_at) VALUES (?, ?, ?, ?, datetime(\'now\',\'localtime\'))')
    .run(taskId, versionNo, JSON.stringify(snap2), `回滚自 V${row.version_no}（${row.summary}）`);
  return { success: true, version_id: info.lastInsertRowid, version_no: versionNo };
}

module.exports = { capture, list, get, rollback, buildSnapshot, diffSummary };
