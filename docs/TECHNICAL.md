# 技术架构文档

> 本文档记录 PatternMaster Pro 的技术实现细节。业务逻辑与决策记录见 [BUSINESS_LOGIC.md](./BUSINESS_LOGIC.md)。

## 1. 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron（main.js + preload.js） |
| 前端 | React 18 + Vite |
| 后端 | Express（server/index.cjs） |
| 数据库 | better-sqlite3（server/database.sqlite） |
| 样式 | 原生 CSS（src/styles/app.css + src/index.css） |
| 图标 | lucide-react |
| 导出 | exceljs（xlsx）、pdf-lib（工艺单 PDF） |
| 自测 | puppeteer-core + 系统 Chrome（headless） |

## 2. 项目结构

```
golden-shuttle/
├── main.js                  # Electron 主进程
├── preload.js               # Electron preload（IPC 桥）
├── vite.config.js
├── index.html
├── src/
│   ├── App.jsx              # 根组件，状态管理（useTasks hook）
│   ├── api/                 # API 封装（index.js + client.js 双通道）
│   ├── hooks/               # useTasks 等
│   ├── components/
│   │   ├── task/            # KanbanView / DetailView / NewTaskModal / SampleRunList
│   │   ├── drawing/         # DrawingLibrary（图纸资料管理）
│   │   ├── bom/             # BomEditor
│   │   ├── process/         # ProcessEditor
│   │   ├── size-table/      # SizeTable
│   │   └── common/          # PdfThumb / PdfPickerModal / SmartSelect / ExportButton ...
│   ├── utils/               # exportTasks / exporter / exportTechPack / exportTechPackPdf ...
│   └── styles/              # app.css + index.css
├── server/
│   ├── index.cjs            # Express 入口 + CORS 白名单 + [REQ] 请求日志中间件
│   ├── db.cjs               # 建表 + 版本化迁移（v1-v10）
│   ├── routes/              # tasks / sampleRuns / drawings / bom / process / styles / files / thumbs ...
│   ├── services/            # tasks / sampleRuns / drawings / styles / bom / process / settings ...
│   └── uploads/             # 上传文件存储（pdf/png/dxf/emf/prj 等专业格式）
├── scripts/
│   └── dev.cjs              # 并发启动后端(3001)+前端(5173)
└── docs/                    # 本文档 + BUSINESS_LOGIC.md
```

## 3. 核心表结构

### styles（款式，style_no 唯一）
```
id, style_no(UNIQUE), title, brand, designer, year, season, month, category, pdf_url, created_at, updated_at
```
- 一款一行；pdf_url 款级共享（同款式所有 task 共享设计稿引用）

### tasks（款单，新模型一款一单）
```
id, style_id(FK→styles), order_no, priority, sample_type, sample_color, size,
sample_count, fabric_date, start_date, expected_date, finish_date,
audit_status, audit_comment, status(todo/doing/done), progress_nodes(JSON),
image_url, fabric_req, trim_req, process_req, note, size_data(JSON),
created_at, updated_at
```
- **新模型（v10 起）一款一 task（款单）**，版次维度下沉到 sample_runs；sample_type/size 等批次字段仅为兼容保留，权威数据在 sample_runs
- status 为**款单看板状态**：todo(待处理) / doing(打版中) / done(已完结)；后续款级状态将自动从最先进批次聚合
- progress_nodes：款级状态机时间线（用户可自由增删改，与看板 status 解耦）
- `GET /api/tasks`、`/api/tasks/:id` 返回体附带 `runs` 数组（一次查询按 task_id 分组，无 N+1）

### sample_runs（版次批次 = 板师工作单元，v10 新增）
```
id, task_id(FK→tasks, ON DELETE CASCADE), sample_type(版次), size, sample_color,
sample_count, priority, status, blocker, assignee,
fabric_date, start_date, expected_date, finish_date, note, sort_order, created_at, updated_at
```
- 一款单 1──N 批次：胚样/头版样/复版/生产样可并行
- status 枚举：waiting_material(待配料)/pattern_making(打版中)/sample_making(样衣中)/pending_confirm(待确认)/done(已完成)
- blocker 枚举：none/short_material(欠面辅料)/wait_designer(待设计师确认)/wait_tech(待工艺单)/other(其他)，独立字段不走备注
- 建单（tasks.create）事务内自动建首个批次；批次增删改写 operation_logs

### drawings（图纸资料，按 task_id 隔离，款单内共享）
```
id, task_id(FK), category(设计稿/参考图/成衣图/纸样/唛架图), kind, title,
filename, url, file_hash, note, version, group_id, sort_order, created_at
```
- group_id：同组（同 kind+filename）的最小 id，用于版本聚合
- version：同组内版本号（工作成果类可追溯）
- file_hash：参考资料类防冗余（同 hash 不重复入库）

### bom_items / process_items
- 均按 task_id 隔离，ON DELETE CASCADE

## 4. API 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/tasks | 全部款单（含 styles join + runs 批次数组） |
| GET | /api/tasks/:id | 单款单详情（含 runs） |
| POST | /api/tasks | 新建款单（自动 upsert styles + 建首个批次） |
| PATCH | /api/tasks/:id | 更新款单（STYLE_KEYS 白名单合并） |
| DELETE | /api/tasks/:id | 删除款单（级联删子数据；款式下无单时清理孤儿 style） |
| GET | /api/tasks/:taskId/runs | 某款单的全部批次 |
| POST | /api/tasks/:taskId/runs | 新增批次（自动排末尾） |
| PATCH | /api/runs/:id | 更新批次（状态/阻塞变化写日志） |
| DELETE | /api/runs/:id | 删除批次（剩余重排） |
| GET | /api/drawings?task_id=N | 某单图纸列表 |
| POST | /api/drawings | 新增图纸（防冗余/版本归组） |
| DELETE | /api/drawings/:id | 删除图纸记录 |
| POST | /api/upload-pdf | 上传设计稿文件 |
| GET | /api/drawing-thumb?url= | EMF/DXF 缩略图生成 |
| GET | /api/styles/:style_no | 按款号查款式 |

