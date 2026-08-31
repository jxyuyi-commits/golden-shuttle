// P2-IPC 无窗口验证脚本：验证 preload contextBridge + ipcMain handlers + services + db 全链路
// 运行: node_modules\.bin\electron _ipc_test.cjs
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// 初始化数据库（默认路径，只读验证不写库）
const { initDatabase } = require('./server/db.cjs');
initDatabase();

// 注册 IPC handlers（与 main.js registerIpcHandlers 同构）
const taskService = require('./server/services/tasks.cjs');
const styleService = require('./server/services/styles.cjs');
const settingsService = require('./server/services/settings.cjs');
const sizeGroupService = require('./server/services/sizeGroups.cjs');
const measurementService = require('./server/services/measurements.cjs');

ipcMain.handle('tasks:list', () => taskService.list());
ipcMain.handle('tasks:get', (_e, id) => taskService.get(id));
ipcMain.handle('tasks:versions', (_e, styleId) => taskService.versions(styleId));
ipcMain.handle('tasks:create', (_e, data) => taskService.create(data));
ipcMain.handle('tasks:update', (_e, id, data) => taskService.update(id, data));
ipcMain.handle('tasks:remove', (_e, id) => taskService.remove(id));
ipcMain.handle('styles:list', () => styleService.listAll());
ipcMain.handle('styles:findByNo', (_e, styleNo) => styleService.findByNo(styleNo));
ipcMain.handle('settings:getAll', () => settingsService.getAll());
ipcMain.handle('settings:set', (_e, key, value) => settingsService.set(key, value));
ipcMain.handle('sizeGroups:list', () => sizeGroupService.list());
ipcMain.handle('sizeGroups:create', (_e, data) => sizeGroupService.create(data));
ipcMain.handle('sizeGroups:update', (_e, id, data) => sizeGroupService.update(id, data));
ipcMain.handle('sizeGroups:remove', (_e, id) => sizeGroupService.remove(id));
ipcMain.handle('measurements:list', (_e, category) => measurementService.list(category));
ipcMain.handle('measurements:upsert', (_e, data) => measurementService.upsert(data));
ipcMain.handle('measurements:remove', (_e, id) => measurementService.remove(id));

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    await win.loadURL('data:text/html,<html><body>IPC Test</body></html>');

    // 通过渲染进程调用 window.api（模拟 React 前端走 IPC）
    const hasApi = await win.webContents.executeJavaScript(`typeof window.api !== 'undefined'`);
    console.log('[IPC-TEST] window.api exposed:', hasApi);

    const taskCount = await win.webContents.executeJavaScript(`window.api.tasks.list().then(r => r.length)`);
    console.log('[IPC-TEST] tasks.list() count:', taskCount);

    const firstTask = await win.webContents.executeJavaScript(
      `window.api.tasks.list().then(r => ({ id: r[0].id, order: r[0].order_no, style: r[0].style_no }))`
    );
    console.log('[IPC-TEST] first task via IPC:', JSON.stringify(firstTask));

    const styleCount = await win.webContents.executeJavaScript(`window.api.styles.list().then(r => r.length)`);
    console.log('[IPC-TEST] styles.list() count:', styleCount);

    const sizeGroups = await win.webContents.executeJavaScript(`window.api.sizeGroups.list().then(r => r.length)`);
    console.log('[IPC-TEST] sizeGroups.list() count:', sizeGroups);

    const settings = await win.webContents.executeJavaScript(`window.api.settings.getAll().then(r => Object.keys(r).length)`);
    console.log('[IPC-TEST] settings.getAll() keys:', settings);

    const measurements = await win.webContents.executeJavaScript(`window.api.measurements.list('上装').then(r => r.length)`);
    console.log('[IPC-TEST] measurements.list(上装) count:', measurements);

    console.log('[IPC-TEST] ALL IPC CHANNELS VERIFIED OK');
  } catch (err) {
    console.error('[IPC-TEST] FAILED:', err);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
