// API 基础配置
// 双通道传输（P2 架构迁移）：
//   - Electron 渲染进程：window.api 存在 → 走 IPC（contextBridge 白名单）
//   - 普通浏览器/Vite 预览：window.api 不存在 → 回退 HTTP(fetch)
// 业务层接口完全不变，透明切换。

export const API = window.location.origin.includes('5173')
  ? 'http://localhost:3001'
  : window.location.origin;

// 拼接完整 URL
export const apiUrl = (path) => (path.startsWith('http') ? path : `${API}${path}`);

// 是否处于 Electron IPC 环境（preload 已注入 window.api）
const hasIPC = typeof window !== 'undefined' && !!window.api && !!window.api.tasks;

/**
 * 将 HTTP 风格的 path+method 映射为 IPC 调用。
 * @param {string} path - API 路径
 * @param {string} method - HTTP 方法（GET/POST/PATCH/DELETE）
 * @param {object} [body] - 请求体
 * @returns {Promise<any>|undefined} IPC 调用结果；不适用时返回 undefined
 */
function ipcRequest(path, method, body) {
  if (!hasIPC) return undefined;
  const api = window.api;
  let m;

  // 大文件上传保持 HTTP（base64 走 IPC 性能差）
  if (path === '/api/upload-pdf') return undefined;

  // Tasks
  if (method === 'GET' && path === '/api/tasks') return api.tasks.list();
  if (method === 'GET' && (m = path.match(/^\/api\/tasks\/(\d+)$/))) return api.tasks.get(m[1]);
  if (method === 'GET' && (m = path.match(/^\/api\/tasks\/versions\/(\d+)$/))) return api.tasks.versions(m[1]);
  if (method === 'POST' && path === '/api/tasks') return api.tasks.create(body);
  if (method === 'PATCH' && (m = path.match(/^\/api\/tasks\/(\d+)$/))) return api.tasks.update(m[1], body);
  if (method === 'DELETE' && (m = path.match(/^\/api\/tasks\/(\d+)$/))) return api.tasks.remove(m[1]);

  // Styles
  if (method === 'GET' && path === '/api/styles') return api.styles.list();
  if (method === 'GET' && (m = path.match(/^\/api\/styles\?style_no=(.+)$/))) {
    return api.styles.findByNo(decodeURIComponent(m[1]));
  }
  if (method === 'PUT' && (m = path.match(/^\/api\/styles\/(\d+)$/))) return api.styles.update(m[1], body);

  // Settings
  if (method === 'GET' && path === '/api/settings') return api.settings.getAll();
  if (method === 'POST' && path === '/api/settings') return api.settings.set(body.key, body.value);

  // Size Groups
  if (method === 'GET' && path === '/api/size-groups') return api.sizeGroups.list();
  if (method === 'POST' && path === '/api/size-groups') return api.sizeGroups.create(body);
  if (method === 'PATCH' && (m = path.match(/^\/api\/size-groups\/(\d+)$/))) return api.sizeGroups.update(m[1], body);
  if (method === 'DELETE' && (m = path.match(/^\/api\/size-groups\/(\d+)$/))) return api.sizeGroups.remove(m[1]);

  // Measurements
  if (method === 'GET' && path.startsWith('/api/measurement-templates')) {
    const catMatch = path.match(/category=([^&]*)/);
    return api.measurements.list(catMatch ? decodeURIComponent(catMatch[1]) : undefined);
  }
  if (method === 'POST' && path === '/api/measurement-templates') return api.measurements.upsert(body);
  if (method === 'DELETE' && (m = path.match(/^\/api\/measurement-templates\/(\d+)$/))) return api.measurements.remove(m[1]);

  // Files（本地打开走 IPC，上传走 HTTP）
  if (method === 'POST' && path === '/api/open-pdf') return api.files.openLocally(body.url);

  // Drawings（图纸资料元数据 CRUD；文件上传走 HTTP）
  if (method === 'GET' && (m = path.match(/^\/api\/drawings\?task_id=(\d+)$/))) return api.drawings.list(m[1]);
  if (method === 'GET' && (m = path.match(/^\/api\/drawings\/group\/(\d+)$/))) return api.drawings.groupList(m[1]);
  if (method === 'POST' && path === '/api/drawings') return api.drawings.create(body);
  if (method === 'PATCH' && (m = path.match(/^\/api\/drawings\/(\d+)$/))) return api.drawings.update(m[1], body);
  if (method === 'DELETE' && (m = path.match(/^\/api\/drawings\/group\/(\d+)$/))) return api.drawings.removeGroup(m[1]);
  if (method === 'DELETE' && (m = path.match(/^\/api\/drawings\/(\d+)$/))) return api.drawings.remove(m[1]);

  return undefined;
}

/**
 * 通用请求封装：优先 IPC，回退 HTTP
 * @param {string} path - API 路径
 * @param {RequestInit} [options] - fetch 选项
 * @returns {Promise<any>} 解析后的 JSON
 */
export async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  let body;
  if (options.body && typeof options.body === 'string') {
    try { body = JSON.parse(options.body); } catch { body = undefined; }
  }

  // 尝试 IPC 通道
  const ipcResult = ipcRequest(path, method, body);
  if (ipcResult !== undefined) return ipcResult;

  // 回退 HTTP 通道
  const res = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export const apiGet = (path) => request(path);
export const apiPost = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
export const apiPut = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
export const apiPatch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiDelete = (path) => request(path, { method: 'DELETE' });
