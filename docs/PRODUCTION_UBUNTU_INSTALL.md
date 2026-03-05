# Production Installation on Ubuntu Server

This guide walks you through deploying AssetFlow / Buildings Manager on an Ubuntu server.

## Server Details (Your Setup)

- **IP:** 185.229.226.37
- **User:** asset_flow
- **OS:** Ubuntu

## Step 1: Connect via SSH

From your local machine (PowerShell or bash):

```powershell
# Windows
ssh asset_flow@185.229.226.37
# Enter password when prompted: KortexDigital1342#
```

```bash
# Linux/macOS
ssh asset_flow@185.229.226.37
```

## Step 2: Prepare the Server

### Option A: Clone from Git (if you have a remote repo)

```bash
# Install git if needed
sudo apt-get update && sudo apt-get install -y git

# Clone (replace with your repo URL)
cd ~
git clone https://github.com/your-org/buildingsmanager.git
cd buildingsmanager
```

### Option B: Upload from Local Machine (rsync/scp)

From your **local machine** (where the code is at `c:\production\buildingsmanager`):

```powershell
# Windows - using scp (excludes node_modules, venv, etc.)
scp -r c:\production\buildingsmanager asset_flow@185.229.226.37:~/
```

Or with rsync (if available):

```bash
rsync -avz --exclude node_modules --exclude backend/venv --exclude backend/__pycache__ --exclude backend/storage c:/production/buildingsmanager asset_flow@185.229.226.37:~/
```

## Step 3: Run the Deployment Script

On the **server** (after the code is present):

```bash
cd ~/buildingsmanager   # or wherever you cloned/uploaded
chmod +x scripts/deploy-production-ubuntu.sh
./scripts/deploy-production-ubuntu.sh
```

When prompted, enter the **PostgreSQL password**. On fresh Ubuntu, the default Postgres user is `postgres` – you may need to set a password first:

```bash
# If postgres has no password set, configure it:
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'YourSecurePassword';"
```

Then run the deploy script with:

```bash
export PGPASSWORD='YourSecurePassword'
./scripts/deploy-production-ubuntu.sh
```

## Step 4: Open the App

- **App:** http://185.229.226.37/
- **API docs:** http://185.229.226.37/docs
- **Health check:** http://185.229.226.37/health

**Default login:** `admin` / `ChangeMe123!`  
⚠️ **Change this password immediately after first login.**

## Step 5: Change Admin Password

```bash
cd ~/buildingsmanager/backend
source venv/bin/activate
python scripts/create_local_admin.py admin "YourNewSecurePassword" admin@yourdomain.com admin
```

## Useful Commands

| Task | Command |
|------|---------|
| View backend logs | `sudo journalctl -u assetflow-backend -f` |
| Restart backend | `sudo systemctl restart assetflow-backend` |
| Restart Nginx | `sudo systemctl reload nginx` |
| Check backend status | `sudo systemctl status assetflow-backend` |
| Rebuild frontend | `npm run build && sudo cp -r dist/* /var/www/buildingsmanager/` |

## PostgreSQL Configuration (if needed)

If the deploy script fails on database connection, ensure Postgres accepts password authentication:

1. Edit `sudo nano /etc/postgresql/*/main/pg_hba.conf`
2. Change the `local` and `127.0.0.1` lines from `peer` to `md5`:
   ```
   local   all   all   md5
   host    all   all   127.0.0.1/32   md5
   ```
3. Restart: `sudo systemctl restart postgresql`

## HTTPS (Recommended for Production)

After deployment, add HTTPS with Let's Encrypt:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Then update Nginx to use the certificate (see `nginx/nginx.conf` for the HTTPS block).

## Troubleshooting

### "Connection refused" when accessing /api
- Backend may not be running: `sudo systemctl status assetflow-backend`
- Check logs: `sudo journalctl -u assetflow-backend -n 50`

### Database connection errors
- Verify Postgres is running: `sudo systemctl status postgresql`
- Check `backend/.env` has correct `DATABASE_URL`
- Ensure pg_hba.conf allows password auth (see above)

### 502 Bad Gateway
- Backend crashed; check `journalctl -u assetflow-backend -f`
- Ensure port 8000 is not used by another process: `ss -tlnp | grep 8000`
