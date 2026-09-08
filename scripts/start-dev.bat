@echo off
rem PatternMaster Pro dev 启动（用户双击运行，进程归属用户桌面会话，稳定不挂）
cd /d D:\dev\golden-shuttle
echo 正在启动 PatternMaster Pro 开发环境...
echo 前端 http://localhost:5173   后端 http://localhost:3001
echo 关闭本窗口即停止服务
node scripts/dev.cjs
pause
