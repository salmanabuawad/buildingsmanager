#!/usr/bin/env bash
#
# Deploy to profile.wavelync.com (production).
#
# - Sends current git HEAD as tarball, builds on server
# - Deploys frontend to /var/www/buildingsmanager
# - Syncs backend/app to /home/profilegroup/app/backend/app
# - Restarts buildingsmanager.service
#
# Usage:
#   bash scripts/deploy-profile.sh
#

set -e

REMOTE_USER="root"
REMOTE_HOST="profile.wavelync.com"
SSH_KEY="$HOME/.ssh/id_ed25519"
WEB_ROOT="/var/www/buildingsmanager"
APP_DIR="/home/profilegroup/app"
SERVICE="buildingsmanager.service"

ssh_run() { ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"; }

echo "=============================="
echo "  profile.wavelync.com deploy"
echo "=============================="

# 1) Send working tree as tarball and build on server
echo "[1/4] Sending source tarball + building on server..."
git archive --format=tar HEAD | ssh_run '
set -e
BUILD_DIR=/root/bm-build-profile
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
cp -r /root/bm-build-profile/dist/assets/. $WEB_ROOT/assets/
cp /root/bm-build-profile/dist/index.html $WEB_ROOT/index.html
for f in /root/bm-build-profile/dist/*.js /root/bm-build-profile/dist/*.svg /root/bm-build-profile/dist/*.ico /root/bm-build-profile/dist/*.png; do
  [ -f \"\$f\" ] && cp \"\$f\" $WEB_ROOT/
done
"

# 3) Sync backend code (only app tree)
echo "[3/4] Copying backend/app -> $APP_DIR/backend/app"
ssh_run "rsync -a --delete /root/bm-build-profile/backend/app/ $APP_DIR/backend/app/ && chown -R profilegroup:profilegroup $APP_DIR/backend/app"

# 4) Restart service
echo "[4/4] Restarting $SERVICE"
ssh_run "systemctl restart $SERVICE && sleep 3 && systemctl is-active $SERVICE"

echo ""
echo "=============================="
echo "  https://profile.wavelync.com/"
echo "=============================="
