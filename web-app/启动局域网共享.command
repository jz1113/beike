#!/bin/bash
# 自动定位到脚本所在目录
cd "$(dirname "$0")"

# 自动适配 NVM 或系统 Node 环境
if [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_LATEST=$(find "$HOME/.nvm/versions/node" -maxdepth 1 -mindepth 1 | sort -V | tail -n 1)
  if [ -n "$NODE_LATEST" ]; then
    export PATH="$NODE_LATEST/bin:$PATH"
  fi
fi

# 获取本机局域网 IP
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -n 1 | awk '{print $2}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="127.0.0.1"
fi

PORT=3000

echo "========================================================"
echo "🚀 正在启动 贝壳云图 (局域网共享模式)..."
echo "========================================================"
echo ""
echo "📱 本机访问地址:       http://localhost:${PORT}"
echo "👥 办公室同事访问地址: http://${LOCAL_IP}:${PORT}"
echo ""
echo "👉 请将上面的【同事访问地址】发送给同一 Wi-Fi 下的同事即可直接使用！"
echo "========================================================"
echo ""

# 检查是否已构建生产包，若未构建则自动构建
if [ ! -d ".next" ]; then
  echo "📦 正在执行首次生产包构建..."
  npm run build
fi

# 启动局域网服务
npm run start:lan
