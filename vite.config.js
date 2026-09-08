import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 确保 Electron 打包后能正确读取本地静态资源
  server: {
    headers: { 'Cache-Control': 'no-store' }, // dev 禁用缓存，避免浏览器加载旧模块
    // 2026-09-08 根因修复（REQ-016 服务反复挂排查）：忽略测试/日志/附件目录，
    // 防止 Vite 文件监听撞上 Edge 测试用户数据目录（EBUSY 崩溃导致服务反复挂）
    watch: {
      ignored: [
        '**/_*/**', // _ 开头的测试/临时目录（_chrome_*、_probe_* 等）
        '**/_*.*', // 根目录 _ 开头测试文件（_dev_out.log 等）
        '**/*.agent_infra_tmp*', // 编辑工具写文件生成的临时文件（如 待开发文档.md.agent_infra_tmp_*）
        '**/attachments_download/**',
        '**/server/backup_empty/**',
      ],
    },
  },
})
