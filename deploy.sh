#!/bin/bash
# Deploy script for profile.wavelync.com remote server

set -e

REMOTE_USER="root"
REMOTE_HOST="profile.wavelync.com"
REMOTE_APP_DIR="/home/profilegroup/app"
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

echo "=============================="
echo "  BuildingsManager Deployment"
echo "=============================="
echo ""

# --- Frontend ---
echo "[1/3] Building frontend..."
npm run build
echo "      Build complete."

echo "[2/3] Deploying frontend to server..."
# Clear remote assets dir to remove stale hashed files, then copy fresh
ssh_run "rm -rf $REMOTE_APP_DIR/dist/assets && mkdir -p $REMOTE_APP_DIR/dist/assets"
scp -i "$SSH_KEY" -r dist/assets/* "$REMOTE_USER@$REMOTE_HOST:$REMOTE_APP_DIR/dist/assets/"
scp_file "dist/index.html" "$REMOTE_APP_DIR/dist/index.html"
# Copy any other top-level dist files (favicon, config.js, etc.) if present
for f in dist/*.js dist/*.svg dist/*.ico dist/*.png dist/*.txt; do
  [ -f "$f" ] && scp_file "$f" "$REMOTE_APP_DIR/dist/"
done
echo "      Frontend deployed."

# --- Backend ---
echo "[3/3] Deploying backend files to server..."
for FILE in "${BACKEND_FILES[@]}"; do
  LOCAL="$FILE"
  REMOTE="$REMOTE_APP_DIR/$FILE"
  REMOTE_DIR=$(dirname "$REMOTE")
  ssh_run "mkdir -p $REMOTE_DIR"
  scp_file "$LOCAL" "$REMOTE" 2>/dev/null || echo "      (skipped: $FILE — not found locally)"
done

echo "      Reloading uvicorn..."
PID=$(ssh_run "$UVICORN_PID_CMD" 2>/dev/null || true)
if [ -n "$PID" ]; then
  ssh_run "kill -HUP $PID"
  echo "      Uvicorn reloaded (PID $PID)."
else
  echo "      WARNING: Could not find uvicorn PID — reload skipped."
fi

echo ""
echo "=============================="
echo "  Deployment complete!"
echo "=============================="