PATCH /api/tasks/:id 的 STYLE_KEYS 白名单：style_no, title, brand, designer, year, season, month, category, pdf_url——只传 pdf_url 安全（合并式，不覆盖其他字段）。

## 5. 数据库迁移历史（server/db.cjs，版本化幂等执行）

| 版本 | 说明 |
|---|---|
| v1 | 初始建表（styles/tasks 等） |
| v2 | 补充列（历史遗留迁移） |
| v3 | 添加查询索引 |
| v4 | 清理死列：tasks.standard_size, styles.size_group_id |
| v5 | 新增 BOM 物料清单 + 工艺指示两张表 |
| v6 | 新增图纸资料 drawings 表（技术图纸/纸样/放码图等） |
| v7 | 图纸分类细化：技术图纸→参考图、放码图→唛架图 |
| v8 | 图纸版本管控：kind/file_hash/version/group_id + 历史数据归组 |
| v9 | 操作日志 operation_logs 表 |
| v10 | **版次批次 sample_runs 表 + 存量同款重复单合并（8单→6单）** |

迁移通过 `_migrations` 表记录已执行版本，每个版本只执行一次；v10 执行前数据库自动备份为 `server/database.backup_before_v10.sqlite`。

## 6. 前端架构要点

### 双通道 API（src/api/client.js）
- window.api 存在（Electron preload IPC）→ 走 IPC
- 否则 → HTTP fetch（开发环境/浏览器预览走此通道）
- 当前用户环境为 HTTP 通道

### 设计稿持久化（App.jsx）
```
persistPdfUrl(url) {
  setField('pdf_url', url);              // 内存更新（预览即时切换）
  updateTask(id, { pdf_url: url })       // PATCH 落库
    .then(loadTasks)                     // 刷新列表
    .catch(...);
}
```
三入口：handlePdfUpload（上传新文件→同步进图纸库→persist）、handlePdfSelect（从资料库选）、handlePdfRemove（仅清引用不删库文件）。

### PdfThumb 组件
- 单击（300ms 判定）→ 放大预览（createPortal overlay）
- 双击 → openFileLocally（系统默认软件打开）
- `interactive={false}`：禁用点击拦截（用于选择弹窗，让点击冒泡到卡片）
- `enlargeActionItems`：放大弹窗内操作按钮（更换设计稿/从资料库选）

### PdfPickerModal
- 从图纸资料库选设计稿：按 group_id 聚合取最新版 → 网格卡片
- 点卡片=选中高亮 → 底部「确认更换」→ onSelect(url) → 关闭

## 7. 环境与自测通道

### 启动
```bash
node scripts/dev.cjs > _dev_out.log 2>&1   # 后端 3001 + 前端 5173
```

### 数据验证（禁止直连 DB）
shell 内 node 与 better-sqlite3 ABI 不匹配（127 vs 132），require 报 ERR_DLOPEN_FAILED。
一律走 HTTP fetch 验证：
```bash
curl http://localhost:3001/api/tasks
curl "http://localhost:3001/api/drawings?task_id=2"
```

### 浏览器端到端自测（Puppeteer）
```js
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: 'C:\\Users\\Yi Yu\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  userDataDir: '_chrome_tN',
  args: ['--no-first-run', '--disable-gpu'],
});
```
- puppeteer-core 已在 node_modules（--no-save，未入 package.json）
- 复现用户操作后必须验证：请求日志（PATCH/POST 发出）、reload 后状态保持、截图确认 UI

### 已知环境坑
- `computer_use_tool` 的 bu/cu plane 均不可用（browser_use_space_disabled / PIP 初始化失败），GUI 自测走 Puppeteer
- Edit 工具对 CRLF 文件报 Native execution failed：先 PowerShell 转 LF 再 Edit
- Vite dev server 已配 Cache-Control: no-store（src 热更新）
- git add 必须指定文件，禁止 `git add -A`（会误捡 _chrome_t* / _*.cjs / _test_upload.pdf 等测试残留）

## 8. 构建与打包

```bash
npm run build        # Vite 构建前端到 dist/
npm run dist         # electron-builder 打包（需配置）
```

## 9. 已知技术债

- [ ] shell node 与 better-sqlite3 ABI 不匹配（127 vs 132），需 rebuild 或统一 node 版本；当前一律走 HTTP 验证数据
- [ ] tasks 表上的 sample_type/size/sample_color/sample_count/fabric_date 等批次字段为兼容保留，权威数据已在 sample_runs；后续可清理
- [ ] 款级 status（todo/doing/done）当前仍手动维护，阶段 5 将改为从最先进批次自动聚合
- [ ] ITERATION_STATE.md 未随最近 commit 补记
- [ ] puppeteer-core 以 --no-save 安装在 node_modules，未入 package.json（新环境需重装）
- [ ] Excel 导入功能待定（用户明确后续再加入）
- [ ] 本地 22+ 笔 commit 未推送（需用户开代理）
