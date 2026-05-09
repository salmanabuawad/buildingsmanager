#!/bin/bash
# Deploy script for profile.wavelync.com
# Usage:
#   ./deploy.sh          → full deploy (build frontend + backend)
#   ./deploy.sh backend  → backend only (no build, instant)
#   ./deploy.sh frontend → frontend build + deploy only

set -e

REMOTE_USER="root"
REMOTE_HOST="profile.wavelync.com"
REMOTE_APP_DIR="/home/profilegroup/app"
REMOTE_WEB_ROOT="/var/www/buildingsmanager"
SSH_KEY="$HOME/.ssh/id_ed25519"
UVICORN_PID_CMD="pgrep -u profilegroup -f 'uvicorn app.main:app' | head -1"

BACKEND_FILES=(
  "backend/app/routers/data.py"
  "backend/app/routers/assets.py"
  "backend/app/routers/buildings.py"
  "backend/app/routers/auth.py"
  "backend/app/routers/audit.py"
  "backend/app/routers/files.py"
  "backend/app/routers/asset_types.py"
  "backend/app/routers/users.py"
  "backend/app/routers/change_log.py"
  "backend/app/services/workflow_service.py"
  "backend/app/main.py"
  "backend/app/models.py"
  "backend/app/schemas.py"
  "backend/app/auth.py"
  "backend/app/database.py"
  "backend/app/config.py"
)

MODE="${1:-full}"

ssh_run() {
  ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"
}

scp_file() {
  scp -i "$SSH_KEY" "$1" "$REMOTE_USER@$REMOTE_HOST:$2"
}

deploy_frontend() {
  echo "[frontend] Building..."
  npm run build
  echo "[frontend] Deploying..."
  ssh_run "rm -rf $REMOTE_WEB_ROOT/assets && mkdir -p $REMOTE_WEB_ROOT/assets"
  scp -i "$SSH_KEY" -r dist/assets/* "$REMOTE_USER@$REMOTE_HOST:$REMOTE_WEB_ROOT/assets/"
  scp_file "dist/index.html" "$REMOTE_WEB_ROOT/index.html"
  for f in dist/*.js dist/*.svg dist/*.ico dist/*.png dist/*.txt; do
    [ -f "$f" ] && scp_file "$f" "$REMOTE_WEB_ROOT/"
  done
  echo "[frontend] Done."
}

deploy_backend() {
  echo "[backend] Deploying files..."
  for FILE in "${BACKEND_FILES[@]}"; do
    LOCAL="$FILE"
    REMOTE="$REMOTE_APP_DIR/$FILE"
    REMOTE_DIR=$(dirname "$REMOTE")
    ssh_run "mkdir -p $REMOTE_DIR"
    scp_file "$LOCAL" "$REMOTE" 2>/dev/null || echo "  (skipped: $FILE)"
  done
  PID=$(ssh_run "$UVICORN_PID_CMD" 2>/dev/null || true)
  if [ -n "$PID" ]; then
    ssh_run "kill -HUP $PID"
    echo "[backend] Reloaded (PID $PID)."
  else
    echo "[backend] WARNING: uvicorn PID not found."
  fi
}

echo "=== Deploy: $MODE ==="

case "$MODE" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  *)        deploy_frontend && deploy_backend ;;
esac

echo "=== Done ==="
