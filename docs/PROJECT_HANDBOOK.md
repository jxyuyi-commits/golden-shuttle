# Golden-Shuttle 项目总手册（PROJECT HANDBOOK）

> 本文件是项目唯一的
> **整合记忆真相源**
> ，由
> `.workbuddy/memory/`
> （AI 工作区，不在 git）整合而来，随仓库走。
> 换机 / 换账号 / 开新对话时，
> **先读本文件 +&#x20;**
> `ITERATION_STATE.md`
> 即可无缝接续。
> 更新日期：2026-09-14（文档清洗：`docs/` 结构收敛为 `audit/`＋`roadmap/`＋`archive/`；本文中所有"计数/版本号"改由 `scripts/doc-stats.cjs` 生成或指向源码，禁止手写）。历史迭代记录见 `ITERATION_STATE.md`。



***

## 1. 项目画像

**PatternMaster Pro（制单师）** —— 女装工艺制单（Tech Pack）桌面应用。单机自包含：样衣打样从收单→打版→样衣→工艺全流程管理，产出可直接发客户 / 工厂的工艺单（Excel + PDF）。



| 项    | 值                                                                                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 技术栈  | Electron 34（ABI 132）+ Vite 7 + React 19 + Express 5 + better-sqlite3 12                                                                                                                                              |
| 数据库  | 本地 SQLite（dev: `server/database.sqlite`；生产: `%APPDATA%/PatternMaster Pro/database.sqlite`，首次启动从 resources 拷示例库）                                                                                                      |
| 模块   | 看板（Kanban）/ 打样需求单详情（Detail）/ 设置，路由 12 个 + services 12 个（含 drawings.cjs / thumbs.cjs）；计数由 `scripts/doc-stats.cjs` 生成，见本节末 STATS 区块                                                                                                                                                |
| 关键文件 | `server/index.cjs`（Express 入口）+ `routes/` + `services/`（含 drawings.cjs / thumbs.cjs）+ `db.cjs`（迁移版本与内容以源码 `migrations` 数组为准）；`src/App.jsx` + `src/components/**`（含 drawing/DrawingLibrary.jsx）；`src/utils/exportTechPack.js`（Excel 导出）+ `exportTechPackPdf.js`（PDF 导出）+ `pdfTechPackVfs.js`（字体 vfs） |
| 当前版本 | `package.json` version 1.0.0（Electron-builder 用）                                                                                                                                                                     |
| Git  | 重构分支 `feature/sample-run-model`（`main` 保持稳定待合并）；受管文件数见 git（不手写）；远端 `https://github.com/jxyuyi-commits/golden-shuttle.git`                                                                                                                                           |

**API 路由备忘**：BOM 是 `/api/bom?task_id=N`（不是 /api/bom-items），工艺 `/api/process?task_id=N`，图纸 `/api/drawings?task_id=N`，均需 task\_id 参数。

**机器可验证计数（防漂移）**：

<!-- STATS:BEGIN (由 scripts/doc-stats.cjs 生成，请勿手改) -->
> 以下计数由 `node scripts/doc-stats.cjs` 从源码实测生成（生成于 2026-09-14 04:14）；手工改动会被 `--check` 判为漂移。

| 计数项 | 值 |
| --- | --- |
| 源码文件数（src/ + server/，.js/.jsx/.cjs/.mjs） | 66 |
| 源码总行数（同上范围） | 10366 |
| `server/routes/*.cjs` | 12 |
| `server/services/*.cjs` | 12 |
| 迁移最大版本（`server/db.cjs` migrations） | 20 |
| 迁移条目数 | 20 |
| `src/api/index.js` 导出绑定数 | 46 |
| git 跟踪文件数 | （设 DOC_STATS_GIT=1 后生成） |
<!-- STATS:END -->



***

## 2. 快速上手（新电脑 / 换机）



```
git clone <你的远端地址> golden-shuttle   # 见 §11 账号与远端

cd golden-shuttle

npm install

npm run dev:all        # 首选：node scripts/dev.cjs，同时起后端 3001 + Vite 5173
```



* 浏览器开 `http://localhost:5173/` 看真实数据。

* 换机后若 better-sqlite3 报 ABI 不匹配 → `npm run rebuild:electron`（方案 D 统一 ABI 132，见 §7）。

* **数据库不随仓库走**（`.gitignore` 排除）→ 空库启动会自动建表（迁移版本见 `server/db.cjs`）。要带数据 / 用真实库 → 见 §10。



