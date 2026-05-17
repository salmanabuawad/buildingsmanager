#!/usr/bin/env bash
#
# Deploy Buildings Manager to LAN server at 10.25.236.179 (profile-group.co.il)
# using SSH key auth — no sshpass, no local npm.
#
# Stream-builds on the LAN box itself using a portable Node 20 in BenyK's
# home dir, so the only thing the deploying machine needs is `git`, `ssh`,
# and an authorized key on `BenyK@10.25.236.179`.
#
# Usage:
#   bash scripts/deploy-lan-key.sh
#
# Prerequisites (one-time setup):
#   1. Your pubkey is in `BenyK@10.25.236.179:~/.ssh/authorized_keys`
#   2. `10.25.236.179` is in your `~/.ssh/known_hosts` (run `ssh-keyscan -t
#      ed25519,rsa 10.25.236.179 >> ~/.ssh/known_hosts` once)
#
# What this does on the remote box:
#   - Downloads Node 20 to `~/BenyK/node20` on first run (~75MB)
#   - Builds in `/var/tmp/bm-build-lan` (LAN /home is only 448M; /var has 4G)
#   - Deploys dist to `/var/www/buildingsmanager` (world-writable, no sudo)
#   - Syncs backend/app to `~/buildingsmanager/backend/app` (BenyK-owned)
#   - Cleans up the build dir
#
# After this script: `sudo systemctl restart buildingsmanager-lan.service`
# (the restart needs sudo password — script does not attempt to automate it).
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

ssh_run() { ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"; }

echo "=============================="
echo "  LAN deploy → $REMOTE_HOST"
echo "  (profile-group.co.il)"
echo "=============================="

# 1) Ensure portable Node is present on the LAN box (idempotent).
echo "[1/4] Ensuring portable Node $NODE_VERSION in $NODE_HOME..."
ssh_run "set -e
if [ -x $NODE_HOME/bin/node ]; then
  echo \"  already present: \$($NODE_HOME/bin/node --version)\"
else
  mkdir -p $NODE_HOME && cd $NODE_HOME
  curl -sfL https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz -o node.tar.xz
  tar -xJf node.tar.xz --strip-components=1
  rm node.tar.xz
  echo \"  installed: \$($NODE_HOME/bin/node --version)\"
fi"

# 2) Stream current git HEAD to remote, build, deploy.
echo "[2/4] Streaming source + building remotely..."
git archive --format=tar HEAD | ssh_run "set -e
export PATH=$NODE_HOME/bin:\$PATH
rm -rf $BUILD_DIR && mkdir -p $BUILD_DIR && cd $BUILD_DIR && tar -x
npm ci --prefer-offline --no-audit --no-fund 2>&1 | tail -2
npm run build 2>&1 | tail -3"

# 3) Deploy frontend + backend.
echo "[3/4] Deploying dist → $WEB_ROOT and backend/app → $APP_DIR/backend/app..."
ssh_run "set -e
rm -rf $WEB_ROOT/assets
mkdir -p $WEB_ROOT/assets
cp -r $BUILD_DIR/dist/assets/. $WEB_ROOT/assets/
cp $BUILD_DIR/dist/index.html $WEB_ROOT/index.html
for f in $BUILD_DIR/dist/*.js $BUILD_DIR/dist/*.svg $BUILD_DIR/dist/*.ico $BUILD_DIR/dist/*.png; do
  [ -f \"\$f\" ] && cp \"\$f\" $WEB_ROOT/
done
rsync -a --delete $BUILD_DIR/backend/app/ $APP_DIR/backend/app/"

# 4) Clean up build dir on the LAN box (it's ~500MB and /var only has 4G).
echo "[4/4] Cleaning $BUILD_DIR..."
ssh_run "rm -rf $BUILD_DIR"

cat <<EOF

==============================
  Files deployed successfully.
==============================

  Frontend: https://profile-group.co.il/
  Backend code synced; service NOT yet restarted.

  Run this on the LAN box (password \`BenyK\`):
    sudo systemctl restart $SERVICE

EOF
