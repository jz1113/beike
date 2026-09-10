#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"
cd "$DIR" || exit 1

export PATH="$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  \. "$NVM_DIR/nvm.sh"
elif [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  \. "$NVM_DIR/nvm.sh"
fi

if [ -f "$HOME/.cargo/env" ]; then
  . "$HOME/.cargo/env"
fi

# 检查并自动补齐运行依赖
if [ ! -d "node_modules" ] || [ ! -d "node_modules/tsx" ]; then
  echo ""
  echo "========================================================="
  echo " 首次运行或检测到依赖未就绪，正在自动安装依赖，请稍候..."
  echo "========================================================="
  echo ""
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install
  elif command -v npm >/dev/null 2>&1; then
    npm install
  else
    echo "错误：未检测到 node / npm / pnpm 环境，请先安装 Node.js"
    read -r -p "按回车键退出..."
    exit 1
  fi
fi

# 检查并补齐 .env 密钥配置
if [ ! -f ".env" ] && [ -f ".env.production" ]; then
  cp ".env.production" ".env"
  echo "已自动初始化环境与密钥配置。"
fi

echo ""
echo "贝壳云图 · 正在启动桌面开发环境…"
echo ""

npm run tauri:dev
EXIT_CODE=$?

  if [ "$EXIT_CODE" -ne 0 ]; then
  echo ""
  echo "── 启动失败，当前状态 ──"
  npm run desktop:status -- --brief || true
  VITE_LOG="$LOG_DIR/vite-dev.log"
  echo ""
  if [ -f "$VITE_LOG" ]; then
    VITE_ERR=$(tail -n 20 "$VITE_LOG" | grep -E 'Error|error|ERR_|failed|already in use' | tail -n 3)
    if [ -n "$VITE_ERR" ]; then
      echo "── Vite 最近错误 ──"
      echo "$VITE_ERR"
      echo ""
    fi
  fi
  echo "提示：Tauri 编译失败时可运行 npm run clean:dev 后重试"
  echo ""
  read -r -p "按回车键关闭窗口…"
fi

exit "$EXIT_CODE"
