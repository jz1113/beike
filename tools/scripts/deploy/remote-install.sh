#!/usr/bin/env bash
# 从本机把仓库同步到 Ubuntu 服务器并执行 bootstrap。
# 用法：
#   BEIKE_SSH_HOST=1.2.3.4 BEIKE_SSH_USER=root BEIKE_SSH_PORT=22 ./tools/scripts/deploy/remote-install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HOST="${BEIKE_SSH_HOST:-}"
USER="${BEIKE_SSH_USER:-root}"
PORT="${BEIKE_SSH_PORT:-22}"
REMOTE_DIR="${BEIKE_REMOTE_DIR:-/opt/beike}"
PASS="${BEIKE_SSH_PASS:-}"

if [[ -z "$HOST" ]]; then
  echo "未设置 BEIKE_SSH_HOST。请先按 deploy/README.md 在椰子云控制台抄下公网 IP。"
  exit 2
fi

ssh_base=(ssh -p "$PORT" -o StrictHostKeyChecking=accept-new)
scp_base=(scp -P "$PORT" -o StrictHostKeyChecking=accept-new)
rsync_e="ssh -p $PORT -o StrictHostKeyChecking=accept-new"

if [[ -n "$PASS" ]]; then
  export SSHPASS="$PASS"
  WRAP="$ROOT/tools/scripts/deploy/ssh-pass.exp"
  CM="${BEIKE_SSH_CONTROL_PATH:-/tmp/beike-ssh-cm}"
  rm -f "$CM"
  AUTH_OPTS=(-o PreferredAuthentications=password -o PubkeyAuthentication=no)
  if command -v expect >/dev/null 2>&1 && [[ -f "$WRAP" ]]; then
    expect "$WRAP" ssh -p "$PORT" -o StrictHostKeyChecking=accept-new "${AUTH_OPTS[@]}" \
      -o ControlMaster=yes -o ControlPath="$CM" -o ControlPersist=600 \
      "$USER@$HOST" 'true'
  elif command -v sshpass >/dev/null 2>&1; then
    sshpass -e ssh -p "$PORT" -o StrictHostKeyChecking=accept-new "${AUTH_OPTS[@]}" \
      -o ControlMaster=yes -o ControlPath="$CM" -o ControlPersist=600 \
      "$USER@$HOST" 'true'
  else
    echo "本机缺少 sshpass / expect，无法用密码登录。"
    exit 3
  fi
  ssh_base=(ssh -p "$PORT" -o ControlPath="$CM" -o ControlMaster=no)
  scp_base=(scp -P "$PORT" -o ControlPath="$CM" -o ControlMaster=no)
  rsync_e="ssh -p $PORT -o ControlPath=$CM -o ControlMaster=no"
fi

SSH=("${ssh_base[@]}" "$USER@$HOST")
RSYNC=(rsync -az --delete --exclude node_modules --exclude .git --exclude apps/desktop/target --exclude .local)

echo "同步代码到 $USER@$HOST:$REMOTE_DIR"
"${SSH[@]}" "mkdir -p $REMOTE_DIR"
"${RSYNC[@]}" -e "$rsync_e" "$ROOT/" "$USER@$HOST:$REMOTE_DIR/"

if [[ -f "$ROOT/.local/deploy-backup/azhuo.db" ]]; then
  echo "上传数据库备份"
  "${scp_base[@]}" "$ROOT/.local/deploy-backup/azhuo.db" "$USER@$HOST:/tmp/azhuo.db"
fi

"${SSH[@]}" "BEIKE_WEB_USER='${BEIKE_WEB_USER:-beike}' BEIKE_WEB_PASS='${BEIKE_WEB_PASS:-}' bash $REMOTE_DIR/deploy/bootstrap-ubuntu.sh"
"${SSH[@]}" "if [[ -f /tmp/azhuo.db ]]; then mv /tmp/azhuo.db /var/lib/beike/azhuo.db; chown beike:beike /var/lib/beike/azhuo.db; fi"
"${SSH[@]}" "sudo -u beike -H bash -lc 'cd $REMOTE_DIR && pnpm install && pnpm run build:ui'"
"${SSH[@]}" "systemctl restart beike && systemctl --no-pager --full status beike"

echo "部署完成，请浏览器打开 http://$HOST/"
