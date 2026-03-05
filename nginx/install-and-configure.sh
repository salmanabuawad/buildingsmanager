#!/usr/bin/env bash
# Install Nginx (if missing), deploy React build, and enable buildingsmanager site.
# Run from repo root: ./nginx/install-and-configure.sh
# Optional: WEB_ROOT=/var/www/buildingsmanager DIST_PATH=dist ./nginx/install-and-configure.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/buildingsmanager}"
DIST_PATH="${DIST_PATH:-dist}"
SITE_NAME="${SITE_NAME:-buildingsmanager}"

echo "Repo root: $REPO_ROOT"
echo "Web root:  $WEB_ROOT"
echo "Dist path: $REPO_ROOT/$DIST_PATH"

# Install nginx if not present
if ! command -v nginx &>/dev/null; then
  echo "Installing nginx..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get update
    sudo apt-get install -y nginx
  elif command -v yum &>/dev/null; then
    sudo yum install -y nginx
  else
    echo "Unknown package manager. Install nginx manually and re-run."
    exit 1
  fi
fi

# Build frontend if dist missing
if [ ! -d "$REPO_ROOT/$DIST_PATH" ]; then
  echo "Building frontend..."
  (cd "$REPO_ROOT" && npm run build)
fi

# Create web root and copy dist
sudo mkdir -p "$WEB_ROOT"
sudo cp -r "$REPO_ROOT/$DIST_PATH"/* "$WEB_ROOT/" 2>/dev/null || sudo cp -r "$REPO_ROOT/$DIST_PATH/." "$WEB_ROOT/"

# Generate config with correct root
if [ -d /etc/nginx/sites-available ]; then
  sed "s|root /var/www/buildingsmanager/dist|root $WEB_ROOT|g" "$SCRIPT_DIR/nginx.conf" | sudo tee "/etc/nginx/sites-available/$SITE_NAME" >/dev/null
else
  sed "s|root /var/www/buildingsmanager/dist|root $WEB_ROOT|g" "$SCRIPT_DIR/nginx.conf" | sudo tee "/etc/nginx/conf.d/$SITE_NAME.conf" >/dev/null
fi

# Enable site (Debian/Ubuntu)
if [ -d /etc/nginx/sites-enabled ]; then
  sudo ln -sf "/etc/nginx/sites-available/$SITE_NAME" "/etc/nginx/sites-enabled/$SITE_NAME"
fi

# Test and reload
sudo nginx -t
sudo systemctl reload nginx 2>/dev/null || sudo nginx -s reload

echo "Done. Nginx is serving $WEB_ROOT and proxying /api to 127.0.0.1:8000"
echo "Ensure FastAPI is running: cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
