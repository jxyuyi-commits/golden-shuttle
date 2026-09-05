# PatternMaster Pro 迭代状态追踪

> 本文件是迭代过程的"外部记忆"，上下文压缩后必须先读本文件再继续。
> 最后更新：2026-09-05（图纸资料页迭代合入：版本管控 v8 + EMF/DXF 缩略图 + 统一交互 + 类型标签 + 工作动态修复 + 缓存路径修复）

---

## 一、项目基本信息

- **项目名**：PatternMaster Pro（golden-shuttle）
- **定位**：服装打样单全流程管理桌面应用
- **技术栈**：Electron 34 + React 19 + Vite 7 + Express 5 + better-sqlite3 + SQLite
- **项目路径**：`D:\dev\golden-shuttle`
- **当前分支**：`main`（2026-09-01 仓库重新初始化后）
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
