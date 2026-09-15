# PatternMaster Pro 迭代状态追踪

> 本文件是迭代过程的"外部记忆"，上下文压缩后必须先读本文件再继续。
> 最后更新：2026-09-12（UI/UX 重构专题上午完成：暖黑金配色换新 + 看板筛选 text-2 + 侧栏参考图样 + Inter/DM Mono 全站字体 + 全站表格无框通透化；下午完成：工艺指示拖拽排序 + 弹窗实底 + SmartSelect 弹层跟随修复 + 跨版次对比退出 + 看板卡片 hover 重叠 + 筛选复位项/清除按钮）
>
> **定位（2026-09-14 文档清洗）**：本文件是**追加式变更日志（只增不改）**，**不承担"项目现状"职责**。任何"当前最新迁移版本""当前 x 行 / x 个模块"之类**现状断言一律以 `docs/PROJECT_HANDBOOK.md`（计数由 `scripts/doc-stats.cjs` 生成）为准**；本文件内出现的历史版本号/行数仅是**当次记录**，不代表现状。文内提及的旧路径已迁移（如 `docs/待开发文档.md` → `docs/roadmap/待开发文档.md`，`docs/P2-ABI-迭代方案.md`、`README_DEV.md` 等 → `docs/archive/`），统一索引见 `docs/README.md`。

---

## 〇、双视角重构专题（feature/sample-run-model 分支）

### 背景：两种任务管理模式的冲突

- **旧模式（单=版次）**：同一个款（如 AW26-JK001）按版次拆成多张单（task1 胚样、task2 头版样），版次资料隔离、看板重复、数据不共享
- **新模式（单=款）**：同一个款的所有版次和资料都在一张单下，通过批次迭代管理，资料共享
- **用户洞察（双视角）**：
  - 设计师视角：关注宏观款级聚合（总款数/品类占比/开发进度/可下大货）
  - 板师视角：关注微观版次级明细（手里款的版次进度/样衣做没做/欠料/谁做的）
- **最终决策（ADR-003，用户确认）**：混合模式——以款为主单 + 版次批次（sample_runs）子状态，同一套分层数据支撑两种可切换视图

### 数据模型（重构后）

```
styles(style_no UNIQUE, pdf_url 款级共享)
  └── tasks(style_id FK，款单级，status=todo/doing/done 由批次自动聚合)
        └── sample_runs(task_id FK ON DELETE CASCADE，版次批次)
              ├── status: waiting_material/pattern_making/sample_making/pending_confirm/done
              ├── blocker: none/short_material/wait_designer/wait_tech/other
              └── linked_drawing_ids: 批次绑定的图纸资料版本(JSON数组)
        ├── drawings / bom_items / process_items（task_id 隔离）
        └── operation_logs(task_id)
```

### 7 阶段实施进度（全部完成）

| 阶段 | 内容 | Commit |
|---|---|---|
| 1 | 看板 status 枚举归一（in_progress→doing 兜底） | 3b090d3 |
| 2 | 建单同款查重（列出已有单/打开/二次确认） | 05fe610 |
| 3 | sample_runs 版次批次结构化（表/服务/路由） | 13c0103 |
| 4 | 存量重复单合并（v10 迁移 8单→6单） | 13c0103 |
| 5 | 设计师仪表盘（款级聚合/品类占比/进度分布/款级列表） | — |
| 6 | 视图切换（看板⇄仪表盘）+ 默认视图记忆 | 3345fe4 |
| 7 | 资料版本绑定到批次（linked_drawing_ids） | cc9227b |
| 8 | 款级状态自动同步（批次变化→task.status 自动推导） | —（本次） |

### 款级状态自动同步规则（本次新增）

- 批次是权威数据源，款级看板列不再手动维护
- 聚合规则：取**最先进**批次状态（waiting_material < pattern_making < sample_making < pending_confirm < done）
- 映射：not_started/waiting_material→todo；pattern_making/sample_making/pending_confirm→doing；done→done
- 触发点：批次 create/update(状态变化)/delete 后自动同步；建单自动建首个批次后同步
- 前端：SampleRunList 批次状态变化后通过 onStatusSync 回调刷新详情页款单状态

### 当前数据状态

- 6 个 task（一单一款无重复）、6 个 styles、8 个批次
- task1 AW26-JK001（胚样打版中 + 头版样待配料）、task4 SS26-TS003（2 批次）、其余各 1 批次
- 数据库迁移最新 **v14**（v10 批次表+存量合并，v11 linked_drawing_ids，v12 清理 tasks 旧批次字段，v13 批次负责人拆分版师/样衣工，v14 单号/审核下沉版次）
- 迁移前备份：`server/database.backup_before_v10.sqlite`（.gitignore 忽略，未入库）

### tasks 旧批次字段清理 + 刷新白屏修复（2026-09-07，迁移 v12）

- **背景**：双视角重构后 tasks 上的 sample_type/sample_color/size/sample_count/fabric_date 为兼容保留（v10 已把值迁入 sample_runs），造成双写路径；文档遗留待办「后续可清理」
- **数据安全核对**：迁移前经 HTTP 逐 task 比对旧字段 vs 首个批次（sort_order 最小）全部一致（6/6 OK），删除零数据损失；执行前备份 `server/database.backup_before_v12.sqlite`
- **迁移 v12**：删除 tasks 5 个旧批次列；v1 建表同步移除（新库直建无旧列）
- **后端**：tasks.cjs create() 任务 INSERT 移除旧列（批次 INSERT 保留）；update() TASK_KEYS 移除旧键（PATCH 旧键静默忽略，不再产生日志噪音）；删除 sample_type 变更日志埋点（批次级日志已覆盖）；versions() 从 sample_runs 投影 sample_type/sample_color；attachRuns() 新增兼容投影（sample_type/sample_color/size/sample_count/fabric_date 从首个批次推导），前端卡片/导出/查重列表零改动
- **seed.cjs**：适配新模型——移除旧列 INSERT 与 ALTER 残留，每张单自动建首个批次（makeRun），与新模型一致（该脚本在本环境因 ABI 无法执行，仅语法校验）
- **顺带修复真实 bug（前端白屏）**：`pm_default_view` 原会把 detail/settings 也写入 localStorage，刷新后 view='detail' 而 editingTask 为空 → 渲染空 div 白屏（无任何报错，Puppeteer 复现：详情页 → goto → 白屏）。修复：setView 仅持久化 kanban/dashboard 两个顶层视图，初始化读取时对非法值兜底回 kanban。已实测污染值（saved='detail'）加载正常回看板
- **验证**（全部实测通过）：
  - HTTP：GET /api/tasks（6 单、runs 附带、派生字段正确）；versions API 正常；PATCH 旧键忽略（taskUpdated=False/logged=0）；建单→批次（类型/尺码/颜色/件数/日期全落位）→批次状态变更→款单状态自动同步→删除→孤儿款式清理，全链路通过
  - 浏览器 E2E（Puppeteer + 系统 Chrome，全新配置目录）：看板 7 项/列表（26AWW526 行 V2—M 2 正确）/仪表盘/详情批次/新建弹窗全 PASS，零 console 错误；空白复现脚本修复前 goto 后 textLen=0 → 修复后 1073
  - 生产构建 `npm run build` 通过（8.5s）

### REQ-002 + REQ-003 仪表盘/清单展示优化（2026-09-07，迁移 v13）

- **REQ-002 图纸资料缩略图完整展示**：DrawingLibrary 卡片网格与版本历史缩略图由 object-fit:cover（上下裁切）改为 contain（完整显示留白），`.drawing-thumb img` CSS 同步；非图片占位（PRJ/EMF/DXF 图标）与矢量缩略图天然完整，无需调整
- **REQ-003① 品类占比点击筛选**：品类条可点击，选中态高亮，再次点击恢复；与统计卡状态筛选**可叠加**（AND 交集），标题计数联动
- **REQ-003② 版师/样衣工列**：迁移 v13 sample_runs 加 pattern_maker/sample_maker（旧 assignee 并入版师后删列）；批次表单「负责人」拆为「版师」「样衣工」两个输入；清单新增两列（取最先进批次，未分配显示「未分配」）；KanbanView 批次 tooltip 同步
- **REQ-003③ 进度展示优化**：清单合并「当前进度+最先进批次」为单列主进度，显示 `版次·批次状态`（如「胚样·打版中」「复版三·已完成」），按批次状态着色，一眼识别在打胚/头版样/复板等环节；无批次显示「无批次」
- **REQ-003④ 统计卡粒度**：4 卡 → 5 卡（总数/进行中/待配料未开始/**待确认**/已完成）；进行中口径改为 打版中+样衣中（待确认独立，分类互斥），统计卡筛选与卡片数字严格一致
- **验证**（全部实测通过）：浏览器 E2E 17 项全 PASS（5 卡/表头 8 列/主进度显示/未分配/品类筛选与选中态/叠加筛选/待确认卡/缩略图 contain/零 console 错误）；生产构建通过（12.3s）
- **注意**：期间用户实际使用推进了批次状态（26AWW526 V2→待确认、SS26-TS003 胚样→样衣中），仪表盘数字随之真实变化——验证了卡片数字非写死
- **REQ-004（款/版次信息归属重构）仍待开发**：数据模型+页面大改，涉及单号下沉版次、审核按版次独立、历史数据迁移；需先定设计决策（见 docs/待开发文档.md 备注），未在本轮实施

### REQ-004 款/版次信息归属重构（2026-09-07，迁移 v14）

- **设计决策（用户拍板）**：①V 编号=款内批次顺序（V0 起，**一位不补零**）；②款式信息用**右侧抽屉**方案（先做出来看，不合适再改）；③款单看板状态**保留款级**（todo/doing/done 是整款推进层级，由最先进批次聚合，不下沉；批次本身已有 5 档细粒度状态）
- **REQ-004① 款式信息抽屉**：新组件 `src/components/style/StyleInfoDrawer.jsx`（createPortal 右侧抽屉，宽 440px）：款号徽标 + 名称/类别/品牌/设计师/年度/季节/波段 + 设计稿只读展示；保存走新增 `PUT /api/styles/:id`（styles 服务 update，白名单 title/category/brand/designer/year/season/month/pdf_url，IPC `styles:update` 同步注册）→ loadTasks + 刷新当前详情。入口：看板卡片款号旁 Info 按钮（`.bento-style-info-btn`）+ 详情页顶部「款式信息」按钮。**详情页「款式基础信息」区块已移除**（不再依附打样单页面）
- **REQ-004② 单号下沉版次**：迁移 v14 sample_runs 加 `order_no`，按款内 sort_order 生成 `PO-{款号}-V{n}`（n 从 0 起，删除批次不重排，max+1 分配新批次）；详情页款单信息区「打样单号」输入移除，批次卡片顶部只读显示各自单号（`.run-order-no`）；tasks.order_no 清空废弃；`attachRuns()` 从最先进批次投影 order_no/audit_status/audit_comment（看板卡片「版单/审核」行、列表列、导出自动正确）；versions() 用首个批次单号标识版本
- **REQ-004③ 审核按版次独立**：sample_runs 加 `audit_status`（未提交/待审核/已通过/已驳回，默认未提交）+ `audit_comment`；批次表单加审核状态下拉（着色）+审版意见输入；详情页款级审核/审版意见 UI 移除；v14 迁移把旧款级审核迁至**最先进批次**（审最新样衣语义，26AWW526 原"待审核"不迁→未提交）；批次审核变更写操作日志
- **验证**（全部实测通过）：迁移后 HTTP 全链路（单号 V0/V1 正确、审核继承、PATCH 审核生效、styles PUT 生效、投影正确）；浏览器 E2E **19 项全 PASS**（抽屉开/关/字段/保存按钮、详情页无款式基础信息区块/无打样单号输入框/无款级审核、批次单号标签/审核字段、看板卡片版单+审核行投影、零 console 错误）；生产构建通过（14.7s）
- **踩坑**：PowerShell 5 的 Invoke-RestMethod 发中文 body 默认非 UTF-8（'待审核'→'??' 被枚举校验回退'未提交'），测试必须 `[Text.Encoding]::UTF8.GetBytes(ConvertTo-Json)` + `charset=utf-8`——是测试方法问题，真实前端 fetch 无此问题；Puppeteer `elementHandle.click()` 在 headless 下不触发 React 合成事件，需 `dispatchEvent(new MouseEvent('click',{bubbles:true}))`（REQ-003 E2E 是 page.click 选择器路径可用，本次按钮在 React 层回调）
- **REQ-004 完成后遗留**：tasks.order_no/audit_status/audit_comment 列保留兼容（v14 已清空数据），后续版本可 DROP；seed.cjs 仍写 tasks.order_no（旧 SQL，种子数据无批次单号，仅开发脚本，不影响真实数据）

### REQ-004 方案修订（2026-09-07，用户验收反馈）

- **抽屉方案作废**：用户验收指出「把最重要的信息藏起来的展示方式反人类、不合理」——款式信息是重点数据，不得收进抽屉。修订：**移除 StyleInfoDrawer 组件与全部入口**（看板卡片 ⓘ 按钮、详情页顶部「款式信息」按钮）；详情页恢复并强化「款式信息」区块（玫红标题条「款级共享·同款各版次同步生效」+ 铅笔编辑开关 + 8 字段直接展示、值可见），编辑保存走原有 handleSave → updateTask STYLE_KEYS 链路
- **审版意见改多行**：批次表单审版意见由单行 input 改 `textarea rows=3`（可多行、垂直拉伸）；数据字段不变（audit_comment）
- 保留：`PUT /api/styles/:id` + IPC `styles:update` + styles 服务 update（款级编辑基础能力，无副作用，后续尺寸表等可复用）
- **验证**：修订后浏览器 E2E 10/10 PASS（无抽屉入口、款式信息 8 字段直接展示且有值、顶部无款式信息按钮、批次单号/审核/审版意见 textarea、零 console 错误）；生产构建通过（11.0s）；commit 随本段提交

### 遗留待办

- 本地 22+ 笔 commit 未推送（需用户开代理）
- Excel 导入功能待定（用户明确后续再加入）
- 前端 task.sample_type 等兼容投影字段的消费点可迁移为直接读取 runs（多批次款目前只投影首个批次；卡片/导出展示多批次摘要为后续 UI 增强）
- 4174 端口为生产构建预览（`_preview.cjs` 托管 dist + 代理 API），内置浏览器缓存问题用换端口解决

---

## 一、项目基本信息

- **项目名**：PatternMaster Pro（golden-shuttle）
- **定位**：服装打样单全流程管理桌面应用
- **技术栈**：Electron 34 + React 19 + Vite 7 + Express 5 + better-sqlite3 + SQLite
- **项目路径**：`D:\dev\golden-shuttle`
- **当前分支**：`feature/sample-run-model`（双视角重构分支，main 保持稳定待合并）
- **备份分支**：`backup/pre-review-20260827`（审查前全量备份）

## 二、环境信息

- **Node 版本**：真机系统 Node v24.13.0（ABI 137）；AI 工具通道里的 node 是托管版 v22.22.2（ABI 127）
- **better-sqlite3**：当前编为 ABI 132（Electron），dev 后端由 Electron Node 运行，无需再 rebuild:node
- **开发端口**：后端 3001（0.0.0.0），前端 Vite 5173
- **数据库路径**：`server/database.sqlite`（6 tasks / 6 styles，迁移已到 v14）
  - task1 AW26-JK001 极地抗寒羽绒服：2 批次（胚样打版中 + 头版样待配料），图纸库 2 条设计稿
  - task4 SS26-TS003 高支纯棉重磅T恤：2 批次；其余款各 1 批次
- **启动命令**：`npm run dev:all`（= `node scripts/dev.cjs`，同时启动后端+前端）
- **启动校验**：后端日志出现 `[DB] All migrations up to date (latest: v14)` 即为正常
- **生产预览**：`node _preview.cjs`（托管 dist 到 4174 端口 + 代理 API 到 3001）——内置浏览器缓存问题用换端口解决
- **Git 现状**：仓库 2026-09-01 重新初始化，当前 `main` 分支仅 1 个提交 `5989809 初始提交`
  （远端 github.com/jxyuyi-commits/golden-shuttle），本文件引用的历史提交号已不可查
- **注意**：仅在换机/升级 Electron 时才需要 rebuild，且需用国内镜像：
  ```powershell
  $env:npm_config_disturl='https://npmmirror.com/mirrors/node'
  npm run rebuild:electron
  ```

## 三、已完成的修改

### Commit 59e38ae2（2026-08-27）
**PDF.js 本地化 + 缩略图修复 + 设计稿格式扩展**
- PDF.js 从 cdnjs CDN 改为 `pdfjs-dist@3.11.174` 本地依赖 + Vite 动态 import
- 根因：cdnjs 不可达 + 原代码无 onerror → PdfThumb 永远卡在"渲染中…"
- 去掉 unsplash 外链 fallback，无设计稿统一显示"请上传设计稿"
- 上传 accept 从 `.pdf` 扩展为 `image/*,.pdf`
- PdfThumb 新增 `isImageFile()` 判断：图片直显，PDF 用 pdf.js 渲染首页
- 加并发保护（pdfjsLoading）防止重复加载

### Commit 5bb23c53（2026-08-27）
**修复 STYLES 中 42 处 CSS 属性名连字符损坏**
- box-sizing/font-size/border-color/box-shadow 等属性名连字符两侧被插入空格
- 浏览器静默丢弃这些声明，导致大量样式未生效
- 全局正则修复：font-size(18), border-color(8), box-shadow(3), max-height(2), font-weight(2) 等

### Commit e6fc6828（2026-08-27）
**SizeTable 两处硬编码 localhost:3001 改为 API 常量**
- 核心部位提醒和版次对比的 fetch 请求硬编码端口，与 API 常量策略不一致

### Commit 70c063aa（2026-08-27）
**清理仓库垃圾文件**
- 从 Git 移除 server/uploads/（9个PDF,~111MB），保留本地文件
- 删除临时脚本：check_db.js/fix.js/get-path.cjs/download-electron.js
- 删除备份：server/index.cjs.bak
- 删除日志：seed_error.log/seed_success.log
- 删除空文件：database.db
- 删除磁盘临时目录：_asar_extract/_asar_verify
- 更新 .gitignore 覆盖上述类别

