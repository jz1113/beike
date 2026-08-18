#!/bin/bash
# 自动定位到脚本所在目录
cd "$(dirname "$0")"

# 1. 自动适配 NVM 或系统 Node 环境
if [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_LATEST=$(find "$HOME/.nvm/versions/node" -maxdepth 1 -mindepth 1 | sort -V | tail -n 1)
  if [ -n "$NODE_LATEST" ]; then
    export PATH="$NODE_LATEST/bin:$PATH"
  fi
fi

# 2. 确保 cloudflared 穿透核心存在 (若不存在则自动下载)
if [ ! -f "./bin/cloudflared" ]; then
  echo "📥 正在初始化 Cloudflare 穿透引擎..."
  mkdir -p bin
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz"
  else
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"
  fi
  curl -fsSL "$CF_URL" -o bin/cloudflared.tgz && tar -xzf bin/cloudflared.tgz -C bin && rm bin/cloudflared.tgz && chmod +x bin/cloudflared
fi

# 3. 检查 Next.js 生产包
if [ ! -d ".next" ]; then
  echo "📦 正在执行首次生产构建，请稍候..."
  npm run build
fi

PORT=3000
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -n 1 | awk '{print $2}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="127.0.0.1"
fi

# 清理可能被占用的端口
lsof -ti :$PORT | xargs kill -9 2>/dev/null

echo "========================================================"
echo "🚀 正在启动 贝壳云图 (公网内网穿透模式)..."
echo "========================================================"

# 4. 后台启动 Next.js 生产服务
npm run start:lan > /dev/null 2>&1 &
SERVER_PID=$!

# 退出时清理所有后台进程
cleanup() {
  echo ""
  echo "🛑 正在关闭公网隧道与工作台服务..."
  kill $SERVER_PID 2>/dev/null
  if [ -n "$TUNNEL_PID" ]; then
    kill $TUNNEL_PID 2>/dev/null
  fi
  pkill -P $$ 2>/dev/null
  echo "✨ 已安全退出！"
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 5. 等待本地服务就绪
echo "⏳ 正在建立 Cloudflare 全球加密隧道..."
for i in {1..30}; do
  if curl -s "http://127.0.0.1:$PORT" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# 6. 启动 Cloudflare Tunnel 并实时捕获公网 URL
TUNNEL_LOG=$(mktemp)
./bin/cloudflared tunnel --url "http://localhost:$PORT" > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

PUBLIC_URL=""
for i in {1..40}; do
  PUBLIC_URL=$(grep -o 'https://[-a-zA-Z0-9@:%._\+~#=]*.trycloudflare.com' "$TUNNEL_LOG" | head -n 1)
  if [ -n "$PUBLIC_URL" ]; then
    break
  fi
  sleep 0.5
done

echo ""
echo "========================================================"
echo "🎉 公网穿透成功！已开启全球 HTTPS 安全访问通道"
echo "========================================================"
echo ""
if [ -n "$PUBLIC_URL" ]; then
  echo "🌐 【公网远程访问链接】(发给异地同事/微信/手机皆可打开):"
  echo "👉 \033[1;32m$PUBLIC_URL\033[0m"
else
  echo "⚠️ 正在生成公网链接中，请稍候查看日志..."
fi
echo ""
echo "📱 【同 Wi-Fi 局域网地址】: http://${LOCAL_IP}:${PORT}"
echo "💻 【您本机专用地址】:     http://localhost:${PORT}"
echo ""
echo "========================================================"
echo "💡 提示：保持本终端窗口开启即可持续提供公网访问。按 [Ctrl + C] 可退出关闭。"
echo "========================================================"
echo ""

# 保持前台等待或查看隧道状态
wait $TUNNEL_PID
