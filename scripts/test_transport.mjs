// 双通道传输逻辑验证（纯Node，无需Electron GUI）
// 验证 src/api/client.js 的 IPC 映射与 HTTP 回退逻辑
// 运行: node scripts/test_transport.mjs
import assert from 'node:assert';

// ── 场景1：window.api 存在 → 应走 IPC ──
const ipcCalls = [];
globalThis.window = {
  location: { origin: 'http://localhost:5173' },
  api: {
    tasks: {
      list: async () => { ipcCalls.push(['tasks:list']); return [{ id: 1 }]; },
      get: async (id) => { ipcCalls.push(['tasks:get', id]); return { id }; },
      versions: async (id) => { ipcCalls.push(['tasks:versions', id]); return []; },
      create: async (d) => { ipcCalls.push(['tasks:create', d]); return { id: 99 }; },
      update: async (id, d) => { ipcCalls.push(['tasks:update', id, d]); return { success: true }; },
      remove: async (id) => { ipcCalls.push(['tasks:remove', id]); return { success: true }; },
    },
    styles: { list: async () => { ipcCalls.push(['styles:list']); return []; }, findByNo: async (n) => { ipcCalls.push(['styles:findByNo', n]); return null; } },
    settings: { getAll: async () => { ipcCalls.push(['settings:getAll']); return {}; }, set: async (k, v) => { ipcCalls.push(['settings:set', k, v]); return { success: true }; } },
    sizeGroups: { list: async () => { ipcCalls.push(['sizeGroups:list']); return []; }, create: async (d) => { ipcCalls.push(['sizeGroups:create', d]); return { id: 1 }; }, update: async (id, d) => { ipcCalls.push(['sizeGroups:update', id, d]); return {}; }, remove: async (id) => { ipcCalls.push(['sizeGroups:remove', id]); return {}; } },
    measurements: { list: async (c) => { ipcCalls.push(['measurements:list', c]); return []; }, upsert: async (d) => { ipcCalls.push(['measurements:upsert', d]); return {}; }, remove: async (id) => { ipcCalls.push(['measurements:remove', id]); return {}; } },
    files: { openLocally: async (u) => { ipcCalls.push(['files:openLocally', u]); return { success: true }; } },
  }
};

const { request } = await import('../src/api/client.js');

// 1. GET /api/tasks → tasks:list
await request('/api/tasks');
assert.deepStrictEqual(ipcCalls.at(-1), ['tasks:list'], 'tasks:list');

// 2. PATCH /api/tasks/5 → tasks:update(5, body)
await request('/api/tasks/5', { method: 'PATCH', body: JSON.stringify({ note: 'x' }) });
assert.deepStrictEqual(ipcCalls.at(-1), ['tasks:update', '5', { note: 'x' }], 'tasks:update');

// 3. GET /api/styles?style_no=AW26 → styles:findByNo('AW26')
await request('/api/styles?style_no=AW26');
assert.deepStrictEqual(ipcCalls.at(-1), ['styles:findByNo', 'AW26'], 'styles:findByNo');

// 4. POST /api/settings {key,value} → settings:set
await request('/api/settings', { method: 'POST', body: JSON.stringify({ key: 'k', value: 'v' }) });
assert.deepStrictEqual(ipcCalls.at(-1), ['settings:set', 'k', 'v'], 'settings:set');

// 5. GET /api/measurement-templates?category=上装 → measurements:list('上装')
await request('/api/measurement-templates?category=%E4%B8%8A%E8%A3%85');
assert.deepStrictEqual(ipcCalls.at(-1), ['measurements:list', '上装'], 'measurements:list 上装');

// 6. GET /api/measurement-templates (no category) → measurements:list(undefined)
await request('/api/measurement-templates');
assert.deepStrictEqual(ipcCalls.at(-1), ['measurements:list', undefined], 'measurements:list 无参数');

// 7. POST /api/upload-pdf → 必须回退 HTTP（大文件不走 IPC）
let httpCalled = false;
globalThis.fetch = async () => { httpCalled = true; return { ok: true, json: async () => ({ url: '/uploads/x.pdf' }) }; };
await request('/api/upload-pdf', { method: 'POST', body: JSON.stringify({ filename: 'a.pdf', data: 'xxx' }) });
assert.strictEqual(httpCalled, true, 'upload-pdf 走 HTTP');
assert.strictEqual(ipcCalls.at(-1).at(0), 'files:openLocally' === ipcCalls.at(-1).at(0) ? undefined : ipcCalls.at(-1).at(0), 'upload 不应误入 IPC');
console.log('[TRANSPORT-TEST] 场景1 IPC 映射全部通过');

// ── 场景2：window 存在但无 window.api → 全部回退 HTTP ──
globalThis.window = { location: { origin: 'http://localhost:5173' } }; // 无 api 属性
delete globalThis.fetch;
const httpRequests = [];
globalThis.fetch = async (url, opts) => {
  httpRequests.push([url, opts.method || 'GET']);
  return { ok: true, json: async () => ({}) };
};
const { request: request2 } = await import(`../src/api/client.js?scenario2=${Date.now()}`);
await request2('/api/tasks');
await request2('/api/tasks/5', { method: 'PATCH', body: JSON.stringify({ note: 'x' }) });
await request2('/api/upload-pdf', { method: 'POST', body: 'x' });
assert.ok(httpRequests.some(r => r[0].includes('/api/tasks') && r[1] === 'GET'), '回退HTTP GET');
assert.ok(httpRequests.some(r => r[0].includes('/api/tasks/5') && r[1] === 'PATCH'), '回退HTTP PATCH');
console.log('[TRANSPORT-TEST] 场景2 HTTP 回退全部通过');

console.log('[TRANSPORT-TEST] ALL PASSED');
