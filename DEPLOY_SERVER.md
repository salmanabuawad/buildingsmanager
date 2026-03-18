# Deploy to profile.wavelync.com

## How to deploy (quick)

| Command | What it does |
|--------|----------------|
| `npm run deploy:server` | Build frontend and deploy to nginx root only |
| `npm run deploy:server:all` | Build frontend, deploy frontend, then deploy backend (one confirmation) |
| `npm run deploy:backend` | Deploy backend only (no frontend build) |

**Backend-only after frontend:** Use `npm run deploy:backend` when you only changed backend code.
You’ll see the deploy target (server, path, app URL); type `y` to confirm.

**Skip the confirmation prompt (e.g. scripts):**
```powershell
$env:DEPLOY_SKIP_CONFIRM = "1"; npm run deploy:server
$env:DEPLOY_SKIP_CONFIRM = "1"; npm run deploy:server:all
```

**What gets deployed:** Frontend: build then upload `dist/` via SCP to nginx root. Backend (when using `deploy:server:all` or `deploy:backend`): upload `backend/` then rsync, pip install, restart service. Live app: **https://profile.wavelync.com/**

**Requirements:** SSH access (key-based or password). Default: `root@185.229.226.37`.

---

- **App URL:** https://profile.wavelync.com/  
- **SSH host:** `185.229.226.37` (override with `$env:DEPLOY_HOST`)  
- **SSH user:** `root` (override with `$env:DEPLOY_USER`)  
- **Frontend path:** `/var/www/buildingsmanager` (override: `$env:DEPLOY_PATH`)
- **Backend path:** `/home/profilegroup/app` (override: `$env:BACKEND_REMOTE_PATH`)

## How to know you're deploying to the right place

1. **Before each deploy** the script prints a **DEPLOY TARGET** block showing Server, Path, and App URL. Check that App URL is `https://profile.wavelync.com/`.
2. **Confirmation:** The script asks "Deploy to the above target? [y/N]" so you can cancel if the target is wrong. To skip the prompt (e.g. in CI), set `$env:DEPLOY_SKIP_CONFIRM = "1"`.
3. **Different target:** To deploy elsewhere, set before running:
   - `$env:DEPLOY_HOST = "other-server.com"`
   - `$env:DEPLOY_APP_URL = "https://other-site.com/"` (optional; only affects the message you see)
   - `$env:DEPLOY_USER` / `$env:DEPLOY_PATH` if needed.
4. **After deploy:** Open the App URL in a browser and hard-refresh (Ctrl+Shift+R) to confirm the new build (e.g. check transfer history or any recent change).

## Deploy (after build)

```powershell
# Option A: Password auth (use PuTTY pscp/plink)
# Install PuTTY from https://www.putty.org/ so pscp and plink are in PATH.
$env:DEPLOY_SSH_PASS = "YourPassword"   # Do not commit this
.\deploy-to-server.ps1
```

```powershell
# Option B: SSH keys (no password)
# Set up key-based login for root@profile.wavelync.com, then:
.\deploy-to-server.ps1
```

```powershell
# Build + deploy in one step
npm run deploy:server
# If using password, set DEPLOY_SSH_PASS first as above.
```

## Required for app to work

The app calls `/api/*` (data, assets, files, email, etc.). The server must:

1. **Same origin (default):** Run the FastAPI backend on the server and proxy `/api` to it (e.g. Nginx `location /api { proxy_pass http://127.0.0.1:8000; }`). The built frontend uses same-origin by default (`apiBaseUrl: ''`).
2. **Different origin:** Set `apiBaseUrl` in `public/config.js` (or env) to your backend URL (no trailing slash), then redeploy.

Without a backend serving `/api`, the app will load but data, export-to-automation, and file download will not work.

## Environment variables (all optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `DEPLOY_HOST` | `185.229.226.37` | SSH host |
| `DEPLOY_USER` | `root` | SSH user |
| `DEPLOY_PATH` | `/var/www/buildingsmanager` | Frontend nginx root |
| `BACKEND_REMOTE_PATH` | `/home/profilegroup/app` | Backend app root (backend code ends up in `.../backend/`) |
| `DEPLOY_APP_URL` | `https://profile.wavelync.com/` | Shown in success message only |
| `DEPLOY_SKIP_CONFIRM` | (unset) | Set to `1` to skip "Deploy? [y/N]" |

## Notes

- Do not commit passwords. Set `DEPLOY_SSH_PASS` only in your session or in a file that is in `.gitignore`.
- Frontend deploy replaces the contents of the nginx path with the new `dist/` contents.
- Backend deploy rsyncs `backend/` into `$BACKEND_REMOTE_PATH/backend/`, then restarts the `buildingsmanager` systemd service.
- After deploy, hard-refresh (Ctrl+Shift+R) in the browser to load the new frontend.
