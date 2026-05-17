#!/usr/bin/env bash
#
# Deploy Buildings Manager to LAN server at 10.25.236.179 (profile-group.co.il).
#
# - Streams current git HEAD to the LAN box (no local npm/Node needed)
# - Auto-installs a portable Node 20 in ~BenyK/node20 on first run
# - Builds on the LAN box itself (in /var/tmp/bm-build-lan because /home is tiny)
# - Deploys frontend to /var/www/buildingsmanager (world-writable, no sudo)
# - Syncs backend/app to ~/buildingsmanager/backend/app
# - Restarts buildingsmanager-lan.service (interactive sudo prompt if needed)
#
# Usage:
#   bash scripts/deploy-lan.sh
#
# One-time prerequisites:
#   1) Your pubkey in BenyK@10.25.236.179:~/.ssh/authorized_keys
#        ssh BenyK@10.25.236.179 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && \
#          echo '<your_pubkey>' >> ~/.ssh/authorized_keys && \
#          chmod 600 ~/.ssh/authorized_keys"
#   2) Host key in known_hosts (one-off):
#        ssh-keyscan -t ed25519,rsa 10.25.236.179 >> ~/.ssh/known_hosts
#   3) (Optional, for fully unattended restart) NOPASSWD for the one
#      systemctl unit. On the LAN box, ONE TIME:
#        echo 'BenyK ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart buildingsmanager-lan.service, /usr/bin/systemctl is-active buildingsmanager-lan.service' | \
#          sudo tee /etc/sudoers.d/benyk-bm-restart && sudo chmod 440 /etc/sudoers.d/benyk-bm-restart
#      Without this the script's restart step will prompt for BenyK's
#      password interactively (still works, just not unattended).
#

set -e

REMOTE_USER="BenyK"
REMOTE_HOST="10.25.236.179"
SSH_KEY="$HOME/.ssh/id_ed25519"
WEB_ROOT="/var/www/buildingsmanager"
APP_DIR="/home/BenyK/buildingsmanager"
SERVICE="buildingsmanager-lan.service"
NODE_HOME="/home/BenyK/node20"
NODE_VERSION="v20.18.0"
BUILD_DIR="/var/tmp/bm-build-lan"

ssh_run()  { ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"; }
ssh_tty()  { ssh -t -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"; }

echo "=============================="
echo "  LAN deploy → $REMOTE_HOST"
echo "  (https://profile-group.co.il/)"
echo "=============================="

# 1) Ensure portable Node is present on the LAN box (idempotent).
echo "[1/5] Ensuring portable Node $NODE_VERSION in $NODE_HOME..."
ssh_run "set -e
if [ -x $NODE_HOME/bin/node ]; then
  echo '  already present: '\$($NODE_HOME/bin/node --version)
else
  mkdir -p $NODE_HOME && cd $NODE_HOME
  curl -sfL https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz -o node.tar.xz
  tar -xJf node.tar.xz --strip-components=1
  rm node.tar.xz
  echo '  installed: '\$($NODE_HOME/bin/node --version)
fi"

# 2) Stream source + build remotely (build dir lives in /var/tmp because
#    /home is only 448M and node_modules is ~400M).
echo "[2/5] Streaming source + building remotely..."
git archive --format=tar HEAD | ssh_run "set -e
export PATH=$NODE_HOME/bin:\$PATH
rm -rf $BUILD_DIR && mkdir -p $BUILD_DIR && cd $BUILD_DIR && tar -x
npm ci --prefer-offline --no-audit --no-fund 2>&1 | tail -2
npm run build 2>&1 | tail -3"

# 3) Deploy frontend → web root.
echo "[3/5] Deploying dist → $WEB_ROOT..."
ssh_run "set -e
rm -rf $WEB_ROOT/assets
mkdir -p $WEB_ROOT/assets
cp -r $BUILD_DIR/dist/assets/. $WEB_ROOT/assets/
cp $BUILD_DIR/dist/index.html $WEB_ROOT/index.html
for f in $BUILD_DIR/dist/*.js $BUILD_DIR/dist/*.svg $BUILD_DIR/dist/*.ico $BUILD_DIR/dist/*.png; do
  [ -f \"\$f\" ] && cp \"\$f\" $WEB_ROOT/
done"

# 4) Sync backend/app and clean build dir.
echo "[4/5] Syncing backend/app → $APP_DIR/backend/app + cleaning build dir..."
ssh_run "set -e
rsync -a --delete $BUILD_DIR/backend/app/ $APP_DIR/backend/app/
rm -rf $BUILD_DIR"

# 5) Restart the service. If NOPASSWD is configured (see prereq #3 in the
#    header) this is silent; otherwise BenyK's password is prompted on
#    your terminal.
echo "[5/5] Restarting $SERVICE..."
if ssh_run "sudo -n systemctl restart $SERVICE && sudo -n systemctl is-active $SERVICE" 2>/dev/null; then
  echo "  restarted (passwordless sudo)"
else
  echo "  passwordless sudo not configured — prompting for BenyK password:"
  ssh_tty "sudo systemctl restart $SERVICE && sudo systemctl is-active $SERVICE"
fi

cat <<EOF

==============================
  https://profile-group.co.il/
==============================
EOF
