const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');

const fs = require('fs');
const fse = require('fs-extra');

// 引入服务层（IPC 与 HTTP 共用，P2 架构迁移）
const taskService = require('./server/services/tasks.cjs');
const styleService = require('./server/services/styles.cjs');
const settingsService = require('./server/services/settings.cjs');
const sizeGroupService = require('./server/services/sizeGroups.cjs');
const measurementService = require('./server/services/measurements.cjs');
const fileService = require('./server/services/files.cjs');

// ── 全局异常捕获 ──
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (app.isReady()) {
        dialog.showErrorBox('严重错误 (Uncaught Exception)', error.stack || error.message || String(error));
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    if (app.isReady()) {
        dialog.showErrorBox('未处理的异步异常 (Unhandled Rejection)', (reason && reason.stack) || String(reason));
    }
});

// 引入我们的后端服务器启动函数
const { startServer } = require('./server/index.cjs');

// ── IPC 处理器注册（P2 架构迁移：业务 CRUD 走 IPC）──
// 需在数据库初始化后调用（依赖 services → db）
function registerIpcHandlers() {
  // Tasks
  ipcMain.handle('tasks:list', () => taskService.list());
  ipcMain.handle('tasks:get', (_e, id) => taskService.get(id));
  ipcMain.handle('tasks:versions', (_e, styleId) => taskService.versions(styleId));
  ipcMain.handle('tasks:create', (_e, data) => taskService.create(data));
  ipcMain.handle('tasks:update', (_e, id, data) => taskService.update(id, data));
  ipcMain.handle('tasks:remove', (_e, id) => taskService.remove(id));

  // Styles
  ipcMain.handle('styles:list', () => styleService.listAll());
  ipcMain.handle('styles:findByNo', (_e, styleNo) => styleService.findByNo(styleNo));

  // Settings
  ipcMain.handle('settings:getAll', () => settingsService.getAll());
  ipcMain.handle('settings:set', (_e, key, value) => settingsService.set(key, value));

  // Size Groups
  ipcMain.handle('sizeGroups:list', () => sizeGroupService.list());
  ipcMain.handle('sizeGroups:create', (_e, data) => sizeGroupService.create(data));
  ipcMain.handle('sizeGroups:update', (_e, id, data) => sizeGroupService.update(id, data));
  ipcMain.handle('sizeGroups:remove', (_e, id) => sizeGroupService.remove(id));

  // Measurements
  ipcMain.handle('measurements:list', (_e, category) => measurementService.list(category));
  ipcMain.handle('measurements:upsert', (_e, data) => measurementService.upsert(data));
  ipcMain.handle('measurements:remove', (_e, id) => measurementService.remove(id));

  // Files（大文件上传仍走 HTTP，仅本地打开走 IPC）
  ipcMain.handle('files:openLocally', (_e, url) => fileService.openLocally(url));

  console.log('[IPC] Handlers registered.');
}

// 开发环境下判断标志
const isDev = !app.isPackaged;

let mainWindow;

async function createWindow() {
    // 根据环境确定数据库和上传路径
    let dbPath, uploadsPath;

    if (isDev) {
        // 开发环境：保持在项目根目录
        dbPath = path.join(__dirname, 'server', 'database.sqlite');
        uploadsPath = path.join(__dirname, 'server', 'uploads');
    } else {
        // 生产环境：使用系统可写目录 (如 %APPDATA%/PatternMaster Pro/)
        const userDataPath = app.getPath('userData');
        dbPath = path.join(userDataPath, 'database.sqlite');
        uploadsPath = path.join(userDataPath, 'uploads');

        // 首次启动时，从打包资源 (extraResources) 拷贝示例数据库与上传文件，
        // 保证安装版也能看到示例数据。仅当目标不存在时才拷贝，避免覆盖用户已有数据。
        const sampleDir = path.join(process.resourcesPath, 'server');
        const sampleDb = path.join(sampleDir, 'database.sqlite');
        const sampleUploads = path.join(sampleDir, 'uploads');

        if (!fs.existsSync(dbPath) && fs.existsSync(sampleDb)) {
            fs.copyFileSync(sampleDb, dbPath);
            console.log('[DB] 已从安装包拷贝示例数据库至:', dbPath);
        }

        if (!fs.existsSync(uploadsPath)) {
            if (fs.existsSync(sampleUploads)) {
                fse.copySync(sampleUploads, uploadsPath);
                console.log('[DB] 已从安装包拷贝示例上传目录至:', uploadsPath);
            } else {
                fs.mkdirSync(uploadsPath, { recursive: true });
            }
        }
    }

    // 确保数据库与本地 Express 服务启动
    try {
        await startServer(3001, dbPath, uploadsPath);
    } catch (serverError) {
        console.error('后端服务启动失败:', serverError);
        dialog.showErrorBox('后端服务启动失败', `无法启动本地服务器或连接数据库。\n\n${serverError.stack || serverError.message || String(serverError)}`);
        app.quit();
        return;
    }

    // 数据库就绪后注册 IPC 处理器（业务 CRUD 走 IPC）
    registerIpcHandlers();

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'preload.js') // P2：暴露 window.api
        },
        autoHideMenuBar: true // 隐藏系统默认菜单栏
    });

    if (isDev) {
        // 开发环境下，Vite 默认运行在 5173 端口
        // 需要确保你已经运行了 `npm run dev: client`
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // 生产环境打包后，后端的 express.static 会在 3001 管理我们的 dist 文件夹
        // 直接访问内部服务器即可获得我们的 React 应用
        mainWindow.loadURL('http://localhost:3001');
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
