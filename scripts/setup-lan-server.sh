#!/usr/bin/env bash
# Full setup script for a fresh LAN server (Oracle Linux 9 / RHEL)
# Run as: sudo bash setup-lan-server.sh
# Or via deploy-lan.sh which SSHes in and runs this.

set -e

APP_USER="BenyK"
APP_DIR="/home/BenyK/buildingsmanager"
WEB_ROOT="/var/www/buildingsmanager"
SERVICE="buildingsmanager-lan.service"
PG_DB="buildingsmanager"
PG_USER="bmuser"
PG_PASS="BmLocal2026!"
BACKEND_PORT=8000
SECRET_KEY="LanSecret$(date +%s%N | sha256sum | head -c 32)"
UPLOADS_DIR="$APP_DIR/uploads"
FILES_DIR="$APP_DIR/asset_files_storage"

echo "=============================="
echo "  Buildings Manager LAN Setup"
echo "=============================="

# ── PostgreSQL ────────────────────────────────────────────────────────────────
echo "[DB] Ensuring PostgreSQL is running..."
systemctl is-active postgresql >/dev/null 2>&1 || {
  /usr/bin/postgresql-setup --initdb 2>/dev/null || true
  systemctl enable postgresql
  systemctl start postgresql
}

echo "[DB] Creating user + database..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $PG_USER WITH PASSWORD '$PG_PASS' CREATEDB;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" | grep -q 1 || {
  sudo -u postgres psql -c "CREATE DATABASE $PG_DB OWNER $PG_USER;"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $PG_DB TO $PG_USER;"
}

# ── Run schema ────────────────────────────────────────────────────────────────
if [ -f "$APP_DIR/install_fresh_database.sql" ]; then
  echo "[DB] Running schema..."
  PGPASSWORD="$PG_PASS" psql -U "$PG_USER" -h 127.0.0.1 -d "$PG_DB" -f "$APP_DIR/install_fresh_database.sql" 2>&1 | tail -5 || true
fi

# ── Directories ───────────────────────────────────────────────────────────────
echo "[DIR] Creating app directories..."
mkdir -p "$APP_DIR/backend" "$UPLOADS_DIR" "$FILES_DIR" "$WEB_ROOT"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chown -R nginx:nginx "$WEB_ROOT" 2>/dev/null || chown -R "$APP_USER:$APP_USER" "$WEB_ROOT"

# ── Python venv + deps ────────────────────────────────────────────────────────
if [ ! -d "$APP_DIR/venv" ]; then
  echo "[PY] Creating virtualenv..."
  python3 -m venv "$APP_DIR/venv"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR/venv"
fi

echo "[PY] Installing Python requirements..."
"$APP_DIR/venv/bin/pip" install -q --upgrade pip
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt"

# ── .env file ─────────────────────────────────────────────────────────────────
echo "[ENV] Writing .env..."
cat > "$APP_DIR/backend/.env" << ENV
DATABASE_URL=postgresql://$PG_USER:$PG_PASS@127.0.0.1:5432/$PG_DB
SECRET_KEY=$SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
FILES_BASE_PATH=$UPLOADS_DIR
ASSET_FILES_STORAGE_PATH=$FILES_DIR
ALLOWED_ORIGINS=http://10.25.236.179,http://10.25.236.179:80,http://localhost,https://profile-group.co.il,https://www.profile-group.co.il,http://profile-group.co.il,http://www.profile-group.co.il
ENVIRONMENT=production
ENV
chown "$APP_USER:$APP_USER" "$APP_DIR/backend/.env"
chmod 600 "$APP_DIR/backend/.env"

# ── nginx config ──────────────────────────────────────────────────────────────
echo "[NGINX] Writing site config..."
cat > /etc/nginx/conf.d/buildingsmanager.conf << 'NGINX'
server {
    listen 80;
    server_name 10.25.236.179 profile-group.co.il www.profile-group.co.il _;

    root /var/www/buildingsmanager;
    index index.html;

    # Let's Encrypt ACME challenge (used by setup-https.sh)
    location /.well-known/acme-challenge/ {
        root /var/www/buildingsmanager;
    }

    # Serve static frontend assets
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 100m;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }
}
NGINX

# Remove default html page if it exists
rm -f /var/www/html/index.html 2>/dev/null || true

nginx -t && systemctl enable nginx && systemctl restart nginx
echo "[NGINX] Running: $(systemctl is-active nginx)"

# ── systemd service ───────────────────────────────────────────────────────────
echo "[SERVICE] Writing $SERVICE..."
cat > /etc/systemd/system/$SERVICE << SERVICE
[Unit]
Description=Buildings Manager LAN (uvicorn)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/backend
Environment="PATH=$APP_DIR/venv/bin"
EnvironmentFile=$APP_DIR/backend/.env
ExecStart=$APP_DIR/venv/bin/gunicorn app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 127.0.0.1:$BACKEND_PORT --timeout 120
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"
sleep 3
systemctl is-active "$SERVICE"

# ── Firewall: open port 80 ────────────────────────────────────────────────────
echo "[FW] Opening port 80..."
firewall-cmd --permanent --add-service=http 2>/dev/null && firewall-cmd --reload 2>/dev/null || echo "(firewalld not running, skipping)"

echo ""
echo "=============================="
echo "  Setup complete!"
echo "  http://10.25.236.179/"
echo "=============================="
