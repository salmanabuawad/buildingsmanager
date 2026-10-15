#!/usr/bin/env bash
#
# ONE-TIME clone of the LAN production site (profile-group.co.il, 10.25.236.179)
# into a demo copy served at  http(s)://profile-group.co.il/demo/
#
# What it creates on the LAN box (production is only READ, never changed,
# except for one `include` line added to its nginx server blocks):
#   - DB        buildingsmanager_demo   (pg_dump copy of the prod DB)
#   - files     /DATA/buildingsmanager_demo/{uploads,asset_files_storage}
#   - backend   /DATA/buildingsmanager_demo/app/backend  (own .env, own SECRET_KEY)
#   - service   buildingsmanager-demo.service  on 127.0.0.1:8008
#               (reuses the prod venv; 8008 is already an SELinux http_port_t)
#   - frontend  /var/www/buildingsmanager_demo  (built with base /demo/)
#   - nginx     /etc/nginx/buildingsmanager-demo.conf, included from the prod
#               server block(s): /demo/ → static, /demo/api/ → :8008/api/
#
# Safety in the demo copy:
#   - mail stays on (email_config is kept), but all operators (פקידים/ות) and
#     managers (מנהלים) are deleted so it never reaches the real recipients;
#     add demo recipients in System Settings. Deleting operators clears
#     assets.operator_id (ON DELETE SET NULL).
#   - a new SECRET_KEY, so demo tokens are not valid against production
#
# Usage (from Git Bash at the repo root, on the LAN/VPN):
#   bash scripts/clone-to-demo.sh
# You'll be prompted for BenyK's sudo password once (unless NOPASSWD is set).
# Re-running refuses to overwrite an existing demo DB unless FORCE=1.
#

set -e

REMOTE_USER="BenyK"
REMOTE_HOST="10.25.236.179"
SSH_KEY="$HOME/.ssh/id_ed25519"
NODE_HOME="/home/BenyK/node20"
BUILD_DIR="/var/tmp/bm-build-demo"
REMOTE_SCRIPT="/var/tmp/bm-clone-demo-remote.sh"
FORCE="${FORCE:-0}"

