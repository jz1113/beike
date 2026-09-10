@echo off
setlocal
chcp 65001 >nul
title 贝壳云图 - Windows 安装包一键构建
cd /d "%~dp0\..\..\.."

echo [1/4] 检查 Node.js、Rust 和 C++ 编译环境...
where node >nul 2>nul
if errorlevel 1 goto missing_node
node -e "const [a,b,c]=process.versions.node.split('.').map(Number); process.exit(((a===20&&(b>20||(b===20&&c>=2)))||a===22)&&process.arch==='x64'?0:1)"
if errorlevel 1 goto missing_node
where cargo >nul 2>nul
if errorlevel 1 goto missing_rust
rustc -vV | findstr /c:"host: x86_64-pc-windows-msvc" >nul
if errorlevel 1 goto missing_rust
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto missing_cpp
"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | findstr . >nul
if errorlevel 1 goto missing_cpp

echo [2/4] 按锁文件安装 Windows 依赖...
call npx --yes pnpm@10.13.1 install --frozen-lockfile
if errorlevel 1 goto failed

echo [3/4] 构建前端、内置服务和 Windows EXE 安装包...
call npm run tauri:build:windows
if errorlevel 1 goto failed

echo [4/4] 打包完成：desktop\target\release\bundle\nsis
if exist "desktop\target\release\bundle\nsis" start "" explorer.exe "%CD%\desktop\target\release\bundle\nsis"
pause
exit /b 0

:missing_node
echo 请先安装 Windows x64 Node.js 22 LTS：https://nodejs.org/
goto failed
:missing_rust
echo 请先安装 Rust，使用默认 x86_64-pc-windows-msvc 工具链：https://rustup.rs/
goto failed
:missing_cpp
echo 请安装 Visual Studio Build Tools，勾选“使用 C++ 的桌面开发”和 Windows SDK。
echo https://visualstudio.microsoft.com/visual-cpp-build-tools/
goto failed
:failed
echo 打包失败。请根据上方提示处理后重新双击此脚本。
pause
exit /b 1
