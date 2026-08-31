# PatternMaster Pro 启动错误修复概览

## 问题现象
安装版应用启动时弹出错误：后端服务启动失败，无法启动本地服务器或连接数据库。

根因是 `better-sqlite3` 原生模块 ABI 不匹配：
- 已编译模块使用 `NODE_MODULE_VERSION 137`（对应 Node.js 24.x 或更旧的 Electron 版本）
- 当前打包使用的 Electron 34.5.8 运行时要求 `NODE_MODULE_VERSION 132`

## 修复内容
1. 清理并重新编译 `better-sqlite3` 为 Electron 34.5.8（ABI 132）。
2. 在 `package.json` 增加明确的重建脚本：
   - `npm run rebuild:node`：为当前 Node 开发环境重建
   - `npm run rebuild:electron`：为 Electron 运行时重建
   - `npm run build:exe`：先重建 Electron 原生依赖，再执行 Vite 构建与 electron-builder 打包
3. 重新打包生成安装程序：`dist_electron/PatternMaster Pro Setup 1.0.0.exe`。

## 验证结果
- Electron 环境下可直接加载并创建内存数据库，确认 ABI 132 匹配。
- 打包后的 `app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node` 同样在 Electron 下加载成功。

## 后续注意事项
- 若使用 `npm run dev:server`（直接 Node 运行后端），请先执行 `npm run rebuild:node`，否则 ABI 不匹配。
- `electron:start` / `dev:all` 因为运行在 Electron 进程内，无需额外重建。
- electron-builder 26.x 已内置 `@electron/rebuild`，可考虑后续移除重复的 devDependency。

---

## 生产环境示例数据丢失修复（第二轮）

### 问题
打包后的安装版读取 `%APPDATA%/PatternMaster Pro/database.sqlite`（独立空库），而 `extraResources` 里拷贝的示例库（`server/database.sqlite`）从未被 `main.js` 使用——导致安装版看不到开发期的示例数据。

### 修复（main.js）
在生产分支（`!isDev` 即 `app.isPackaged`）增加「首次启动从 `extraResources` 拷贝示例库」逻辑：
- 源路径：`path.join(process.resourcesPath, 'server')`（打包后 `extraResources` 落盘于 `resources/server`）。
- 若 `userData/database.sqlite` 不存在且示例库存在 → `fs.copyFileSync` 拷贝示例数据库。
- 若 `userData/uploads` 不存在且示例 uploads 存在 → `fse.copySync` 拷贝示例上传目录（含示例 PDF）。
- 仅当目标不存在时才拷贝，避免覆盖用户已有数据。
- 新增 `const fse = require('fs-extra');`。

### 验证
- 单独脚本模拟该拷贝逻辑，指向已构建包的 `resources/server`，拷贝后校验数据完整：**styles 5 / tasks 7 / settings 5 / measurement_templates 12 / size_groups 3**，uploads 9 个文件 → **PASS**。
- 已将修复版 `main.js` 重新封入 `dist_electron/win-unpacked/resources/app.asar`（已抽取/替换/封回并校验一致）。

### 环境限制与交付说明（第二轮补充更正）
- 此前一度误判沙箱内 `win-unpacked` 启动报 `Invalid file descriptor to ICU data received` 是无头环境的 fd 限制；**实际根因见第四轮**：`win-unpacked` 缺失了 Electron 运行时文件（见下）。现已补齐并实测可正常启动。
- 受沙箱限制，完整安装包（`Setup.exe`）未能在此重新生成（构建过程卡在 NSIS 打包步骤、且挂起进程在沙箱内无法 `taskkill` 终止）。请在你的机器上执行 `npm run build:exe` 重新生成安装程序。
- `dist_electron/win-unpacked/` 经第四轮补齐运行时文件后，已是带本修复、可直接运行（免安装）的版本。

---

## 免安装版（win-unpacked）无法正常启动修复（第四轮）

### 问题
用户反馈免安装版（解压即用的 `win-unpacked`）双击无法启动。

### 根因（更正）
启动即报 `[icu_util.cc(223)] Invalid file descriptor to ICU data received`，导致进程退出。
比对 `node_modules/electron/dist` 与 `dist_electron/win-unpacked` 发现：**`win-unpacked` 缺失了关键 Electron 运行时文件**——
`icudtl.dat`、`chrome_100/200_percent.pak`、`d3dcompiler_47.dll`、`ffmpeg.dll`、`libEGL.dll`、`libGLESv2.dll`、`LICENSE`、`LICENSES.chromium.html`、`version`。
（仅 `electron.exe` 被正常改名为 `PatternMaster Pro.exe`。）
这些文件并非被人为删除，而是**此前一次被挂起的 electron-builder 构建（`app-builder.exe` / 多个 `node.exe` 子进程）在中断时把 `win-unpacked` 清成了半成品、且未补齐**。只要那个挂起的构建进程树还活着，手动补回的文件会立刻被再次清掉——这也一度让人误以为是环境 fd 限制。

### 修复
1. 终止挂起的构建进程树：`taskkill /F /PID` 杀掉 `app-builder.exe` 及多个 `node.exe` 构建子进程（仍有 4 个 52K 的 `electron.exe` 与 1 个 `PatternMaster Pro Setup 1` 因沙箱权限 `拒绝访问` 无法杀掉，但它们已不再写入 `win-unpacked`，属无害僵尸）。
2. 从 `node_modules/electron/dist` 把缺失的运行时文件逐一 `cp` 回 `dist_electron/win-unpacked`，补齐后目录完整（11 个关键文件全部 OK）。

### 验证（沙箱内实测）
- 启动 `PatternMaster Pro.exe`（带 `--disable-gpu --disable-gpu-sandbox`，且必须 `env -u ELECTRON_RUN_AS_NODE` 去掉沙箱注入的 Node 环境变量，否则 Electron 会退化成 Node 模式报 `app is undefined` / `bad option`）。
- `debug.log` 无 ICU 报错；后端日志 `PatternMaster Backend running at http://localhost:3001`；`curl http://127.0.0.1:3001/` 返回 **HTTP 200**。
- 关闭后再次核对 `win-unpacked` 运行时文件仍全部存在 → **补齐有效、可持久、可启动**。

### 给你的机器上的交付建议
- 你机器上没有这个挂起的构建进程，直接 `npm run build:exe`（链式：`electron-rebuild` → Vite → electron-builder）即可生成**完整**的 `win-unpacked` + `Setup.exe`，无需手动补文件。
- 若你之前也遇到过构建中断，删除 `dist_electron/` 后重新构建即可，避免半成品残留。