### Commit c0da7b63（2026-08-27）
**Electron 安全加固：关闭 nodeIntegration，启用 contextIsolation**
- 前端未使用任何 Node/Electron API，可安全关闭
- 防止渲染进程被注入后直接获得系统 shell 访问权

### Commit ddb56a35（2026-08-27）
**添加迭代状态追踪文件 ITERATION_STATE.md**

### Commit f78a2246（2026-08-27）
**P1架构重构第一步：提取API层和工具函数**
- 新建 src/api/client.js（API常量+request封装：apiGet/apiPost/apiPut/apiDelete）
- 新建 src/api/index.js（19个API函数：tasks/styles/settings/size-groups/measurement-templates/upload/open-file）
- 新建 src/utils/pdf.js（loadPdfJs/renderPdfThumb/isImageFile）
- 新建 src/utils/format.js（autoSign/formatTime）
- App.jsx 移除全部19处内联fetch调用，统一使用API层
- 顺手修复BUG：saveTask从PATCH改为PUT（匹配后端app.put路由），SizeGroupManager更新从PATCH改为POST（后端只有POST做upsert）
- 本地函数fetchTasks/fetchSettings改名为loadTasks/loadSettings避免与导入冲突
- App.jsx 从2685行减至约2490行
- 验证：看板数据、筛选器、占位符、PDF缩略图全部正常

### Commit c6c3b4ef（2026-08-27）
**P1架构重构第二步：拆分App.jsx全部9个组件到独立文件**
- src/components/common/SmartSelect.jsx
- src/components/common/PdfThumb.jsx
- src/components/measurement/MeasurementModal.jsx
- src/components/measurement/MeasurementTemplateManager.jsx
- src/components/size-table/SizeTable.jsx（556行，最复杂组件）
- src/components/task/NewTaskModal.jsx
- src/components/settings/SizeGroupManager.jsx
- src/components/settings/CategoryManager.jsx
- src/components/settings/SettingListEditor.jsx
- App.jsx 从2592行减至1290行，仅保留App主组件+STYLES
- 验证：看板/详情页/尺寸表全部正常，零console错误

### Commit 4585d6f6（2026-08-27）
**P1架构重构第三步：CSS独立化 + SettingsView提取**
- CSS独立化：STYLES字符串(267行)提取到 src/styles/app.css，main.jsx import引入
- SettingsView：设置视图提取到 src/components/settings/SettingsView.jsx
- App.jsx 从1292行减至975行（较原始2685行减少64%）
- 验证：看板/详情/设置三视图全部正常，零console错误

### Commit 6118cd0a（2026-08-27）
**P1架构重构第四步：提取业务hooks**
- 新建 src/hooks/useTasks.js（tasks state + loadTasks）
- 新建 src/hooks/useSettings.js（settings state + loadSettings + saveSetting，含默认值）
- App.jsx 移除 tasks/settings useState、loadTasks/loadSettings useCallback、saveSetting 函数
- 验证：看板/详情/设置三视图全部正常，零console错误
- App.jsx 从749行降至714行（较原始2685行减少73%）

### Commit 5b029eb3（2026-08-27）
**P1架构重构第五步：提取KanbanView（最后一个大视图）**
- 新建 src/components/task/KanbanView.jsx（413行，最复杂视图）
- 包含：筛选器/看板三列/任务卡片/列表视图/列配置/视图保存
- 内部封装 filterTasks/getActiveCols/getNodeIcon 辅助函数
- App.jsx 看板视图从413行内联JSX改为20行组件调用
- 移除 App.jsx 中的 getNodeIcon 函数（已移入 KanbanView）
- 验证：看板/列表/详情导航全部正常，零console错误
- App.jsx 从714行降至323行（较原始2685行减少88%）

### Commit 41722599（2026-08-27）
**P1架构重构第六步：后端分层 + 数据库索引**
- server/db.cjs：数据库初始化+建表+迁移+索引（130行）
- server/index.cjs：Express入口+路由挂载+启动（62行，原530行）
- server/routes/ 下6个路由模块：tasks(203行)/styles/files/measurement/settings/sizeGroups
- 新增3个数据库索引：tasks.style_id / tasks.status / measurement_templates.category
- 验证：全部API端点200 OK，前端看板/详情正常，零console错误

### 图纸资料页（2026-09-04，迁移 v6 + CRUD + IPC + DrawingLibrary）
- **背景**：DetailView「图纸资料」Tab 原为占位（"集中管理技术图纸/纸样/放码图等资料…即将上线"），仅右侧单张设计稿 PDF
- **数据层**：迁移 v6 新增 drawings 表（task_id 外键 ON DELETE CASCADE / category / title / filename / url / note / sort_order）+ idx_drawings_task_id 索引
- **后端**：services/drawings.cjs（listByTask/create/update PATCH 语义/remove）+ routes/drawings.cjs（GET /api/drawings?task_id / POST / PATCH / DELETE），index.cjs 注册
- **IPC 双通道**：preload.js 暴露 api.drawings 4 方法；main.js 注册 drawings:* handlers；client.js ipcRequest 映射 /api/drawings；api/index.js 新增 fetchDrawings/createDrawing/updateDrawing/deleteDrawing（文件上传仍走 HTTP /api/upload-pdf）
- **前端**：src/components/drawing/DrawingLibrary.jsx（分类筛选全部/设计稿/技术图纸/纸样/放码图 + 上传弹窗 createPortal + 卡片网格 PdfThumb 预览 + 标题/备注防抖自动保存 + 删除 confirm）；DetailView 移除占位接入组件；app.css 新增 drawing-grid/card/thumb/badge/del/meta 样式
- **验证**：API CRUD 全通（UTF-8 中文正常）；生产构建 1771 模块通过；浏览器实测上传→卡片出现（分类徽章/标题默认文件名）→改标题防抖 PATCH 持久化→删除→空态，全部通过

### 图纸资料上传方式升级（2026-09-05）
- **需求**：上传方式原始（仅点击选择+图片/PDF），需支持拖拽/复制粘贴、不限制文件格式（专业软件 dxf/pla/prj/Zprj/zpac 等）
- **PdfThumb**：新增通用文件分支——非图片/非 PDF 显示「文件类型图标+扩展名」占位，单击用系统默认软件打开（getExt 提取扩展名 + isGeneric 判断，图片/PDF 行为不变）
- **DrawingLibrary**：图纸区域整区拖拽（拖入高亮「松开上传」）+ 上传弹窗拖拽放置区 + 文件多选（multiple、去掉 accept）+ 全局 Ctrl+V 粘贴监听（clipboardData.files → 预填弹窗）+ 待上传文件列表（name+size 去重、可移除）+ 批量串行上传
- **后端**：express.json limit 50mb → 100mb（支持较大专业文件；base64 膨胀 33%）
- **验证**：浏览器实测拖拽 3 专业格式（dxf/pla/prj）→ 弹窗预填 → 批量上传 → 卡片显示 DXF/PLA/PRJ 占位「单击本地打开」；模拟粘贴 docx → 弹窗自动打开；生产构建通过；测试数据已清理

### 图纸资料分类可编辑（2026-09-05）
- **需求**：上传后分类不可改，误标只能删除重来
- **实现**：卡片缩略图左上角分类徽章改为可点击下拉（.drawing-cat-sel，按分类配色 + 内置小箭头），切换即本地即时更新 + PATCH 持久化（handleCategoryChange）
- **验证**：浏览器实测下拉切换分类 → API 确认持久化；测试数据清理，用户数据不受影响

### 图纸资料分类细化（2026-09-05，迁移 v7）
- **需求**：分类细分为 设计稿 / 参考图 / 成衣图 / 纸样 / 唛架图（原 设计稿/技术图纸/纸样/放码图）
- **实现**：DRAWING_CATEGORIES + CATEGORY_COLORS 更新（参考图 #f472b6、成衣图 #fb923c、唛架图 #34d399）；迁移 v7 映射旧数据：技术图纸→参考图、放码图→唛架图
- **验证**：筛选 chips / 卡片下拉 / 上传弹窗均同步为新 5 分类；已有 5 条数据正确映射（技术图纸→参考图）；浏览器实测通过

### 图纸资料版本管控 + 文件校验（2026-09-05，迁移 v8）
- **需求**：①纸样会持续迭代需版本管控；②同一文件反复上传被照单全收，缺校验。用户明确分两类治理：参考资料（参考图/成衣图）→ A 防冗余；工作成果（设计稿/纸样/唛架图）→ B 可追溯版本，回复「确认」授权实施
- **数据层**：迁移 v8 给 drawings 表加 kind / file_hash / version / group_id 四列；历史数据按分类推断 kind、按 (task_id, kind, filename) 归组、group_id=组内最小 id、version 按 id 升序递增
- **后端**：services/files.cjs save 返回 `{url, hash, size}`（SHA-256）；services/drawings.cjs 重写——categoryKind() 映射、create() 智能逻辑（同 task+同 hash 非 force → conflict:duplicate；output 非 force + 同名文件 → 归同组 version+1 返回 isNewVersion/previousId）、新增 listGroup/removeGroup；routes/drawings.cjs 新增 GET/DELETE /api/drawings/group/:groupId
- **IPC 双通道**：preload.js / main.js / src/api/client.js 透传 groupList/removeGroup；src/api/index.js 新增 fetchDrawingGroup/deleteDrawingGroup、uploadDesignFile 返回 hash
- **前端**：DrawingLibrary.jsx 重写——按 group_id 聚合卡片（最新版 + 版本徽章「Vx · 共N版」+ 分类下拉并排）；上传弹窗分类旁标注「参考资料·防冗余 / 工作成果·可追溯版本」；上传冲突分支（重复弹窗 confirm：确定=force 强制新建 / 取消=跳过）；版本历史弹窗（V1~Vn 缩略图列表、单版删除）；多版本整组删除二次确认
- **验证**：API 实测同内容重复→conflict:duplicate、同名不同内容→自动升 V3 归组、force 强制新建、参考图重复同样拦截、GROUP 12 返回 V1,V2,V3；前端版本徽章/版本历史弹窗/自动升版/重复确认全部实测通过

### 多文件拖拽 overlay 卡住修复（2026-09-05）
- **需求**：一次性拖入多文件后「松开鼠标上传」覆盖层 drop 后不消失、不锁焦点（用户截图 1425x896）
- **根因**：真实浏览器拖拽多文件时 drop 后残留 dragover 事件重新点亮 dragOver 状态；原代码只在 drop 重置且 dragleave 判断脆弱（未用 relatedTarget.contains）
- **修复**：DrawingLibrary.jsx 加 onDragEnd 强制关闭 + drop 后 setTimeout 兜底重置 + dragleave 改用 `relatedTarget.contains` 判断
- **验证**：实测残留 dragover 后再 dragend 必定关闭

### EMF/DXF 缩略图（2026-09-05）
- **需求**：EMF/DXF 无预览缩略图
- **实现**：新增 server/services/thumbs.cjs——parseDxf（解析 POLYLINE/VERTEX 轮廓，适配服装 CAD AC1009）、dxfToSvg（Y 轴翻转、padding、non-scaling-stroke）、emfToPng（PowerShell + System.Drawing 转 PNG，maxSide 1000）、getThumb（按扩展名分流 + 缓存）；新增 server/routes/thumbs.cjs GET /api/drawing-thumb（image/png 或 image/svg+xml，Cache-Control max-age=86400）；index.cjs 挂载；PdfThumb.jsx 增加 isVectorThumb(emf/dxf) 分支，卡片 img 显示真实预览，失败回退占位
- **验证**：EMF 清晰渲染连衣裙线稿（1000x388）；DXF 正确渲染纸样轮廓（3 纸样片、77 POLYLINE、3447 VERTEX）；PRJ 保持占位（富怡/格博工程文件无公开格式规范，合理边界）；DXF 解析曾修 bug：顶点按 10→push 新点、20→补 Y，不能按行序盲推

### 单击放大修复 + 统一交互（2026-09-05）
- **第一轮**：PNG/DXF 放大无效——根因放大条件检查 thumb（PDF 渲染图）但图片直显时 thumb 恒 null，改 canEnlarge 按类型取预览源（图片→fullUrl、矢量→thumbUrl、PDF→thumb）
- **第二轮 DXF 仍异常**：SVG 作 `<img>` 在 flex 容器中固有宽度被 Chrome 按 0 处理（clientWidth=0）；SVG 加 width/height、img 用 vw、onLoad 设宽均无效（React 对已缓存 SVG onLoad 不触发）
- **最终方案**：DXF 放大弹窗改内联渲染——useEffect fetch SVG 文本 + dangerouslySetInnerHTML 渲染到 .drawing-svg-preview（app.css：max-width 92vw/max-height 90vh、白底圆角阴影）
- **统一交互**（用户明确"所有文件双击打开，prj 也改成双击"）：handleInteract 移除 isGeneric 单击直达分支——所有格式统一 单击→300ms 放大（无预览格式显示「该格式无在线预览，双击卡片可调用本地软件打开」占位）/ 300ms 内第二击=双击→openNative；title 统一「单击放大预览，双击用本地软件打开」

### 文件类型标签（2026-09-05）
- **需求**：为各文件类型打上标签以便区分（PRJ/EMF/DXF/PNG/PDF/ZPRJ 等）
- **实现**：DrawingLibrary.jsx 加 TYPE_COLORS 配色（图片=绿、PDF=红、DXF=橙、EMF=蓝、PRJ/ZPRJ/ZPAC/PLA=紫、其他=灰）+ fileExtOf 从 url/filename 提取扩展名；卡片缩略图加 .drawing-type-badge 标签（初版在左上角 badges 区，版本历史弹窗 .ver-title 同步加）
- **调整**：用户要求移到右上角——新增 .drawing-corner 容器（类型标签 + 删除按钮），左上角 badges 只留分类 + 版本
- **验证**：15 卡片全部带类型标签且配色正确；右上角布局不拥挤；版本历史行带类型标签；浏览器实测 + 构建通过

### 工作动态节点显示修复（2026-09-05）
- **需求**：工作动态卡片没显示工作节点（截图：每条记录只剩「已完成+日期+负责人」）
- **根因**：timeline-row 总宽仅 290px，单行要塞 状态+日期(104px)+事件名+负责人+删除 五元素，事件名 input 被 flex 压缩到 18px 几乎不可见
- **修复**：DetailView.jsx 改两行布局——第一行 事件名称全宽 + 删除按钮，第二行 状态+日期+负责人（.tl-main/.tl-sub）；app.css 相应调整
- **验证**：事件名 input 从 18px→260px，7 条节点（收单→胚样→完成头样待料→料齐下板房→完成头板样衣→更名→大货制单）全部清晰可见

### 缩略图缓存路径修复（2026-09-05）
- **问题**：git status 出现项目根未跟踪 thumbs/ 目录（6 个缩略图缓存 + _emf2png.ps1）
- **根因**：thumbs.cjs 的 THUMB_DIR 在模块加载时固定计算，若 require 早于 initDatabase()，getUploadsDir() 返回空串 → path.resolve('', 'thumbs') 落到项目根
- **修复**：THUMB_DIR 弃用，改为惰性 getThumbDir()（每次调用现算，getUploadsDir() 为空时回退 server/uploads）；emfToPng/getThumb 内部改用 getThumbDir()；删除误生成的根目录 thumbs/
- **验证**：重启 dev 后 EMF→PNG/DXF→SVG 全部缓存正确写入 server/uploads/thumbs/（2 PNG + 3 SVG + ps1），根目录无残留；浏览器缩略图全部正常渲染

### 版次自定义值筛选补齐 + 设置页滚动条（2026-09-06）
- **需求**：①看板版次筛选器缺自定义版次值——26AWW526 版次为自定义「V2」（版次库预设为 胚样/头版样/复版一…），筛选器只列预设，筛不出该单；②系统设置页内容超高无滚动条，底部区域（尺寸部位管理）被裁
- **版次方案（三处协同）**：编辑页 SmartSelect 本就支持自定义输入（无需改）；新建单 NewTaskModal 版次普通 select 改为 SmartSelect（可手动输入 V1/V2 等）；看板 KanbanView 版次筛选器选项改为「版次库预设 ∪ 所有任务实际使用值去重」（useMemo），自定义值自动出现在筛选项
- **滚动条根因**：App.jsx 根容器 `overflow:hidden; height:100vh`（全局不滚动），各视图需内部自滚——详情页有 `.detail-content{overflow-y:auto}`，设置页缺失；修复 SettingsView 最外层改 `height:100vh + overflowY:auto`（custom-scrollbar）
- **验证**：构建通过；用户重新导出的看板数据样本确认版次筛选器已含 V2；设置页可滚动至底部
- **说明**：用户确认分类为可自定义主数据（此前"筛选缺下装"判断撤销）；Excel 导入功能待定搁置，后续再加入

### 看板逾期提醒（2026-09-06）
- **需求**：打样单有期望交期（expected_date），超期未完结需醒目提示；看板需按逾期情况关注分组
- **实现**：KanbanView 加 getOverdueInfo(task) 纯函数——未完结 + 有交期才判定，逾期(>0天)/今日到期(0天)/3天内到期(-3~-1天)/正常/无交期或已完结；关注点下拉新增「逾期情况」分组（已逾期红/今日到期橙/3天内黄/正常绿/无交期灰 5 列）；看板卡片右上角逾期徽章（⚠ 逾期 N 天 / 今日到期 / N 天后到期），逾期卡片红描边
- **验证**：构建通过；Node 单测 8 组用例（逾期180天/已完结/无交期/逾期1天/今日/2天后/远期）全部符合预期；浏览器工具本轮沙箱不可用，待用户页面确认

### 操作日志（2026-09-06，迁移 v9）
- **需求**：侧边栏「操作日志 (开发中)」占位转正——追溯每个打样单的关键动作（谁在何时改了状态/版次/优先级/审核/交期/工作动态）
- **数据层**：迁移 v9 建 operation_logs 表（task_id/action/detail/operator/created_at + task_id/created_at 索引）
- **后端**：services/tasks.cjs 加 logAction()/listLogs()；create 记「创建打样单 款号…，版单…」；update 埋点去噪——状态/版次/优先级/审核/期望交期变化才记（同值不记），progress_nodes 用 JSON 串比较（前端整单 PATCH 不产生「工作动态更新」噪音）；routes/tasks.cjs 加 GET /api/logs（?task_id= 过滤 + ?limit=）
- **前端**：api/index.js 加 fetchLogs；新组件 OperationLogsModal.jsx（时间倒序、动作图标/颜色、空态引导）；App.jsx 侧边栏「操作日志」可点开弹窗
- **验证**：迁移 v9 生效（GET /api/logs 200）；PATCH status→logged:1、PATCH status+priority→logged:2（去噪正确）；task_id=8 过滤返回 3 条可读中文日志；测试后还原任务8优先级；构建通过

