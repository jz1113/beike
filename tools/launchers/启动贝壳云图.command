#!/bin/bash
# ==============================================================================
# 贝壳云图 (Beike Cloud Graph) - macOS 本地一键启动器
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || exit 1
if [[ -f "$SCRIPT_DIR/../../package.json" ]]; then
  PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)" || exit 1
elif [[ -f "$SCRIPT_DIR/package.json" ]]; then
  PROJECT_DIR="$SCRIPT_DIR"
else
  PROJECT_DIR="$(pwd)"
fi
cd "$PROJECT_DIR" || exit 1

pause_on_error() {
  if [[ -t 0 ]]; then
    echo
    read -r -p "按回车键关闭窗口…" _
  fi
}

fail() {
  echo "✗ $1" >&2
  pause_on_error
  exit 1
}

echo "→ 正在启动贝壳云图…"

# Finder 双击启动时不会加载用户的终端环境变量，补充常见的系统与包管理器路径
for candidate_path in \
  "/opt/homebrew/bin" \
  "/opt/homebrew/sbin" \
  "/usr/local/bin" \
  "/usr/local/sbin" \
  "$HOME/.local/bin" \
  "$HOME/bin" \
  "$HOME/Library/pnpm" \
  "$HOME/.local/share/pnpm" \
  "$HOME/.local/go/bin" \
  "$HOME/go/bin" \
  "/usr/local/go/bin" \
  "$HOME/.cargo/bin"
do
  if [[ -d "$candidate_path" && ":$PATH:" != *":$candidate_path:"* ]]; then
    export PATH="$candidate_path:$PATH"
  fi
done

# 优先加载常见 Node 版本管理器
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  . "$NVM_DIR/nvm.sh"
  nvm use 22 --silent >/dev/null 2>&1 || nvm use --silent >/dev/null 2>&1 || true
fi

if [[ -d "$HOME/.fnm" ]]; then
  export PATH="$HOME/.fnm:$PATH"
  eval "$("$HOME/.fnm/fnm" env 2>/dev/null)" || true
elif command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env 2>/dev/null)" || true
fi

if [[ -d "$HOME/.volta/bin" && ":$PATH:" != *":$HOME/.volta/bin:"* ]]; then
  export PATH="$HOME/.volta/bin:$PATH"
fi

if [[ -d "$HOME/.local/share/mise/shims" && ":$PATH:" != *":$HOME/.local/share/mise/shims:"* ]]; then
  export PATH="$HOME/.local/share/mise/shims:$PATH"
fi

if [[ -d "$HOME/.asdf/shims" && ":$PATH:" != *":$HOME/.asdf/shims:"* ]]; then
  export PATH="$HOME/.asdf/shims:$PATH"
fi

# 如果未找到 node，或当前 node 不是 22，主动扫描常见的 NVM Node 22 安装路径
CURRENT_NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo '')"
if [[ "$CURRENT_NODE_MAJOR" != "22" ]]; then
  for nvm_node22 in "$HOME"/.nvm/versions/node/v22*/bin; do
    if [[ -x "$nvm_node22/node" ]]; then
      export PATH="$nvm_node22:$PATH"
      break
    fi
  done
fi

# 检查 Node.js 22 环境
command -v node >/dev/null 2>&1 || fail "未找到 Node.js 22。请先安装项目要求的 Node.js 22（https://nodejs.org/）。"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo '')"
[[ "$NODE_MAJOR" == "22" ]] || fail "当前 Node.js 版本是 $(node -v 2>/dev/null || echo '未知')，项目需要 Node.js 22。"

# 检查 Go 编译器环境（后端 API 服务必需）
if ! command -v go >/dev/null 2>&1; then
  # 尝试补充检测 ~/.local/go
  if [[ -x "$HOME/.local/go/bin/go" ]]; then
    export PATH="$HOME/.local/go/bin:$PATH"
  elif [[ -x "/usr/local/go/bin/go" ]]; then
    export PATH="/usr/local/go/bin:$PATH"
  fi
fi

command -v go >/dev/null 2>&1 || fail "未检测到 Go 环境。项目 API 服务需要 Go 1.23+（推荐 Go 1.26），请先安装 Go（https://golang.google.cn/dl/ 或 https://go.dev/dl/）。"

# 首次启动配置文件初始化
if [[ ! -f ".env" && -f ".env.example" ]]; then
  echo "→ 首次运行，正在根据 .env.example 初始化本地 .env…"
  cp ".env.example" ".env"
fi

# 首次启动依赖检查与自动安装
if [[ ! -f node_modules/tsx/package.json || ! -f node_modules/vite/package.json ]]; then
  echo "→ 首次运行，正在按 pnpm-lock.yaml 安装项目依赖…"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile || fail "依赖安装失败，请查看上方错误信息。"
  elif command -v corepack >/dev/null 2>&1; then
    corepack enable || fail "无法启用项目要求的 pnpm 10.13.1。"
    corepack pnpm install --frozen-lockfile || fail "依赖安装失败，请查看上方错误信息。"
  else
    fail "缺少依赖且未检测到 pnpm 或 Corepack。请先安装 pnpm 10.13.1。"
  fi
fi

# 启动 Web 开发服务（包含 Go API 与 Vite，会自动打开浏览器）
echo "→ 正在启动前端和 API；准备好后会自动打开浏览器。"
set +e
node tools/scripts/web/dev-web.mjs
STATUS=$?
if [[ "$STATUS" -ne 0 ]]; then
  echo "✗ 启动失败，请查看上方错误信息。" >&2
  pause_on_error
fi
exit "$STATUS"
