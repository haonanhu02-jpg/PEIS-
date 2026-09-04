@echo off
chcp 65001 >nul
REM ===== PEIS 项目管理系统 - 一键启动脚本（企业本地部署） =====
cd /d "%~dp0"

echo [1/3] 检查 Node 运行环境...
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 18+ 或使用项目内置 node
  pause
  exit /b 1
)

echo [2/3] 检查依赖...
if not exist "node_modules" (
  echo 首次运行，正在安装依赖（含 MySQL 数据库驱动 mysql2）...
  call npm install --no-audit --no-fund
)

echo [3/3] 启动服务（监听 0.0.0.0:9280）...
echo.
echo   访问地址: http://192.168.3.110:9280/#/
echo   数据存储: MySQL 数据库（连接配置见 .env，支持多人并发）
echo   按 Ctrl+C 停止服务
echo.
node src/app.js

pause
