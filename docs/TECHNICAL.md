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
│   │   ├── task/            # KanbanView / DetailView / TaskCard / NewTaskModal
│   │   └── common/          # PdfThumb / PdfPickerModal / SmartSelect ...
│   ├── utils/               # exportTasks / exporter / exportTechPack ...
│   └── styles/              # app.css
├── server/
│   ├── index.cjs            # Express 入口 + [REQ] 请求日志中间件
│   ├── db.cjs               # 建表 + 迁移
│   ├── routes/              # tasks / drawings / bom / process / upload
│   ├── services/            # tasks / drawings / styles / bom / process
│   └── uploads/             # 上传文件存储
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

### tasks（开发单）
```
id, style_id(FK→styles), order_no, priority, sample_type, sample_color, size,
sample_count, fabric_date, start_date, expected_date, finish_date,
audit_status, audit_comment, status(todo/doing/done), progress_nodes(JSON),
image_url, fabric_req, trim_req, process_req, note, size_data(JSON),
created_at, updated_at
```
- 一款可有多张 task（旧模式：一版次一单）
- status 枚举：todo(待处理) / doing(打版中) / done(已完结)
- progress_nodes：状态机节点数组（用户可自由增删改）

### drawings（图纸资料，按 task_id 隔离）
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
| GET | /api/tasks | 全部任务（含 styles join） |
| GET | /api/tasks/:id | 单任务详情 |
| POST | /api/tasks | 新建任务（自动 upsert styles） |
| PATCH | /api/tasks/:id | 更新任务（STYLE_KEYS 白名单合并） |
| DELETE | /api/tasks/:id | 删除任务（级联删子数据） |
| GET | /api/drawings?task_id=N | 某单图纸列表 |
| POST | /api/drawings | 新增图纸（防冗余/版本归组） |
| DELETE | /api/drawings/:id | 删除图纸记录 |
| POST | /api/upload-pdf | 上传设计稿文件 |
| GET | /api/drawing-thumb?url= | EMF/DXF 缩略图生成 |
| GET | /api/styles/:style_no | 按款号查款式 |

PATCH /api/tasks/:id 的 STYLE_KEYS 白名单：style_no, title, brand, designer, year, season, month, category, pdf_url——只传 pdf_url 安全（合并式，不覆盖其他字段）。

## 5. 前端架构要点

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

## 6. 环境与自测通道

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

## 7. 构建与打包

```bash
npm run build        # Vite 构建前端到 dist/
npm run dist         # electron-builder 打包（需配置）
```

## 8. 已知技术债

- [ ] shell node 与 better-sqlite3 ABI 不匹配（需 rebuild 或统一 node 版本）
- [ ] 存量重复单（AW26-JK001 task1+task2、SS26-TS003 task4+task5）待合并
- [ ] 建单不查重款号（阶段 2 待实施）
- [ ] 版次批次未结构化（阶段 4 待实施）
- [ ] ITERATION_STATE.md 未随最近 commit 补记