### 设计稿缺失可见性（2026-09-06，已按用户意见调整）
- **初版**：看板卡片左上角橙色「缺设计稿」角标 + 筛选区新增「全部设计稿/缺设计稿/已有设计稿」下拉
- **用户否决**：明确「设计过于离谱」「不需要筛选、不需要多此一举的角标，只想优化 UI 效果」（附截图：角标与占位文字重叠显冗余）
- **最终落地**：撤销筛选下拉与缺稿角标（design_doc/bento-draft-missing 全部清理）；只优化缺稿占位 UI——`.pdf-empty` 从 index.css 图层控制组摘出，改为 flex 垂直居中（图标 22px + 「请上传设计稿」 + 副提示「进入详情可上传」），柔和配色；构建通过、无残留

### 设计稿上传拖拽化（2026-09-06）
- **需求**：详情页「设计稿 PDF」上传方式与图纸资料页统一——图纸资料页支持拖拽/点击/粘贴/任意格式，详情页此前只有按钮选文件且 accept 限 image/*,.pdf
- **实现**：DetailView 设计稿块外包 `.pdf-upload-zone` 拖拽容器（dragOver 高亮 + 「松开鼠标上传设计稿」覆盖层，与 DrawingLibrary 同款交互）；拖入文件取首个直接上传（onPdfUpload）；保留点击选择；去掉 accept 格式限制（PDF/图片/dxf/prj/emf 等任意格式，与图纸资料页一致）；有稿时按钮文案「更换设计稿」；底部提示「拖拽文件到此处 / 点击上传，支持任意格式」
- **验证**：构建通过；上传接口 /api/upload-pdf 本就无格式限制（files.cjs 无白名单），前端 accept 移除即可

### 设计稿区悬停操作（2026-09-06，按用户意见二轮调整）
- **用户反馈**：底部长驻「上传/更换设计稿」大按钮 + 两行提示非常影响交互体验；「很多地方都有这个问题」，要求悬停操作方案
- **实现**：无稿时整块预览区=上传区（点击选文件/拖拽上传），hover 边框高亮 + 底部浮出「点击或拖拽上传」小提示；有稿时只显示预览，hover 右上角浮出 更换/移除 小图标，右下角常驻极小的「更换」角标兜底可发现性；拖拽覆盖层文案按状态区分「松开鼠标上传/更换设计稿」
- **验证**：构建通过；待浏览器确认

### 设计稿与图纸资料库打通（2026-09-06）
- **用户反馈**：①设计稿区 hover 时出现重复上传按钮（右下角常驻角标 + hover 更换组）；②移除设计稿无确认；③上传的设计稿不进入「图纸资料」管理页，且应能从图纸资料里选稿件更换
- **实现**：删右下角常驻 `.pdf-corner-edit` 角标（只留 hover 动作组，解决重复）；移除设计稿加 window.confirm；上传设计稿成功后同步 createDrawing（task_id + category=设计稿 + filename，工作成果可追溯版本）；新增 PdfPickerModal——列出该打样单图纸资料中「设计稿」分类（按 group_id 聚合取最新版，当前选中打勾），hover 动作组加「从图纸资料选择」按钮（有稿/无稿均可用），选中即设 pdf_url
- **验证**：构建通过；待浏览器确认
- **实测修复（用户反馈后）**：①「从资料库选择」按钮冒泡——无稿时容器整块 onClick 打开文件选择 + 按钮打开资料库，同时触发；给 从资料库选择/移除 按钮加 stopPropagation；②用户 3:39 上传的 235-6 设计稿未进库——根因是当时同步功能尚未部署（4:02 才生效），非逻辑 bug；同步链路 API 实测通过（upload-pdf→createDrawing→fetchDrawings→清理），并补录 235-6 设计稿进图纸库（task7 V1）；测试产生的孤儿文件已清理
- **SS26-TS003 仍未进库（第二轮排查）**：上传文件成功（uploads 有 25FWS014.pdf）但图纸库 0 条、pdf_url 空。后端逐环节实测（CORS preflight/带 Origin POST createDrawing/同名归组/400 分支）全部正常——createDrawing 请求要么未到达后端、要么 task_id 参数异常（400 不打日志）。处置：①server/index.cjs 加请求日志中间件（method/path/body 摘要）；②前端同步失败从 console.warn 改为 alert（错误可见）；③待用户下次上传，日志直接定位。机制澄清：styles.pdf_url 与 drawings.url 均引用 server/uploads 同一文件，非复制

### UI/UX 重构专题：暖黑金视觉系统 + 无框通透化（2026-09-12 上午，设计稿为 `Downloads/index.css`）

> 用户提供设计稿（暖黑底 #0e0f11 + 香槟金 accent #c8a96e，Inter/DM Mono 字体）作为配色与字体的唯一权威来源，逐项重构界面。所有改动均 `npm run build` 验证通过。

**1. 配色全面换新（custom 主题 → 暖黑金 token）**
- `src/styles/theme.css`：custom 主题全部 token 重写（bg #0e0f11 / bg-elev #161719 / text #f0ece6 / text-2 #9d9890 / accent #c8a96e / accent-soft rgba(200,169,110,.12) / input-bg rgba(255,255,255,.04) 等，app-bg 金色径向渐变）；顶部注释更新为「暖黑底+香槟金（2026-09-12）」；dark/light 系统主题与状态语义色（RUN_STATUS/PRIORITY/AUDIT_COLORS）有意未动
- `src/index.css`：--glass-bg 改 rgba(22,23,25,.75)；.manage-overlay 背景→var(--overlay-strong)；.data-table th 石板蓝→var(--bg-elev)
- `src/styles/app.css`：.data-table th→var(--bg-elev)；pdf-empty-hover-tip/generic-file/run-linked-picker 背景 rgba(2,6,23,x)→rgba(10,10,11,x)；tl-date 日期图标 filter hue-rotate(175deg)→0deg（灰→金色系）
- 组件内联蓝→金（4 处）：BomEditor 表头底线→var(--accent-soft-2)；DetailView 虚线框→rgba(200,169,110,.6)；ConfirmModal 图标底→var(--accent-soft)；DrawingLibrary 拖拽浮层→rgba(22,23,25,.7)
- `index.css` 新增 `.grid-cell` 无框单元格样式（hover 显底、focus 金色底线）——回应「无框通透」目标
- 图纸库专属紫色 #a78bfa 系列（drawing-ver-row/.drawing-dropzone/.dz-btn/generic-file 扩展名）有意保留未换金

**2. 看板筛选控件改 text-2**
- `KanbanView.jsx` 筛选区 5 个原生 select（分类/版次/设计师/优先级/状态）color var(--text)→var(--text-2)，与设计稿次级文字色一致

**3. 侧栏对齐参考图样（两轮）**
- 第一轮：`App.jsx` 侧栏 JSX 加 .sb-brand/.sb-pro 品牌区；菜单项绑定 view 的 .active 高亮；`app.css` .sidebar 去右侧圆角、品牌样式、.menu-item.active
- 第二轮按精确参考：菜单项 = 左侧 3px accent 竖条 + border-radius 6px + 13px/500 + width 100% + hover bg-hover；**保留原本 lucide 图标**；品牌 PatternMaster 16px/600 纯色 + Pro 徽标 10px/700/padding 1px 6px/radius 4px（背景 accent）；**关闭 × 移除**（侧栏失焦自动收起）

**4. 字体对齐设计稿 + 全站应用**
- `src/index.css` 顶部加两条 Google Fonts @import（Inter 400/500/600、DM Mono 0,400;0,500;1,400），body 字体栈 `'Inter', -apple-system, sans-serif`，新增 `.mono { font-family: 'DM Mono', 'Courier New', monospace }`
- `src/styles/app.css` body 去 Outfit（此前 Outfit 从未被加载，机器差异致字体表现不稳定）
- **全站贯通**：`button, input, select, textarea, .dp-input, .ss-display, .theme-option { font-family: inherit }`（表单控件默认不继承 body 字体）；等宽规则覆盖数字/编号场景——`input[type="number"]`、`.tl-date`、`.bento-style-no`、`.bento-order-no`、`.run-order-no em`、`.bento-node-date`；SizeTable 标准值/各码/档差/公差输入显式挂 `.mono`
- 验证：产物 CSS 已确认两条 @import 与继承/等宽规则进入 dist（离线回退系统字体）

**5. 表格无框通透化（BOM → 全站 .data-table）**
- `BomEditor.jsx`：cellStyle 删除内联 background/border（内联优先级最高是衬底来源），表格挂 .bom-grid 类
- `ProcessEditor.jsx`：cellStyle 同样删除内联 background/border
- `app.css` 规则从 .bom-grid 升级为全站 `.data-table`：
  - 常态：input/textarea/select 用 `input-bg` 近透明微底 rgba(255,255,255,.04)（用户指定「新·近透明」）；select 单独设 background-color 保留下拉箭头图标
  - hover：行 + 单元格 → accent-soft 金弱底 rgba(200,169,110,.12)（用户指定）
  - focus：accent-soft-2 + 底部 1px 金色底线（box-shadow 0 1px 0 var(--accent)），border-color transparent 覆盖全局 .data-table input:focus 的 !important 灰边框
  - 0.15s 过渡动画
- `SizeTable.jsx`：手动修改单元格橙色底衬 rgba(249,115,22,.05) 移除（保留橙色文字 #f97316 + 加粗作语义标记）；快速添加行独立表单区保留衬底
- 覆盖范围：BOM / 工艺指示 / 尺寸表 / 看板列表视图（只读表仅行 hover 生效）

### UI/UX 重构专题（下午）：交互修复与控件统一（2026-09-12 下午，承接上午视觉重构）

> 上午完成视觉基座后，下午集中处理交互与控件问题：弹窗透底、下拉跑飞、跨版次对比无法退出、看板 hover 重叠、筛选复位等。所有改动均 `npm run build` 验证通过。

**1. 工艺指示行拖拽排序（ProcessEditor + 后端 process.cjs）**
- 需求：工艺指示（部位工艺/缝制/后整理/特殊工艺）行可自由上下拖移排序
- `ProcessEditor.jsx`：序号列改为「拖拽手柄 GripVertical ≡ + 序号」，行 `onDragStart` 存 idx、拖拽行金弱底 + 半透明、行 `onDragOver`/`onDrop` 重排；新增 `dragIdx` state + `rowsRef`（重排时从 `rowsRef.current` 取数再 `setRows`，规避 StrictMode 下 updater 内重复副作用）；`load` 按 `sort_order` 升序渲染；`handleAdd` 新行 `sort_order: rows.length`；表头说明加「拖动行首手柄可排序」
- `server/services/process.cjs`：`update()` 原只更新 FIELDS 文本字段、`sort_order` 更新会静默失效 → 补 `if (b.sort_order !== undefined) keys.push('sort_order')`，数值走 `Number(b[k])||0` 不字符串化。**改后需重启本地 node 服务生效**
- 前端样式：app.css `.data-table td [draggable='true']` user-select:none + hover 金

**2. 编辑页标题与导出按钮主题化（DetailView）**
- 标题由「修改打样需求单 — {style_no||title}」改为 `{style_no}{...}{title}`（款号 + 款式名称）
- 「导出PDF」按钮内联样式由绿色（rgba(52,211,153,...)/#34d399）改为与「导出工艺单」一致的主题金（`--accent-soft` 底 + `--accent` 字 + `--accent-soft-2` 边）

**3. 设置「绑定号型系列」下拉失效（SmartSelect createPortal）**
- 现象：CategoryManager 两处 SmartSelect 弹层出现在输入框下方约 200px 外
- 根因：设置页容器带 `animate-slide-up`（transform），CSS 规定 transform 非 none 的祖先会成为 fixed 后代包含块 → 弹层坐标基准错乱
- 修复：SmartSelect 弹层改用 `createPortal` 渲染到 `document.body`，彻底脱离 transform/overflow 祖先；点击外部关闭判断同步纳入 `dropRef`（Portal 后弹层不在组件 ref 内）

**4. 跨版次对比缺「取消对比」（SizeTable）**
- `.compare-run-ss` 的 options 原只有版次列表，选中后无法退出对比
- 修复：options 首位加 `{ key: '', label: '不对比（隐藏对比列）' }`，选空 key 后 `compareRunId` 置空回到不对比态

**5. 分类库新增行控件对齐（CategoryManager + app.css）**
- 新增行三控件高度不齐（输入框 32px / mini-ss 约 20px / + 按钮约 14px）
- 修复：`.add-row-enhanced` 作用域统一 `align-items:center` + 输入框/`.smart-select`/`.btn-add-mini` 全部 32px 高 + `box-sizing:border-box`；`.mini-ss .ss-display` 覆盖为 `min-height:32px; padding:0 24px 0 8px; font-size:12px; display:flex; align-items:center`；按钮 `min-width:36px`

**6. 新建打样弹窗过于透明 + 下拉列表跑飞（app.css 实底 + SmartSelect rAF 跟随）**
- **透明根因**：custom 主题（`:root` 默认）下 `--glass-bg: rgba(22,23,25,0.75)` 半透明；theme.css 只对 `[data-theme="dark"/"light"] .glass` 有实色覆盖（background: var(--card-bg)），custom 主题漏了 → `.modal`/`.confirm-modal`/`.modal-content` 全部透底。修复：app.css 三处直接补 `background: var(--bg-elev-2)` 实底
- **跑飞根因**：弹层坐标只在打开瞬间 getBoundingClientRect 计算 + scroll/resize 监听；新建弹窗输入款号失焦后异步查重会向弹窗插入提示区块，弹窗重新居中上移，弹层停旧位
- 修复：SmartSelect 弹层改为 **rAF 逐帧跟随锚点**（`requestAnimationFrame` 循环 tick，位置未变 setPos 返回 prev 避免重渲染，open 关闭 cancelAnimationFrame）；弹层 z-index 从 400 提到 **10000**（高于 `.overlay` 9999 遮罩）

**7. 看板卡片 hover 与 sticky 列头重叠（三轮修复，最终方案）**
- 现象：`.col-title` sticky top:0 z-index:50，卡片 `.card:hover{transform:translateY(-4px)}` 上移压住列头
- 第一轮取消位移（`.card.bento-card:hover{transform:none}`）→ 用户明确要**保留原位移动态**
- 第二轮恢复位移 + 列头 padding-bottom 16→28px → 用户「还是重叠了」
- 根因定位：列头与第一张卡片实际 **0 间距**（`.col-body` 空样式、卡片无上 margin），加大列头自身 padding 只会让吸顶背景往下多盖，卡片上移 4px 仍被压
- **最终方案**：`.col-body` 加 `padding-top: 12px` 创造真实间隙（hover 上移 4px 后仍有 8px 空隙），列头 padding-bottom 还原 16px，保留 hover 位移动画

**8. 筛选区「全部」复位选项 + 清除筛选按钮（KanbanView）**
- 五个筛选下拉（分类/打样版次/设计师/优先级/版次状态）options 首位各加 `{ key: '', label: '全部XX' }` 复位项，选中即清空该项筛选回到全选态
- 新增「清除筛选」按钮（FilterX 图标，位于导出按钮左侧）：一键清空全部六项筛选（含关键词搜索框）

**验证**：以上 8 项均 `npx vite build --outDir dist-verify --emptyOutDir` 构建通过（9~10s），核验后清理 dist-verify；改动文件：ProcessEditor.jsx / process.cjs / DetailView.jsx / SmartSelect.jsx / SizeTable.jsx / CategoryManager.jsx / KanbanView.jsx / app.css

## 四、待办事项（按优先级）

### P0 - 立即修复 ✅ 全部完成
- [x] CSS 42 处属性名损坏 → 5bb23c53
- [x] SizeTable 两处硬编码 localhost:3001 → e6fc6828
- [x] 清理仓库垃圾文件 → 70c063aa
- [x] Electron 安全加固 → c0da7b63
- [x] PDF.js 本地化 + 缩略图修复 → 59e38ae2

- [x] P0-1 回环绑定（仅 [::1]）+ P0-2 CORS 白名单恢复 → 24d2705（8-25 回滚后曾缺失，2026-09-04 重新落地并实测数据链路正常）
- [x] P0-3 Electron sandbox: true → 24d2705（main.js，配合 nodeIntegration:false + contextIsolation:true）

### P1 - 架构改进
- [x] 提取API层和工具函数（src/api/, src/utils/）→ f78a2246
- [x] 拆分 App.jsx 组件到独立文件（9个组件）→ c6c3b4ef
- [x] CSS 独立化（STYLES→src/styles/app.css）→ 34f97758
- [x] SettingsView 视图组件提取 → 4585d6f6
- [x] DetailView 视图组件提取 → 0a89b6ef
- [x] 提取自定义 hooks（useTasks/useSettings）→ 6118cd0a
- [x] KanbanView 视图组件提取（413行最复杂视图）→ 5b029eb3
- [x] 后端分层（db.cjs + routes/ 6个模块）→ 41722599
- [x] 加索引：tasks.style_id, tasks.status, measurement_templates.category → 41722599
- [x] 数据库迁移版本化（_migrations 表，事务化，v1建表/v2补列/v3索引/v4清理死列）→ 53309642
- [x] 清理死列：tasks.standard_size、styles.size_group_id → 53309642
- [x] JSDoc 类型标注（server/db.cjs + 6个路由 + jsconfig.json checkJs）→ a929c97b
- [x] **修复保存bug**：前端PUT→后端PATCH 404 → 改用apiPatch → 25e88dad
- [x] 恢复task1 note测试污染数据 → 25e88dad
- [x] 评估去 Express 改 IPC 架构（ARCHITECTURE_REVIEW.md）→ a18f6c5a

### P2-IPC - 去 Express 改 IPC（2026-08-27 立项，方案C混合架构）
**决策已确认**：业务CRUD走IPC / 大文件保留HTTP / ID引用重构排入P2
- [x] 第1步：服务层抽取（server/services/ 6个模块，纯函数，HTTP与IPC共用）→ c1156d05
- [x] 第2步：preload.js + contextBridge 暴露 window.api（6资源×17方法）→ 4d659121
- [x] 第3步：main.js 注册 17 个 ipcMain.handle（复用 services）→ 4d659121
- [x] 第4步：client.js 双通道（IPC优先/HTTP回退，业务接口不变）→ 4d659121
- [x] 双通道逻辑测试（scripts/test_transport.mjs，场景1/2全通过）→ 73d19f10
- [x] 第5步：Electron GUI 实测通过（用户确认，数据正常无报错）→ 2026-08-27
  - 前置：electron-rebuild 修复 ABI（115→132，Electron 34 需 NODE_MODULE_VERSION 132）
  - 验证：设置页全部模块 + 编辑页尺寸指标表数据均通过 IPC 加载，DevTools 零错误
- [x] 打包验证（build:exe，确认 preload.js 入包）→ 2026-08-28
  - Setup 安装包 381.2MB（dist_electron/PatternMaster Pro Setup 1.0.0.exe）
  - asar 内确认 preload.js / main.js / server 均在包内
  - 注意：打包前需停 dev 环境（better-sqlite3 文件被占用会 EPERM）

### P2-ABI - 摆脱 Electron/Node 双 ABI（2026-08-28 立项，方案D）
**决策已确认**：统一 Electron ABI（132）运行 dev 后端，彻底消除 rebuild 来回切换
- [x] 方案评估（docs/P2-ABI-迭代方案.md：A双目录/B纯JS/C子进程/D统一ABI 对比）
- [x] 方案D 验证：ELECTRON_RUN_AS_NODE=1 electron 加载 better-sqlite3（ABI 132）成功，tasks 7条
- [x] scripts/dev.cjs 改为 Electron Node 启动后端（ABI 132）+ 修复 DEP0190 shell 警告
- [x] package.json dev:server 改为 cross-env ELECTRON_RUN_AS_NODE=1 electron
- [x] dev:all 全链路验证：后端3001 + 前端5173 均正常，API 7条，零报错
- [ ] 长期收益：dev 与 electron:start/打包统一 ABI 132，无需再 rebuild:node

### P2 - 功能开发
- [x] **数据导出功能模块（基础设施）→ 73d606cc**（2026-08-28）
  - src/utils/exporter.js：通用导出引擎（Excel 多sheet / CSV 带BOM / JSON），列宽自适应、sheet名清洗
  - src/utils/exportTasks.js：业务转换层（task→行，含进度节点状态+日期、看板状态中文映射）
  - KanbanView 新增"导出"按钮：导出当前筛选列表为 Excel（30 列业务字段）
  - 依赖：xlsx@0.18.5（SheetJS）
  - 验证：浏览器实测导出 `打样单列表_YYYYMMDD_HHMM.xlsx`，7 条数据、表头对齐、字段无误
  - 后续工艺单/BOM 导出复用 exporter.js 基础设施
- [x] **工艺单（Tech Pack）Excel 导出 → 提交见下**（2026-08-28）
  - src/utils/exportTechPack.js：单张打样单 → 多sheet Excel（基本信息三列键值对 + 尺寸指标表）
  - DetailView 新增"导出工艺单"按钮
  - 修复：进度节点状态兼容 done/completed 两种取值 → 中文"已完成"
  - 修复：尺寸表过滤 `_manual` 标记键（size_values 里的手动标记污染列）
  - 验证：浏览器实测导出 `工艺单_SS26-DR002_PO-..._*.xlsx`，基本信息 29 行 + 尺寸表 7 行对齐无误
  - 后续可扩展 PDF 版工艺单（pdfmake）
- [x] **导出反馈增强 + 问题排查 → 提交见下**（2026-08-28）
  - 现象：用户反馈导出按钮无反馈（内置浏览器拦截 a[download] 下载）
  - 排查：自动化浏览器实测两处导出均正常（看板 26920B / 工艺单 22950B），代码无问题
  - 修复：两个导出按钮加 try/catch + alert 反馈（成功条数/失败原因/空数据提示）
  - 文档：docs/数据导出模块-使用与问题排查.md（功能说明 + 排查记录 + 后续方向）
- [x] **导出交互完善（确认环节+反馈）→ 提交见下**（2026-08-29）
  - 新建 src/components/common/ExportButton.jsx：确认对话框 + 导出中反馈 + 结果 toast
  - 确认环节：点导出弹确认框（内容说明+文件名预览+确认/取消，createPortal）
  - 按钮反馈：执行中「导出中…」+ 旋转图标 + 防重复点击
  - toast：成功绿/失败红，3.2s 自动消失（替代 alert）
  - 配套：app.css 新增 spin/fadeInUp 动画；exportTasks/exportTechPack 抽取文件名函数
  - 实测：看板导出（确认→toast→下载 26920B）+ 工艺单导出（确认→下载 22950B）均通过
- [x] **BOM 物料清单 + 工艺指示 模块 → 提交 44475177**（2026-08-29）
  - 迁移 v5：新增 bom_items/process_items 两张表 + task_id 索引（server/db.cjs）
  - 后端：services/bom.cjs + services/process.cjs（list/create/update/remove/replaceAll）
  - **修复关键bug**：update 原整行 SET（未传字段清空），改 PATCH 语义只更新传入字段
  - 路由：routes/bom.cjs + routes/process.cjs（GET/POST/PATCH/DELETE/PUT 整体替换）
  - 前端 API：src/api/index.js 新增 10 个函数（fetch/create/update/delete/replace ×2），走 HTTP 回退通道（client.js 无需 IPC 映射也能在 Electron 里回退 HTTP）
  - 组件：BomEditor.jsx（类别/单位下拉、单耗×单价小计、底部单件成本合计）+ ProcessEditor.jsx（部位工艺/缝制/后整理/特殊工艺分类）
  - **防抖自动保存**（400ms）：onChange 更新本地 + scheduleCommit，输入停顿即提交，避免快速连续编辑丢字段（原 onBlur 提交在连续操作下有竞态）
  - DetailView 激活「物料清单」「工艺指示」两个 Tab（detailTab: bom/process）
  - 实测（SS26-DR002）：增删改查全通过、刷新持久化、合计 ¥60.13 计算正确、删除含 confirm
  - 演示数据：task 3 各留 1 行（主料 100%聚酯纤维面料 + 领口罗纹工艺）
- [x] **真实款 26AWW526 全量录入实测（2026-08-29，无代码变更，数据在 task 8）**
  - 通过真实 HTTP API 链路录入：styles 主档 + task（版次V2/件数2/M码/doing）+ 工作动态7节点 + 尺寸12部位S/M/L + BOM 10条 + 工艺 13条
  - 浏览器验证：看板卡片完整显示（含工作动态时间线）、详情各Tab、尺寸表、BOM、工艺全部正确呈现
  - **暴露的短板**（真实工作流差距）：
    1. 原始单耗"面A 140*1.12"为紧凑格式，140（门幅？）只能放规格/备注，无独立字段
    2. 单位枚举缺 cm（90cm/110cm 需换算成米录入）
    3. 导出工艺单（exportTechPack）仅"基本信息+尺寸指标"两 sheet，**不含 BOM/工艺**；且进度节点按固定 label（配料/跟版/版师/样衣/工艺）匹配，自定义工作动态节点导出丢失
    4. 分类粒度粗（用户"外套/夹克（棒球服）"→ 系统"外套"）
    5. 版次 V2 为自定义值（系统枚举为胚样/头版样等），API 直写可显示，UI SmartSelect 需确认
  - 下一步：工艺单导出并入 BOM + 工艺 sheet（复用 exporter.js）
- [x] **工作动态改造为开放式「项目更新流」→ 提交 3c4eca21**（2026-08-29）
  - 用户核心痛点：progress_nodes 原按分工角色写死（配料/跟版/版师/样衣/工艺 状态机+联动），实际工作流是按项目推进迭代的「项目更新流」，自由度更高
  - **数据模型**：节点结构升级 `{label, date, by(负责人), note(备注), status}`；status 沿用 pending/active/done（兼容旧数据与 done/completed 双枚举）；初始模板改为项目流事件（收单/胚样/头样/样衣/制单），新单可自由增删改
  - **看板解耦**：App.jsx 移除「版师节点 ↔ task.status」双向硬联动（原 setField/setNodeField 会互推状态），看板三列由 status 独立控制，时间线只忠实记录过程
  - **UI**：DetailView 侧边「生产进度节点」→「工作动态」时间线编辑器（每行：状态下拉+日期+事件名+负责人+删除，顶部一键添加事件，空态提示）；TaskCard/KanbanView 卡片节点兼容 done、支持负责人、超出 5 条折叠为 +N
  - **导出**：exportTechPack 工艺单基本信息 sheet 工作动态完整序列化（每事件一行：分类=工作动态，键=事件名，值=状态+日期｜负责人+备注）；exportTasks 列表导出「配料/跟版/版师/样衣/工艺」5 固定列改为「工作动态」时间线文本列
  - **浏览器实测全通过**：卡片 5 节点+2 折叠、详情页工作动态 7 条可编辑、添加事件→保存→刷新持久化（8 条）、删除→持久化（回 7 条）、工艺单导出含 8 条工作动态行（26357B）、列表导出工作动态列完整序列化
  - 备注：detailTab 的 bom/process Tab、BOM/工艺 PATCH 语义、400ms 防抖自动保存均为既有正确实现，勿回退
- [x] **工艺单导出并入 BOM+工艺 sheet + 格式统一 → 提交 9aefd6b2**（2026-08-30）
  - 之前短板：导出仅"基本信息+尺寸指标"2 sheet，BOM/工艺完全缺失；日期格式混乱（2026-03-10 vs 03/02）；空值空白
  - exportTechPack 新增 buildBomSheet（11列：序号/类别/物料名称/规格/颜色/单位/单耗/供应商/单价/小计/备注，底部单件成本合计）+ buildProcessSheet（6列：序号/工艺分类/工艺名称/工艺要求/质量标准/备注）
  - 导出从 2 sheet 扩为 4 sheet：基本信息 / 尺寸指标 / 物料清单 / 工艺指示
  - formatDate()：兼容 YYYY-MM-DD、YYYY/MM/DD、MM/DD（缺年份用 task.year 补全），统一输出 YYYY-MM-DD
  - val()：空值统一显示"—"，避免空白单元格
  - 工作动态分类名从"生产进度节点"改为"工作动态"
  - DetailView 导出按钮 onExport 改为 async：先 Promise.all fetchBomItems + fetchProcessItems，再传入 exportTechPack
  - ExportButton handleConfirm 改为 async，支持异步 onExport
  - 浏览器实测：26AWW526（BOM 10条/工艺 13条，单件成本 ¥389.25）+ SS26-DR002（旧日期 03/02→2026-03-02）均验证 4 sheet 完整、日期统一、合计正确
- [x] **工艺单导出专业格式重做（exceljs）→ 提交 4470de59**（2026-08-30）
  - 用户反馈：导出的 xlsx 是裸数据，无边框/标题/合并，"不能给人看"
  - 根因：xlsx@0.18.5 社区版不支持写入单元格样式
  - 换库：exceljs@4.4.0（支持边框/填充/合并/列宽/字体/行高），package.json 已加依赖
  - 基本信息 sheet：标题行"一、基本信息"（深蓝底白字合并 A1:C1）+ 表头（浅蓝底粗体）+ 分类列合并（款式基础信息/打样信息/日期/工作动态/说明与反馈）+ 全边框 + 列宽 14/20/60
  - 尺寸指标 sheet：标题"二、尺寸指标（基码M，S/M/L）" + 表头含序号/测量部位/测量方法/公差/基准值/档差/各码(cm)/备注 + 数字居中 + 长文本换行
  - 物料清单 sheet：标题"三、物料清单（BOM）" + 浅绿表头 + 11列 + 合计行（浅黄底，红色粗体单件成本）
  - 工艺指示 sheet：标题"四、工艺指示" + 浅紫表头 + 长文本自动换行（vertical:top）
  - 清理：note 字段里"工作动态：..."冗余文本自动过滤（工作动态已单独成块导出）
  - 浏览器实测：26AWW526 导出 4 sheet 完整，分类合并生效，BOM 合计 389.25，尺寸 12 部位，工艺 13 条，文件 14KB
  - 注意：exportTechPack 现为 async 函数，DetailView onExport 已 await，ExportButton handleConfirm 已 async
- [x] 工艺单（Tech Pack）PDF 导出（pdfmake，Excel 版已完成）→ 提交 6f89b9f
- [ ] Excel 导入（用户明确后续再加入，暂缓）
- [x] 操作日志（2026-09-06 上线：operation_logs 表 v9 + 弹窗视图，侧边栏入口可点）
- [x] 看板逾期提醒（2026-09-06 上线：逾期/今日/3天内/正常/无交期 5 档 + 卡片角标）
- [ ] 品牌/分类/设计师 ID 引用重构（README_DEV V6.0专项，字段直存→外键+级联更新）

## 五、关键技术决策与约束

1. **修改前必须 git 备份**：用户明确要求，每次大面积修改前 commit 当前状态
2. **修改前必须有运行预览**：确保 `npm run dev:all` 启动，浏览器能看到数据
3. **better-sqlite3 ABI**：Node v20 需要 ABI 115，rebuild 时必须用国内镜像
4. **PDF.js 版本锁定 3.11.174**：与原 CDN 版本一致，worker 用 `?url` 导入
5. **categories 数据结构兼容**：可能是 `string[]` 或 `{name, size_group_id}[]`，消费时需 `typeof c === 'string' ? c : c.name`
6. **size_data 是 JSON 数组**：每行 `{name, method, base, grading, tolerance, size_values, actual_values, note}`，size_values/actual_values 可能是 JSON 字符串或对象
7. **Electron 生产环境**：数据库在 `%APPDATA%/PatternMaster Pro/database.sqlite`，首次启动从 extraResources 拷贝示例库
8. **弹窗必须用 createPortal**：backdrop-filter 创建层叠上下文，普通 fixed 弹窗会被遮挡（README_DEV 记录的踩坑）

## 六、代码结构速查

```
src/App.jsx (2685行) 各组件位置：
  1-52    : API常量、PDF.js加载、renderPdfThumb
  54-97   : SmartSelect
  100-107 : autoSign
  109-111 : isImageFile
  112-205 : PdfThumb
  207-273 : MeasurementModal
  275-465 : MeasurementTemplateManager
  467-1043: SizeTable (最复杂，576行)
  1045-2058: App 主组件 (看板/列表/详情/设置)
  2060+   : NewTaskModal, SizeGroupManager, CategoryManager, SettingListEditor
  末尾    : STYLES 常量 (CSS字符串，42处损坏已修复)

server/index.cjs (530行):
  建表+迁移 : 18-115
  styles API: 118-131
  tasks API : 134-326
  PDF上传   : 329-343
  打开PDF   : 347-367
  measurement templates: 370-428
  settings  : 431-454
  size_groups: 457-494
  startServer: 497-524

main.js (113行):
  全局异常捕获、生产环境数据拷贝、启动Express、创建BrowserWindow
```

## 七、重启开发环境步骤

如果上下文丢失/环境重置，按以下步骤恢复：

```powershell
cd D:\dev\golden-shuttle
# 1. 方案D后无需手动 rebuild（当前 ABI 为 132，dev 后端用 Electron Node 运行）
#    仅当 better-sqlite3 意外变为 Node ABI(115) 时才需要：
$env:npm_config_disturl='https://npmmirror.com/mirrors/node'
npm run rebuild:electron
# 2. 启动开发环境（后端用 Electron Node ABI 132，Vite 用系统 Node）
npm run dev:all
# 3. 浏览器打开 http://localhost:5173
```

## 八、审查报告

完整代码审查报告见 `CODE_REVIEW.md`（项目根目录），包含 P0/P1/P2 全部问题清单、四阶段路线图、11个开发方向分析。


### REQ-008 人员预设（2026-09-07 完成，commit 随本段提交）

- **需求**（用户口头）：系统设置页「设计师预设」控件升级为「人员预设」——可增加不同人员（姓名）并为每人配置角色（如纸样师/样衣工/设计师，一人可多角色，角色可自定义）；各处人员选择联动按角色过滤。
- **实现**：
  - 新组件 src/components/settings/PeopleEditor.jsx：人员=姓名+角色集；每行支持 +角色 快捷按钮（+设计师/+版师/+样衣工）与自定义角色输入、删除角色/删除人员；替换设置页「设计师库」卡（SettingsView 顶部三卡=品牌库/人员预设/打样版次库）
  - settings 新增 people=[{name, roles}]；后端 settings.cjs getAll() 读取层兼容迁移：无 people 且有 designers 时自动转 people（角色=设计师），不写回库，下次保存 people 时自然持久化；旧 designers 字段保留兼容
  - 消费点联动（utils/people.js peopleByRole(people, role)）：详情页款式设计师 SmartSelect、看板「全部分派设计师」筛选、批次版师/样衣工 SmartSelect（原自由 input 升级）均按角色过滤，SmartSelect 保留自由输入
- **数据**：迁移后 people=[{白洁,设计师},{李飞,设计师}]；E2E 添加/删除测试人员后已恢复原值
- **验证**：HTTP 迁移确认 + 浏览器 E2E 12/12 PASS（迁移展示/加人/加角色/批次版师下拉联动含新人员且不含他角色人员/删除恢复/零 console 错误）+ 生产构建通过（8.7s）
- **备注**：已登记 docs/待开发文档.md REQ-008（已完成）；REQ-005（尺寸表体系重构）、REQ-006（交互与确认机制）、REQ-007（控件交互样式统一）仍待开发

---

## 九、文档清洗与防漂移机制（2026-09-14，由架构师执行、主理人统一提交）

> 依据用户 2026-09-14 批准的「文档清洗方案（决策 4）」，重新整理全部开发文档，解决"11 份重叠事实源"问题。**本节为追加记录，未改动本文件既有内容。**

- **结构收敛**：`docs/` 拆为三类子目录 —— `audit/`（审计报告）、`roadmap/`（唯一计划源）、`archive/`（**只归档不删除**）。新建 `docs/README.md` 作**唯一文档索引**。
- **文件归位（移动 / 不删除）**：
  - → `docs/audit/`：`UI-UX-审计与优化建议-20260914.html`、`全项目审查与优化方案-20260914.html`
  - → `docs/roadmap/`：`统一实施路径与任务分解-20260914.md`、`待开发文档.md`（需求池）、`开发工作计划.md`（排期计划）
  - → `docs/archive/`：根目录 `README_DEV.md`、`OVERVIEW.md`、`ARCHITECTURE_REVIEW.md`；`P2-IPC-完成报告.md`、`P2-ABI-迭代方案.md`、`数据导出模块-使用与问题排查.md`、`配色审计报告.md`、`配色预览.html`、`MANUAL_COPY_MANIFEST.md`（换机清单，HANDBOOK §12 保留指向）、`_req_screenshot_*.png`（23 张，移入 `archive/req-screenshots/`）
- **保留原位**：`AGENTS.md`、`README.md`、`ITERATION_STATE.md`（本文件）、`docs/BUSINESS_LOGIC.md`（用户指定长期维护）、`docs/PROJECT_HANDBOOK.md`、`docs/TECHNICAL.md`
- **校正漂移**：`PROJECT_HANDBOOK.md` §1 的计数（66 行 / routes 8 / services 9 / App.jsx 288 行）改为"指向源码"或脚本生成；§11 提交历史改指向 `git log`。本文件头部加"追加式日志不承担现状职责"定位。
- **防漂移机制**：新增 `scripts/doc-stats.cjs`（纯源码扫描，**不 require better-sqlite3**），生成 `PROJECT_HANDBOOK.md` 的 `<!-- STATS:BEGIN/END -->` 区块；`npm run doc:stats` 回填、`npm run doc:check` 校验（package.json 脚本接线由主理人补入）。

---

## 十、工程治理两批（止损批 1 / 治本批 2，2026-09-14）

> 追加记录，未改动本文件既有内容。**现状断言（版本号/行数/文件数）一律以 `docs/PROJECT_HANDBOOK.md` 为准**（计数由 `scripts/doc-stats.cjs` 生成）；本节只记当次动作与提交号。

### 工程止损批 1（G1–G8，提交 49a2263）

- G1 **回滚静默清空尺寸表（数据损坏级）**：快照新增 `snapVersion` 字段，`rollback` / `diffSummary` 改按「字段是否存在」判别新旧快照形态（旧实现靠「size_data 键是否存在」猜测 → 旧快照分支成死代码）。
- G2 **封堵「上传文件 → 本机执行」RCE 链路**：`resolvePath` 路径硬化（拒反斜杠与 `..`、只取 basename、断言落在 uploadsDir 内）+ `openLocally` 改走 `shell.openPath` / 回退 `rundll32 url.dll,FileProtocolHandler`（`execFile` + argv，不经 shell）。
- G3 上传扩展名白名单（含 dxf/psd/ai/cdr 等行业格式）+ 50MB 上限；G4 迁移前自动备份（同目录保留最近 3 份）+ 版本倒挂告警；G5 请求日志不再序列化 body；G6+G8 ESLint 覆盖补齐 `server/**`、`scripts/**`、`main.js`、`preload.js`（85 → 0 problems）；G7 全局 ErrorBoundary + 加载失败态。

### 工程治本批 2（G9–G15）

- **G9（提交 fc567ed）**：引入 Vitest。**关键**：ABI 132 下必须走 Electron 运行时 —— `cross-env ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run`；`vitest.config.mjs` 用 pool=forks + isolate + fileParallelism:false；`tests/helpers/dbHarness.js` 只建临时库（**永不触生产库**）。首覆 7 个模块：迁移引擎 / 款级状态聚合 / 文档防漂移 / 图纸版本 / 任务原子性 / 上传安全 / 运行地基（断言 ABI 132）。
- **G10–G15（提交 2e5d29a）**：
  - **G10** 迁移 **v21** 物理删除 `tasks.order_no / audit_status / audit_comment / size_data / priority`（权威数据早已下沉 `sample_runs`，v14/v16 当时只清空未删列）；一并摘净 `tasks.cjs`（create / TASK_KEYS / versions 死读）、`versions.cjs`（buildSnapshot 死读）、`seed.cjs`、`test-rollback-size.cjs`。
  - **G11 priority 单主**：款级优先级唯一口径 = 批次最高档（S>A>B>C，无批次回退 B，REQ-030），由 `attachRuns` 投影为 `task.priority`；看板 `taskTopPriority` / 列表 / 技术包导出口三处同规则。
  - **G12** `tasks.update()` / `remove()` 包**单事务**（styles UPDATE → tasks UPDATE → 操作日志 → 版本快照），杜绝「styles 已改而 tasks 未改」的部分写入；快照 capture 失败在事务内本地消化。
  - **G13** 删掉启动期 `recalcAllTaskStatus()` 调用，款级状态归位折进 v21（纯 SQL，与 `syncTaskStatus` 同口径）；运行时由批次写路径增量维护（已逐一核对 `sample_runs.status` 全部写入方），函数本体保留。
  - **G14 砍 IPC 双通道**：`src/api/client.js` 回归纯 HTTP fetch（删 26 条 IPC 映射，115→43 行）；`preload.js` / `main.js` 的 IPC 注册**按用户决定原样保留**，仅前端不再调用。
  - **G15** 抽 `src/utils/techPackModel.js`（379 行 / 27 导出）作为 Excel/PDF 导出的共享单一来源（`exportTechPack.js` 418→327、`exportTechPackPdf.js` 401→321）。
- **本批修掉的用户可见缺陷**：① 版本详情每次打开都多出假的「优先级：中 → X」行（快照恒写已废止词表值 `'中'`，与 attachRuns 投影值恒不等）；② PDF 尺寸表标题基码与自身备注口径不一致（四处统一走 `deriveBaseSize`）。
- **验证入口（新增，换机后可直接跑）**：`npm test`（= 单测 + 回滚 + 上传安全）、`npm run lint`、`npm run doc:check`、`npm run build`。
- **`main` 未动**：两批全部落在 `feature/sample-run-model`（用户明确「当前版本没完善前不推 main」）。
- **新增踩坑（详见 HANDBOOK §6.5）**：① 同一文件同一回合发多条 `Edit` 只有最后一条落盘；② AI 侧 bash 的 PATH 缺 PortableGit `usr/bin` 会导致 `ls/head/wc` 与 `npm run` 全挂。

### UI 止血轨（U1+U2+U3，批 1 漏做，批 3 前置）

> 背景：路线图 U7「CSS 分层重构」的依赖是 U1/U2，而 U1/U2 原属批 1「UI 止血轨」，该轨当时未执行（批 1 只落了 G1–G8 + D1/D2）。故批 3 先补齐。

- **U1 解除 1280px 硬约束**：`src/App.jsx:258-266` 根容器整块内联样式（含 `minWidth: 1280`、`overflow:'hidden'`）删除，改由 `src/styles/app.css:7 .app` 承担 —— `height:100vh / display:flex / flex-direction:column / background:var(--app-bg) / color:var(--text) / overflow-x:auto / overflow-y:hidden / min-width:0`。**成因**：1366×768@125% 逻辑视口仅 ≈1093px，`overflow:hidden` 下右侧被裁 ≈187px（顶栏「导出工艺单/导出 PDF/历史版本/删除单据」+ 看板最右列）且无滚动条。
- **U3 找回氛围光**：内联 `background:'var(--bg')` 一直压掉 `.app` 的 `var(--app-bg)`（内联 > 类层级），导致 custom 主题香槟金氛围光从未生效；删内联即恢复。另给 `theme.css:39` 的 custom `--app-bg` 末尾补 `, var(--bg)` 兜底底色。
- **U2 文字对比度达标 AA**（仅 custom 主题；dark/light 实测已达标故未动）：
  | 令牌 | 改前 | 改后 |
  | --- | --- | --- |
  | `--text-3` | `#6b6560` = **3.34:1** ✕ | `#8c857c` = **5.26:1** ✓ |
  | `--text-4` | `#4a4540` = **2.02:1** ✕ | `#6b6560` = **3.34:1**（收敛为装饰/分隔线语义）|
  | placeholder 合成 | `--text-4` + `opacity:.5` = **1.34:1**（≈隐形）| `--text-3` + `opacity:.75` = **3.46:1** ✓ |
- **placeholder 去二次衰减（口径统一 4 处）**：`app.css:660`（.data-table，唯一叠加了 `opacity` 的一处）、`app.css:215`（.field）、`app.css:226`（.ss-display，不加 opacity）、`app.css:583`（.dp-placeholder / DatePicker，不加 opacity）、`index.css:1422`（.grid-cell）—— 统一 `color: var(--text-3)`，真 placeholder 加 `opacity:.75`。
- **JSX 内联 `--text-4` 语义收口 7 处 → `--text-3`**（均为正文/标签/元信息/空态）：`App.jsx:385`（侧栏 11px 版本号）、`KanbanView.jsx:416`（分组标签）、`DetailView.jsx:407/458`、`SizeTable.jsx:335/483`、`MeasurementModal.jsx:54`。**保留 `--text-4` 3 处装饰性图标**：`KanbanView.jsx:15/445`、`TaskCard.jsx:8`。
- **未做（有意留白）**：CSS 文件内其余 `--text-4` 用法（app.css ≈14 处 / index.css ≈6 处）不在本轨范围，归 **U7 分层重构**统一收敛；`app.css:68 .template-manager-v4 {min-width:800px}` 保持不动（由 U1 的根容器 `overflow-x:auto` 兜底，留待 U7/U22 流体化）。
- **验证**：`npm run lint` 0 problems；`npm test` **9 files / 95 tests 全绿**（含文档防漂移用例，故需 `node scripts/doc-stats.cjs` 回填 HANDBOOK STATS：源码总行数 10587→10579）；`npm run build` 通过；WCAG 对比度由主理人独立复算（Python）确认。
- **侦察成果落档（只读，未改码）**：
  - `docs/roadmap/批3-UI治本-锚点侦察-20260914.md`（U1–U12 锚点全景 + 依赖顺序 + 明确否定结论）
  - `docs/audit/U7-CSS分层重构-施工设计-20260914.md`（U7 分层方案 / 72 组 179 条冲突清单 / `!important` 三分法 7+16+156 / `.col` 单源方案 / S0–S8 施工顺序 / 风险与验证协议）

### U7 CSS 分层重构收尾（S3 单源 + S7 删死文件，2026-09-14）

- **S3 `.col` 单源**：`src/styles/theme.css` 新增 `--board-col-w: 600px`；`src/styles/views.css` 三处冲突 `.col`（720px / 600px!important / 400px）合并为 token 驱动单源（含 `box-sizing:border-box`），`.board` padding 收敛；`src/components/task/KanbanView.jsx:480` 删除内联 `style`（宽度全交 token）。
- **S7 删死文件**：删除 `src/index.css`（1425 行）、`src/styles/app.css`（685 行）、`src/App.css`（42 行，零引用）；`src/components/task/TaskCard.jsx` 此前已删（Glob 全局确认）。备份 `backups/u7-s7-deadfiles-20260914.zip`（19,336B，可回撤）。
- **验证（亲测）**：`vite build` 通过（1784 modules）；运行时实测 `.col` 计算宽 **600px**、`flex:0 0 600px`、无 `720px/400px/!important`；5173 重启后 S3 确认生效，控制台零错误。
- **文档清洗**：`docs/TECHNICAL.md` 迁移史补 v15–v21；`docs/PROJECT_HANDBOOK.md` §11 提交 SHA 更新 + `scripts/doc-stats.cjs` 刷新 STATS 区块。
- **提交**：于 `feature/sample-run-model` 最新提交（见 `git log`）。

### 批3 U8–U12 收尾（UI 治本，2026-09-14）

按路线图 `docs/roadmap/批3-UI治本-锚点侦察-20260914.md` 推进，全部 build 自测通过；无 Chrome 故以「生产 build + 编译后 dist 验证」为自测结论（符合 AGENTS.md 实测精神）。

- **U8 状态色 token 化**：`theme.css` 三主题（custom/dark/light）新增语义色令牌 `--color-success/-danger/-danger-strong/-danger-soft/-danger-fg/-warn/-warn-soft/-info/-overdue/-overdue-soft/-overdue-fg` 及 run 状态色 `--run-*`；`:root` 额外固定扩展令牌（green-500/danger-rose/orange-400 等）供三主题继承不漂移。15 个 JSX 文件约 93 处硬编码 hex → `var(--token)`（DrawingLibrary 调色板 + 第 335 行 hex 拼 alpha 例外，保留硬编码避免 `var()22` 断裂）。
- **U11 三主题保留香槟金**：修复 dark/light 被误改为中性灰，恢复品牌金（dark `#c8a96e` / light `#8a6d2f`）。与 U8 强耦合、同一窗口改。
- **U8 对比度修复（components.css）**：`.btn-danger`（红底+近黑字→`--color-danger-fg`）、`.bento-badge`（黑底+近黑字→`--color-overdue-fg`）、`.bento-overdue-badge`/`.drawing-del:hover`/`.drawing-svg-preview svg` 共 5 处彩色底配前景违规修正。
- **U9 尺度阶梯 + 令牌化**：`theme.css` 新增圆角 `--radius-*`、高度 `--h-*`、字号 `--fs-*` 令牌；13 个按钮类半径/字号接令牌（类名不变，控回归风险）。
- **U9 类名校名收敛（补做完成）**：新建 `src/styles/buttons.css` 作为按钮系统**单一来源**，收敛为 3 基类 + 修饰符：`btn--primary`（原 .btn-blue/.btn-blue-sm/.btn-add-mini/.btn-add-circle/.run-add-btn）、`btn--ghost`（原 .btn-ghost/.btn-ghost-sm/.btn-upload-pdf/.btn-mode-toggle/.op-btn/.pdf-* /.dp-act/.people-*/.run-material-btn/.run-linked-manage）、`btn--icon`（原 .btn-icon/.btn-icon-xs/.btn-icon-sm/.icon-btn/.icon-btn-danger/.btn-sort/.del-btn/.del-btn-mini/.tag-del/.dp-nav/.drawing-del/.run-del-btn），另有 `btn--danger`（实心危险，原 .btn-danger）与 `btn--ghost-danger`（幽灵危险，原 .btn-del-ghost）。旧类名保留为**分组别名**（同规则 grouped selector），实现零视觉漂移与零断链兜底。
  - `components.css` 摘除 **71 条**已迁移的重复按钮定义（脚本化，按"首个简单选择器"判定；`.cat-item:hover .del-btn`、`.add-row-enhanced .btn-add-mini` 等上下文覆盖规则首词非按钮类，原样保留）。
  - JSX `className` 迁移 **103 处 / 23 文件**（有序替换，避免 `btn-icon` 与 `btn-icon-sm`、`del-btn` 与 `del-btn-mini` 的前缀污染）。
  - 顺带修复：`drawing-del` 旧写法叠加 `icon-btn-danger`，后者源序靠后会覆盖其深色底 → 收敛后只保留 `btn--icon btn--circle btn--danger-dark`，深色圆形删除按钮恢复正常；`btn-icon-sm`（4 处使用但全仓无定义）已归入 `btn--icon.btn--xs` 获得样式。
  - **验证**：`vite build` 通过；产物孤儿检查「JSX 使用 btn-- 类 22 个 / CSS 定义 22 个 / 孤儿 0」；U10 字体回归确认 dist 含 5 个 woff2、`googleapis` 出现 0 次。
