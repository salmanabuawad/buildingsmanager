# Full local installation (Frontend + Nginx + Python + Postgres)

The app runs entirely on your machine: **PostgreSQL**, **FastAPI** (Python) backend, **Vite/React** frontend, and optionally **Nginx** to serve the built app and proxy `/api` to FastAPI.

## Prerequisites

- **PostgreSQL** 14+ installed and running (e.g. from [postgresql.org](https://www.postgresql.org/download/) or Chocolatey `choco install postgresql`).
- **psql** in PATH (comes with Postgres; on Windows often in `C:\Program Files\PostgreSQL\15\bin`).
- **Python** 3.10+ and **Node.js** 18+.

## 1. Create database and run migrations

From the repo root.

**Windows (PowerShell):**

```powershell
$env:PGPASSWORD = "your_postgres_password"
.\scripts\setup_local.ps1
```

Optional: custom DB name, host, user:

```powershell
.\scripts\setup_local.ps1 -DbName buildingsmanager -PgHost localhost -PgUser postgres -PgPassword "your_password"
```

**Linux / macOS:**

```bash
export PGPASSWORD=your_postgres_password
chmod +x scripts/setup_local.sh standalone/apply_migrations.sh
./scripts/setup_local.sh
```

Custom:

```bash
./scripts/setup_local.sh buildingsmanager localhost 5432 postgres
```

The script will:

1. Create the database `buildingsmanager` (or the name you passed).
2. Run `standalone/00_extensions_and_roles.sql`.
3. Apply all migrations from `migrations/`.
4. Run `standalone/post_migration_standalone.sql` (default user + optional RLS).

At the end it prints the `DATABASE_URL` to use in the backend.

### If migrations fail

- Ensure Postgres is running and `PGPASSWORD` (or `-PgPassword`) is correct.
- For a clean start:  
  **PowerShell:** `.\scripts\setup_local.ps1 -Force`  
  **Bash:** `FORCE_RECREATE=1 ./scripts/setup_local.sh`  
  This drops and recreates the database.

### RLS and local user

Policies use roles `anon` and `authenticated`. For local dev you can either:

- **Grant roles to your DB user** (recommended):  
  In `standalone/post_migration_standalone.sql` uncomment and run:
  ```sql
  GRANT anon TO postgres;
  GRANT authenticated TO postgres;
  ```
- **Disable RLS**: In the same file, uncomment the “Option B” block that runs `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` for all tables.

## 2. Backend (FastAPI)

```bash
cd backend
```

Create `.env` from the local example and set `DATABASE_URL` (and optionally `PGPASSWORD`-derived URL):

```bash
copy .env.local.example .env   # Windows
# or
cp .env.local.example .env     # Linux/macOS
```

Edit `.env`:

- `DATABASE_URL=postgresql://postgres:YOUR_PG_PASSWORD@localhost:5432/buildingsmanager`
- `SECRET_KEY=dev-secret-key-change-in-production`
- Set `STORAGE_PATH=./storage` and `STORAGE_MAIN_FOLDER=assetflow-files` for local file storage (leave `STORAGE_USER` and `STORAGE_PASSWORD` empty for localhost).

Install and run:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend: **http://localhost:8000**  
Docs: **http://localhost:8000/docs**

## 3. Frontend (React / Vite)

In a new terminal, from the repo root:

```bash
npm install
npm run dev
```

Frontend: **http://localhost:5173**

### Point frontend at the backend

- **Default**: The frontend uses **same origin** for all API requests (`/api` on the current host). When served from Nginx at `http://localhost/`, requests go to `http://localhost/api/...` and Nginx proxies to the backend. No `VITE_API_BASE_URL` needed.
- Set `VITE_API_BASE_URL` only if the API is on a different origin (e.g. backend on another host or port and no proxy).

## 4. Create admin user and login

After migrations, the `users` table has a `default` user (no password). To log in with a real account:

**Option A – script (recommended)**

From the `backend` directory (with `.env` set):

```bash
cd backend
python scripts/create_local_admin.py admin yourpassword admin@local.dev admin
```

Then:

1. **Login**: POST `http://localhost:8000/api/auth/login` with body `{"username": "admin", "password": "yourpassword"}`.
2. Use the returned `access_token` as `Authorization: Bearer <token>`.
3. **Current user**: GET `http://localhost:8000/api/auth/me/users-table` with that Bearer token.

**Option B – SQL**

If the RPC exists:  
`SELECT users_create_internal('admin', 'admin@local.dev', 'your_password', 'admin');`  
Otherwise create the hash with Python:  
`python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('your_password'))"`  
then `INSERT INTO users (user_name, user_email, password_hash, user_role, active) VALUES (...)`.

## 5. If local DB tables are empty

After setup, reference tables (e.g. **asset_types**) should be filled by migrations. If they are still empty:

- **Reference data only (asset_types for dropdowns):**  
  From repo root, with `DATABASE_URL` set (e.g. in backend `.env`):
  ```bash
  python scripts/seed_local_reference_data.py
  ```
  This runs `import_asset_types_latest.sql` so the app has asset types. New runs of `setup_local_db.py` (with or without `--force`) also run this import.

- **Full data (buildings, assets, users, etc.):** Use existing `standalone/seed/*.sql` and run `python scripts/apply_seed.py` (with `DATABASE_URL` set). See `standalone/seed/README.md`.

## 6. Summary## 8. Summary

| Step | Command / action |
|------|-------------------|
| 1. DB | `.\scripts\setup_local.ps1` (Windows) or `./scripts/setup_local.sh` (Linux) with `PGPASSWORD` set; or `python scripts/setup_local_db.py` |
| 2. Backend .env | Copy `backend/.env.local.example` → `backend/.env`, set `DATABASE_URL` |
| 3. Backend | `cd backend && pip install -r requirements.txt && python -m uvicorn app.main:app --reload --port 8000` |
| 4. Frontend | `npm install && npm run dev` |
| 5. Open | Frontend: http://localhost:80 (Vite) or http://localhost/ (Nginx) — Backend: http://localhost:8000 — Docs: http://localhost:8000/docs |
| Start all (dev) | **Windows:** `.\scripts\start-servers.ps1` — **Linux:** `./scripts/start-servers.sh` (starts backend + frontend) |
| Deploy to Nginx | **Windows:** `.\nginx\deploy-frontend.ps1` — **Linux:** `./nginx/deploy-frontend.sh` (build + copy to Nginx root) |
| (if tables empty) | `python scripts/seed_local_reference_data.py` or `python scripts/apply_seed.py` (with existing `standalone/seed/*.sql`) |

## Nginx (production-like local)

To serve the built frontend on port 80 and proxy `/api` to FastAPI:

- **Linux:** Install and configure in one go: see **`nginx/README.md`**. From repo root you can run:
  ```bash
  chmod +x nginx/install-and-configure.sh
  ./nginx/install-and-configure.sh
  ```
  This installs Nginx (if needed), builds the frontend, deploys it under `/var/www/buildingsmanager`, and enables the site. Ensure FastAPI is running on `127.0.0.1:8000`.
- **Windows:** Install Nginx (e.g. from [nginx.org](https://nginx.org/en/download.html) or `choco install nginx`), then follow **`nginx/README.md`** to copy `nginx/nginx.conf`, set `root` to your `dist` path, and start Nginx.
