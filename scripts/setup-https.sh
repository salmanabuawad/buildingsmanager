#!/usr/bin/env bash
#
# Setup HTTPS (Let's Encrypt) for Buildings Manager on profile-group.co.il
#
# Run this script DIRECTLY on the server (as root or with sudo).
# The domain profile-group.co.il must already point to this server's public IP.
#
# Usage (on the server):
#   sudo bash setup-https.sh
#
# Prerequisites:
#   - nginx is running and serving port 80
#   - profile-group.co.il DNS A record → this server's public IP
#   - Ports 80 and 443 open (firewall / router port forwarding if behind NAT)
#
set -e

DOMAIN="profile-group.co.il"
WWW_DOMAIN="www.profile-group.co.il"
WEB_ROOT="/var/www/buildingsmanager"
NGINX_CONF="/etc/nginx/conf.d/buildingsmanager.conf"
APP_ENV="/home/BenyK/buildingsmanager/backend/.env"
SERVICE="buildingsmanager-lan.service"

echo "=============================="
echo "  HTTPS Setup → $DOMAIN"
echo "=============================="

# ── 1. Install certbot ────────────────────────────────────────────────────────
echo "[1/5] Installing certbot..."
if command -v certbot &>/dev/null; then
    echo "      certbot already installed: $(certbot --version 2>&1)"
else
    if command -v apt-get &>/dev/null; then
        apt-get update -qq
        apt-get install -y certbot python3-certbot-nginx
    elif command -v dnf &>/dev/null; then
        dnf install -y certbot python3-certbot-nginx
    elif command -v yum &>/dev/null; then
        yum install -y certbot python3-certbot-nginx
    else
        echo "ERROR: Cannot detect package manager. Install certbot manually."
        exit 1
    fi
fi
echo "      certbot ready."

# ── 2. Update nginx for HTTP (needed for Let's Encrypt challenge) ─────────────
echo "[2/5] Updating nginx config to serve domain on port 80..."
cat > "$NGINX_CONF" << NGINX
server {
    listen 80;
    server_name $DOMAIN $WWW_DOMAIN;

    root $WEB_ROOT;
    index index.html;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root $WEB_ROOT;
    }

    # Serve static frontend assets
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy API calls to FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 100m;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }
}
NGINX

nginx -t && systemctl reload nginx
echo "      nginx reloaded."

# ── 3. Obtain certificate ─────────────────────────────────────────────────────
echo "[3/5] Obtaining Let's Encrypt certificate for $DOMAIN..."
# --non-interactive + --agree-tos + -m: need a valid email
# --nginx: certbot will auto-configure nginx for HTTPS
# Prompt user for email
read -rp "      Enter your email for Let's Encrypt notifications: " LE_EMAIL
if [ -z "$LE_EMAIL" ]; then
    LE_EMAIL="admin@$DOMAIN"
    echo "      Using default: $LE_EMAIL"
fi

certbot --nginx \
    -d "$DOMAIN" \
    -d "$WWW_DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "$LE_EMAIL" \
    --redirect

echo "      Certificate obtained and nginx updated for HTTPS."

# ── 4. Update CORS origins in backend .env ────────────────────────────────────
echo "[4/5] Updating CORS origins in backend .env..."
if [ -f "$APP_ENV" ]; then
    # Add both http and https versions to ALLOWED_ORIGINS
    CURRENT_ORIGINS=$(grep "^ALLOWED_ORIGINS=" "$APP_ENV" | cut -d'=' -f2-)
    NEW_HTTPS="https://$DOMAIN,https://$WWW_DOMAIN,http://$DOMAIN,http://$WWW_DOMAIN"
    if echo "$CURRENT_ORIGINS" | grep -q "$DOMAIN"; then
        echo "      CORS already includes $DOMAIN — skipping."
    else
        # Append domain to existing origins
        sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=${CURRENT_ORIGINS},${NEW_HTTPS}|" "$APP_ENV"
        echo "      CORS updated: $(grep 'ALLOWED_ORIGINS' "$APP_ENV")"
        # Restart backend to pick up new CORS
        systemctl restart "$SERVICE"
        echo "      Backend restarted."
    fi
else
    echo "      WARNING: .env not found at $APP_ENV — update ALLOWED_ORIGINS manually."
fi

# ── 5. Verify auto-renewal ────────────────────────────────────────────────────
echo "[5/5] Verifying auto-renewal..."
if systemctl is-enabled certbot.timer &>/dev/null || systemctl is-active certbot.timer &>/dev/null; then
    echo "      certbot.timer already active."
elif crontab -l 2>/dev/null | grep -q certbot; then
    echo "      certbot cron already exists."
else
    # Add cron for renewal twice daily (standard Let's Encrypt recommendation)
    (crontab -l 2>/dev/null; echo "0 3,15 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
    echo "      Added certbot renewal cron (03:00 and 15:00 daily)."
fi

# Test renewal dry-run
certbot renew --dry-run --quiet && echo "      Renewal dry-run: OK" || echo "      WARNING: Renewal dry-run failed — check certbot config."

echo ""
echo "=============================="
echo "  HTTPS setup complete!"
echo "  Site: https://$DOMAIN"
echo "=============================="
echo ""
echo "NOTE: Make sure your router forwards ports 80 and 443 to $(hostname -I | awk '{print $1}')."
echo "NOTE: Certificate auto-renews every 60 days."
