import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 确保 Electron 打包后能正确读取本地静态资源
  server: {
    headers: { 'Cache-Control': 'no-store' }, // dev 禁用缓存，避免浏览器加载旧模块
  },
})
