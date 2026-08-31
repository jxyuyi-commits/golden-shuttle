// dev:all 开发环境启动脚本
// P2-ABI 方案D：后端使用 Electron 的 Node 模式运行（ELECTRON_RUN_AS_NODE=1）
// 这样后端与 Electron 主进程统一为 ABI 132，better-sqlite3 只需编译一次，
// 彻底摆脱 Node(115)/Electron(132) 来回 rebuild 的困境。
// Vite 是纯 JS，不受 ABI 影响，仍用系统 Node 运行。
const { spawn } = require('child_process');

// require('electron') 在非 Electron 环境返回 electron.exe 的绝对路径
const electronPath = require('electron');

console.log('启动后端 API (Electron Node, ABI 132)...');
const server = spawn(electronPath, ['server/index.cjs'], {
  stdio: 'inherit',
  // 不启用 shell，避免参数拼接安全隐患（修复 DEP0190 警告）
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

console.log('启动前端 Vite...');
const client = spawn('npm', ['run', 'dev:client'], { stdio: 'inherit', shell: true });

// 捕获终止信号，同时关闭前后端
const cleanup = () => {
    console.log('正在关闭服务...');
    server.kill('SIGINT');
    client.kill('SIGINT');
    process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
