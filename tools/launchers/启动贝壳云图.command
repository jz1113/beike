#!/bin/bash
# macOS Finder one-click launcher for the local browser app.

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

# Finder does not load the user's interactive shell profile. Use the project's
# .nvmrc when nvm is installed, then verify the actual Node major version.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  . "$NVM_DIR/nvm.sh"
  nvm use --silent >/dev/null 2>&1 || true
fi

command -v node >/dev/null 2>&1 || fail "未找到 Node.js 22。请先安装项目 README 中要求的 Node.js。"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
[[ "$NODE_MAJOR" == "22" ]] || fail "当前 Node.js 是 $(node -v)，项目需要 Node.js 22。"

# First launch after a fresh checkout: install only from the locked manifest.
if [[ ! -f node_modules/tsx/package.json || ! -f node_modules/vite/package.json ]]; then
  command -v corepack >/dev/null 2>&1 || fail "缺少依赖和 Corepack。请先安装 Node.js 22。"
  echo "→ 首次运行，正在按 pnpm-lock.yaml 安装依赖…"
  corepack enable || fail "无法启用项目要求的 pnpm 10.13.1。"
  corepack pnpm install --frozen-lockfile || fail "依赖安装失败。请查看上方错误信息。"
fi

# The Node launcher validates workspace ownership before reusing existing services.
echo "→ 正在启动前端和 API；准备好后会自动打开浏览器。"
node tools/scripts/web/dev-web.mjs
STATUS=$?
if [[ "$STATUS" -ne 0 ]]; then
  echo "✗ 启动失败，请查看上方错误信息。" >&2
  pause_on_error
fi
exit "$STATUS"
