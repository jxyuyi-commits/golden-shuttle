# docs/ 文档索引（DOCS INDEX）

> **这是全部开发文档的唯一入口。** 新会话 / 换电脑 / 新成员，**先读本文件**，再按下方"一分钟导航"顺序展开。
> 本索引于 2026-09-14 由「文档清洗方案（决策 4）」建立，用于消除"多份重叠事实源"。

---

## 一分钟导航（按顺序读）

| 场景 | 读什么（顺序） |
| --- | --- |
| **任何新会话开始** | ① [`PROJECT_HANDBOOK.md`](./PROJECT_HANDBOOK.md)（怎么跑/环境坑/命令）→ ② 本文件 → ③ 需要改代码时看 [`TECHNICAL.md`](./TECHNICAL.md)（结构） |
| **换电脑 / 换账号** | ① [`archive/MANUAL_COPY_MANIFEST.md`](./archive/MANUAL_COPY_MANIFEST.md)（**换机手动拷贝清单**）→ ② `PROJECT_HANDBOOK.md` §2 / §10 / §11 |
| **新成员上手** | ① 本文件 → ② `PROJECT_HANDBOOK.md` → ③ [`BUSINESS_LOGIC.md`](./BUSINESS_LOGIC.md)（业务与决策）→ ④ `TECHNICAL.md` → ⑤ [`roadmap/`](./roadmap/)（在做/将做什么） |

---

## 一、持续维护文档清单（★ = 长期维护）

> "持续维护" = 会随项目演进不断更新。**每份只负责一类事实（单一职责）**，避免同一事实多处声明。

| 文档 | 位置 | 单一职责（管什么） | 更新时机（什么时候必须改） | 防漂移约束 |
| --- | --- | --- | --- | --- |
| **★ BUSINESS_LOGIC.md** | `docs/` | **业务逻辑沉淀**：业务规则、模式讨论、状态机、决策演进（ADR） | **每次业务规则或数据模型变更时** | **用户指定长期维护，不得归档/改名/合并**；只增不删；禁止写行数与"最新 vN" |
| PROJECT_HANDBOOK.md | `docs/` | **运行手册**：怎么跑、环境坑、命令、账号远端 | **命令或环境变更时** | 计数走 `<!-- STATS -->` 脚本生成；现状不写死 |
| TECHNICAL.md | `docs/` | **技术架构与表结构** | 目录结构 / 表结构 / 模块职责变更时 | 表结构以 `server/db.cjs` 为源（引用而非复制） |
| ITERATION_STATE.md | 仓库根 | **追加式变更日志**（跨对话外部记忆） | **每次交付追加一条**（不删不改历史） | 只增不改；**不承担"项目现状"职责**（现状以 HANDBOOK 为准） |
| AGENTS.md | 仓库根 | **AI 工作约定**：自测通道、强制规则、环境坑 | AI 工作方式/自测通道变更时 | 属"约定"非"事实源"；不写会漂移的数字 |
| roadmap/统一实施路径与任务分解-20260914.md | `docs/roadmap/` | **当前批次路线图（唯一计划源）** | 批次推进 / 路线调整时 | 与需求池互链，不重复登记 |
| roadmap/待开发文档.md | `docs/roadmap/` | **需求池 / backlog（唯一需求登记入口）** | 每次登记/状态变更需求时 | 编号递增；只登记，不排期 |
| roadmap/开发工作计划.md | `docs/roadmap/` | **排期与实施要点**（承接需求池） | 制定开发顺序/决策点时 | 不写死迁移版本等现状数字 |

**单一职责速记**：业务看 `BUSINESS_LOGIC`｜运行看 `HANDBOOK`｜结构看 `TECHNICAL`｜历史看 `ITERATION_STATE`｜计划看 `roadmap/`｜约定看 `AGENTS`。

### roadmap/ 内部分工（避免重复）

- **`待开发文档.md` = 需求池**：REQ-xxx 的**唯一登记入口**，负责"有哪些需求、什么状态"。
- **`开发工作计划.md` = 排期计划**：承接需求池，负责"开发顺序、实施要点、待拍板决策点"。
- **`统一实施路径与任务分解-20260914.md` = 当前批次路线图**：负责"这一批先做什么、并行/串行约束、验收方式"。**计划以本目录为准。**

---

## 二、文档地图（清洗后完整结构）

