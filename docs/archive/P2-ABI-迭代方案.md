# P2-ABI 迭代方案：彻底摆脱 Electron/Node 双 ABI 困境

> 规划日期：2026-08-28
> 状态：**方案D 已实施并验证通过（2026-08-28）**

---

## 一、痛点回顾

`better-sqlite3` 是原生模块，只能针对单个 ABI 编译：

| 环境 | Node ABI | 用途 |
|------|---------|------|
| Node 20.20.2 | **115** | `npm run dev:all` 后端 |
| Electron 34 | **132** | `electron:start` 主进程 |

同一份 `node_modules` 无法同时满足两个 ABI，导致每次切换环境都要：
```powershell
npm run rebuild:electron  # 切到 Electron (132)
npm run rebuild:node      # 切回 Node (115)
```
来回切换耗时且易出错（用户已多次踩坑）。

## 二、方案对比

| 方案 | 思路 | 优点 | 缺点 |
|------|------|------|------|
| A | 双 node_modules / 双编译产物脚本 | 不改代码 | 治标不治本，维护复杂 |
| B | SQLite 纯 JS/WASM（sql.js） | 彻底无原生模块 | 迁移 API 成本中，性能略降 |
| C | Node 子进程承载数据层 | 统一 115 | 生产无系统 Node，部署难 |
| **D ⭐** | **统一 Electron ABI 跑 dev 后端** | **零代码改动，一次编译** | 需验证 ELECTRON_RUN_AS_NODE |

## 三、推荐方案 D：统一 Electron ABI

**核心思路**：开发环境的后端也使用 Electron 自带的 Node 运行，让全链路统一为 ABI 132，`better-sqlite3` 只需编译一次。

### 实施步骤

1. **一次性编译 Electron ABI**（当前打包流程已包含）
   ```powershell
   $env:npm_config_disturl='https://npmmirror.com/mirrors/node'
   npm run rebuild:electron   # 之后永远保持 132，不再切回
   ```

2. **修改 `scripts/dev.cjs`**：后端启动命令改为 Electron 的 Node 模式
   ```js
   // 原：spawn('node', ['server/index.cjs'], ...)
   // 改：ELECTRON_RUN_AS_NODE=1 使用 electron 二进制以 Node 模式运行
   const electronPath = require('electron');  // 返回 electron.exe 绝对路径
   spawn(electronPath, ['server/index.cjs'], {
     env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
     shell: true
   });
   ```

3. **`dev:all` 与 `electron:start` 共用 ABI 132**，此后：
   - 不再需要 `rebuild:node` / `rebuild:electron` 来回切换
   - 开发 = 生产，环境完全一致

### 验证点

- [ ] `ELECTRON_RUN_AS_NODE=1 electron server/index.cjs` 能正常启动后端（ABI 132）
- [ ] dev:all 启动后看板数据正常（通过 Node ABI 132 加载 sqlite）
- [ ] electron:start 正常（同 132）
- [ ] 移除 `rebuild:node` 使用场景，文档更新

### 兼容性说明

- `vite` 是纯 JS，运行在普通 Node 不受影响
- Electron 打包产物（dist_electron）自带 Electron 运行时，天然 ABI 132
- 唯一注意：`ELECTRON_RUN_AS_NODE` 模式不创建窗口、不加载 preload，仅当作 Node 解释器，符合后端需求

## 四、备用方案（若 D 验证失败）

**方案 B（SQLite 纯 JS）**：迁移 `server/db.cjs` 从 better-sqlite3 → sql.js（WASM）。
- 数据文件格式兼容（都是标准 SQLite 文件）
- 无任何原生依赖，ABI 问题彻底消失
- 代价：`db.prepare().get()/.all()/run()` 的 API 需要适配层；大数据量性能略降

**方案 C（Node 子进程）**：Electron 主进程 fork 系统 Node 子进程承载 services+sqlite。
- 仅在开发可行，打包后用户机器无 Node → 不推荐

---

## 五、执行记录

1. ✅ 打包验证完成（2026-08-28）：better-sqlite3 已是 Electron ABI 132，Setup 381.2MB 生成
2. ✅ 方案D 验证通过：`ELECTRON_RUN_AS_NODE=1 electron` 成功加载 better-sqlite3（132），tasks 7 条
3. ✅ 已修改 `scripts/dev.cjs`：后端改用 `require('electron')` 路径 + ELECTRON_RUN_AS_NODE 启动（顺带修复 DEP0190 shell 警告）
4. ✅ 已修改 `package.json`：`dev:server` 改用 `cross-env ELECTRON_RUN_AS_NODE=1 electron server/index.cjs`
5. ✅ dev:all 全链路验证：后端 3001 + 前端 5173 正常，API 7 条，零报错

## 六、收益

- 消除 90% 的 rebuild 场景（README_DEV 最痛的坑）
- 开发/生产 ABI 完全一致，减少"开发正常、打包失败"类问题
- 一条命令启动，心智负担大幅下降
- dev 与 electron:start / build:exe 统一 ABI 132，无需再 rebuild:node