- **U12 术语常量表**：新建 `src/constants/terms.js`，收敛 `KanbanView.RUN_STATUS_META` / `SampleRunList.RUN_STATUS` / `DesignerDashboard.STATUS_META` / `NewTaskModal.STATUS_CN` 为单一来源（`RUN_STATUS`/`RUN_STATUS_LIST`/`RUN_STATUS_RANK`/`TASK_STATUS_CN` 等）。
- **U10 字体本地化**：npm 因沙箱 bash shim 缺失无法直装 @fontsource → 改为 node 直连 jsdelivr 下载 Inter(400/500/600) + DM Mono(400/500) 共 5 个 woff2 至 `src/assets/fonts/`；`base.css` 顶部远程 `@import googleapis` 两行替换为 5 条本地 `@font-face`。验证：dist 含 5 个哈希 woff2、`googleapis` 出现 0 次、`@font-face` 5 条且 src 指向本地。

提交链（`feature/sample-run-model`）：
- `d598286` U8+U11 状态色 token 化 + 三主题保留香槟金
- `266b5a9` U12 术语常量表
- `2e167e8` U9 尺度阶梯令牌化
- `3593722` U10 字体本地化（自托管 woff2）

**待办/遗留**：① 无 e2e（缺 Chrome），运行时以 build+dist 验证替代；② `.active-mode {}` 为空规则（看板/列表切换按钮无选中态，属既有遗留，未在本轮改动）；③ 旧类名作为分组别名保留在 `buttons.css`，待有 e2e 后可整体摘除。

