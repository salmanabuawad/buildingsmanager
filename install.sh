#!/usr/bin/env bash
# ============================================================
# BuildingsManager – Full Ubuntu installation script
# Target: profile.wavelync.com (185.229.226.37)
# User:   profilegroup
# Run as: sudo bash install.sh   (or as profilegroup with sudo rights)
# ============================================================
set -euo pipefail

APP_USER="profilegroup"
APP_DIR="/home/${APP_USER}/app"
DOMAIN="profile.wavelync.com"
BACKEND_PORT=8002
DB_NAME="buildings_manager"
DB_USER="bm_user"
DB_PASS="bm_pass_2024"
ADMIN_EMAIL="admin@wavelync.com"

export DEBIAN_FRONTEND=noninteractive

echo "=== [1/9] System packages ==="
apt-get update -qq
apt-get install -y -qq \
  python3.11 python3.11-venv python3-pip \
  nodejs npm \
  postgresql postgresql-contrib \
  nginx certbot python3-certbot-nginx \
  curl git unzip

echo "=== [2/9] Create app user if missing ==="
id "${APP_USER}" &>/dev/null || useradd -m -s /bin/bash "${APP_USER}"

echo "=== [3/9] Wipe home directory ==="
# Remove everything in profilegroup home except . and ..
find "/home/${APP_USER}" -mindepth 1 -maxdepth 1 ! -name '.ssh' -exec rm -rf {} +

echo "=== [4/9] PostgreSQL – drop and recreate DB ==="
systemctl start postgresql
systemctl enable postgresql

sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}';" 2>/dev/null || true
sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME};"
sudo -u postgres psql -c "DROP ROLE IF EXISTS ${DB_USER};"
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER} ENCODING 'UTF8';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"

echo "=== [5/9] Upload code (backend + frontend) ==="
# This section is run AFTER scp of the code
mkdir -p "${APP_DIR}/backend"
mkdir -p "${APP_DIR}/frontend-src"
mkdir -p "${APP_DIR}/frontend/dist"
mkdir -p "${APP_DIR}/files/structure-drawings"
mkdir -p "${APP_DIR}/files/asset-files"
mkdir -p "${APP_DIR}/files/inspection-reports"
mkdir -p "${APP_DIR}/files/dwg-files"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "=== [6/9] PostgreSQL schema ==="
sudo -u postgres psql -d "${DB_NAME}" -f "${APP_DIR}/backend/create_schema.sql"
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO ${DB_USER};"
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};"

echo "=== [7/9] FastAPI backend ==="
cd "${APP_DIR}/backend"

# Write .env
cat > .env <<ENV
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
FILES_BASE_PATH=${APP_DIR}/files
ALLOWED_ORIGINS=https://${DOMAIN},http://localhost:5173
ENVIRONMENT=production
PORT=${BACKEND_PORT}
ENV

# Virtual environment
python3.11 -m venv venv
venv/bin/pip install --quiet --upgrade pip
venv/bin/pip install --quiet -r requirements.txt

# systemd service
cp buildingsmanager.service /etc/systemd/system/buildingsmanager.service
systemctl daemon-reload
systemctl enable buildingsmanager
systemctl restart buildingsmanager

echo "=== [8/9] Frontend build ==="
cd "${APP_DIR}/frontend-src"

# Write .env.production if not present
[ -f .env.production ] || echo "VITE_API_URL=https://${DOMAIN}" > .env.production

npm ci --silent
npm run build --silent

# Copy dist
cp -r dist/. "${APP_DIR}/frontend/dist/"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}/frontend"

echo "=== [9/9] Nginx + SSL ==="

# Write Nginx site config
cat > /etc/nginx/sites-available/${DOMAIN} <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    # Redirect HTTP to HTTPS (certbot will add SSL block)
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    # SSL certs will be filled in by certbot
    # ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    root ${APP_DIR}/frontend/dist;
    index index.html;

    # React SPA
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy to FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        client_max_body_size 100M;
    }

    # Static file uploads
    location /uploads/ {
        alias ${APP_DIR}/files/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

# Enable site
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

# Obtain SSL certificate
certbot --nginx \
  -d "${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  -m "${ADMIN_EMAIL}" \
  --redirect || echo "WARNING: certbot failed – check DNS and try: certbot --nginx -d ${DOMAIN}"

systemctl reload nginx

echo ""
echo "======================================"
echo " Deployment complete!"
echo " https://${DOMAIN}"
echo "======================================"
echo " Backend health: https://${DOMAIN}/health"
echo " API docs:       https://${DOMAIN}/api/docs"
echo ""
echo " Default login: admin / admin123"
echo " CHANGE THE DEFAULT PASSWORD IMMEDIATELY!"
echo "======================================"
