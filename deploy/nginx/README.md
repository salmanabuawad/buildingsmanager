# Nginx reverse proxy (VM deployment)

Use this when running AssetFlow on an **Azure Linux VM** (or any Linux server): nginx serves the static frontend and proxies `/api` and `/health` to gunicorn.

## Domains

- **www.wavelync.com** (and wavelync.com, app.wavelync.com) → app at `/`, API at `/api`.

## Setup on the VM

1. **Install nginx**
   ```bash
   sudo apt-get update
   sudo apt-get install -y nginx
   ```

2. **Deploy the app** so that:
   - Frontend static files are in `/var/www/assetflow/static` (e.g. copy `dist/` contents there).
   - Backend runs with gunicorn on `127.0.0.1:8000` (see `deploy/vm/` and `backend/startup.sh`).

3. **Install this config**
   ```bash
   sudo cp /var/www/assetflow/deploy/nginx/assetflow.conf /etc/nginx/sites-available/assetflow
   sudo ln -sf /etc/nginx/sites-available/assetflow /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. **DNS**  
   Point **www.wavelync.com** (and optionally wavelync.com) to this VM’s public IP.

5. **HTTPS with Let’s Encrypt**
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d www.wavelync.com -d wavelync.com --non-interactive --agree-tos --redirect
   ```
   Certbot will add a TLS server block and HTTP→HTTPS redirect.

## Paths

| Path        | Handled by   |
|------------|--------------|
| `/`        | nginx (static SPA from `root`) |
| `/api/*`   | nginx → proxy to gunicorn :8000 |
| `/health`  | nginx → proxy to gunicorn :8000 |

Ensure the backend is bound to `127.0.0.1:8000` (or the address used in `proxy_pass`).
