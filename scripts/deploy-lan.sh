#!/usr/bin/env bash
#
# Deploy Buildings Manager to LAN server at 10.25.236.179
#
# Usage:
#   bash scripts/deploy-lan.sh
#
# Requirements:
#   - sshpass installed (winget install xhcoding.sshpass-win32 on Windows)
#   - Node.js 20+ for frontend build
#   - Access to LAN network (10.25.236.x)
#
# Credentials: BenyK / BenyK  (SSH into 10.25.236.179)
#
set -e

REMOTE_HOST="10.25.236.179"
REMOTE_USER="BenyK"
REMOTE_PASS="BenyK"
APP_DIR="/home/BenyK/buildingsmanager"
WEB_ROOT="/var/www/buildingsmanager"
SERVICE="buildingsmanager-lan.service"

# Cross-platform SSH/SCP helpers
SSH_CMD() { sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "$@"; }
SCP_CMD() { sshpass -p "$REMOTE_PASS" scp -o StrictHostKeyChecking=no "$1" "$REMOTE_USER@$REMOTE_HOST:$2"; }
SUDO_SSH() { sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "echo $REMOTE_PASS | sudo -S $*"; }

echo "=============================="
echo "  LAN deploy → $REMOTE_HOST"
echo "=============================="

# 1) Build frontend locally
echo "[1/4] Building frontend..."
npm run build 2>&1 | tail -3

# 2) Package and transfer
echo "[2/4] Packaging and uploading..."
tar -czf /tmp/bm-lan-deploy.tar.gz dist/ backend/app/ backend/requirements.txt
SCP_CMD /tmp/bm-lan-deploy.tar.gz /home/BenyK/bm-lan-latest.tar.gz
rm /tmp/bm-lan-deploy.tar.gz

# 3) Extract and deploy on server
echo "[3/4] Deploying on server..."
SSH_CMD "
set -e
mkdir -p /tmp/bm-deploy-tmp
tar -xzf /home/BenyK/bm-lan-latest.tar.gz -C /tmp/bm-deploy-tmp 2>/dev/null || true

# Deploy frontend
echo $REMOTE_PASS | sudo -S bash -c '
  cp -r /tmp/bm-deploy-tmp/dist/. $WEB_ROOT/
  chown -R nginx:nginx $WEB_ROOT 2>/dev/null || true
'

# Deploy backend
cp -r /tmp/bm-deploy-tmp/backend/app/. $APP_DIR/backend/app/

rm -rf /tmp/bm-deploy-tmp
echo deployed
" 2>&1

# 4) Restart service
echo "[4/4] Restarting $SERVICE..."
SUDO_SSH "systemctl restart $SERVICE; sleep 3; systemctl is-active $SERVICE"

echo ""
echo "=============================="
echo "  http://$REMOTE_HOST/"
echo "=============================="
