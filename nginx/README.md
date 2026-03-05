# Nginx: required when serving the built app

## Production (wavelync.com)

- **nginx-wavelync-http.conf** – HTTP only; used when Let's Encrypt certs don't exist. Run `scripts/enable_https_wavelync.py` after DNS points to the server.
- **nginx-production-https.conf** – HTTP→HTTPS redirect + HTTPS for wavelync.com and www.wavelync.com. Used by `deploy-production-ubuntu.sh` when `/etc/letsencrypt/live/wavelync.com/` exists. Deployments preserve this so HTTPS keeps working.

**The app uses same-origin API only: all requests go to `http://<host>/api/...`.** You **must** proxy `/api` to the backend. See **[docs/PROXY_API.md](../docs/PROXY_API.md)** for the canonical instructions and Nginx snippet. Nginx is the supported way when serving the built app.

- **Dev** (`npm run dev`): Vite proxies `/api` to the backend; no Nginx needed.
- **Served build** (e.g. port 80): Use Nginx (or equivalent) so `/api` is proxied to the backend. Copy [nginx-windows.conf](nginx-windows.conf) to `C:\nginx\conf\nginx.conf` and reload Nginx (see below). Windows one-liner: `.\nginx\setup-nginx-config-windows.ps1` then `cd C:\nginx; .\nginx.exe -s reload`.

Nginx serves the React app (static files) on port 80 and proxies `/api`, `/health`, `/docs`, etc. to the FastAPI backend.

## Deploy frontend on Nginx

**One-shot deploy (build + copy to Nginx root + reload):**

- **Linux (from repo root):**
  ```bash
  ./nginx/deploy-frontend.sh
  ```
  Uses `/var/www/buildingsmanager` by default. Override: `WEB_ROOT=/var/www/myapp ./nginx/deploy-frontend.sh`

- **Windows (from repo root):**
  ```powershell
  .\nginx\deploy-frontend.ps1
  ```
  Default web root: `C:\nginx\html\buildingsmanager`. Override: `$env:WEB_ROOT = "C:\path\to\root"; .\nginx\deploy-frontend.ps1`

Ensure Nginx is configured with the same `root` path (see config below). Then open **http://localhost/** (port 80).

---

## Linux (Debian / Ubuntu)

### 1. Install Nginx

```bash
sudo apt update
sudo apt install -y nginx
```

### 2. Build the frontend

From the repo root:

```bash
npm run build
```

This creates `dist/` (Vite default).

### 3. Deploy static files and config

Copy the app build to a directory Nginx can serve (e.g. `/var/www/buildingsmanager`), then install the site config:

```bash
# From repo root
sudo mkdir -p /var/www/buildingsmanager
sudo cp -r dist /var/www/buildingsmanager/
sudo cp nginx/nginx.conf /etc/nginx/sites-available/buildingsmanager
sudo ln -sf /etc/nginx/sites-available/buildingsmanager /etc/nginx/sites-enabled/
# Remove default site if you want this to be the only one
# sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Or use the script (run from repo root):

```bash
./nginx/install-and-configure.sh
```

### 4. Run FastAPI

Nginx proxies to `127.0.0.1:8000`. Start the backend (e.g. with systemd or in a terminal):

```bash
cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

For production, run under gunicorn and systemd (see docs).

---

## Windows

### 1. Install Nginx

- Download from [nginx.org](https://nginx.org/en/download.html) (e.g. “nginx/Windows-1.24.0”) and extract to e.g. `C:\nginx`, or use Chocolatey:

  ```powershell
  choco install nginx -y
  ```

- Default path with Chocolatey is often `C:\tools\nginx` or `C:\ProgramData\chocolatey\lib\nginx\tools`.

### 2. Configure

- Build the frontend: `npm run build` (creates `dist\`).
- Copy `nginx\nginx.conf` into the Nginx `conf` folder (e.g. `C:\nginx\conf\`).
- Edit the config:
  - Set `root` to the **absolute** path to your `dist` folder, e.g.:
    - `root C:/production/buildingsmanager/dist;`
  - Ensure `upstream fastapi_backend` points to `127.0.0.1:8000`.

- Include this config in the main `nginx.conf` (inside `http { }`):

  ```nginx
  include C:/path/to/buildingsmanager/nginx/nginx.conf;
  ```

  Or replace the default `server { }` in Nginx’s main config with the contents of `nginx/nginx.conf`.

### 3. Start Nginx and FastAPI

- **Backend** (separate terminal):

  ```powershell
  cd backend; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
  ```

- **Nginx** (port 80; run as Administrator if something else uses 80):

  ```powershell
  .\nginx\start-nginx-windows.ps1
  # or: cd C:\nginx; .\nginx.exe
  ```

- Open **http://localhost/** (frontend), **http://localhost/api/** (API), **http://localhost/health** (health).

---

## Config reference

| Setting | Meaning |
|--------|---------|
| `root` | Directory containing the React build (e.g. `dist/`). |
| `upstream fastapi_backend` | Backend address (default `127.0.0.1:8000`). |
| `location /api/` | Proxies all `/api/*` to FastAPI. |
| `location ~ ^/(health|docs|...)` | Proxies health and OpenAPI docs to FastAPI. |

After changing the config, test and reload:

- Linux: `sudo nginx -t && sudo systemctl reload nginx`
- Windows: `nginx -t` then `nginx -s reload`
