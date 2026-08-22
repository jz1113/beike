@echo off
chcp 65001 >nul
echo.
echo =========================================================
echo    贝壳云图 · 桌面窗口
echo    正在启动 Vite UI 与 Hono API 服务...
echo =========================================================
echo.

cd /d "%~dp0.."

if exist "%USERPROFILE%\.cargo\bin" set PATH=%USERPROFILE%\.cargo\bin;%PATH%

call npm run tauri:dev
pause
