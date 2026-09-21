#!/usr/bin/env bash
# Ubuntu 22.04/24.04 一键安装 Node 20、pnpm、Nginx，并落好地目录。
# 用法（在服务器上、仓库已放到 /opt/beike 之后）：
#   sudo bash /opt/beike/deploy/bootstrap-ubuntu.sh
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/beike}"
DATA_DIR="${DATA_DIR:-/var/lib/beike}"
SITE_USER="${SITE_USER:-beike}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请用 root 运行：sudo bash $0"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git nginx apache2-utils rsync

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10.13.1
fi

id -u "$SITE_USER" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$SITE_USER"

mkdir -p "$DATA_DIR/storage" "$DATA_DIR/database-backups"
if [[ ! -f "$DATA_DIR/.env" && -f "$REPO_DIR/deploy/env.production.example" ]]; then
  cp "$REPO_DIR/deploy/env.production.example" "$DATA_DIR/.env"
  echo "已写入 $DATA_DIR/.env ，请立刻填入 LOCAL_ACCESS_TOKEN 与 AI_DRAWING_API_KEY"
fi

chown -R "$SITE_USER:$SITE_USER" "$DATA_DIR"
if [[ -d "$REPO_DIR" ]]; then
  chown -R "$SITE_USER:$SITE_USER" "$REPO_DIR"
fi

install -m 644 "$REPO_DIR/deploy/beike.service" /etc/systemd/system/beike.service
install -m 644 "$REPO_DIR/deploy/nginx.conf.example" /etc/nginx/sites-available/beike
ln -sfn /etc/nginx/sites-available/beike /etc/nginx/sites-enabled/beike
rm -f /etc/nginx/sites-enabled/default

if [[ ! -f /etc/nginx/.htpasswd ]]; then
  WEB_USER="${BEIKE_WEB_USER:-beike}"
  WEB_PASS="${BEIKE_WEB_PASS:-}"
  if [[ -z "$WEB_PASS" ]]; then
    WEB_PASS="$(openssl rand -base64 18)"
    echo "已生成网页访问密码，请自行记下："
    echo "  用户名: $WEB_USER"
    echo "  密码:   $WEB_PASS"
  fi
  htpasswd -bc /etc/nginx/.htpasswd "$WEB_USER" "$WEB_PASS"
fi

nginx -t
systemctl daemon-reload
systemctl enable nginx beike
systemctl reload nginx

echo
echo "目录已就绪。接下来在 $REPO_DIR 执行："
echo "  sudo -u $SITE_USER -H bash -lc 'cd $REPO_DIR && pnpm install && pnpm run build:ui'"
echo "  sudo systemctl start beike"
echo "然后把本机 .local/deploy-backup/azhuo.db 拷到 $DATA_DIR/azhuo.db"