***

## 3. 构建 / 运行命令（2026-09-04 实测）



| 命令                         | 作用                                                       | 备注                                            |
| -------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| `npm run dev:all`          | 后端 3001 + Vite 5173 一起起                                  | **首选**，`node scripts/dev.cjs`，一次成功无需 rebuild  |
| `npm run dev:client`       | 只起 Vite                                                  |                                               |
| `npm run dev:server`       | 只起后端（`ELECTRON_RUN_AS_NODE=1 electron server/index.cjs`） | ABI 132，不用系统 node                             |
| `npm run electron:start`   | 完整 Electron 应用（开发）                                       | 需 Vite 在跑                                     |
| `npm run build`            | Vite 生产构建                                                | 1770 模块 0 错误，仅 pdfjs eval + chunk>500kB 两个老告警 |
| `npm run rebuild:electron` | 重编 better-sqlite3 为 ABI 132                              | **换机 / 升 Electron 时唯一需要的 rebuild**            |
| `npm run build:exe`        | rebuild:electron → build → electron-builder 打包           | **打包前须停 dev**（better-sqlite3 文件占用 EPERM）      |
| `npm run lint`             | ESLint（覆盖 src / server / scripts / main.js / preload.js）  | 2026-09-14 起覆盖 .cjs；**必须保持 0 problems**        |
| `npm test`                 | 自动化回归测试（回滚尺寸表 + 上传安全）                                     | 走 `ELECTRON_RUN_AS_NODE=1 electron`，ABI 132     |
| `npm run test:rollback`    | 版本回滚的尺寸表恢复语义（20 项断言）                                      | 断言非首批次也逐批恢复，防"只恢复首批次"回归                        |
| `npm run test:security`    | 上传白名单 / 路径穿越 / 本机打开策略（43+ 项断言）                            | 用独立临时库，不触碰生产数据                                 |
| `node scripts/doc-stats.cjs` | 输出源码文件数/行数/路由数/服务数/迁移版本，校验文档数字是否漂移                        | 文档改数字前先跑它                                      |



***

## 4. 用户工作约定（强制，违反会被狠批）



1. **每次修改后必须&#x20;**`git commit`**&#x20;备份。**

2. **打包纪律**：小改 = 只提交不打包；大改 = 先升 `package.json.version` 再 `npm run build:exe`。

3. **节奏**：每完成一步先与用户确认（尤其 "本地预览能否打开、有无数据"），**未确认不擅自进入下一步代码改动**。

4. **上下文纪律**：避免一次性读超大文件；结构分析优先 grep / 行号 / 分段读。

5. **诊断 UI 问题先吃准用户截图原意**（曾误改按钮、误删待开发 tab 被狠批）；"待开发功能" 应保留占位而非删除。

6. 回复始终用中文、语言稳定。

7. 判断环境问题前先核对**真实源码状态**（用户可能边开项目边改）。



***

## 5. 生产部署约束（硬性前提，红线）

保持**单一自包含桌面应用**：



* Express 继续打包在 Electron 内，不拆分；

* DB 用本地 SQLite（`%APPDATA%`），不引 DB 服务器；

* **不引 Docker / 反向代理 / 微服务 / 云后端**；

* 分发维持 `win-unpacked` + NSIS `Setup.exe`。

* 推论：IPC 替代 HTTP（更自包含）优先；自动更新（electron-updater）可选。



***

## 6. 关键踩坑（务必牢记，同类问题勿再踩）

### 6.1 CORS 关键坑（2026-09-04，曾致 8-25"绑定回环后无法访问"）



* **cors 库函数型 origin 必须写&#x20;**`(origin, callback)`**&#x20;回调风格并调用 callback**。

* 传同步布尔函数 `(origin) => bool` → 中间件永不 next → 所有请求卡死：后端 listen 成功、DB 正常、TCP ESTABLISHED，但 HTTP 永不响应。

* 验证：`netstat` 确认 3001 只监听 `[::1]`；node 客户端秒测 `/api/tasks`；curl `Origin: evil.com` 无 ACAO、`localhost:5173` 有。

* 排障：多组 dev 并存会 DB 锁 / 端口乱，杀树 `taskkill /F /T /PID <dev.cjs pid>`；Invoke-WebRequest 只走 IPv4 连 `[::1]` 会超时误判，用 curl.exe/node 客户端。

