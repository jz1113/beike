@echo off
chcp 65001 >nul
echo.
echo =========================================================
echo    贝壳云图 · 桌面窗口
echo    正在启动 Vite UI 与 Hono API 服务...
echo =========================================================
echo.

cd /d "%~dp0..\.."

if exist "%USERPROFILE%\.cargo\bin" set PATH=%USERPROFILE%\.cargo\bin;%PATH%

if not exist "node_modules" (
    echo.
    echo =========================================================
    echo  首次运行或检测到依赖未就绪，正在自动安装依赖，请稍候...
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
    )
)

call npm run tauri:dev
pause