```
仓库根/
├── README.md                  # Vite 模板默认（非项目文档，保留原样）
├── AGENTS.md                  # ★AI 工作约定（保留原位）
├── ITERATION_STATE.md         # 追加式变更日志（保留原位）
└── docs/
    ├── README.md              # ← 本文件：唯一文档索引
    ├── BUSINESS_LOGIC.md      # ★业务逻辑沉淀（用户指定长期维护）
    ├── PROJECT_HANDBOOK.md    # 运行手册（含 STATS 计数区块）
    ├── TECHNICAL.md           # 技术架构与表结构
    ├── 工艺单样例_26AWW526.pdf # PDF 导出样例（被 .gitignore 的 docs/*.pdf 排除，不进 git，仅本机）
    ├── audit/                 # 审计报告（活跃/本轮输入）
    │   ├── 全项目审查与优化方案-20260914.html
    │   └── UI-UX-审计与优化建议-20260914.html
    ├── roadmap/               # ★唯一计划源目录
    │   ├── 统一实施路径与任务分解-20260914.md
    │   ├── 待开发文档.md
    │   └── 开发工作计划.md
    └── archive/               # 归档区：历史文档，不再维护（只归档不删除）
        ├── MANUAL_COPY_MANIFEST.md   # 换机打包清单（HANDBOOK §12 有指向）
        ├── README_DEV.md
        ├── OVERVIEW.md
        ├── ARCHITECTURE_REVIEW.md
        ├── P2-IPC-完成报告.md
        ├── P2-ABI-迭代方案.md
        ├── 数据导出模块-使用与问题排查.md
        ├── 配色审计报告.md
        ├── 配色预览.html
        └── req-screenshots/          # 需求登记时的参考截图（_req_screenshot_*.png）
```

---

## 三、audit/ 与 archive/ 的区别

| 目录 | 含义 | 是否维护 |
| --- | --- | --- |
| `docs/audit/` | **本轮/近期审计产出**（工程审查 + UI/UX 审计），是当前批次路线图的输入 | 本轮结束后转 archive |
| `docs/archive/` | **历史文档**（被取代/已完成/一次性报告）：`README_DEV`、`OVERVIEW`、`ARCHITECTURE_REVIEW`、P2-IPC/ABI、配色审计、换机清单、参考截图等 | **不再维护，仅作历史**；**只归档不删除** |

> 归档区文档**可能含过时信息**（如旧的行数、旧的迁移版本、旧路径），请勿作为现状依据。

---

## 四、防漂移机制（防"文档说的和代码不一样"）

1. **数字分流 —— 禁止手写会漂移的数字**
   - **结构/计数类**（源码行数、routes/services 数、迁移最大版本、`src/api/index.js` 导出数、git 跟踪文件数）→ **一律由 `scripts/doc-stats.cjs` 从源码生成**，注入 `PROJECT_HANDBOOK.md` 的 `<!-- STATS:BEGIN ... STATS:END -->` 区块。
   - **现状类断言**（"最新 vN""当前 x 行"）→ **禁止写死**，只允许**指向源码**（例如"迁移版本见 `server/db.cjs` 的 `migrations` 数组"）。
2. **单一职责** —— 每类事实只有一个文件有权声明（见上表）。
3. **校验钩子** —— 运行 `node scripts/doc-stats.cjs --check`（建议接线为 `npm run doc:check`，可挂 pre-commit）校验 STATS 区块与源码一致，不一致即报警。

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `node scripts/doc-stats.cjs` | 重新统计并**回填** `PROJECT_HANDBOOK.md` 的 STATS 区块 |
| `node scripts/doc-stats.cjs --check` | **只校验**STATS 区块与源码是否一致（不一致退出码 1） |
| `node scripts/doc-stats.cjs --json` | 只打印统计 JSON，不回填 |
| `DOC_STATS_GIT=1 node scripts/doc-stats.cjs` | 额外统计 git 跟踪文件数（脚本仅执行**只读** `git ls-files`） |

> ⚠️ 本脚本**不 require better-sqlite3**（避免 ABI 失败），只做文件扫描与正则解析。

---

## 五、维护约定（给所有后续维护者）

- 新增/移动/重命名文档后，**必须同步更新本索引**与所有指向它的路径（尤其 `AGENTS.md`、`PROJECT_HANDBOOK.md`、`ITERATION_STATE.md`）。
- **不允许删除文档**；淘汰的文档一律移入 `docs/archive/`。
- 更新"现状"请改 `PROJECT_HANDBOOK.md`（或由脚本生成），**不要**改 `ITERATION_STATE.md` 的历史条目。
- 换机手动拷贝清单是 [`archive/MANUAL_COPY_MANIFEST.md`](./archive/MANUAL_COPY_MANIFEST.md)（用户换机必读）。
