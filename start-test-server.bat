@echo off
echo 🚀 启动KAS测试后端服务器...
echo.

cd /d "%~dp0"

:: 检查Node.js是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到Node.js，请先安装Node.js
    pause
    exit /b 1
)

:: 检查依赖是否安装
if not exist "node_modules" (
    echo 📦 正在安装依赖...
    npm install express cors ws
)

:: 启动测试服务器
echo ⚡ 启动测试服务器在端口8080...
echo.
echo 请确保端口8080未被占用...
netstat -an | findstr :8080
echo.
node test-simple-server.js

pause