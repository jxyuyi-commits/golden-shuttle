// Vitest 配置（G9 测试框架）
//
// ⚠️ 关键背景：本项目的 better-sqlite3 原生二进制编译目标是 **Electron ABI 132**，
// 系统 Node（本机 v22 = ABI 127）加载它会 ERR_DLOPEN_FAILED（见 HANDBOOK §6.3）。
// 因此本配置**必须**配合 `ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs`
// 一同使用：Vitest 本体与它 fork 出的每个测试子进程都跑在 Electron 运行时上，
// 从而与生产后端（`npm run dev:server`）用的是同一份原生二进制。
// 详见 package.json 的 `test:unit` 脚本。
//
// 刻意独立于 vite.config.js（后者含 React 插件与 dev 服务器配置，测试不需要），
// 且独立命名的 vitest.config.* 优先级高于 vite.config.*，避免误加载前端构建配置。
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 仅收集 tests/ 下的测试；不扫描 src/server
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules/**', 'dist/**', 'dist_electron/**'],
    environment: 'node',
    // 走 fork 池：每个测试文件独立子进程 → 模块级单例（db.cjs 的 db 句柄）天然隔离，
    // 每个文件可用各自的临时库互不污染；子进程用 process.execPath（= electron）创建，
    // 继承 ELECTRON_RUN_AS_NODE=1，故 ABI 132 一路贯通到最底层。
    pool: 'forks',
    poolOptions: {
      forks: { isolate: true },
    },
    // 迁移/夹具测试会反复建库跑全部迁移，给足超时
    testTimeout: 30000,
    hookTimeout: 30000,
    // 串行执行，避免多个 electron 子进程同时抢占临时目录/文件句柄（Windows 更稳）
    fileParallelism: false,
    reporters: ['default'],
  },
});
