#!/usr/bin/env bash
# Enable HTTPS after DNS points at this server and HTTP bootstrap is working.
set -euo pipefail
DOMAIN="${1:-}"
EMAIL="${2:-}"
REPO_DIR="${REPO_DIR:-/opt/beike}"
if [[ "$(id -u)" -ne 0 || ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ || "$DOMAIN" != *.* || -z "$EMAIL" ]]; then
  echo "用法: sudo bash tools/deploy/enable-https.sh <域名> <证书通知邮箱>" >&2
  exit 1
fi
certbot certonly --webroot -w /var/www/html --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN"
sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__REPO_DIR__|$REPO_DIR|g" \
  "$REPO_DIR/tools/deploy/nginx.https.conf.example" > /etc/nginx/sites-available/beike-domain
ln -sfn /etc/nginx/sites-available/beike-domain /etc/nginx/sites-enabled/beike-domain
nginx -t
systemctl reload nginx
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/beike-nginx.sh <<'HOOK'
#!/usr/bin/env bash
systemctl reload nginx
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/beike-nginx.sh
echo "HTTPS 已启用：https://$DOMAIN/；更新 PUBLIC_WEB_ORIGIN 后重启 beike 服务。"
