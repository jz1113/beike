@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo =========================================================
echo    贝壳云图 · 启动服务
echo    正在启动 Vite UI 与 Hono API 服务...
echo =========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 电脑未检测到 Node.js，请先访问 https://nodejs.org 安装
    pause
    exit /b 1
)

if exist "%USERPROFILE%\.cargo\bin" set PATH=%USERPROFILE%\.cargo\bin;%PATH%

if not exist "node_modules" (
    echo.
    echo =========================================================
    echo  首次运行或依赖未就绪，正在自动安装依赖，请稍候...
    echo =========================================================
    echo.
    where pnpm >nul 2>nul
    if %errorlevel% equ 0 (
        call pnpm install
    ) else (
        call npm install
    )
)

if not exist ".env" (
    if exist ".env.production" (
        copy ".env.production" ".env" >nul
        echo [OK] 已自动初始化环境与密钥配置。
    ) else if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [OK] 已自动从 .env.example 初始化环境配置。
    )
)

where pnpm >nul 2>nul
if %errorlevel% equ 0 (
    call pnpm run tauri:dev
) else (
    call npm run tauri:dev
)
if %errorlevel% neq 0 (
    echo.
    echo [提示] 服务已停止。
)
pause