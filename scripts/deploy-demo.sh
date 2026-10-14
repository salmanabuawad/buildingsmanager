#!/usr/bin/env bash
#
# Update the demo copy at  https://profile-group.co.il/demo/  with the
# committed HEAD of this repo. The demo must already exist (see
# scripts/clone-to-demo.sh, which provisions it once).
#
# Only code is replaced. NOT touched: the demo DB (buildingsmanager_demo),
# uploads / asset files, the demo backend .env, nginx, and production.
#
# Usage (from Git Bash at the repo root, on the LAN/VPN):
#   bash scripts/deploy-demo.sh            # frontend + backend
#   bash scripts/deploy-demo.sh frontend   # frontend only
#   bash scripts/deploy-demo.sh backend    # backend only
# You'll be prompted for BenyK's sudo password once (unless NOPASSWD is set).
#
# Uncommitted changes are NOT deployed (git archive HEAD) — commit first.
#

set -e

MODE="${1:-full}"
case "$MODE" in
  full|frontend|backend) ;;
  *) echo "Usage: $0 [full|frontend|backend]" >&2; exit 1 ;;
esac

REMOTE_USER="BenyK"
REMOTE_HOST="10.25.236.179"
SSH_KEY="$HOME/.ssh/id_ed25519"
NODE_HOME="/home/BenyK/node20"
BUILD_DIR="/var/tmp/bm-build-demo"
REMOTE_SCRIPT="/var/tmp/bm-deploy-demo-remote.sh"

ssh_run() { ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"; }
ssh_tty() { ssh -t -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"; }

SHA="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "WARNING: uncommitted changes are NOT included — deploying HEAD ($SHA) only."
fi

echo "======================================"
echo "  Deploy $SHA → demo ($MODE)"
echo "  → https://profile-group.co.il/demo/"
echo "======================================"

# 1) Stream HEAD to the LAN box; build the frontend there with base /demo/.
echo "[1/2] Streaming source$([ "$MODE" != backend ] && echo ' + building frontend with base /demo/')..."
git archive --format=tar HEAD | ssh_run "set -e
rm -rf $BUILD_DIR && mkdir -p $BUILD_DIR && cd $BUILD_DIR && tar -x
if [ '$MODE' != backend ]; then
  export PATH=$NODE_HOME/bin:\$PATH
  npm ci --prefer-offline --no-audit --no-fund 2>&1 | tail -2
  VITE_API_BASE_URL=/demo npx vite build --base=/demo/ 2>&1 | tail -3
  # index.html loads config.js via a plain <script>, which Vite doesn't rebase.
  sed -i 's#src=\"/config.js\"#src=\"/demo/config.js\"#' dist/index.html
  cat > dist/config.js <<'JS'
// Demo copy: API lives under /demo/api/ (nginx → buildingsmanager-demo on :8008).
window.__APP_CONFIG__ = window.__APP_CONFIG__ || { apiBaseUrl: '/demo' };
JS
  test -s dist/index.html
  rm -rf node_modules
fi"

# 2) Install as root: copy code into the demo dirs and restart the demo service.
echo "[2/2] Uploading install script..."
ssh_run "cat > $REMOTE_SCRIPT" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail

MODE="$1"
BUILD_DIR="/var/tmp/bm-build-demo"
APP_USER="BenyK"
DEMO_APP="/DATA/buildingsmanager_demo/app/backend"
DEMO_WEB="/var/www/buildingsmanager_demo"
DEMO_PORT=8008
DEMO_SERVICE="buildingsmanager-demo.service"

# Refuse to run against a demo that was never provisioned.
[ -f "$DEMO_APP/.env" ] || { echo "Demo not provisioned ($DEMO_APP/.env missing) — run scripts/clone-to-demo.sh first." >&2; exit 1; }
systemctl cat "$DEMO_SERVICE" >/dev/null 2>&1 || { echo "$DEMO_SERVICE not found — run scripts/clone-to-demo.sh first." >&2; exit 1; }

if [ "$MODE" != frontend ]; then
  echo "[APP] Updating backend code (.env kept)..."
  rsync -a --delete "$BUILD_DIR/backend/app/" "$DEMO_APP/app/"
  cp "$BUILD_DIR/backend/requirements.txt" "$DEMO_APP/" 2>/dev/null || true
  chown -R "$APP_USER:$APP_USER" "$DEMO_APP"
  systemctl restart "$DEMO_SERVICE"
fi

if [ "$MODE" != backend ]; then
  echo "[WEB] Deploying frontend → $DEMO_WEB..."
  rsync -a --delete "$BUILD_DIR/dist/" "$DEMO_WEB/"
  chown -R nginx:nginx "$DEMO_WEB" 2>/dev/null || true
  command -v restorecon >/dev/null && restorecon -R "$DEMO_WEB" || true
fi

# ── Verify ────────────────────────────────────────────────────────────────────
sleep 3
echo -n "  $DEMO_SERVICE:       "; systemctl is-active "$DEMO_SERVICE" || true
echo -n "  backend /api/ direct:  "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:$DEMO_PORT/api/asset-types" || true
echo -n "  /demo/ via nginx:      "; curl -sk -o /dev/null -w "%{http_code}\n" -H "Host: profile-group.co.il" http://127.0.0.1/demo/ || true
echo -n "  /demo/api/ via nginx:  "; curl -sk -o /dev/null -w "%{http_code}\n" -H "Host: profile-group.co.il" http://127.0.0.1/demo/api/asset-types || true

rm -rf "$BUILD_DIR"
REMOTE

echo "Running install (sudo password may be prompted)..."
ssh_tty "sudo bash $REMOTE_SCRIPT $MODE; rc=\$?; rm -f $REMOTE_SCRIPT; exit \$rc"

echo
echo "======================================"
echo "  Deployed $SHA → https://profile-group.co.il/demo/"
echo "======================================"
