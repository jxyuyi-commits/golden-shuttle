import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist_electron', 'node_modules']),
  // ── 前端：浏览器环境 + JSX + ESM（src/**） ──
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // ── 后端 / Electron 主进程 / 脚本：Node 环境 + CommonJS ──
  // 覆盖 server/**、scripts/**、main.js、preload.js。
  // 修复原配置两处缺陷：files 仅 globals.browser 导致 main.js 误报 require/process/__dirname（no-undef）；
  // 且 files 未覆盖 .cjs 导致 server/**、scripts/** 完全不参与 lint（无覆盖的文件不会被任何规则检查）。
  // 注意：本块的 files 必须与 package.json 的 lint 命令参数保持一致，否则命令里列出的目录会因无匹配配置而报 unused-ignore 或直接被忽略。
  {
    files: ['server/**/*.cjs', 'scripts/**/*.cjs', 'main.js', 'preload.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'commonjs',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
