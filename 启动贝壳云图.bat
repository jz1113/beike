@echo off
chcp 65001 >nul
call "%~dp0tools\launchers\启动贝壳云图.bat" %*
exit /b %errorlevel%
