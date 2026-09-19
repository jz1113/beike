#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR" || exit 1

if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    source "$NVM_DIR/nvm.sh"
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请先访问 https://nodejs.org 安装 Node.js 20+。"
  read -n 1 -s -r -p "按任意键退出..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "首次运行，正在安装依赖..."
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install
  else
    npx --yes pnpm@10.13.1 install
  fi
fi

if [ ! -f ".env" ]; then
  if [ -f ".env.production" ]; then
    cp ".env.production" ".env"
  elif [ -f ".env.example" ]; then
    cp ".env.example" ".env"
  fi
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm run dev:web
else
  npm run dev:web
fi
