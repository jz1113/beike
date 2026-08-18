@echo off
chcp 65001 >nul
echo.
echo =========================================================
echo    🌸 贝壳云图
echo    正在启动服务并打开浏览器，请稍候...
echo =========================================================
echo.

cd /d "%~dp0web-app"

start "" http://localhost:3000

npm run dev
pause
