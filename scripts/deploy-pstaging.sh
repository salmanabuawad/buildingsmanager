#!/usr/bin/env bash
#
# Deploy to pstaging.wavelync.com (185.229.226.37).
#
# - Rebuilds on the server from the current branch of this worktree
# - Deploys frontend to /var/www/buildingsmanager_pstaging
# - Copies changed backend files to /home/profilestaging/app/backend
# - Reloads the pstaging uvicorn (port 8006)
#
# Usage:
#   bash scripts/deploy-pstaging.sh            # deploy current HEAD
#

set -e

REMOTE_USER="root"
REMOTE_HOST="185.229.226.37"
SSH_KEY="$HOME/.ssh/id_ed25519"
WEB_ROOT="/var/www/buildingsmanager_pstaging"
APP_DIR="/home/profilestaging/app"
SERVICE="buildingsmanager-pstaging.service"

ssh_run() { ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"; }

echo "=============================="
echo "  pstaging deploy"
echo "=============================="

# 1) Send working tree as tarball so the server can build from it
echo "[1/4] Sending source tarball + building on server..."
git archive --format=tar HEAD | ssh_run '
set -e
BUILD_DIR=/root/bm-build-pstaging
rm -rf "$BUILD_DIR" && mkdir -p "$BUILD_DIR" && cd "$BUILD_DIR" && tar -x
npm ci --prefer-offline --no-audit --no-fund 2>&1 | tail -2
npm run build 2>&1 | tail -3
'

# 2) Deploy frontend
echo "[2/4] Copying dist -> $WEB_ROOT"
ssh_run "
set -e
rm -rf $WEB_ROOT/assets
mkdir -p $WEB_ROOT/assets
cp -r /root/bm-build-pstaging/dist/assets/. $WEB_ROOT/assets/
cp /root/bm-build-pstaging/dist/index.html $WEB_ROOT/index.html
for f in /root/bm-build-pstaging/dist/*.js /root/bm-build-pstaging/dist/*.svg /root/bm-build-pstaging/dist/*.ico /root/bm-build-pstaging/dist/*.png; do
  [ -f \"\$f\" ] && cp \"\$f\" $WEB_ROOT/
done
"

# 3) Sync backend code (only app tree)
echo "[3/4] Copying backend/app -> $APP_DIR/backend/app"
ssh_run "rsync -a --delete /root/bm-build-pstaging/backend/app/ $APP_DIR/backend/app/ && chown -R profilestaging:profilestaging $APP_DIR/backend/app"

# 4) Reload uvicorn
echo "[4/4] Reloading $SERVICE"
ssh_run "systemctl restart $SERVICE && sleep 3 && systemctl is-active $SERVICE"

echo ""
echo "=============================="
echo "  pstaging: https://pstaging.wavelync.com/"
echo "=============================="
