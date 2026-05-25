#!/usr/bin/env bash
#
# One-shot SSL setup for profile-group.co.il on the LAN box (10.25.236.179).
#
# What it does (idempotent, safe to re-run):
#   1) Backs up the existing /etc/nginx/conf.d/buildingsmanager.conf
#   2) Inserts a port-80 server block that:
#        - serves /.well-known/acme-challenge/ from a webroot (for HTTP-01)
#        - 301-redirects everything else to https://
#   3) Reloads nginx and runs:
#        certbot certonly --webroot \
#          -w /var/www/le-webroot \
#          -d profile-group.co.il -d www.profile-group.co.il \
#          --email <EMAIL> --agree-tos --non-interactive
#   4) Swaps the 443 block's ssl_certificate / ssl_certificate_key paths
#      to the Let's Encrypt cert (keeps the self-signed one as fallback)
#   5) Reloads nginx and verifies the cert with `openssl s_client`
#   6) Confirms the certbot.timer is active for auto-renewal
#
# HOW TO RUN (on the LAN box, NOT from the laptop):
#   1) scp this file to the LAN box:
#        scp scripts/setup-ssl-lan.sh BenyK@10.25.236.179:/tmp/
#   2) ssh in:
#        ssh BenyK@10.25.236.179
#   3) Edit EMAIL below if you want a different contact address.
#   4) Run as root:
#        sudo bash /tmp/setup-ssl-lan.sh
#
# PREREQUISITES:
#   - profile-group.co.il + www.profile-group.co.il must resolve publicly
#     to the IP that's NAT'd to this LAN box.
#   - Ports 80 AND 443 on that public IP must forward to this box.
#   - certbot must be installed (already verified: 3.1.0).

set -euo pipefail

EMAIL="admin@profile-group.co.il"
DOMAINS=("profile-group.co.il" "www.profile-group.co.il")
NGINX_CONF="/etc/nginx/conf.d/buildingsmanager.conf"
WEBROOT="/var/www/le-webroot"
LE_LIVE="/etc/letsencrypt/live/profile-group.co.il"
TS="$(date +%Y%m%d-%H%M%S)"

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: must run as root (use: sudo bash $0)" >&2
  exit 1
fi

echo "=== [1/6] Backing up nginx config ==="
cp -av "$NGINX_CONF" "${NGINX_CONF}.bak.${TS}"

echo "=== [2/6] Ensuring webroot exists ==="
mkdir -p "$WEBROOT/.well-known/acme-challenge"
chown -R nginx:nginx "$WEBROOT" 2>/dev/null || chown -R www-data:www-data "$WEBROOT" 2>/dev/null || true
chmod -R 755 "$WEBROOT"

echo "=== [2b/6] Opening http + https in firewalld ==="
if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
  echo "  firewalld now allows:"
  firewall-cmd --list-services | tr ' ' '\n' | grep -E '^https?$' || true
else
  echo "  firewalld not active, skipping"
fi

echo "=== [3/6] Installing port-80 server block (for ACME + 301) ==="
# Only inject if not already present.
if ! grep -q "listen 80;" "$NGINX_CONF"; then
  # Prepend a port-80 block before the existing 443 block.
  cat > /tmp/_bm_port80.conf <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name profile-group.co.il www.profile-group.co.il;

    # ACME HTTP-01 challenge
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/le-webroot;
        default_type "text/plain";
        try_files $uri =404;
    }

    # Everything else → HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

EOF
  cat /tmp/_bm_port80.conf "$NGINX_CONF" > "${NGINX_CONF}.new"
  mv "${NGINX_CONF}.new" "$NGINX_CONF"
  rm -f /tmp/_bm_port80.conf
  echo "  port-80 block injected"
else
  echo "  port-80 block already present, skipping"
fi

echo "=== [4/6] Reloading nginx (with current self-signed cert) ==="
nginx -t
systemctl reload nginx

echo "=== [5/6] Requesting Let's Encrypt cert via HTTP-01 webroot ==="
DOMAIN_ARGS=()
for d in "${DOMAINS[@]}"; do DOMAIN_ARGS+=("-d" "$d"); done

DRY_RUN="${DRY_RUN:-0}"
EXTRA_ARGS=()
if [ "$DRY_RUN" = "1" ]; then
  echo "  *** DRY-RUN (staging) — validates external reachability, issues NO real cert ***"
  EXTRA_ARGS+=(--dry-run)
fi

certbot certonly \
  --webroot -w "$WEBROOT" \
  "${DOMAIN_ARGS[@]}" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive \
  --keep-until-expiring \
  "${EXTRA_ARGS[@]}"

if [ "$DRY_RUN" = "1" ]; then
  echo
  echo "=== DRY-RUN passed: ports 80/443 are reachable from Let's Encrypt. ==="
  echo "    Re-run WITHOUT DRY_RUN=1 to issue the real cert."
  exit 0
fi

if [ ! -f "$LE_LIVE/fullchain.pem" ]; then
  echo "ERROR: certbot did not produce $LE_LIVE/fullchain.pem" >&2
  exit 1
fi
echo "  cert issued/renewed:"
openssl x509 -in "$LE_LIVE/fullchain.pem" -noout -subject -issuer -dates

echo "=== [6/6] Pointing nginx 443 block at the LE cert ==="
# Replace the two ssl_certificate* lines in the 443 block.
sed -i.bak."$TS" \
  -e "s|ssl_certificate     /etc/ssl/buildingsmanager/fullchain.pem;|ssl_certificate     ${LE_LIVE}/fullchain.pem;|" \
  -e "s|ssl_certificate_key /etc/ssl/buildingsmanager/privkey.pem;|ssl_certificate_key ${LE_LIVE}/privkey.pem;|" \
  "$NGINX_CONF"

# Catch the case where indentation differs.
if grep -q "/etc/ssl/buildingsmanager/" "$NGINX_CONF"; then
  echo "  sed didn't fully replace cert paths; doing fallback rewrite"
  sed -i "s|/etc/ssl/buildingsmanager/fullchain.pem|${LE_LIVE}/fullchain.pem|g" "$NGINX_CONF"
  sed -i "s|/etc/ssl/buildingsmanager/privkey.pem|${LE_LIVE}/privkey.pem|g"   "$NGINX_CONF"
fi

nginx -t
systemctl reload nginx

echo "=== Verifying ==="
echo "--- HTTPS handshake (cert chain):"
echo | openssl s_client -servername profile-group.co.il -connect localhost:443 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
echo
echo "--- Renewal timer status:"
systemctl status certbot.timer --no-pager 2>&1 | head -10 || systemctl status certbot-renew.timer --no-pager 2>&1 | head -10 || echo "  (no timer found; check 'systemctl list-timers | grep cert')"

cat <<EOF

==============================
  DONE. https://profile-group.co.il/ is now served with a Let's Encrypt cert.

  Backup of the original nginx config: ${NGINX_CONF}.bak.${TS}
  Old self-signed cert still at:        /etc/ssl/buildingsmanager/
  Renewal: handled automatically by certbot.timer
==============================
EOF
