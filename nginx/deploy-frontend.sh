#!/usr/bin/env bash
# Build the frontend and deploy to Nginx web root.
# Run from repo root: ./nginx/deploy-frontend.sh
# Optional: WEB_ROOT=/var/www/buildingsmanager ./nginx/deploy-frontend.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/buildingsmanager}"

echo "Building frontend..."
(cd "$REPO_ROOT" && npm run build)

echo "Deploying to $WEB_ROOT..."
sudo mkdir -p "$WEB_ROOT"
sudo cp -r "$REPO_ROOT/dist"/* "$WEB_ROOT/" 2>/dev/null || sudo cp -r "$REPO_ROOT/dist/." "$WEB_ROOT/"

if command -v nginx &>/dev/null; then
  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx 2>/dev/null || sudo nginx -s reload
    echo "Nginx reloaded."
  else
    echo "Nginx config test failed; skip reload. Fix config and run: sudo nginx -t && sudo systemctl reload nginx"
  fi
else
  echo "Nginx not in PATH; copy done. Reload Nginx manually if needed."
fi

echo "Done. Frontend is at $WEB_ROOT (Nginx root). Open http://localhost/"