ssh_run() { ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"; }
ssh_tty() { ssh -t -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "$@"; }

echo "======================================"
echo "  Clone prod → demo on $REMOTE_HOST"
echo "  → https://profile-group.co.il/demo/"
echo "======================================"

# 1) Build the frontend on the LAN box with base /demo/ (no sudo needed).
echo "[1/2] Streaming source + building frontend with base /demo/..."
git archive --format=tar HEAD | ssh_run "set -e
export PATH=$NODE_HOME/bin:\$PATH
rm -rf $BUILD_DIR && mkdir -p $BUILD_DIR && cd $BUILD_DIR && tar -x
npm ci --prefer-offline --no-audit --no-fund 2>&1 | tail -2
VITE_API_BASE_URL=/demo npx vite build --base=/demo/ 2>&1 | tail -3
# index.html loads config.js via a plain <script>, which Vite doesn't rebase.
sed -i 's#src=\"/config.js\"#src=\"/demo/config.js\"#' dist/index.html
cat > dist/config.js <<'JS'
// Demo copy: API lives under /demo/api/ (nginx → buildingsmanager-demo on :8008).
window.__APP_CONFIG__ = window.__APP_CONFIG__ || { apiBaseUrl: '/demo' };
JS
rm -rf node_modules"

# 2) Upload + run the root part (DB, files, backend, service, nginx).
echo "[2/2] Uploading root setup script..."
ssh_run "cat > $REMOTE_SCRIPT" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail

FORCE="${1:-0}"
BUILD_DIR="/var/tmp/bm-build-demo"
PROD_APP_DIR="/home/BenyK/buildingsmanager"
PROD_VENV="/home/BenyK/venv"   # the venv buildingsmanager-lan.service runs from
PROD_ENV="$PROD_APP_DIR/backend/.env"
PROD_CONF="/etc/nginx/conf.d/buildingsmanager.conf"
APP_USER="BenyK"

DEMO_ROOT="/DATA/buildingsmanager_demo"
DEMO_APP="$DEMO_ROOT/app/backend"
DEMO_UPLOADS="$DEMO_ROOT/uploads"
DEMO_FILES="$DEMO_ROOT/asset_files_storage"
DEMO_WEB="/var/www/buildingsmanager_demo"
DEMO_DB="buildingsmanager_demo"
DEMO_PORT=8008
DEMO_SERVICE="buildingsmanager-demo.service"
DEMO_NGINX="/etc/nginx/buildingsmanager-demo.conf"

envval() { grep -E "^$1=" "$PROD_ENV" | head -1 | cut -d= -f2- ; }

PROD_DB_URL="$(envval DATABASE_URL)"
PROD_DB="$(echo "$PROD_DB_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"
PROD_UPLOADS="$(envval FILES_BASE_PATH)"
PROD_FILES="$(envval ASSET_FILES_STORAGE_PATH)"
echo "  prod DB: $PROD_DB | uploads: $PROD_UPLOADS | files: $PROD_FILES"
[ -n "$PROD_DB" ] || { echo "Could not read prod DB name from $PROD_ENV" >&2; exit 1; }
[ "$PROD_DB" != "$DEMO_DB" ] || { echo "Prod DB name equals demo DB name?!" >&2; exit 1; }

# ── Port must be free ─────────────────────────────────────────────────────────
if ss -ltn | grep -q ":$DEMO_PORT " && ! systemctl is-active -q "$DEMO_SERVICE"; then
  echo "Port $DEMO_PORT is already in use by something else — edit DEMO_PORT." >&2; exit 1
fi

# ── Database ──────────────────────────────────────────────────────────────────
echo "[DB] Cloning $PROD_DB → $DEMO_DB..."
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DEMO_DB'" | grep -q 1; then
  if [ "$FORCE" = "1" ]; then
    systemctl stop "$DEMO_SERVICE" 2>/dev/null || true
    sudo -u postgres dropdb "$DEMO_DB"
  else
    echo "$DEMO_DB already exists. Re-run with FORCE=1 to recreate it." >&2; exit 1
  fi
fi
DB_OWNER="$(sudo -u postgres psql -tAc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$PROD_DB'")"
sudo -u postgres createdb -O "$DB_OWNER" "$DEMO_DB"
sudo -u postgres pg_dump "$PROD_DB" | sudo -u postgres psql -q -o /dev/null "$DEMO_DB"
# Mail stays on, but no real recipients: empty the operator and manager lists.
sudo -u postgres psql -q -v ON_ERROR_STOP=1 -1 "$DEMO_DB" -c "DELETE FROM operators;" -c "DELETE FROM managers;"
for t in buildings assets users; do
  printf "  %-12s prod=%s demo=%s\n" "$t" \
    "$(sudo -u postgres psql -tAc "SELECT count(*) FROM $t" "$PROD_DB")" \
    "$(sudo -u postgres psql -tAc "SELECT count(*) FROM $t" "$DEMO_DB")"
done

# ── Files ─────────────────────────────────────────────────────────────────────
echo "[FILES] Copying uploads + asset files (prod is read-only here)..."
du -sh "$PROD_UPLOADS" "$PROD_FILES" 2>/dev/null || true
df -h /DATA | tail -1
mkdir -p "$DEMO_UPLOADS" "$DEMO_FILES" "$DEMO_APP"
[ -d "$PROD_UPLOADS" ] && rsync -a "$PROD_UPLOADS/" "$DEMO_UPLOADS/"
[ -d "$PROD_FILES" ]   && rsync -a "$PROD_FILES/"   "$DEMO_FILES/"

# ── Backend code + .env ───────────────────────────────────────────────────────
echo "[APP] Installing backend code + .env..."
rsync -a --delete "$BUILD_DIR/backend/app/" "$DEMO_APP/app/"
cp "$BUILD_DIR/backend/requirements.txt" "$DEMO_APP/" 2>/dev/null || true
DEMO_DB_URL="$(echo "$PROD_DB_URL" | sed -E "s#/[^/?]+(\?.*)?\$#/$DEMO_DB\1#")"
grep -vE '^(DATABASE_URL|SECRET_KEY|FILES_BASE_PATH|ASSET_FILES_STORAGE_PATH)=' "$PROD_ENV" > "$DEMO_APP/.env"
cat >> "$DEMO_APP/.env" <<ENV
DATABASE_URL=$DEMO_DB_URL
SECRET_KEY=Demo$(head -c 48 /dev/urandom | sha256sum | head -c 48)
FILES_BASE_PATH=$DEMO_UPLOADS
ASSET_FILES_STORAGE_PATH=$DEMO_FILES
ENV
chmod 600 "$DEMO_APP/.env"
chown -R "$APP_USER:$APP_USER" "$DEMO_ROOT"