### 6.2 pdfmake 三大坑（2026-09-04，PDF 导出）



1. **VFS 是模块级单例**，必须 `pdfMake.addVirtualFileSystem(vfs)` 注册字体；只设 `pdfMake.vfs = {...}` 不生效 → `File 'xxx.otf' not found in virtual file system`。字体用 `addFonts()`。

2. **colSpan=N 的 cell 后必须补 N-1 个占位 cell**（空 `{}`）→ 否则 `Malformed table row, a cell is undefined`。占满整行：`colSpan: widths.length` + `Array(n-1).fill({})`。

3. **pdfmake 0.3.x 的&#x20;**`getBlob()`**&#x20;是 async 无参方法（返回 Promise）**，按旧回调 `(cb, errCb)` 调用会永不 resolve → 按钮永久 "导出中…"。正确：`await pdfMake.createPdf(dd).getBlob()`。

### 6.3 better-sqlite3 ABI



* 方案 D 已落地：dev 后端与 Electron **统一 ABI 132**（`ELECTRON_RUN_AS_NODE=1 electron` 跑后端），不再需要 rebuild:node 来回切。

* 唯一需要的 rebuild：`npm run rebuild:electron`（换机 / 升 Electron）。

* 旧 "三步修复法"（README\_DEV 头部有标注）是 ABI 115 时代办法，勿照抄。

* AI 通道 node 是 v22.22.2（ABI 127）、真机 node v24.13.0（ABI 137）——**不要用系统 node 直接跑后端**（`ERR_DLOPEN_FAILED`），走 `npm run dev:server`。

### 6.4 SQLite 锁死（孤儿进程）



* 多个后端进程同时持 database.sqlite 写锁 → 新服务器查询挂死（连上不回包）。`netstat` 找 PID → `taskkill /F /PID` 清孤儿再起。

* **预览跑通期间勿再手动起 dev / 双击 fix-dev.bat**，否则重现 DB 锁死。

### 6.5 沙箱 / 环境（AI 侧）



* AI 通道 `curl localhost:5173` 200 但连 `[::1]:3001` 回环一律 000 —— 沙箱够不到回环绑定，**不能据此判服务挂**；真机浏览器（Happy Eyeballs）能通。

* 唯一可信 "看数据" 通道 = `present_files(http://localhost:5173)` 预览面板（用户真机浏览器）。

* 后台 `node scripts/dev.cjs` 在 AI 侧报 `failed` 是包装壳退出，spawn 出的 electron + vite 子进程继续存活供真机访问。

* **`.git/refs/heads/<嵌套分支名>` 写入会静默失败（2026-09-14 精确复现并修正归因）**
  * 现象：`git commit` 返回 0、`git commit` 后 `git log` 却报 "current branch does not have any commits yet"；`git update-ref refs/heads/x/y <sha>` 返回 0 但 `.git/refs/heads/x/` 目录根本没被创建；`git status` 显示 `[gone]`。
  * **不是数据丢失**：`git cat-file -t <sha>` 能确认 commit 对象完好，reflog（`.git/logs/HEAD`）里有完整的新旧哈希记录。
  * **归因修正（推翻此前"core.fscache 导致"的判断）**：已实测 `core.fscache=false` 写入 `.git/config` 成功落盘，**问题照旧复现**。真正的边界是：**bash 直接重定向写入 `.git/refs/heads/` 能持久（含新建子目录），而 git 自己写嵌套引用静默失败**；`.git/config`、`.git/index`、`.git/objects` 的写入均正常。属环境层对 git 引用写入的拦截，与本项目代码无关。
  * 处置（每次 git 写操作后执行）：
    1. 从 reflog 取真实哈希：`tail -1 .git/logs/HEAD`（末列即为新哈希）。
    2. 用 bash 直接落引用：`mkdir -p .git/refs/heads/<dir> && printf '<sha>\n' > .git/refs/heads/<branch>`（remote-tracking 同理写 `refs/remotes/origin/...`）。
    3. **落完引用后只用只读命令验证**（`git log` / `git status` / `git ls-remote`）——再一次 `git commit` 会把它删掉，需重新补。
  * 绕过本地引用的推送法（推荐）：`git push origin <sha>:refs/heads/<branch>`，不依赖本地分支引用是否可解析。
  * 换机恢复：新机 `git fetch origin && git checkout -B <branch> origin/<branch>` 即可，引用由远端重建，不受此问题影响。



