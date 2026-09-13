# P2-IPC 架构迁移 — 完成报告

> 迁移日期：2026-08-27 ~ 2026-08-28
> 项目：PatternMaster Pro (golden-shuttle)
> 状态：**全部 5 步完成，待打包验证**

---

## 一、迁移目标

将前后端通信从「Electron 内嵌 Express + HTTP」迁移为「Electron IPC」，解决：
- 端口占用 / 多实例冲突
- better-sqlite3 ABI 双版本困境（根源之一是 Express 与 Electron 混跑）
- localhost 无鉴权安全风险
- HTTP 序列化性能损耗

## 二、架构变化

```
重构前:  Renderer --HTTP(3001)--> Express --> SQLite
                                [端口/ABI/安全/性能风险]

重构后:  Renderer --window.api IPC--> ipcMain --> services --> SQLite
          ├─ 大文件上传仍走 HTTP（性能考量）
          └─ 普通浏览器预览自动回退 HTTP（透明兼容）
```

## 三、五步完成明细

| 步骤 | 内容 | Commit | 验证 |
|------|------|--------|------|
| 1 | 服务层抽取：`server/services/` 6 个纯函数模块 | `c1156d05` | 全 API 200 OK |
| 2 | preload.js：contextBridge 暴露 `window.api`（6 资源×17 方法） | `4d659121` | 语法+逻辑验证 |
| 3 | main.js：注册 17 个 `ipcMain.handle`（复用 services） | `4d659121` | Electron 加载验证 |
| 4 | client.js 双通道：IPC 优先 / HTTP 回退，业务接口不变 | `4d659121` | 场景1/2 断言全通过 |
| 5 | Electron GUI 实测：数据经 IPC 加载，零报错 | `cfafee1d` | 用户实测确认 |

## 四、关键技术点

### 1. 服务层（HTTP 与 IPC 共用）
- `server/services/tasks.cjs`：list/get/versions/create/update/remove，含事务与 JSON 字段解析
- `server/routes/*.cjs` 变为薄 HTTP 适配层（仅 req/res 解析）

### 2. 双通道客户端
```js
// src/api/client.js
// 有 window.api → 走 IPC；没有 → 回退 fetch(HTTP)
// 大文件上传（/api/upload-pdf）强制走 HTTP（base64 走 IPC 性能差）
const hasIPC = typeof window !== 'undefined' && !!window.api && !!window.api.tasks;
```

### 3. ABI 修复（第 5 步前置）
- 现象：`better_sqlite3.node` 编译版本 115 vs Electron 34 要求 132
- 解决：`npm run rebuild:electron`（electron-rebuild + 国内镜像）
- 验证：Electron 主进程加载 better-sqlite3 成功，tasks.list() 返回 7 条

## 五、验证结果

- ✅ 双通道逻辑测试 `scripts/test_transport.mjs`（场景1 IPC 映射 7 项断言 / 场景2 HTTP 回退）
- ✅ Electron ABI 加载验证（`_abi_check.cjs` 临时脚本）
- ✅ 用户 Electron GUI 实测：设置页全部模块 + 编辑页尺寸指标表数据正常，DevTools 零错误
- ⏳ 打包验证（`build:exe`）待执行

## 六、遗留事项

1. **打包验证**：`npm run build:exe`，确认 preload.js 入包
2. **ABI 双版本痛点**：当前 dev:all（Node ABI 115）与 Electron（ABI 132）仍需手动 `rebuild:node` / `rebuild:electron` 来回切换，待专项迭代（见 P2-ABI 计划）

## 七、本次相关命令

```powershell
# Electron 实测（需 Electron ABI）
$env:npm_config_disturl='https://npmmirror.com/mirrors/node'
npm run rebuild:electron
npm run electron:start

# 恢复浏览器开发（需 Node ABI）
npm run rebuild:node
npm run dev:all
```
