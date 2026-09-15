# AGENTS.md — PatternMaster Pro（女装打样管理）

Electron + Vite + React + Express + better-sqlite3。根 `D:\dev\golden-shuttle`，
工作分支 `feature/next-milestone`（双视角重构 `feature/sample-run-model` 已合入 main，本地=远端 2774f52），
远端 github.com/jxyuyi-commits/golden-shuttle.git（推送需用户开代理）。

## 强制规则（用户明确要求，写死，不可违背）

1. **任何改动必须自己亲测有效（自测通过、看到真实结果）之后才能提交/交付**。禁止只写代码不验证、
   禁止"应该没问题"式提交、禁止把验证推给用户。用户已明确授权最高权限自测，不测就交 = 违规。
2. **任何 JSX/JS 提交前必须跑 `eslint src`（exit 0 才算过）**：`vite build` 不检查未定义标识符，
   `RUN_STATUS_META is not defined` 这类 ReferenceError 只能靠 no-undef 静态检查拦住（2026-09-14
   看板崩溃事故教训）。检查器本身有效性也要正向验证（故意引入坏标识符确认能报错）。
2. 用户对"更换/上传/删除"类操作有强确认意识：破坏性/变更性交互必须有明确确认步骤，不得静默生效。
3. 用户否决过的设计（不要回退）：底部长驻操作按钮+提示、缺稿角标+筛选、"多此一举"的装饰。

## 自测通道（已验证可用，照此执行）

- 前端 `http://localhost:5173`，后端 `http://localhost:3001`。dev 启动：`node scripts/dev.cjs > _dev_out.log 2>&1`（后台）。
- 数据验证一律走 HTTP fetch（`/api/tasks`、`/api/drawings?task_id=N`、PATCH `/api/tasks/:id`）；
  **shell 内 node 直接 require better-sqlite3 会因 ABI 不匹配（127 vs 132）报 ERR_DLOPEN_FAILED，禁止直连 DB**。
- 浏览器端到端自测：Puppeteer（`puppeteer-core`，已在 node_modules，--no-save）+
  系统 Chrome `C:\Users\Yi Yu\AppData\Local\Google\Chrome\Application\chrome.exe`，
  `headless:'new'` + 独立 `userDataDir`（如 `_chrome_tN`）+ `--no-first-run --disable-gpu`。
  复现用户操作（点击卡片/上传/弹窗点选）后，必须验证：请求日志（PATCH/POST 发出）、
  reload 后状态保持、截图确认 UI。
- 自测产生的临时文件/脏数据必须清理（删测试 uploads、删测试 drawings 记录、恢复被测试改写的字段），
  且**不允许 git add 测试残留**（`_*.cjs`、`_chrome_t*`、`_test_upload.pdf` 等只手动 add 明确文件）。
- 测试会改写数据时，测完必须把用户真实数据恢复原状（如 pdf_url 恢复为用户的最后上传文件）。

## 已知环境坑（勿重试/勿踩）

- `computer_use_tool` 的 bu/cu 两个 plane 在本环境均不可用（browser_use_space_disabled / PIP 初始化失败），
  不要尝试；GUI 自测走上面的 Puppeteer 通道。
- Edit 工具对 CRLF 文件报 Native execution failed：先 PowerShell 转 LF 再 Edit。
- 项目使用 HTTP 通道（非 Electron IPC）时，前端 src/api/client.js 自动回退 fetch；验证以 HTTP 实测为准。

## 数据与历史备注

- **双视角重构已合入 main（2026-09-15）**：重构期分支 `feature/sample-run-model` 全部提交已在 main（2774f52，本地=远端）；
  业务决策见 docs/BUSINESS_LOGIC.md（第 4-5 节），7 阶段路径见该文档 5.4。当前工作分支 `feature/next-milestone`。
- 同一款式可能存在重复单据（如 AW26-JK001 有 task1/task2 两个实例，共享 styles 行的 pdf_url）——
  涉及此类任务先查清再动，不要盲目合并/删除。
- 图纸资料分五类：设计稿/参考图/成衣图/纸样/唛架图；参考类防冗余、工作成果可追溯（版本）。
- 设计稿区交互：单击放大（放大图内提供 更换设计稿/从资料库选）、双击本地打开；
  「从资料库选」弹窗内卡片已禁用预览交互，点卡片=选中，底部「确认更换」生效。
- **文档防漂移（2026-09-14 文档清洗）**：本仓库文档**禁止写死**"文件行数 / 模块（routes·services）数 /
  数据库迁移版本"等会漂移的数字 —— 一律**指向源码**（如迁移版本见 `server/db.cjs` 的 `migrations` 数组）
  或由 `scripts/doc-stats.cjs` 从源码生成（见 `docs/PROJECT_HANDBOOK.md` 的 `<!-- STATS:BEGIN/END -->` 区块，
  `npm run doc:check` 可校验）。**文档索引与持续维护清单见 `docs/README.md`**；`docs/{audit,roadmap,archive}` 为
  审计 / 计划 / 归档三类，归档只归档不删除。