***

## 7. 安全与功能完成状态（2026-09-04）

**工程止损批 1（G1–G8，2026-09-14，提交 49a2263）**



* G1 **回滚静默清空尺寸表（数据损坏级）**：快照新增 `snapVersion` 字段，`rollback` / `diffSummary` 统一按「字段是否存在」判别新旧快照形态。修复前用 `runs[].size_data` 键是否存在猜测，而 `buildSnapshot` 恒写该键 → 旧快照分支成死代码；返工中又发现新分支同样不可达（`snapVersion` 漏写）→ 回滚只写首批次且取 task 级僵尸列为源。现已修复并端到端验证（`npm run test:rollback`）。
* G2 **上传→本机执行 RCE 链路封堵**：`resolvePath` 路径硬化（拒反斜杠与 `..`、只取 basename、断言落在 uploadsDir 内）；`openLocally` 去掉 `exec` 字符串拼接，Electron 走 `shell.openPath`，非 Electron 回退 `rundll32 url.dll,FileProtocolHandler`（`execFile`+argv，不经 shell）。
* G3 **上传白名单 + 50MB 上限**：扩展名白名单（含 dxf/psd/ai/cdr 等行业格式），不合法不落盘，错误带 400。
* G4 **迁移前自动备份 + 版本断言**：同目录备份保留最近 3 份；库版本高于代码版本时醒目告警（防旧程序写新库）。
* G5 **请求日志不再序列化 body**（默认只记 method/path/状态码/耗时，`LOG_BODY=1` 才记且按体积预判）。
* G6+G8 **ESLint 覆盖修复**：补齐 `server/**`、`scripts/**`、`main.js`、`preload.js` 的 Node/CommonJS 块（此前 `server/**` 完全不参与 lint）；85 problems → 0。
* G7 **ErrorBoundary + 加载失败态**：全局错误边界兜底 + 任务加载失败横幅与重试。

**P0 安全三连（全部完成并落地，提交 24d2705）**



* P0-1 后端 `app.listen(p, 'localhost')` 仅回环 `[::1]`（局域网不可达）

