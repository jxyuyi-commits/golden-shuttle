// API 基础配置
// 传输方式：纯 HTTP（fetch）。G14 已回归单一 HTTP 通道。
//
// 背景（为什么放弃 IPC 双通道）：此前实现过 "IPC / HTTP 双通道"（P2-IPC）——Electron
// 渲染进程优先走 preload 暴露的 IPC 白名单，其余回退 HTTP(fetch)。但该方案只映射了
// 46 个接口中的 26 个，剩余 20 个本就一直走 HTTP，等于把一条链路做成半成品：调用路径
// 分裂、问题难以定位，且并未解决任何实际问题。经评估后前端调用侧删除 IPC 分支，
// 全部 46 个业务接口统一走 fetch（HTTP）。
//
// 注：preload.js 与 main.js 中的 IPC 注册（contextBridge 白名单）作为已交付的既有能力
//      原样保留，仅前端不再调用它们。

export const API = window.location.origin.includes('5173')
  ? 'http://localhost:3001'
  : window.location.origin;

// 拼接完整 URL
export const apiUrl = (path) => (path.startsWith('http') ? path : `${API}${path}`);

/**
 * 通用请求封装：统一走 HTTP(fetch)。
 * 保留原有行为：默认 JSON 请求头、!res.ok 时抛出含响应体文本的错误、成功返回 res.json()。
 * @param {string} path - API 路径
 * @param {RequestInit} [options] - fetch 选项
 * @returns {Promise<any>} 解析后的 JSON
 */
export async function request(path, options = {}) {
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
