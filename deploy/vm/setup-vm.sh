#!/bin/bash
# Run on the VM as root (or with sudo) to install nginx, Python, and configure AssetFlow
# Usage: curl -s <url> | bash  OR  scp setup-vm.sh user@vm: && ssh user@vm 'sudo bash setup-vm.sh'

set -e

APP_ROOT=/var/www/assetflow
NGINX_CONF=/etc/nginx/sites-available/assetflow

echo "=== Installing packages ==="
apt-get update
apt-get install -y python3.11 python3.11-venv python3-pip nginx

echo "=== Creating app directory ==="
mkdir -p $APP_ROOT/static $APP_ROOT/backend
chown -R www-data:www-data $APP_ROOT

echo "=== Copy nginx config (run after deploying assetflow.conf) ==="
# cp /path/to/assetflow.conf /etc/nginx/sites-available/assetflow
# ln -sf /etc/nginx/sites-available/assetflow /etc/nginx/sites-enabled/
# rm -f /etc/nginx/sites-enabled/default
ln -sf $APP_ROOT/deploy/nginx/assetflow.conf /etc/nginx/sites-available/assetflow 2>/dev/null || true

echo "=== Create .env template ==="
if [ ! -f $APP_ROOT/.env ]; then
  cat > $APP_ROOT/.env << 'ENVEOF'
PGHOST=your-db.postgres.database.azure.com
PGUSER=dbadmin
PGPORT=5432
PGDATABASE=postgres
PGPASSWORD=
SECRET_KEY=
ENVIRONMENT=production
ALLOWED_ORIGINS=*
ENVEOF
  chown www-data:www-data $APP_ROOT/.env
  chmod 600 $APP_ROOT/.env
  echo "Edit $APP_ROOT/.env with your DB credentials and SECRET_KEY"
fi

echo "=== Setup complete ==="
echo "Next:"
echo "  1. Deploy backend and frontend to $APP_ROOT"
echo "  2. Edit $APP_ROOT/.env"
echo "  3. python3 -m venv $APP_ROOT/venv && $APP_ROOT/venv/bin/pip install -r $APP_ROOT/backend/requirements.txt"
echo "  4. Install gunicorn.service and enable it"
echo "  5. sudo systemctl enable gunicorn && sudo systemctl start gunicorn"
echo "  6. sudo ln -sf /etc/nginx/sites-available/assetflow /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx"
