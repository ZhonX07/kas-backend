@echo off
title KAS后端服务器启动器
color 0A

echo.
echo ===============================================
echo            KAS 后端服务器启动器
echo ===============================================
echo.

:: 检查Node.js是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到Node.js
    echo 请先安装Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [信息] Node.js版本: 
node --version

:: 切换到后端目录
cd /d "%~dp0"
echo [信息] 当前目录: %CD%

:: 检查端口8080是否被占用
echo.
echo [检查] 检查端口8080是否被占用...
netstat -an | findstr :8080 >nul
if %errorlevel% equ 0 (
    echo [警告] 端口8080已被占用！
    echo 当前占用情况:
    netstat -an | findstr :8080
    echo.
    echo 是否要强制启动？ (可能会冲突)
    choice /C YN /M "继续启动 (Y) 或退出 (N)"
    if errorlevel 2 exit /b 1
) else (
    echo [信息] 端口8080可用
)

:: 检查依赖是否安装
echo.
if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖...
    npm install express cors ws
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo [信息] 依赖已安装
)

:: 启动服务器
echo.
echo ===============================================
echo            启动测试服务器
echo ===============================================
echo [信息] 服务器将在端口8080启动
echo [信息] 前端地址: http://localhost:5173
echo [信息] 后端地址: http://localhost:8080
echo [信息] 按 Ctrl+C 停止服务器
echo ===============================================
echo.

node test-simple-server.js

if %errorlevel% neq 0 (
    echo.
    echo [错误] 服务器启动失败！
    echo 请检查错误信息并重试
    pause
)