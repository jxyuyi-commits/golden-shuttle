# 换机/换账号手动打包清单（MANUAL COPY MANIFEST）

> 适用于：在**另一台电脑**继续开发 golden-shuttle 时，除 `git clone` 之外的**需要手动拷贝**的文件。
> 原则：**代码全部走 git**；这里只列 .gitignore 排除的、但换机开发/使用需要的文件。

## 一、必拷（影响能否直接用真实数据 / AI 记忆）

| 文件/目录 | 来源（当前机） | 目标（新机） | 是否必需 | 说明 |
|---|---|---|---|---|
| `server/database.sqlite` | `D:\dev\golden-shuttle\server\database.sqlite` | 新机同路径 | ⚠️ 按需 | **当前是测试数据**（8 tasks）。若要在新机从空库开始（推荐，用真实工作数据），**不需要拷**；若想沿用现有数据才拷。生产数据在 `%APPDATA%/PatternMaster Pro/` |
| `.workbuddy/` 整个目录 | `D:\dev\.workbuddy\` | `D:\dev\.workbuddy\` | ⚠️ 建议 | AI 开发记忆（MEMORY.md + 每日日志），不在 git。拷过去可让 AI 在新机接续上下文。**注：项目记忆已整合进 git 内的 `docs/PROJECT_HANDBOOK.md`，不拷 .workbuddy 也能继续开发，只是失去 AI 侧历史日志** |
| `server/uploads/` | `D:\dev\golden-shuttle\server\uploads\` | 新机同路径 | ⚠️ 按需 | 设计稿 PDF 等上传文件（.gitignore 排除）。要保留历史设计稿才拷 |

## 二、不建议拷（新机重新生成即可）

| 项 | 原因 |
|---|---|
| `node_modules/` | `npm install` 重建；better-sqlite3 按新机 ABI 编译 |
| `dist/`、`dist_electron/`、`out/` | 构建产物，`npm run build` / `npm run build:exe` 重建 |
| `.env` 等本地配置 | 仓库有模板，按新机环境重建 |

## 三、新机安装后必须执行

```bash
git clone <你的远端> golden-shuttle
cd golden-shuttle
npm install
npm run rebuild:electron   # 换机必做：better-sqlite3 重编为 ABI 132
npm run dev:all            # 起后端 3001 + Vite 5173，浏览器开 localhost:5173 验证
```

## 四、换账号额外动作

见 `docs/PROJECT_HANDBOOK.md` §11（git config 身份、远端地址、PAT/SSH 认证、代理）。

## 五、打包前检查清单（发布时）

- [ ] `npm run dev:all` 预览数据正常（用户确认）
- [ ] 停掉 dev（避免 better-sqlite3 文件占用 EPERM）
- [ ] 大改先升 `package.json.version`
- [ ] `npm run build:exe`（自动 rebuild:electron → vite build → electron-builder）
- [ ] 产物：`dist_electron/win-unpacked/` + `Setup.exe` 分发
