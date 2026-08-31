# 架构评估报告：去 Express 改 Electron IPC

> 评估日期：2026-08-27
> 评估对象：PatternMaster Pro (golden-shuttle) 前后端通信架构
> 状态：**决策文档，尚未实施**

---

## 一、当前架构

```
┌─────────────────────────────────────────────────────┐
│  Electron Main Process                              │
│  ├─ main.js 创建 BrowserWindow                      │
│  └─ 内嵌 Express 服务器 (better-sqlite3)            │
│      └─ 监听 http://localhost:3001                  │
├─────────────────────────────────────────────────────┤
│  Renderer Process (React 19 + Vite 7)               │
│  └─ src/api/client.js → fetch(HTTP) → Express       │
└─────────────────────────────────────────────────────┘
```

- 渲染进程通过 **HTTP + JSON** 访问本地 3001 端口
- 数据库 `better-sqlite3` 原生模块在主进程加载
- 开发环境前端走 Vite 5173，生产环境走 Express 3001 托管 dist

---

## 二、已知问题（README_DEV + 代码审查实证）

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| 1 | **ABI 冲突** | better-sqlite3 是原生模块，Node 20 (ABI 115) 与 Electron 的 V8 版本不匹配 | 看板数据为空 / 后端崩溃，需 rebuild |
| 2 | **端口占用** | 固定 3001 端口，多实例/其他程序冲突 | 启动失败，需 taskkill 清理 |
| 3 | **影子锁定** | 开发/生产同时运行时，生产实例"暗中"访问开发库文件加锁 | 先开生产环境后开发全挂 |
| 4 | **EPERM 打包冲突** | 驱动文件被运行中的进程占用 | build:exe 失败 |
| 5 | **无鉴权本地服务** | localhost:3001 无认证，CORS 全开 | 任何本地进程可读写数据（安全风险） |
| 6 | **HTTP 序列化开销** | 每次请求 JSON 编解码 + TCP 往返 | 大数据量（size_data）性能损耗 |
| 7 | **双层复杂度** | Express 路由 + Electron 主进程两套体系 | 维护成本高，日志分散 |

**问题 1-4 是同类根因**：Electron 主进程内跑一个"额外"的 HTTP 服务 + 原生模块 ABI 适配。这正是"去 Express 改 IPC"能一劳永逸解决的。

---

## 三、IPC 方案评估

### 方案 A：纯 IPC（推荐验证方向）

```
Renderer (React)
   │  window.api.tasks.list()          ← contextBridge 暴露
   ▼
Preload (contextBridge + ipcRenderer.invoke)
   │  ipcRenderer.invoke('tasks:list')
   ▼
Main Process (ipcMain.handle)
   │  直接调用 better-sqlite3
   ▼
SQLite
```

**优点**
- ✅ 彻底消除端口/ABI/影子锁定问题（无 HTTP 服务）
- ✅ 安全：contextIsolation + 白名单 API，外部进程无法访问
- ✅ 性能：无 HTTP 序列化，IPC 直接传结构化数据
- ✅ 单一进程体系，日志/错误处理集中

**缺点 / 代价**
- ⚠️ 需新增 `preload.js`，重写 `src/api/client.js` 底层（接口可保持不变）
- ⚠️ 大文件上传（设计稿 base64）走 IPC 可能卡顿，需评估（见方案 C）
- ⚠️ 开发模式 Vite HMR 下需要 preload 同步加载（Electron 需 reload）

### 方案 B：纯 HTTP 现状 + 加固（最小改动）

- 保留 Express，但加上随机端口 + 本地 token 鉴权
- 缺点：治标不治本，ABI/双层复杂度仍在

### 方案 C：混合方案（推荐落地路径）

| 通信类型 | 通道 | 理由 |
|---------|------|------|
| 业务 CRUD（tasks/styles/settings） | **IPC** | 高频、小数据、安全敏感 |
| 大文件上传/下载（设计稿） | **HTTP 或文件路径** | base64 走 IPC 慢；可保留 Express 仅做静态/上传 |
| PDF 本地打开 | **IPC**（shell.openPath） | 主进程原生能力 |

**迁移路径（建议 3 步）**
1. **PoC 验证**：单独任务验证 IPC + better-sqlite3 + contextBridge 全链路（半天）
2. **preload + ipcMain 层**：把 `server/routes/*.cjs` 的 SQL 逻辑抽成 `server/services/*.cjs`（纯函数，HTTP 与 IPC 共用）
3. **client.js 适配**：`request()` 内部改为 `window.api` 转发，业务层 `src/api/index.js` 接口不变，前端零改动

---

## 四、与 P1 已完成工作的衔接

P1 的后端分层（`server/routes/` 拆 6 个模块）为 IPC 迁移打下基础：
- 每个路由模块的 handler 已按"资源"组织，可直接映射为 `ipcMain.handle('tasks:list')`
- SQL 逻辑集中在 db.cjs + routes，抽取 service 层成本低

---

## 五、建议与优先级

**建议：作为 P2 立项，先 PoC 验证再全量迁移，不急于本周实施。**

理由：
1. P1 刚完成（前后端重构 + 保存 bug 修复），先稳定验证
2. IPC 重构涉及 Electron 主进程 + 打包链路（build:exe），风险高于普通前端改动
3. README_DEV 记录的字段直存 vs ID 引用问题（V6.0 专项）同样涉及数据层，建议合并规划

**决策清单（供确认）**
- [ ] 是否立项 P2-IPC？
- [ ] 大文件走 IPC 还是保留 HTTP？（建议保留 HTTP 仅上传）
- [ ] README_DEV 的"品牌/分类/设计师 ID 引用"重构是否排入 P2？
