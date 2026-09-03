# PatternMaster Pro 迭代状态追踪

> 本文件是迭代过程的"外部记忆"，上下文压缩后必须先读本文件再继续。
> 最后更新：2026-09-04（本次为会话恢复 + dev 环境启动，代码无改动）

---

## 一、项目基本信息

- **项目名**：PatternMaster Pro（golden-shuttle）
- **定位**：服装打样单全流程管理桌面应用
- **技术栈**：Electron 34 + React 19 + Vite 7 + Express 5 + better-sqlite3 + SQLite
- **项目路径**：`D:\dev\golden-shuttle`
- **当前分支**：`fix-dev-db-connection`
- **备份分支**：`backup/pre-review-20260827`（审查前全量备份）

## 二、环境信息

- **Node 版本**：真机系统 Node v24.13.0（ABI 137）；AI 工具通道里的 node 是托管版 v22.22.2（ABI 127）
- **better-sqlite3**：当前编为 ABI 132（Electron），dev 后端由 Electron Node 运行，无需再 rebuild:node
- **开发端口**：后端 3001（0.0.0.0），前端 Vite 5173
- **数据库路径**：`server/database.sqlite`（8 tasks / 6 styles，迁移已到 v5）
  - task 8 = 26AWW526 褶皱金属丝棒球服：工作动态 8 条 / 尺寸 12 部位 / BOM 10 条 / 工艺 13 条
- **启动命令**：`npm run dev:all`（= `node scripts/dev.cjs`，同时启动后端+前端）
- **启动校验**：后端日志出现 `[DB] All migrations up to date (latest: v5)` 即为正常
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

## 四、待办事项（按优先级）

### P0 - 立即修复 ✅ 全部完成
- [x] CSS 42 处属性名损坏 → 5bb23c53
- [x] SizeTable 两处硬编码 localhost:3001 → e6fc6828
- [x] 清理仓库垃圾文件 → 70c063aa
- [x] Electron 安全加固 → c0da7b63
- [x] PDF.js 本地化 + 缩略图修复 → 59e38ae2

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
- [ ] 工艺单（Tech Pack）PDF 导出（pdfmake，Excel 版已完成）
- [ ] Excel 导入/导出
- [ ] 操作日志（侧边栏已占位"开发中"）
- [ ] 逾期提醒
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
