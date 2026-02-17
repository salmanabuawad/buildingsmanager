#!/bin/bash
# Run on VM after app.wavelync.com DNS points to this server (20.217.184.238)
# Usage: sudo bash /var/www/assetflow/deploy/vm/enable-ssl.sh

set -e
certbot --nginx -d app.wavelync.com --non-interactive --agree-tos \
  --register-unsafely-without-email --redirect
echo "SSL enabled. Use https://app.wavelync.com"