**推送**：已推远端 `origin`（代理开启）：`39a4153..f2232aa feature/sample-run-model -> feature/sample-run-model`。

### 批4 U13 Modal 基座（体验提升首批，2026-09-14）

> 依据路线图 `docs/roadmap/统一实施路径与任务分解-20260914.md` 批4（U13–U22），依赖 U5/U7 已完成；「Modal 先于确认分级」。

- **新建 `src/components/common/Modal.jsx`**：Portal 到 body；Esc 关**最上层**弹窗（模块级栈；`.ss-dropdown`/`.dp-cal` 下拉打开时 Esc 让位给面板，不误关弹窗）；焦点陷阱（Tab/Shift+Tab 不逃逸，焦点在陷阱外一律拉回弹窗内）；打开时焦点移入遮罩容器、关闭时还原触发元素；`role="dialog"` + `aria-modal` + `aria-label`；遮罩关闭用 mousedown 且仅 target===遮罩本体（防「框内选文字、框外松手」误关）。
- **结构约定**：role/ref 落在遮罩 div 本体、不加包装层——避免破坏 `.overlay` 的 flex/stretch 布局，children 原样渲染，DOM 与迁移前一致，零视觉漂移；各弹窗经 `overlayClassName`/`overlayStyle`/`zIndex` 复刻原遮罩类（`.modal-overlay` 或 `.overlay overlay-show`）与 z 层。
- **11 处弹窗统一接入**：ConfirmModal / VersionHistoryModal(z2100) / MeasurementModal（保留原「无遮罩关闭」行为，新增 Esc）/ OperationLogsModal / PdfPickerModal / NewTaskModal / DrawingLibrary 上传+版本历史（busy 守卫保留）/ ExportButton 确认框 / MeasurementTemplateManager 编辑框 / SizeGroupManager 编辑框。PdfThumb 放大灯箱与 App 侧栏遮罩为非对话框用途，有意不接入。
- **顺带修掉一个堆叠隐患**：ConfirmModal 原内联渲染、随父级堆叠上下文；统一 Portal 后 z2000 会被 z2100/z9999 父弹窗盖住 → ConfirmModal 增加 `zIndex` 透传：版本回滚确认传 2200、图纸版本删除确认传 10000（叠加于版本历史 z9999 之上）。
- **验证**：ESLint 全量 src 通过（no-undef 门禁）+ 生产 build 通过（10.2s）；静态一致性核查「剩余裸遮罩仅 PdfThumb 灯箱 / 10 文件 import Modal」；无 Chrome，运行时行为（Esc/焦点陷阱/嵌套堆叠）待用户界面点验。
- **提交**：`555b7a4`（ref 已回填落盘）。推送两遇代理 502/Empty reply 未上远端，待代理稳定后 `git push origin feature/sample-run-model`。

