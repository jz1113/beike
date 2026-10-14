@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo → 正在启动贝壳云图…

:: 补充 Go 常见安装路径到当前 PATH
if exist "C:\Program Files\Go\bin" set "PATH=C:\Program Files\Go\bin;!PATH!"
if exist "C:\Go\bin" set "PATH=C:\Go\bin;!PATH!"
if exist "%USERPROFILE%\go\bin" set "PATH=%USERPROFILE%\go\bin;!PATH!"

:: 检查 Node.js 22
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ✗ 未找到 Node.js 22。请先安装项目 README 中要求的 Node.js。
    echo   下载地址：https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node" 2^>nul') do set "NODE_MAJOR=%%v"
if not "%NODE_MAJOR%"=="22" (
    for /f "delims=" %%v in ('node -v 2^>nul') do set "CURRENT_NODE=%%v"
    echo ✗ 当前 Node.js 是 !CURRENT_NODE!，项目需要 Node.js 22。
    pause
    exit /b 1
)

:: 检查 Go 环境（Go API 服务必需）
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo ✗ 未检测到 Go 环境。项目 API 服务需要 Go 1.23+（推荐 Go 1.26+），请先安装 Go。
    echo   下载地址：https://golang.google.cn/dl/ 或 https://go.dev/dl/
    pause
    exit /b 1
)

:: 首次启动配置初始化
if not exist ".env" (
    if exist ".env.example" (
        echo → 首次运行，正在根据 .env.example 初始化本地 .env…
        copy ".env.example" ".env" >nul
    )
)

:: 首次运行依赖检查
if not exist "node_modules\tsx\package.json" (
    set "NEED_INSTALL=1"
) else if not exist "node_modules\vite\package.json" (
    set "NEED_INSTALL=1"
) else (
    set "NEED_INSTALL=0"
)

if "!NEED_INSTALL!"=="1" (
    echo → 首次运行，正在按 pnpm-lock.yaml 安装依赖…
    where pnpm >nul 2>nul
    if %errorlevel% equ 0 (
        call pnpm install --frozen-lockfile
    ) else (
        where corepack >nul 2>nul
        if %errorlevel% equ 0 (
            call corepack enable >nul 2>nul
            call corepack pnpm install --frozen-lockfile
        ) else (
            echo ✗ 未检测到 pnpm 或 corepack。请先安装 pnpm 10.13.1。
            pause
            exit /b 1
        )
    )
    if %errorlevel% neq 0 (
        echo ✗ 依赖安装失败，请查看上方错误信息。
        pause
        exit /b 1
    )
)

:: 启动 Web 开发服务（包含 Go API 与 Vite，会自动打开浏览器）
echo → 正在启动前端和 API；准备好后会自动打开浏览器。
node tools/scripts/web/dev-web.mjs
set "STATUS=%errorlevel%"
if %STATUS% neq 0 (
    echo ✗ 启动失败，请查看上方错误信息。
    pause
)
exit /b %STATUS%