# ── systemd ───────────────────────────────────────────────────────────────────
echo "[SERVICE] Writing $DEMO_SERVICE (port $DEMO_PORT, reusing prod venv)..."
cat > "/etc/systemd/system/$DEMO_SERVICE" <<UNIT
[Unit]
Description=Buildings Manager DEMO (uvicorn) — /demo
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$DEMO_APP
Environment="PATH=$PROD_VENV/bin"
EnvironmentFile=$DEMO_APP/.env
ExecStart=$PROD_VENV/bin/gunicorn app.main:app --workers 1 --worker-class uvicorn.workers.UvicornWorker --bind 127.0.0.1:$DEMO_PORT --timeout 120
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable -q "$DEMO_SERVICE"
systemctl restart "$DEMO_SERVICE"

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "[WEB] Deploying frontend → $DEMO_WEB..."
mkdir -p "$DEMO_WEB"
rsync -a --delete "$BUILD_DIR/dist/" "$DEMO_WEB/"
chown -R nginx:nginx "$DEMO_WEB" 2>/dev/null || true
command -v restorecon >/dev/null && restorecon -R "$DEMO_WEB" || true

# ── nginx ─────────────────────────────────────────────────────────────────────
echo "[NGINX] Writing $DEMO_NGINX + including it in the prod server block(s)..."
cat > "$DEMO_NGINX" <<'NGINX'
# Demo copy of Buildings Manager under /demo/ (see scripts/clone-to-demo.sh)
location = /demo { return 301 /demo/; }

location ^~ /demo/api/ {
    proxy_pass http://127.0.0.1:8008/api/;
    # FastAPI's trailing-slash redirects point at /api/...; keep them under /demo
    # or they'd land on the production backend.
    proxy_redirect ~^(https?://[^/]+)?/api/(.*)$ $1/demo/api/$2;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 100m;
    proxy_read_timeout 120s;
    proxy_connect_timeout 10s;
}

location = /demo/index.html {
    alias /var/www/buildingsmanager_demo/index.html;
    add_header Cache-Control "no-cache, must-revalidate" always;
}

location ^~ /demo/assets/ {
    alias /var/www/buildingsmanager_demo/assets/;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location ^~ /demo/ {
    alias /var/www/buildingsmanager_demo/;
    try_files $uri $uri/ /demo/index.html;
}
NGINX
command -v restorecon >/dev/null && restorecon "$DEMO_NGINX" || true

if ! grep -q "buildingsmanager-demo.conf" "$PROD_CONF"; then
  BACKUP="$PROD_CONF.bak-$(date +%Y%m%d%H%M%S)"
  cp -a "$PROD_CONF" "$BACKUP"
  # Add the include right after every `root /var/www/buildingsmanager;` (port 80 + 443 blocks).
  sed -i -E "s#^([[:space:]]*)root /var/www/buildingsmanager;#&\n\1include $DEMO_NGINX;#" "$PROD_CONF"
  if ! nginx -t; then
    echo "nginx -t failed — restoring $BACKUP" >&2
    cp -a "$BACKUP" "$PROD_CONF"; exit 1
  fi
  echo "  backup of prod config: $BACKUP"
fi
N_INC="$(grep -c "buildingsmanager-demo.conf" "$PROD_CONF" || true)"
echo "  include lines in prod config: $N_INC"
if [ "$N_INC" = "0" ]; then
  echo "Could not find 'root /var/www/buildingsmanager;' in $PROD_CONF." >&2
  echo "Add 'include $DEMO_NGINX;' inside its server block(s) by hand, then: nginx -t && systemctl reload nginx" >&2
  exit 1
fi
nginx -t && systemctl reload nginx

# ── Verify ────────────────────────────────────────────────────────────────────
sleep 3
systemctl is-active "$DEMO_SERVICE" || true
echo -n "  backend /api/ direct:  "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:$DEMO_PORT/api/asset-types" || true
echo -n "  /demo/ via nginx:      "; curl -sk -o /dev/null -w "%{http_code}\n" -H "Host: profile-group.co.il" http://127.0.0.1/demo/ || true
echo -n "  /demo/api/ via nginx:  "; curl -sk -o /dev/null -w "%{http_code}\n" -H "Host: profile-group.co.il" http://127.0.0.1/demo/api/asset-types || true
echo -n "  prod / still OK:       "; curl -sk -o /dev/null -w "%{http_code}\n" -H "Host: profile-group.co.il" http://127.0.0.1/ || true

rm -rf "$BUILD_DIR"
REMOTE

echo "Running root setup (sudo password may be prompted)..."
ssh_tty "sudo bash $REMOTE_SCRIPT $FORCE; rc=\$?; rm -f $REMOTE_SCRIPT; exit \$rc"

cat <<EOF

======================================
  Demo: https://profile-group.co.il/demo/
  Log in with the same users/passwords as production.
======================================
EOF
