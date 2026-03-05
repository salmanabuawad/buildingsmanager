# Restarting servers

After **backend** or **api client** (e.g. `apiClient.ts`) changes, restart the backend and rebuild or restart the frontend so the running app picks up the changes.

## Quick restart (both servers)

**Windows (PowerShell, from repo root):**
```powershell
.\scripts\restart-servers.ps1
```
Stops processes on ports 8000, 80, 81, 82, then starts the backend (background) and frontend (foreground; you see Vite logs and the port, e.g. 80 or 81).

**Linux/macOS (from repo root):**
```bash
chmod +x scripts/restart-servers.sh
./scripts/restart-servers.sh
```

## Manual steps

1. **Stop** any process on port 8000 (backend) and 80/81/82 (frontend).
2. **Start backend:** `cd backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
3. **Rebuild frontend (if you changed frontend code):** `npm run build`
4. **Start frontend:** `npm run dev` or `npm run preview` (or use Nginx with deployed build).

When in doubt, run `.\scripts\restart-servers.ps1` (Windows) or `./scripts/restart-servers.sh` (Linux) to restart both.