* P0-2 CORS 白名单（仅 [localhost/127.0.0.1](https://localhost/127.0.0.1) 的 5173/3001、file://、无 Origin）

* P0-3 main.js `sandbox: true`（渲染层纯 fetch，无 Node 调用，封 XSS→RCE）

**功能完成**



* ✅ 看板导出

* ✅ 工艺单 Excel 导出（exceljs 专业版 4 sheet：基本信息 / 尺寸指标 / 物料清单 / 工艺指示）

* ✅ 工艺单 PDF 导出（pdfmake + 思源黑体，A4：信息 + 尺寸竖版 / BOM + 工艺横向；提交 6f89b9f）

* ✅ 图纸资料页（drawings 表 v6 + 分类 v7 + **版本管控 v8**：设计稿/参考图/成衣图/纸样/唛架图，上传弹窗 + 卡片网格预览 + 编辑自动保存 + 删除 + 分类可下拉更改，IPC 双通道）
  - 2026-09-05 迭代：上传升级（整区拖拽 + Ctrl+V 粘贴 + 多文件 + 任意格式 dxf/pla/prj/Zprj/zpac 等，100mb）；**版本管控**（参考资料防冗余去重 / 工作成果同名迭代自动升版，版本徽章 + 版本历史弹窗 + 整组删除）；**EMF→PNG、DXF→SVG 缩略图**（server/services/thumbs.cjs，缓存 server/uploads/thumbs/，PRJ 保持扩展名占位合理边界）；**统一交互**（单击放大预览 + 双击本地软件打开，DXF 放大内联 SVG 渲染）；**文件类型标签**（右上角按大类配色 PRJ/EMF/DXF/PNG/PDF 等）；**工作动态卡片两行布局修复节点不可见**

* ✅ ExportButton 交互（确认→执行→toast）

* ✅ BOM + 工艺指示模块、工作动态开放式项目更新流

* ✅ 真实款 26AWW526 全量录入实测

**下一步候选（按用户排期）**



* Excel 导入、品牌 / 分类 / 设计师 ID 引用重构（逾期提醒、操作日志已于 2026-09-06 完成）



***

## 8. 依赖清单（重要）

`better-sqlite3 12.6.2`（原生，需 rebuild）、`cors 2.8.6`、`exceljs 4.4.0`、`express 5.2.1`、`fs-extra`、`lucide-react`、`pdfjs-dist 3.11.174`、`pdfmake 0.3.11`、`react 19.2`、`xlsx`。

已清理的未用依赖：crypto-js /chokidar/app-builder-lib（90e7ed5 移除）。

**字体资产（进 git，clone 即带）**



* `scripts/fonts/NotoSansSC-Regular.otf`（8.3MB，思源黑体，SIL OFL 开源可商用）

* `src/utils/pdfTechPackVfs.js`（10.6MB，由 `scripts/gen_pdf_vfs.cjs` 生成）

* 重新生成字体 vfs：`node scripts/gen_pdf_vfs.cjs`



***

## 9. 生产数据 / 用户真实环境（2026-08 记录）



* 用户真机 `%APPDATA%/PatternMaster Pro` 已有旧数据（styles4/tasks6/settings5/mt9，缺 size\_groups 旧 schema），已验证未丢失。

* 生产版 main.js 首次启动从 `process.resourcesPath/server` 拷示例库与 uploads 到 userData（仅当目标不存在时）。



***

## 10. 数据与换机（数据库独立性）

**结论：不同电脑 / 不同账号用不同数据库完全可以，数据库与代码完全解耦。**



* `server/database.sqlite` 在 `.gitignore`，**不进 git** → clone 后是空库，启动自动建表（迁移版本见 `server/db.cjs`），从零开始用真实工作数据即可。

* 当前这台机器的 `server/database.sqlite` 是**测试数据**（8 tasks / 6 styles），**不需要**迁到新电脑。

* 若新电脑要用 "真实工作数据"：直接把真实库文件放到 `server/database.sqlite`（首次启动会自动跑迁移），或从空库开始录入。

* 生产数据在 `%APPDATA%/PatternMaster Pro/database.sqlite`，与开发库互不影响。



***

## 11. 账号与远端配置（换工作账号必读）

**当前状态**



* git 作者：`jxyuyi-commits`

* 远端：`https://github.com/jxyuyi-commits/golden-shuttle.git`（HTTPS）

* 提交历史：以 `git log --oneline` 为准（不手写）。截至 2026-09-14：`feature/sample-run-model` = `5f630c8`，`main` = `c694305`

* 本机 push GitHub 需要**代理环境**（直连 443 不通，用户开代理后成功）

**换工作账号后**



1. 新电脑 `git clone <新远端>`；或本机 `git remote set-url origin <新地址>`

2. 配置身份：`git config user.name "<新账号>"`、`git config user.email "<新邮箱>"`（决定提交作者）

3. 认证：HTTPS 用 PAT（个人访问令牌）或 SSH key；新账号需先在 GitHub 生成

4. 历史提交作者仍是旧账号（提交记录不可变），从换账号时点起是新作者 —— 如需统一可 `git rebase` 改写历史（慎用，会 rewrite 已推送提交）

5. **建议**：换账号后把本文件 §11 的 "当前状态" 更新为新远端地址，保持真相源最新



***

## 12. 参考文档



* **`docs/README.md`**（文档索引与持续维护清单 —— 新会话/换机/新成员**先读这个**）

* `ITERATION_STATE.md`（追加式变更日志，**不承担"项目现状"职责**；现状以本手册为准）

* `docs/BUSINESS_LOGIC.md`（业务逻辑与决策沉淀，**用户指定长期维护**）

* `docs/TECHNICAL.md`（技术架构与表结构）

* `docs/roadmap/统一实施路径与任务分解-20260914.md`（当前批次路线图，**唯一计划源入口**）

* `docs/roadmap/待开发文档.md`（需求池 / backlog）· `docs/roadmap/开发工作计划.md`（排期与实施要点）

* **换机打包清单 → `docs/archive/MANUAL_COPY_MANIFEST.md`**（换机/换账号需手动拷贝的文件，用户换机必读）

* `docs/archive/README_DEV.md`（开发说明，已归档，仅作历史）

* `docs/工艺单样例_26AWW526.pdf`（PDF 导出样例；被 `.gitignore` 的 `docs/*.pdf` 排除，**不进 git**、仅本机存在）

* 历史细节：`.workbuddy/memory/`（2026-08-22 / 08-24 / 08-25 / 09-04 + MEMORY.md，AI 工作区，不在 git）