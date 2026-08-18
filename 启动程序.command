#!/bin/bash

# =========================================================
# 🌸 AI 真实买家秀与种草生图工坊 - 一键启动器 (macOS)
# =========================================================

# 切换到当前脚本所在目录
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/web-app" || exit 1

# 加载常用的 Node.js / NVM 环境变量
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  \. "$NVM_DIR/nvm.sh"
elif [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  export NVM_DIR="/opt/homebrew/opt/nvm"
  \. "$NVM_DIR/nvm.sh"
fi

echo ""
echo "========================================================="
echo "   🌸 贝壳云图"
echo "   正在启动服务并打开浏览器，请稍候..."
echo "========================================================="
echo ""

# 异步等待 2.5 秒后自动在默认浏览器中打开页面
(
  sleep 2.5
  open "http://localhost:3000"
) &

# 启动 Next.js 本地开发服务
npm run dev
