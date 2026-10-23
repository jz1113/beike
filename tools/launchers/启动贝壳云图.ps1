# ==============================================================================
# 贝壳云图 (Beike Cloud Graph) - Windows PowerShell 本地一键启动器
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path (Join-Path $scriptDir "..\..\package.json")) {
    $projectDir = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
} elseif (Test-Path (Join-Path $scriptDir "package.json")) {
    $projectDir = (Resolve-Path $scriptDir).Path
} else {
    $projectDir = (Get-Location).Path
}
Set-Location $projectDir

function Write-Info($msg)  { Write-Host "→ $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "✗ $msg" -ForegroundColor Red }

function Pause-OnError {
    if ([Environment]::UserInteractive) {
        Write-Host "`n按任意键退出…" -ForegroundColor DarkGray
        [void][System.Console]::ReadKey($true)
    }
}

Write-Info "正在启动贝壳云图…"

# 1. 补充 Go 安装路径
$goCandidates = @(
    "C:\Program Files\Go\bin",
    "C:\Go\bin",
    "$env:USERPROFILE\go\bin",
    "$env:LOCALAPPDATA\Programs\Go\bin"
)
foreach ($dir in $goCandidates) {
    if ((Test-Path $dir) -and ($env:Path -notlike "*$dir*")) {
        $env:Path = "$dir;$env:Path"
    }
}

# 2. 检查 Node.js 22
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Err "未找到 Node.js。请先安装项目要求的 Node.js 22。"
    Write-Host "  下载地址：https://nodejs.org/" -ForegroundColor Yellow
    Pause-OnError
    exit 1
}

$nodeVersion = (& node -v 2>$null)
$nodeMajor = (& node -p "process.versions.node.split('.')[0]" 2>$null)
if ($nodeMajor -ne "22") {
    Write-Err "当前 Node.js 版本是 $nodeVersion，项目需要 Node.js 22。"
    Pause-OnError
    exit 1
}
Write-Ok "Node.js 环境检测通过: $nodeVersion"

# 3. 检查 Go 环境（Go API 服务必需）
$goCmd = Get-Command go -ErrorAction SilentlyContinue
if (-not $goCmd) {
    Write-Err "未检测到 Go 编译器。项目 API 服务需要 Go 1.26 或更高版本。"
    Write-Host "  下载地址：https://golang.google.cn/dl/ 或 https://go.dev/dl/" -ForegroundColor Yellow
    Pause-OnError
    exit 1
}
$goVersion = (& go version 2>$null)
Write-Ok "Go 编译环境检测通过: $goVersion"

# 4. 配置文件初始化
if (-not (Test-Path ".env")) {
    if (Test-Path "tools/configs/env.example") {
        Write-Info "正在根据 tools/configs/env.example 初始化本地 .env…"
        Copy-Item -LiteralPath "tools/configs/env.example" -Destination ".env"
        Write-Ok "已生成默认 .env 配置文件"
    }
}

# 5. 依赖检查与安装
$needInstall = (-not (Test-Path "node_modules\tsx\package.json")) -or (-not (Test-Path "node_modules\vite\package.json"))
if ($needInstall) {
    Write-Info "首次运行，正在根据 pnpm-lock.yaml 安装项目依赖…"
    $pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($pnpmCmd) {
        & pnpm install --frozen-lockfile
    } else {
        & corepack enable
        & corepack pnpm install --frozen-lockfile
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Err "依赖安装失败，请检查网络或依赖源。"
        Pause-OnError
        exit 1
    }
}

# 6. 启动前后端服务并自动打开浏览器
Write-Info "正在启动前端与 API；服务就绪后会自动打开浏览器。"
& node tools/scripts/web/dev-web.mjs
$status = $LASTEXITCODE

if ($status -ne 0) {
    Write-Err "服务启动异常，退出码: $status"
    Pause-OnError
}
exit $status