---

## 交接锚点（2026-09-14 18:33 收工，换机续做）

- **当前状态**：批1止血 / 批2工程治本(G9-G15) / 批3 UI治本(U7-U12+U9类名收敛) / 批4 U13 Modal基座 已全部完成并推远端；本地 HEAD = 远端 = `e23b5ac`。
- **下一单元**：批4 U17 消灭 prompt()/alert() + 确认分级 + 可撤销 toast（依赖 U13 已满足）→ U14 可点击div→button / U15 空态骨架 / U16 保存指示器 → U18-U22 性能与响应式。
- **新机初始化**：`git pull origin feature/sample-run-model` 后 `npm install`（node_modules 未入库），dev 启动 `node scripts/dev.cjs`。
- **强制流程**：JSX/JS 提交前必须 `eslint src` 过 no-undef（build 抓不到未定义标识符，见 AGENTS.md 规则4）；任何改动亲测通过才能提交。
- **本会话事故复盘**：U12 漏改 KanbanView 第209行 RUN_STATUS_META 致看板崩溃（commit 034a450 修复）——收敛类枚举时必须全仓 grep 引用点，勿凭记忆改两处。

---

## 批4 U17 弹窗治理（消灭原生对话框 + 确认分级 + 可撤销 toast，2026-09-14 晚）

- **交付**（提交 `b0ff680`，已推远端）：全仓 **28 处**原生弹窗清零（25 alert→toast、1 window.confirm→ConfirmModal、1 prompt→InputModal）；新增 `common/Toast.jsx`（事件单例+Host，零 keydown 不碰 U13 Esc 栈）与 `common/InputModal.jsx`（Enter 确认/空名禁钮/聚焦全选）；ConfirmModal 增 `tone('danger'|'default')` 分级（16 处删除/回滚=danger、2 处中性=default），`cancelText` 可自定义，旧 `danger` 属性向后兼容。
- **可撤销范围（重要决策）**：仅版本回滚接了「撤销回滚」（复用现有 rollbackVersion API，撤销=再回滚一次，不新增后端接口）；其余删除类服务端无恢复接口，按约束保持 danger 确认、不做假撤销。
- **验证**：主理人独立复验（grep 原生弹窗=0、三道门实跑 eslint 0 / test 全绿 / build 通过、关键 diff 逐行过目）；无 Chrome，Esc/焦点陷阱/堆叠等运行时行为待用户界面点验。
- **下一单元**：U14 可点击 div→button → U15 空态骨架 → U16 保存指示器 → U18-U22。

