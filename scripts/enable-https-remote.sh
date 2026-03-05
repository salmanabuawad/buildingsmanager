#!/usr/bin/env bash
# Enable HTTPS on remote Ubuntu server.
# Option 1: Self-signed cert (works for IP, browser will show warning)
# Option 2: Let's Encrypt (requires domain name pointing to server)
#
# Run ON the server: ./scripts/enable-https-remote.sh
# Or with domain:    DOMAIN=app.yourdomain.com ./scripts/enable-https-remote.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_ROOT="/var/www/buildingsmanager"
DOMAIN="${DOMAIN:-}"

echo "Enabling HTTPS..."

# Install certbot if using domain
if [ -n "$DOMAIN" ]; then
  echo "Using Let's Encrypt for domain: $DOMAIN"
  sudo apt-get update
  sudo apt-get install -y certbot python3-certbot-nginx
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
  echo "HTTPS enabled via Let's Encrypt."
  exit 0
fi

# Self-signed cert for IP
CERT_DIR="/etc/nginx/ssl"
sudo mkdir -p "$CERT_DIR"
if [ ! -f "$CERT_DIR/assetflow.crt" ]; then
  echo "Generating self-signed certificate..."
  sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/assetflow.key" \
    -out "$CERT_DIR/assetflow.crt" \
    -subj "/CN=185.229.226.37/O=AssetFlow/C=IL"
fi

# Add HTTPS server block
HTTPS_BLOCK="
# HTTPS (self-signed)
server {
    listen 443 ssl http2 default_server;
    server_name _;
    ssl_certificate     $CERT_DIR/assetflow.crt;
    ssl_certificate_key $CERT_DIR/assetflow.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    root $WEB_ROOT;
    index index.html;
    try_files \$uri \$uri/ /index.html;
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection \"\";
    }
    location ~ ^/(health|docs|openapi.json|redoc) {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
"

# Update HTTP to redirect to HTTPS
sudo sed -i 's/listen 80 default_server;/listen 80 default_server;\n    return 301 https:\/\/$host$request_uri;/' /etc/nginx/sites-available/buildingsmanager 2>/dev/null || true

# Append HTTPS block
echo "$HTTPS_BLOCK" | sudo tee -a /etc/nginx/sites-available/buildingsmanager > /dev/null

sudo nginx -t && sudo systemctl reload nginx
echo "HTTPS enabled (self-signed). Use https://185.229.226.37/"
echo "Note: Browser will show security warning - click Advanced -> Proceed."
