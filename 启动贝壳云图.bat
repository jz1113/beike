@echo off
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launchers\启动贝壳云图.ps1" %*
exit /b %errorlevel%
