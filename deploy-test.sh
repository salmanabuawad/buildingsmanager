#!/bin/bash
# Deploy script for TEST environment at test.profile.wavelync.com
# Backend: port 8005  |  DB: buildingsmanager_test  |  User: profiletest

set -e

REMOTE_USER="root"
REMOTE_HOST="profile.wavelync.com"
REMOTE_APP_DIR="/home/profiletest/app"
REMOTE_WEB_ROOT="/var/www/buildingsmanager_test"
SSH_KEY="$HOME/.ssh/id_ed25519"
UVICORN_SERVICE="buildingsmanager-test"

BACKEND_FILES=(
  "backend/app/routers/data.py"
  "backend/app/routers/assets.py"
  "backend/app/routers/buildings.py"
  "backend/app/routers/auth.py"
  "backend/app/routers/audit.py"
  "backend/app/routers/files.py"
  "backend/app/routers/asset_types.py"
  "backend/app/routers/inspection_tasks.py"
  "backend/app/routers/users.py"
  "backend/app/services/workflow_service.py"
  "backend/app/main.py"
  "backend/app/models.py"
  "backend/app/schemas.py"
  "backend/app/auth.py"
  "backend/app/database.py"
  "backend/app/config.py"
)

ssh_run() {
  ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"
}

scp_file() {
  scp -i "$SSH_KEY" "$1" "$REMOTE_USER@$REMOTE_HOST:$2"
}

echo "======================================"
echo "  BuildingsManager TEST Deployment"
echo "  → test.profile.wavelync.com"
echo "======================================"
echo ""

# --- Frontend ---
echo "[1/3] Building frontend..."
npm run build
echo "      Build complete."

echo "[2/3] Deploying frontend to test server..."
ssh_run "rm -rf $REMOTE_WEB_ROOT/assets && mkdir -p $REMOTE_WEB_ROOT/assets"
scp -i "$SSH_KEY" -r dist/assets/* "$REMOTE_USER@$REMOTE_HOST:$REMOTE_WEB_ROOT/assets/"
scp_file "dist/index.html" "$REMOTE_WEB_ROOT/index.html"
for f in dist/*.js dist/*.svg dist/*.ico dist/*.png dist/*.txt; do
  [ -f "$f" ] && scp_file "$f" "$REMOTE_WEB_ROOT/"
done
echo "      Frontend deployed."

# --- Backend ---
echo "[3/3] Deploying backend files to test server..."
for FILE in "${BACKEND_FILES[@]}"; do
  LOCAL="$FILE"
  REMOTE="$REMOTE_APP_DIR/$FILE"
  REMOTE_DIR=$(dirname "$REMOTE")
  ssh_run "mkdir -p $REMOTE_DIR"
  scp_file "$LOCAL" "$REMOTE" 2>/dev/null || echo "      (skipped: $FILE — not found locally)"
done

echo "      Restarting test service..."
ssh_run "systemctl restart $UVICORN_SERVICE"
sleep 2
ssh_run "systemctl is-active $UVICORN_SERVICE" && \
  echo "      Service restarted OK." || \
  echo "      WARNING: service may not have started — check journalctl -u $UVICORN_SERVICE"

echo ""
echo "======================================"
echo "  Test deployment complete!"
echo "  URL: http://test.profile.wavelync.com"
echo "  API: http://test.profile.wavelync.com/api/"
echo "======================================"