### 运行时点验通道建立（Chrome 就位，"无 e2e" 遗留解除，2026-09-14 深夜）
- 用户提供本机便携 Chrome：`D:/Chrome131_AllNew_2024.11.15/App/chrome.exe`（131.0.6778.70，Chrome++ 封装）。
- 方法：Playwright（装于受管 node 工作区 `~/.workbuddy/binaries/node/workspace`，**未进项目依赖**、跳过浏览器下载）手动 spawn + `--remote-debugging-port` + `connectOverCDP`（Chrome++ 壳与 remote-debugging-pipe 不兼容，executablePath 直启会立即退出）；点验脚本 `uiprobe-runtime.cjs`（gitignored，本机保留复用）。
- **U17 运行时点验 11/11 通过**：看板加载(6 卡)/ToastHost 挂载/3 toast 并存/右上定位避开 76px 顶栏(x:1202,y:88)/pre-line 多行/≤8s 自动消失/详情「删除单据」→ danger 红钮+「删除打样单」标题/取消关闭/Esc 关最上层/**零 console 错误**；截图 `.uiprobe/runtime-toasts.png`、`runtime-danger-confirm.png`、`runtime-toasts-dark/light.png`。
- U17 交付时标注的"运行时行为待用户界面点验"至此已由真浏览器自动点验覆盖；后续单元（U14-U16 等）的交互验证可直接复用此通道。

---

## 批4 U14 可点击非交互元素键盘可达化（2026-09-14 深夜）

- **交付**：36 处盘点 → **30 处改造**（A 案转 `<button type="button">`×18，挂 `.u14-btn` 复位类中和 UA 默认样式；B 案保留标签 + `role="button"`+`tabIndex={0}`+键盘激活×11；C 案 tr 仅 tabIndex+键盘×1，保表格语义）+ **6 处合理不改造**（遮罩关闭/stopPropagation，非控件）。
- **新增** `src/hooks/useKeyboardActivate.js`（hook + 循环用模块级工厂双导出；Enter/Space 触发、Space 防滚动、事件目标为子交互元素时放行防双重触发）。base.css 仅增 `.u14-btn` 复位类一条。
- **关键判定**：看板卡片/SmartSelect/DatePicker/视图下拉走 B 案（嵌套交互禁令或 `.ss-display > span` 元素限定选择器）；tr/td 一律不改标签（11 处元素限定选择器）。
- **验证（主理人独立复跑）**：grep 残留=6（与清单一致）；eslint 0 / test 95+20+43 全绿 / build 通过；**U17 回归 11/11 + U14 专项 19/19**（真 Chrome CDP）；焦点环截图 `.uiprobe/u14-focus-card.png` 可见、看板零漂移。
- **遗留（待办池）**：① 侧栏遮罩的键盘关闭路径（Esc 关侧栏）属新行为，待拍板后另做；② 基线说明——改造在基线截图之前已落盘，零漂移以"逐项计算样式断言"替代像素 diff（更精准定位 UA 注入类漂移）。

---

## 批4 U15 统一空态 + 骨架屏 + 筛选无结果态（2026-09-14 深夜）

- **交付**：新增 `src/components/common/EmptyState.jsx`（icon/title/hint/action/compact；基底复用 `.empty-state-v4`/`.empty-icon`，compact 24px/默认 40px）+ `src/components/common/Skeleton.jsx`（list/table/lines 三变体，rows 1~12 截断末行收窄，role=status + aria-busy，shimmer 令牌化 + prefers-reduced-motion 降级）。
- **替换**：13 处空态 → 15 个 EmptyState 实例（DrawingLibrary 真空态/筛选无结果双分支——全项目唯一筛选无结果场景；MeasurementTemplateManager 双锚点含 action「立即添加第一个」；SampleRunList×2/DesignerDashboard/DetailView/MeasurementModal/OperationLogsModal/PdfPickerModal/SizeTable td 内 compact 等）+ 3 处「加载中…」→ Skeleton（BomEditor table×4 / ProcessEditor table×5 / VersionHistoryModal list×4）。
- **明确不动**：exportTechPack/Pdf 的导出文件内"（暂无XX数据）"、DetailView toast 消息、SmartSelect `.ss-empty`。
- **实现细节**：ESLint 核心规则不识别 JSX 使用——icon 参数解构重命名（`icon: Icon`）会误报 unused（varsIgnorePattern 不覆盖 args），改函数体内 `const Icon = icon || Inbox`。
- **验证（主理人独立复跑）**：eslint 0 / test 全绿 / build 通过（工程师三道门）+ 主理人复核 eslint 关键 6 文件 + npm test exit 0；**uiprobe-u15 真实 Chrome CDP 9/9**（空库态/筛选无结果态/Skeleton 延迟路由 8 占位块/零漂移断言/深浅动效开关/Esc 回归/零 console error）；OperationLogsModal 空态因库中已有日志不可达，软性降级验证（弹窗渲染正常）——如需强验证须 mock 或清库，暂接受。
- **Git 提交**：`591fdc5`（已推送 feature/sample-run-model；commit 后 ref 丢失缺陷再现，手动重建分支 ref + 远端跟踪 ref 后以显式 refspec 推送）。
- **下一单元**：U16 保存指示器 → U18-U22 性能与响应式。

---

## 批4 U16 统一 loading/disabled 令牌 + 次级按钮弱化 + 柔性超时（2026-09-14 深夜，提交 `5dc8432` 已推）

- **交付**：①新增 `src/hooks/useSoftRetry.js`（柔性超时：失败→「N 秒后自动重试」递减倒计时，N=baseDelay×失败次数封顶 15s，最多 3 次后转手动兜底，UI 永不硬失败；mount 期重置 mountedRef 修复 StrictMode 双挂载丢更新的通用坑）；②三主题共享令牌 `--control-disabled-opacity:0.55` + `--control-disabled-cursor:not-allowed`（0.4/0.5/0.6 多档收敛单档，read-only 不套用）；③`buttons.css` primary/danger disabled 走令牌 + 新增 `.btn--quiet` 次级弱化修饰符（消费：看板「清除筛选」/SizeTable「清空」/DatePicker「清除」）；④useTasks/OperationLogsModal/PdfPickerModal/App.jsx 错误横幅接柔性超时。排序步进按钮 0.2/default 刻意保留（边界提示语义，非 disabled 态）。
- **⚠️ 主理人复核抓到 P0 并已修复**：工程师首版把裸 `fetchTasks` 交给 useSoftRetry，结果只存其内部 data，**`setTasks` 全仓零调用 → tasks 永远空数组 → 看板/仪表盘/导出全空白**（且其"看板正常渲染"的点验结论与代码事实不符）。修复 = 数据落位收进 `fetchAndSet`（await fetchTasks → setTasks → return），useSoftRetry 只管重试编排不代持业务状态。**终验实锤：真 Chrome CDP 探针 API 任务数 6 = 看板 .bento-card 6、零空态误显、零 JS 错误**（uiprobe-u16fix.cjs，gitignored）。
- **门禁**：lint 0；test 全绿（先跑 `node scripts/doc-stats.cjs` 回填 74 文件/11256 行——useTasks 修复 +8 行曾致 docStats 漂移 2 测试红）；build 17.16s 通过。注意：**PowerShell 通道跑 npm test 会解析到系统 Node（ABI 127）→ better-sqlite3/r ABI 相关 5+ 项假失败**，测试必须走 bash + PortableGit usr/bin PATH 通道（本夜 bash 环境劣化，`export PATH=...PortableGit/.../usr/bin:$PATH` 后恢复）。
- **环境教训**：①PowerShell Remove-Item 静默失败（回 exit 0 但文件未删），导致 15 个门禁输出残留 txt 被 `git add -A` 误入提交——未推送前 `git rm --cached` + `--amend` 清除；②本夜 ref 丢失缺陷再现 4+ 次（commit/amend 后即吞），bash + PATH 补丁通道的 `mkdir -p && printf` 流程为唯一稳定修复法；③PowerShell 全程 stdout 被吞（只回 exit code），读输出靠落盘 + Read。
- **下一单元**：U18-U22 性能与响应式（roadmap 尾批）。

---

## 批4 U18–U22 性能与响应式（2026-09-15，收尾提交 `0757662` 已推远端）

- **交付（U18→U22 五单元 + 5 轮修订）**：
  - **U18 看板卡片两层层级重构**：`KanbanView.jsx` 退化为容器层（分组/筛选/布局/滚动），新增卡片层 `src/components/task/TaskCard.jsx` + 派生根工具 `src/utils/taskView.js`（`PRIO_RANK/taskRuns/taskRunTypes/taskTopPriority/derivedCol/getOverdueInfo/buildRunNodes` 单一来源）。卡片 = **主信息层**（缩略图+设计师徽标 / 款号 / 款名 / 优先级 / 款级状态 / 类别 / 版次数 / 审核 / 5 个进度节点，常驻） ∪ **次级详情层**（款号·品牌·时段·版单·类别·批次明细，`position:absolute` hover/focus 浮层、不占布局）。原目标「同屏卡片 ≈ +35%」达成（卡高约 320 → 238，受 140×198 缩略图下限约束）。
  - **U19**：`TaskCard` 包 `React.memo`；`filteredTasks/activeCols/groupedTasks` 转 `useMemo`；保存后改单条 `GET /api/tasks/:id` 就地合并（去掉全量 `loadTasks()`）的乐观更新。
  - **U20**：新增 `src/utils/thumbQueue.js`（并发≤2 队列 + cancel/卸载出队）；`PdfThumb` 首进视口才渲染并解绑 IntersectionObserver；`renderPdfThumb` 失败静默；失败态补「设计稿缺失」可点占位（放大层可达更换入口）。
  - **U21**：`SmartSelect` 去每帧 rAF，改「打开期 scroll(捕获)/resize/ResizeObserver + rAF 节流」；Esc 关面板改 document 捕获监听（解「焦点不在下拉内」死锁）。
  - **U22**：新增 3 个响应式断点（≤1366 / ≤1200 / ≤1024 → `--board-col-w` 420/380/360）+ 款号省略号全局化。
- **⚠️ 主理人独立复核（自建 CDP 探针，不复用工程师脚本）共打回 5 处实锤**：①U18 重构后批次明细丢失（颜色/件数/尺码）；②U18 逾期徽标压款号；③U21 鼠标点开下拉后 Esc 完全无响应（死锁）；④U22 1024 卡片内部元素级溢出 + 节点文字重叠；⑤U20 失败占位点击无反应（降级路径不可用）。全部修复后复验通过。
- **末项补修 `0757662`（U22 补修·窄宽度逾期卡款号截断）**：根因＝≤1366 右栏仅 136~196px，24px 款号与 104px 逾期徽标在 `.bento-tr` 同排争宽（徽标以 `padding-right:104px` 预留）→ ellipsis 截成「SS…」（实测 1366 `149/106`、1200 `149/66`、1024 `149/46`）。修法＝徽标 DOM 移入 `.bento-tr`（桌面仍 `position:absolute` → 定位祖先仍是 `.bento-card`，脱离文档流 ⇒ 1440 零漂移）；≤1366 把 `.bento-tr` 改列方向 + 徽标 `static` 独占一行、款号整行可用；≤1200/≤1024 再降字号至 20/18px。
- **主理人终验（`_lead_probe8/9.cjs`：4 宽度 × 6 卡 = 24 组合）**：款号 `scrollWidth-clientWidth ≤ 1` 全绿 24/24；徽标∩款号 = 0、徽标∩设计师徽标 = 0、徽标均在卡内；卡高 238/240/242/246（在 238±8 区间内，且未超过基线已有的 246）；无元素级溢出、无节点文字重叠、`pageOverflowX = 0`、`consoleErrors = 0`。1440 与基线逐字段一致（徽标 absolute、内缩 10/10＋1px 卡片边框 = 11/11；款号内容宽 149/149/119/75 不变；卡高全 238）。真实鼠标 hover 复验：次级浮层正常浮出（opacity 0→1）、徽标仍压在浮层之上（z-index 8 > 6）、移出即收回。
- **门禁**：`eslint src` 0 / `doc:check` STATS 一致 / `npm test` 98/98（含 U20 新增 thumbQueue 3 用例）/ `vite build` 11.41s；远端 = 本地 = `0757662`。
- **⚠️ 遗留冲突（已登记 REQ-033）**：U22 把**分组视图**列宽降到 420/380/360px，与 **REQ-032（2026-09-11 已拍板「看板卡片最小宽度不得低于 500px」）冲突**（「全部」视图的 `minmax(500px,1fr)` 未动、仍合规）。窄列是「款号压字号 / 徽标被迫垂直分层 / meta 行拥挤」一串补丁的共同根因 —— 用户 2026-09-15 指示：先记录、跳过，另立「看板卡片布局重构专项」。
- **下一单元**：批5 演进预备（G16 移除 xlsx → G17 前后端拆分留缝 → G18 extraResources 改空白示例库 → G19 分页按需）。

---

## 批5 G16 移除 xlsx 依赖·导出引擎迁 exceljs（2026-09-15，提交 `ef4edf6` + 补修 `4fc8b0d`，均已推远端）

- **交付**：
  - `src/utils/exporter.js` 全面改用 `exceljs`（移除 `import * as XLSX`）：新增 `normalizeCell` 保型——`number→number`、`null/undefined/''→null`（写为**空白单元格**）、其余 `String`；`autoWidthCols` 直接产出 `{width}`（与旧 `!cols[].wch` 同为字符数量纲，口径沿用）；`exportExcel` 改 `async`（`workbook.xlsx.writeBuffer()` → `downloadBlob`）；删除零调用的死导出 `exportCSV`/`exportJSON`。
  - `src/utils/exportTasks.js`：`exportTasksToExcel` 随之 async + await，返回文件名与签名语义不变。调用方无需改动——`KanbanView` 的 `onExport` 本就是 `return exportTasksToExcel(...)`，`ExportButton.handleConfirm` 已 `await onExport()`，无悬挂 Promise。
  - 依赖清理：`package.json` 删 `xlsx`；lock 移除根依赖 + `node_modules/xlsx` + 其独有传递闭包（adler-32/cfb/codepage/ssf/wmf/word/frac），**保留 crc-32**（仍被 crc32-stream 引用）。`node_modules/xlsx` 已不存在。
- **主理人独立等价复核（自写 `_lead_g16check.cjs`，逐单元格「值 + 数据类型」比对）**：两 sheet 名一致；「打样单」7×26 + 「类型探针」3×26 共 **260 格全等**——`sample_count` 仍是 `number`（含 0）、`"=SUM(A1:A2)"` 仍为 `String`（未被误判公式）、空值仍是**空白单元格**（未落 0/NaN/undefined）；列宽最大偏差 9.4%（阈值 20%）。verdict = **PASS**。
- **体积**：`dist/assets/index-*.js` 1,632,959 → 1,347,182 B（**−285,777 B ≈ −279 KB**）；其余分块（pdfTechPackVfs / pdf.worker / pdfmake / pdf）不变 → 确认 xlsx 已不在包内。
- **门禁**：`eslint src` 0 / `doc:check` STATS 一致 / `npm test` 98/98 / `vite build` 9–11s。
- **补修 `4fc8b0d`（downloadBlob 撤销时机）**：`downloadBlob` 原为 `a.click()` 后**同步** `document.body.removeChild(a)` + `URL.revokeObjectURL(url)`；改为 `setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000)`。属清理时机的最佳实践改进（避免过早释放 blob 致下载中断），零副作用、签名不变；`docs/PROJECT_HANDBOOK.md` STATS 源码行数 11549 → 11554 同步回填。
- **⚠️ 重要排查教训（主理人自证伪，勿再踩）**：主理人曾据 CDP 探针观测把「点导出后 toast 提示成功、下载事件却 `canceled`、磁盘无文件」判为**产品缺陷**并归因 `downloadBlob` 过早 revoke —— **该判断错误**。同脚本 A/B 对照（`_lead_dl_verify.cjs`，唯一变量＝是否调用 `Browser.setDownloadBehavior`）实测：
  - **A｜不调用 setDownloadBehavior（默认下载行为）** → `C:\Users\Administrator\Downloads\打样单列表_20260915_1243.xlsx` **真实落盘 8389 B**，toast 正常；
  - **B｜调用 `Browser.setDownloadBehavior{behavior:'allow',downloadPath,eventsEnabled:true}`** → 事件链 `willBegin → inProgress 8389/8389 → canceled`，downloadPath 与系统 Downloads **双双无文件**。
  - 工程师侧更硬证据：把 `URL.revokeObjectURL` 打桩为 no-op / 延迟至 6s 仍 canceled；**纯 Blob（28 B）与 `data:` URL 在 setDownloadBehavior 下同样 canceled**（与项目代码无关）；headful 与 headless 表现一致。
  - **结论：本机 Chrome 142.0.7444.60（FEIMAN 打包版）在 CDP 覆写下载行为时会取消下载，属环境限制、非产物问题；用户真实使用（Electron/常规浏览器，不经 CDP）导出全程正常**（Downloads 中 9/8 两个真实导出件即佐证）。**今后自动化验证下载落盘：禁用 setDownloadBehavior，改用默认下载行为 + 轮询系统下载目录做目录 diff。**
- **下一单元**：G17 前后端拆分「留缝」（3 项，见 `docs/roadmap/统一实施路径与任务分解-20260914.md` §D）。

---

## 批5 G17 前后端拆分"留缝"（2026-09-15，提交 `ffc5adf` 已推远端）

- **交付（3 项低成本留缝，行为逐字等价、不改任何业务接口签名）**：
  - **① config 外置 + 鉴权占位**：新增 `server/config.cjs` 集中 `DEFAULT_PORT(3001)` / `ALLOWED_HOSTS(['localhost','127.0.0.1'])` / `ALLOWED_PORTS(['','5173','3001'])` / `UPLOADS_MOUNT_PATH('/uploads')` / `API_PATH_PREFIX('/api/')` / `UPLOADS_PATH_PREFIX('/uploads/')` / `DIST_DIR_REL('../dist')` / `JSON_BODY_LIMIT('100mb')` / `LOG_BODY_MAX_BYTES(2000)`；`server/index.cjs` 全量改读 config。**新增 no-op 鉴权前置中间件占位**（`app.use((req,res,next)=>next())`，位于 CORS 之后、body 解析之前，注释标明"未来接认证只改这一处"）——不引入真实鉴权、放行行为不变。
  - **② `openLocally` 能力接口化**：新增 `server/capabilities/localOpen.cjs`，接口 `openLocal(absPath) -> {ok, mode}`，mode ∈ `electron-shell`（Electron `shell.openPath`）/ `windows-fallback`（无 Electron 时 `rundll32 url.dll,FileProtocolHandler`，**execFile + argv、不经 shell**）/ `unsupported`（均无 → 供将来服务器端降级为下载）。`services/files.cjs` 的 `openLocally` **原样保留 G2 全部安全断言**（拒 `\`/`..` → basename → `startsWith(uploadsDir+sep)` 断言 → `BLOCKED_OPEN_EXTENSIONS` 33 项）后委托能力模块，响应仍为 `{success:boolean}`；该文件不再直接依赖 `child_process`。
  - **③ `VITE_API_BASE` 外置**：`src/api/client.js` 改为优先读 `import.meta.env.VITE_API_BASE`，未配置时回退原 `5173` 判定，零行为变化。
  - `docs/PROJECT_HANDBOOK.md` STATS 回填（77→79 文件 / 11554→11676 行）。
- **主理人独立复核（自写 `_lead_g17check.cjs` + `_lead_g17ui.cjs`，不复用工程师脚本）——四项全绿**：
  - **CORS 谓词等价**：旧实现（`148e174` 内联）vs 新实现（config 常量）在 **32 个 origin** 上逐一比对，**0 处不一致**（21 放行；覆盖大小写主机、前导零端口 `:05173`、userinfo、`file://`、空/无 Origin、非法 URL、`[::1]`、`evil.com`、`localhost.evil.com`）。
  - **CORS 实机**：`localhost:5173` / `127.0.0.1:5173` / `file://` / `https://127.0.0.1:3001` → 回显 ACAO；`evil.com`、`localhost:5174` → **无 ACAO**；无 Origin → 200。
  - **G2 安全断言零削弱（关键回归面）**：`.exe`（文件真实存在）→ **400「安全策略」**；`..\..\` 与 `../../` → **400「非法文件路径」**；缺失 → 404；合法存在文件 → 200 `{success:true}`。
  - **能力模块不经 shell**：monkeypatch `child_process.execFile` 后调用 → `{ok:true, mode:'windows-fallback'}`，参数为 `rundll32.exe` + **argv 数组**（无字符串拼接、无 cmd 解释面）。
  - **前端侧**：CDP 实机加载看板，**15 个业务请求全部归因 `localhost:3001`**、`.bento-card` = 6、**consoleErrors = 0 / exceptions = 0**。
- **门禁**：`npx eslint src server` 0 / `doc:check` 一致 / `npm test` 98/98 / `vite build` 9.26s。
- **⚠️ 裁决记录（§D② 口径，已回写 roadmap）**：§D② 的"读码确认"（称 openLocally 为 `exec('start "" ...')`）**已过期**——G2 之后实际已是 `shell.openPath` + 无 Electron 时 `rundll32` 回退。§D 字面要求"无 shell 即返回不支持/降级"会**改变开发态单跑后端的行为、违反行为等价红线**。**裁决：采纳工程师的三级能力方案**（既保行为等价，又为服务器端预留 `unsupported` 降级分支）。再次印证：**计划文档的读码结论会随改造过期，落地前必须重核现状。**
- **下一单元**：G18 `extraResources` 改空白示例库（安装包不含开发者数据）→ G19 `GET /api/tasks` 分页/字段裁剪（按需）。

## 批5 G18 安装包脱敏——`extraResources` 改空白示例库（2026-09-15，提交 `e796c86` 已推远端）

- **背景（安全/隐私）**：打包配置此前通过 `build.extraResources` 直接随安装包分发**开发者真实生产库** `server/database.sqlite`（6 款/6 任务/10 批次/94 操作日志等业务数据）+ **真实设计稿** `server/uploads`，导致私有生产数据随安装包外泄。改造后随包仅分发一个「表结构齐全、业务数据 0 行」的空白示例库，用户首次安装得到干净空环境。
- **交付（3 处改动）**：
  - **① `package.json` extraResources 改空白库**：`from` 由 `server/database.sqlite` 改为 `server/seed/database.sqlite`、`to` 仍为 `server/database.sqlite`；**移除原 `server/uploads` 条目**（真实上传目录不再随包分发）。`files` 数组新增排除项：`!server/database.sqlite` / `!server/database.sqlite.bak-*` / `!server/database.backup_*.sqlite` / `!server/uploads` / `!server/uploads/**` / `!server/seed` / `!server/seed/**` / `!server/backup_empty/**`，确保真实库与构建期种子源都不进 asar。新增 `npm run sample:db` 脚本入口。
  - **② 新增 `scripts/make-sample-db.cjs`（幂等 + 自校验）**：复用 `server/db.cjs` 的 `initDatabase(dbPath, uploadsPath)` 从零跑完整 migrations 建库，**绝不复制真实库**；用 `os.tmpdir()` 临时目录作 uploads 参数，不污染仓库与真实数据；生成前先清旧产物（主库 + `-journal/-wal/-shm` 侧车 + `.bak-*` 备份）保证幂等；生成后只读重开自校验，断言 `_migrations` 最大版本与代码一致、全部业务表（`styles/tasks/sample_runs/drawings/bom_items/process_items/operation_logs`）行数严格为 0，失败 `process.exit(1)`。
  - **③ `main.js` 注释更正**：生产环境首次启动的拷贝说明由「示例数据库与上传文件」改为「空白示例库（仅表结构，不含任何业务数据）与上传目录」（`sampleUploads` 缺失时走 `mkdirSync` 自建空目录，行为不变）。
- **主理人独立验证（不依赖工程师脚本，自跑自测）**：
  - **seed 库生成 + 脚本自校验**：`npm run sample:db` 跑通全部 21 个迁移（v1→v21），打印各表行数全部为 0，`_migrations=21` 与代码 `migrations` 数组最大版本一致，输出 `✅ 空白示例库已生成并通过校验（业务数据 0 行）`。
  - **独立双库比对（electron-as-node 直连 better-sqlite3）**：`server/seed/database.sqlite` → 12 表业务数据**全 0 行**；`server/database.sqlite`（真实库，266240 B 未改动）→ `styles=6 / tasks=6 / sample_runs=10 / drawings=1 / bom_items=16 / process_items=15 / operation_logs=94 / size_groups=4 / measurement_templates=97`，**真实生产数据完好、未被触及**。
  - **配置面核对**：`git check-ignore server/seed/database.sqlite` 返回非忽略 → 种子库可随仓库分发（纳入 git）；`build.extraResources` 仅含种子库、不含真实 uploads；proxy 7897 存活、git 身份 `jxyuyi-commits` 就绪。
- **关键风险点（已排除）**：`initDatabase` 签名为 `initDatabase(dbPath, uploadsPath)`（`server/db.cjs:664`，`DB_PATH = dbPath || process.env.DB_PATH || ...`），脚本显式传入种子路径，**不会**误改真实库；`backupBeforeMigration` 仅对非空库备份（`db.cjs:586` `stat.size === 0` 提前返回），空白库无残留备份。
- **下一单元**：G19 `GET /api/tasks` 分页/字段裁剪（标注按需，未启动）。

## 批5 G19 `GET /api/tasks` 分页/字段裁剪（轻量版，2026-09-15，提交 `aa6eba4` 已推远端）

- **定位（路线图 §D，line 86）**：`GET /api/tasks` 分页/字段裁剪，落点 `tasks.cjs:154-158`，验收「上量后响应恒定」，标「按需」。原 `list()` 一次性 `SELECT *` 全部 task + `attachRuns` 挂全部 `sample_runs`，随数据量增长响应体与序列化成本线性上涨。
- **轻量实现（默认零行为变更，看板零影响）**：
  - `server/services/tasks.cjs` 新增 `listPaged({limit, offset, light})`：limit 钳制 [1,200]、offset 非负；`LIMIT ? OFFSET ?` 切片 + 单独 `COUNT(*)` 返回 `{items, total}`；`light=true` 经 `toTaskSummary` 丢弃完整 `runs` 数组，仅留 `top_run + runs_count` 等看板卡片级字段。`list()` 保持原样（返回数组），现有调用方不受影响。
  - `server/routes/tasks.cjs` `/api/tasks` 分流：仅当 `?limit`/`?offset`/`?light` 任一显式传入才走 `listPaged`，否则仍 `list()`（数组）。
  - `src/api/index.js` `fetchTasks(params?)` 可带参构建 query string，无参时保持原 `apiGet('/api/tasks')` 行为。
- **主理人独立验证（不依赖脚本自述）**：
  - 服务层直连真实库：默认 `list()` 仍返回数组 6 条；`listPaged({limit:2})`→items=2/total=6/ids=[8,7]；`{limit:2,offset:2}`→items=2/ids=[1,3]，两页**无重叠**；`limit:9999` 钳制到 ≤200；`light:true` 无 `runs` 键、`runs_count=3`、保留 `top_run`+`derived_status`+`style_no`。
  - 隔离 Express 实例（新代码）HTTP 实测：`GET /api/tasks`→数组 6 条；`?limit=2`→`{items:2,total:6}`；`?limit=2&offset=2`→`{items:2}` 不同 ids；`?light=true`→无 `runs`、`runs_count=3`、有 `top_run`。（注：常驻 dev 后端 PID 4992 在改码前启动、仍为旧路由，故直连 dev 的 `?limit` 返回数组——重启 dev 即生效；隔离实例已证新路由正确。）
  - `eslint server src` exit 0。
- **未做（按需 defer）**：前端看板未切换为分页模式（当前 6 条无痛点）；如需上量，后续让看板/列表调用 `fetchTasks({limit, offset})` 并渲染 total 分页器即可，后端能力已就绪。

---

## 分支里程碑：双视角重构合入 main + 新分支建立 + REQ-035~039 登记（2026-09-15）

- **分支状态**：`feature/sample-run-model` 全部提交已合入 main（main=远端=`2774f52`，收官提交 fc61635）；新工作分支 `feature/next-milestone`（基线 main 2774f52）已建立并切换，**后续提交只走新分支**；`feature/sample-run-model` 保留不再提交。
- **git 教训（本次）**：本地 remote-tracking 引用过期（origin/main 停在旧提交、缺 feature 分支引用）会误导"领先 N 个提交/分支已删除"的判断——涉及远端状态必须先 `git fetch`（本项目需代理 127.0.0.1:7890）实时核对再汇报。
- **文档同步（防漂移）**：AGENTS.md / docs/PROJECT_HANDBOOK.md（§1 Git 行、§11 提交历史）/ docs/BUSINESS_LOGIC.md（§0、§5.5）的分支现状表述更新为"已合入 main + 当前工作分支 feature/next-milestone"。
- **需求登记**：docs/roadmap/待开发文档.md 新增 **REQ-035~REQ-039**（截图归档 docs/archive/req-screenshots/_req_screenshot_037/038/039.png）：
  - REQ-035（P1）安装包首次运行初始化：品牌名称 + 数据库存储位置
  - REQ-036（P2）关闭按钮行为可选：直接退出 / 最小化到任务栏
  - REQ-037（P1）设置页部位预设表数据穿透（截图 037）
  - REQ-038（P1）看板列表视图数据穿透（截图 038，与 037 同根因）
  - REQ-039（P2）看板按钮文字换行（截图 039）
- **缺陷定义（用户 2026-09-15 确认，截图逐像素复核）**：数据穿透=数据行/列滚动时在标题栏或首列边缘显示出来（037=纵向滚动穿透表头——截图红框内首行「胸围」位于表头行上方；038=横向滚动穿透首列——截图红竖线标注首列边缘）；039=看板右上「关注点:任务状态」按钮/面板文字折成「关注点:/任务/状态」三行（截图红框，含「全部分派设计师」筛选框待一并复核）。

---

## 批6 REQ-037/038 修数据穿透（2026-09-15，提交 `2aa8997` 已在本地分支 feature/next-milestone）
- **根因（真实 Chrome CDP 复现/排查）**：
  - **REQ-037（设置页部位预设明细表，确定性复现）**：`.tpl-table-wrapper`（components.css:744）顶部 `padding:12px` 在滚动区顶缘与 sticky 表头之间留下 **12px 缝隙**（th `top:0` 定位在 padding 内缘）；wrapper 背景 `--bg-panel` 为半透明 rgba(255,255,255,0.024)，纵向滚动时滚过表头的数据行内容在缝隙中穿透显示。实测 scrollTop=250、「穿透复现A2」行 12px 高内容相交缝隙（thTop−wrapperTop=12）。
  - **REQ-038（看板列表视图）**：当前代码实测无穿透——列表冻结列均为内联不透明 `var(--bg-elev)`（hover+横向滚动下计算背景 rgb(22,23,25)），用户截图对应旧版列布局；但排查到**同类根因活缺陷**：`.data-table tr:hover td.sticky-col { background: transparent }`（components.css:274，U7 去 !important 时"还原"误写成透明）→ 使用 `.sticky-col` 冻结列的表格（SizeTable 尺寸表）在 hover 时冻结列变透明、横向滚动内容可穿透。合成行真实悬停实测命中该规则（计算背景 transparent）。
- **修复（改动最小、不回退既有验收样式）**：
  - 037：`.tpl-table-wrapper` padding `12px` → `0 12px 12px`（顶部不留缝，sticky 表头贴齐滚动区顶缘）；`.tpl-table-v4 th:first-child/last-child` 补 `border-top-left/right-radius:6px` 对齐容器圆角。
  - 038 同类：`.data-table tr:hover td.sticky-col` 改 `background-color: var(--bg-elev)`（hover 冻结列保持不透明，恢复原 `!important` 恒不透明语义）；看板列表最后一个冻结列（th/td）加 `boxShadow: 4px 0 10px rgba(0,0,0,0.25)` 右侧投影，横向滚动时列边缘形成干净裁剪遮罩（与 `.sticky-col` 既有 `2px 0 5px` 阴影模式一致）。
- **验证（headless Chrome CDP，1180×760）**：
  - 037：修复前 thTop−wrapperTop=12（缝隙穿透）→ 修复后 =1（仅 1px 边框）；缝隙区 4x 截图显示表头本体文字（部位名称/测量方法说明），无任何数据行文字穿透。
  - 038 列表：hover+横向滚动下冻结列背景全部 rgb(22,23,25) 不透明；末冻结列 th/td 投影生效（rgba(0,0,0,0.25)）。
  - 038 同类：注入 `.sticky-col` 行真实悬停 → 计算背景 rgb(22,23,25)（修复前为 transparent）。
  - 门禁：`eslint src` exit 0；复现临时模板（id 13-20，「穿透复现A1~A8」）已通过 HTTP API 全部删除恢复（剩余 0 条临时数据）。
- **登记**：docs/roadmap/待开发文档.md REQ-037/038 状态 → 已完成；REQ-039（看板按钮文字换行，P2）待开发另拍板。

## 批7 REQ-037/038 用户反馈修复（2026-09-15，提交 `90f17c0`）
- **背景**：用户在验收 REQ-037 修复后上传 4 张截图投诉：①表格内部配色"奇怪"，要求改为左侧绿框标注区域（--bg-elev）同色；②系统深色主题下表头"像补丁"；③冻结列边界"明显的黑色阴影"（= 批6 为列表末冻结列加的 `boxShadow: 4px 0 10px rgba(0,0,0,0.25)`，用户第 N 次强调禁止黑色阴影）；④REQ-038 列表视图要求"仔细看图"（旧截图标注首列边缘，穿透检查）。
- **像素证据（用户截图逐点采样 + 饱和色连通域扫描）**：
  - 图1 绿线 x=396px 纵贯 = 页面背景 #141517 与目录容器 #161719（--bg-elev）分界；"左侧绿框内"= --bg-elev 区域。
  - 系统深色 token：页面 Canvas、表头 #232327、表格容器 rgba(255,255,255,0.06) 叠 Canvas ≈ #2C2C30 → 表头夹在亮主体与页面之间 = "补丁"感。
  - 图3 蓝竖线 x≈918px = category 冻结列右缘（900px）+ boxShadow 阴影带（900-914px）→ 黑色阴影实证。
- **修复（components.css + KanbanView.jsx）**：
  - 移除 KanbanView 末冻结列 th/td `boxShadow: 4px 0 10px rgba(0,0,0,0.25)`（含 lastStickyId 计算）。
  - 移除 `.sticky-col` 既有 `box-shadow: 2px 0 5px rgba(0,0,0,0.2)`（用户否决黑色阴影）。
  - 037 表格配色统一：`.tpl-table-wrapper` background `--bg-panel` → `--bg-elev`；`.tpl-table-v4 th` background `--bg-elev-2` → `--bg-elev` + border-bottom 1px var(--bg-hover)（表头/主体区分线）。dark=Canvas=页面色、custom=#161719=目录容器色。
- **验证（headless Chrome CDP，系统深色 + custom 双主题）**：dark 下 wrapper/th/page 均 rgb(18,18,18)（同色，补丁消失）；custom 下 wrapper/th rgb(22,23,25)=目录容器色；038 列表冻结列 bg Canvas/#161719 不透明、boxShadow none；037 thShadow none。
- **门禁**：`npx eslint src --max-warnings 0` exit 0；提交 `90f17c0`（仅 KanbanView.jsx + components.css）。

## 批8 REQ-037 用户反馈修复（2026-09-15，提交 `1cb9870`）
- **背景**：用户在验收批7 后再次投诉"037 没完善解决"+"你留个表头不改"，上传截图 `7ecc9b0a`（custom 主题 1947x904），红框横跨右侧标签栏整行（"上装"徽标 + "部位预设明细" + "新增部位"按钮，y 207-236）。
- **像素证据（千分比换算后逐点采样，修正此前坐标误用）**：
  - 标签栏容器背景 #1E2022（=--bg-elev-2 亮一档）；表格表头/数据行 #161719（=--bg-elev）→ **标签栏比表格亮一档 = 用户所指"表头没改"**。
  - "上装"徽标与"新增部位"按钮为香槟金 #C8A96E（=--accent/--accent-btn，品牌色，用户未要求改）。
  - 根因：`.content-header-v4` 挂 `glass-inner`（base.css `background: var(--bg-panel)` 半透明白 2.5%），叠加 `.template-manager-v4`（components.css 732 行同样 --bg-panel）→ 双层半透明 ≈ #1E2022；表格 `.tpl-table-wrapper`/`.tpl-table-v4 th` 为 --bg-elev 不透明 #161719。
- **中间过程（用户要求还原）**：批8 初版曾把徽标/按钮改深色（active-cat-badge --bg-elev-2、按钮 --bg-hover-2），用户指令"还原上一步"后完全还原（git 工作树回到 90f17c0），徽标/按钮保持品牌金。
- **最终修复（按用户明确指示）**：`.content-header-v4 { ... background: var(--bg-elev); }`——只改标签栏容器背景，与表格同色；徽标/按钮不动。
- **验证（headless Chrome CDP，双主题）**：custom 下 headerBg=wrapperBg=thBg=rgb(22,23,25)；dark 下三者=pageBg=rgb(18,18,18)——标签栏与表格同色，无亮一档补丁。截图 `_r8_037_custom_header.png` / `_r8_037_dark_header.png`。
- **门禁**：`npx eslint src --max-warnings 0` exit 0；提交 `1cb9870`（仅 components.css 1 行）。

## 批9 参考设计语言全局套用（REQ-037/038 根治 + Warm Studio Dark 元素规范，2026-09-16）
- **背景**：批6-8 的零敲碎打未获用户认可（038"两个回合连问题在哪都没搞懂"）。用户提供参考网页代码包（React19+Vite+Tailwind v4 原型，业务对象 100% 对齐），授权**只套用配色/元素设计语言，绝不改已设计好的页面功能/布局/列顺序/交互**。先产出分析报告与实施方案（飞书文档 Vzh1dMfbzo39Cgx3GoncI4jN6hI），用户拍板 D1-D6：D1 表头按参考 bg-elev-2 亮一档；D2=A 去 custom 金色径向渐变纯 --bg；D3=A 字体打包（盘点 U10 已完成，5 woff2 已在 src/assets/fonts/）；D4=C 静态零阴影、可点卡片 hover 才浮起 var(--shadow)（用户关键澄清："我们现在的是一直都有阴影，这才是我一直否决的原因"）；D5=A 设置页新增部位改虚线幽灵钮；D6=B 一次性全局套用后统一验收。
- **配色结论**：参考定稿 "Warm Studio Dark"（#0e0f11/#161719/#1e2023 + 哑光金 #c8a96e）与本项目 custom token 逐一相同，配色不换；真正套用的是元素设计语言：①三级实色分层（页面 --bg／卡片面板侧栏表格容器 --bg-elev／卡内列表项表头缩略图底轨道 --bg-elev-2／hover --bg-hover），--bg-panel 半透明禁止用于实体容器（037 补丁根因=双层半透明叠加）；②哑光金极克制（每页唯一主 CTA 实心金，选中/导航/chip=accent-soft 弱底+accent 文字，次要新增=虚线幽灵，危险=红 10% 底+红 30% 边+#f43f5e 字）；③卡片 bg-elev+1px border+圆角10、静态零阴影、hover 才 border-strong+var(--shadow)（0 8px 32px rgba(0,0,0,.3)），无上移/金边；④表头 bg-elev-2+text-3+11-13px/600，行透明+弱底线+hover bg-hover，冻结列必须同级实色；⑤徽标胶囊 999、状态色文字+同色 15% 弱底、无阴影；⑥Tab 幽灵（激活 text+2px accent 下边框）；去径向渐变、毛玻璃改实色。
- **改动（5 CSS + 3 JSX，+125/-100 行）**：
  - theme.css：custom --glass-bg/--glass-bg-strong/--card-bg 半透明 rgba→实色 #161719/#1e2023；--shadow 改 0 8px 32px rgba(0,0,0,.30)；--app-bg 删两条金色 radial-gradient 纯 var(--bg)（D2）；dark glass #1f1f23/#232327、light #fff/#f7f8fa。
  - base.css：.glass 实色+border+圆角12（原圆角20+常驻阴影+backdrop-filter）；.glass-inner 改 bg-elev-2 实色+圆角10（原 bg-panel 半透明）；.glass-card 圆角10去阴影；新增 .overlay .glass/.modal.glass/.confirm-modal.glass 浮层阴影补回（零 JSX 覆盖所有裸 glass 弹窗：操作日志/PDF 选择/图纸上传与版本历史/抽屉）。
  - **隐藏根因修复**：base.css:47 旧别名块 `:root { --glass-bg: rgba(22,23,25,.75) }` 源序晚于 theme.css，把三主题 token 全覆盖（dark/light 靠 `[data-theme] .glass` 高特异性规则幸免，custom 所有 .glass 实际一直 75% 半透明，浮层上内容穿透）；改为 `var(--bg-elev)` 后三主题全部实色。
  - components.css：.template-manager-v4/.table-wrapper/.template-sidebar/.modal-sidebar 的 bg-panel→bg-elev（037/038 容器补丁根因）；.data-table/.tpl-table-v4/.tpl-table/.dash-table 表头统一 bg-elev-2+text-3+600（D1）；.card/.task-card/.drawing-card/.setting-card-compact 静态零阴影、hover 统一 border-strong+var(--shadow)，去 translateY/金边（accent/蓝/紫）；.bento-box/.bento-primary/.bento-nodes 改 bg-elev-2+border-weak；.bento-overdue-badge 红 15% 弱底+#f43f5e+pill 删 glow；.active-cat-badge 金实心→accent-soft 弱底；bg-panel 全量分流实色（template-card/run-card/dash-stat-card→elev，category-item-row/version 行/uplist/people-row/theme-option/pdf-empty/mini-table→elev-2 或 border-weak）；hover 金底收敛中性 bg-hover/border-strong；.dash-bar-track→elev-2；硬编码深色 rgba(10,10,11,*) token 化；卡片/面板圆角统一 10（form-panel 24→12）；.drawing-cat-sel 失效 color-mix 改中性弱底；新增 038 专块 .list-view-scroll（bg-elev 卡+border+圆角10+margin-top16）/.list-view-table th（elev-2）/td（text-2）/.sticky-cell（静态 bg-elev 与卡同色、th elev-2、hover 全行 elev-2 不透明防滚动穿透）；.dp-cal 浮层 bg-elev-2 与下拉同档。
  - buttons.css：.btn--primary 800→600、10/22→8/16、圆角10→6、14→13px；.btn--sm 700→600、hover 去 scale(1.05) 改 opacity；.btn--ghost 改 input-bg+border+text-2+500+8/16+圆角6+13px（原 bg-hover/圆角12/14）；.btn--danger 实心深红→rgba(244,63,94,.10) 底+.30 边+#f43f5e 字+圆角6，hover .18；新增 .btn--dashed-add（透明+中性虚线+text-3，hover 出金）。
  - views.css：.top-bar/.tab-bar 显式 bg-elev+border:none+仅 border-bottom+无阴影（通栏条不吃卡片四向边框）；.logo 去 linear-gradient 文字渐变改纯色（22px/900 形态保留）；列计数 .badge pill。
  - JSX（仅视觉属性，布局/交互/数据流不动）：MeasurementTemplateManager「新增部位」btn--primary→btn--dashed-add（D5）；TaskCard today/soon 高饱和实底徽标→琥珀 15% 弱底+同色字；KanbanView 看板/列表视图切换激活态 accent 实心→accent-soft 弱底；列表段外层 div 挂 list-view-scroll、table 挂 list-view-table，th/序号 th/td/序号 td 的内联 background/color/borderBottom/borderRight 全部抽类（.sticky-cell），布局内联（position/left/zIndex/宽度/padding）全保留，tr 内联行底线删除交类规则，「详情」btn--primary→btn--ghost。
- **明确保留（边界）**：JSX 结构/布局/列顺序/交互/数据流；表格密度（padding/行高/字号，表头只改背景字重）；.bento-style-no 24px/950 金色大款号；弹窗圆角（modal-content 20/confirm 16）与浮层阴影（ss-dropdown/dp-cal/modal-content/toast/lightbox/svg-preview/遮罩）；图纸模块紫色 #a78bfa；.drawing-dropzone 虚线弱底；.run-add-btn 金弱底虚块、.btn-add-mini 金实心迷你加号（D5 仅点名设置页新增部位）；下拉/日历选项 hover 的 accent-soft；KPI 数字字号字体；text-3/text-4 色值。
- **验证（headless Chrome CDP，custom/系统深色/系统浅色三主题，冷加载）**：
  - 037：.template-manager-v4/.sidebar-v4/.content-header-v4/.tpl-table-wrapper 四者背景严格同色（custom rgb(22,23,25)、dark rgb(18,18,18)、light rgb(255,255,255)），th 统一 bg-elev-2（30,32,35 / 35,35,39 / 238,240,243）+text-3+600；新增部位钮 transparent+dashed+text-3。
  - 038：list-view-scroll 卡 bg-elev+圆角10+border；冻结 th/序号 th=elev-2，冻结 td 静态与卡严格同色、右缘仅 border-weak、非冻结 td 透明；横滚 300px 与 951px 窄视口横滚 200px 后冻结列仍同色无穿透无色差边缘（用户原标注的"黑色阴影带"消除）；hover 整行贯通（非冻结 bg-hover、冻结 elev-2 不透明，合成色差极小）；详情钮幽灵化。
  - 卡片：三主题静态 box-shadow=none（custom 首轮 HMR 残留假象经冷加载与 CSS.getMatchedStyles 排查否定）；hover=var(--shadow)（custom/dark rgba(0,0,0,.3/.35)、light rgba(15,23,42,.12)）+border-strong，无上移；逾期/今日/天后徽标弱底胶囊无 glow。
  - 影响面：仪表盘 KPI 卡零阴影、dash-table 表头 elev-2、状态胶囊弱底；详情 5 Tab 幽灵激活、表单卡实色；操作日志等浮层实色+浮起阴影；顶栏/Tab 通栏无圆角无阴影、logo 纯色。
  - 门禁：`npx eslint src --max-warnings 0` exit 0（pdfTechPackVfs.js BABEL deoptimised 为已知无碍提示）。截图存会话工作区 shots/_b9*。


## 批10 抄参考收口：设置页"干净"对齐（2026-09-16，用户两轮反馈后）
- **背景**：批9 后用户上传实测截图（custom 1989x1306）质问"难道我们看的不是一个界面"，随后上传参考页面截图（ui_ref 原型设置页）说"你再看看参考代码的页面多干净？？？？抄都不会吗？？？？？？"。**先做了像素级实测自证**：headless Chrome 加载当前源码 5173、导航到同一设置页同尺寸（1989x1306）截图，与用户截图逐像素比对，差异 <0.1%（仅右缘滚动条与渲染噪声），表头 #1E2023/容器 #161719/页面 #0E0F11 采样一致——**我们和用户看的是同一个界面**，问题不在"版本不一致"，而在批9 抄参考抄错了点。
- **参考实证（ui_ref/src/components/SettingsView.tsx + index.css 重读）**：参考设置页干净的真正配方 = ①每个模块是**独立卡片**（bg-elev + 1px var(--border) + 圆角10 + padding 18/20，页面 --bg 露出的 gap 14）；②卡片内列表项是 **bg-elev-2 圆角6 胶囊行**（padding 8/10，gap 6），不是透明行+底线；③**根本没有表头行**（尺寸部位=分类树+部位胶囊行，行内"部位名 + ±1cm 小字"）；④添加按钮 1px dashed+border+text-3+圆角6（我们 D5 已对齐）；⑤选中分类=accent-soft 底+accent 字（我们 cat-item.active 已对齐）；⑥角色标签 11px 状态色+同色 22% 底+999 胶囊（我们徽标已对齐）。**批9 抄错的点**：把表头做成 bg-elev-2 横贯亮条（参考根本没表头）→ 深色主题下就是用户从批7 起一直在否决的"补丁"；数据行做成透明+底线（参考是胶囊行）；设置小卡 bg-elev-2 亮一档（参考卡片是 bg-elev）。
- **改动（components.css 4 处 + JSX 1 行，纯视觉）**：
  - `.tpl-table-v4 th`：background bg-elev-2 → **bg-elev（与容器同色不透明）**，border-bottom 改 1px var(--border-weak)，删 th 首尾圆角；分隔靠文字层级（text-3/600/uppercase）+弱线，**补丁亮条消除**；sticky 不透明背景继续保证 037 滚动穿透裁剪。
  - `.tpl-table-v4 td`：透明+强底线 → **bg-elev-2 胶囊行**（td 首列左圆角/末列右圆角 6px，行间 4px solid var(--bg-elev) 容器同色间隙）；`td[colspan]`（空态）排除透明；`tr:hover td` 整体 bg-hover-2（原 tr 透明 hover 被 td 实色遮挡失效，改 td 层）。
  - `.tpl-tag-blue`（公差/放码标签）：金色弱底标签 → **透明 + text-3 12px 纯文字小字**（对齐参考"±1cm"小字）；JSX 删放码规则 span 的内联金底 style。
  - `.setting-card-compact`：加 background var(--bg-elev)（覆盖 glass-inner 的 bg-elev-2，设置三小卡与参考卡片同色）。
- **验证（CDP 1989x1306 三主题冷加载 + 真实指针）**：th 背景三主题 = 容器色（custom rgb(22,23,25)/dark rgb(18,18,18)/light rgb(255,255,255)）——补丁消除；td 背景 bg-elev-2（30,32,35/35,35,39/238,240,243）+ 首尾圆角 6px + 行间 4px 间隙；行 hover 真实指针（Input.dispatchMouseEvent）td 变 bg-hover-2（.07/.1/.08 半透明层）整行高亮；滚动到底（scrollTop=233）数据行在 sticky 表头处被不透明表头裁剪（037 穿透保持）；设置小卡 bg-elev。ESLint exit 0。截图 shots/_u10_*（custom/dark/light 设置页、hover、滚动穿透）。
- **边界**：仍保留 5 列表格功能（部位名称/测量方法说明/公差范围/放码规则/操作）与编辑/删除操作——只抄视觉（胶囊行/同色表头/纯文字），不砍功能/列顺序/交互；表格 padding/行高/字号未动（用户批9 密度边界）。