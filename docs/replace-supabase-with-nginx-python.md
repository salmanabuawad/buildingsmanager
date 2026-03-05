# Replacing Supabase with Nginx + Python (FastAPI)

Target: run the app on your own VM with **Nginx** + **Python (FastAPI)** and **managed PostgreSQL** (Azure or GCP). No Supabase.

---

## Target architecture

```
                    ┌─────────────────────────────────────────┐
                    │  VM (e.g. Ubuntu, Israel region)        │
                    │                                         │
  User browser  ──► │  Nginx                                  │
                    │    ├── /          → static (React build) │
                    │    └── /api/*     → FastAPI backend     │
                    │                                         │
                    │  FastAPI (Python)                        │
                    │    ├── Auth (login, JWT)                 │
                    │    ├── Buildings, Assets, Asset types    │
                    │    ├── Files (upload/download → Blob)   │
                    │    ├── Audit, Email                      │
                    │    └── All current Supabase RPCs as API │
                    └──────────────┬──────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     Managed PostgreSQL      Azure Blob / GCP       (optional: same
     (same schema,            Storage (300 GB)        VM for frontend
      migrations applied)                             or other host)
```

- **Nginx**: Serves the React static build and proxies `/api/*` to FastAPI.
- **Python (FastAPI)**: Single backend; talks to PostgreSQL and to Blob/Cloud Storage. Replaces all Supabase client usage.
- **PostgreSQL**: Managed (Azure Database for PostgreSQL or GCP Cloud SQL). Use your existing `migrations/*.sql`; no Supabase service.
- **Storage**: Keep using Azure Blob (or switch to GCP Cloud Storage); all file access via FastAPI (upload/download or signed URLs).

---

## What the frontend uses today (to replace)

| Area | Current (Supabase) | Replace with |
|------|--------------------|--------------|
| **Auth** | `supabase.rpc('auth_login', …)` + session in `sessionStorage` | `POST /api/auth/login` (FastAPI already has it); store JWT and use it for API calls. |
| **DB / RPCs** | Many `supabase.rpc(...)` (e.g. `save_assets_bulk_transactional`, `update_building_total_area`, `get_assets_with_history`, `delete_asset_transactional`, `get_record_change_history`, etc.) | New or extended FastAPI endpoints that run the same SQL/functions on your Postgres. |
| **Tables** | `supabase.from('operators')`, `supabase.from('managers')`, `supabase.from('buildings')`, `supabase.from('asset_types')`, etc. | REST endpoints on FastAPI (e.g. `/api/operators`, `/api/managers`) or reuse existing building/asset-type routes. |
| **Storage** | `supabase.storage.from(...).upload`, `download`, `getPublicUrl` | FastAPI file routes: upload → `POST /api/files/upload/{asset_id}`, download → `GET /api/files/download/{file_id}` or signed URLs from backend. |

---

## What the backend already has

- **Auth**: `POST /api/auth/login`, `GET /api/auth/me` (JWT). You’ll need to align user source: either FastAPI uses the same `users` table and password check as `auth_login`, or you migrate to the backend’s `User` model.
- **Buildings / Assets / Asset types**: Basic CRUD in `buildings.py`, `assets.py`, `asset_types.py`. Missing: bulk transactional saves, building total area updates, distribution flags, history, audit logging – these are currently done in Supabase RPCs.
- **Files**: Upload, list, delete, download via Azure Blob in `files.py`. Frontend needs to call these instead of Supabase Storage.
- **Audit**: `audit.py` – list logs.
- **Email**: `email.py` – send email.

---

## Migration checklist

### 1. Backend (FastAPI)

- [ ] **Database**: Point `DATABASE_URL` to managed PostgreSQL (Azure or GCP). Apply all migrations from `migrations/`.
- [ ] **Auth**: Use one source of truth. Either:
  - Make FastAPI login use the same `auth_login` logic (and `users` table) as today, and return JWT with `user_id`, `user_name`, `user_role`; or
  - Migrate users into the backend’s `User` table and retire `auth_login` RPC.
- [ ] **RPCs → endpoints**: For each Supabase RPC the frontend calls, add or extend a FastAPI endpoint that runs the same SQL/function (e.g. call `save_assets_bulk_transactional`, `update_building_total_area`, etc. via raw SQL or SQLAlchemy).
- [ ] **Operators / managers**: Add `routers/operators.py` and `routers/managers.py` (or include in existing routers) so frontend doesn’t use `supabase.from('operators')` / `from('managers')`.
- [ ] **Storage**: Keep Azure Blob (or add GCP Cloud Storage). Ensure all file URLs the frontend needs are served via backend (e.g. `/api/files/download/{file_id}` or backend-issued signed URLs). Remove any direct Supabase Storage usage in the frontend.

### 2. Frontend (React)

- [ ] **Auth**: Replace `loginUsersTable()` (Supabase RPC) with `POST /api/auth/login`; store JWT (e.g. in memory or `sessionStorage`); send `Authorization: Bearer <token>` on every API request. Use `GET /api/auth/me` for current user.
- [ ] **API layer**: Replace every `supabase.rpc(...)` and `supabase.from(...)` with calls to your FastAPI backend (e.g. `fetch(API_BASE + '/api/...', { headers: { Authorization: 'Bearer ' + token } })` or a small API client).
- [ ] **Files**: Replace `supabase.storage` upload/download with backend endpoints (e.g. upload via `POST /api/files/upload/{asset_id}`, download via `GET /api/files/download/{file_id}` or URL returned by backend). Update any logic that checks for `.supabase.co/storage/` to use your backend URL or blob URL pattern.
- [ ] **Env**: Remove `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. API uses same origin by default (`/api` on current host). Set `VITE_API_BASE_URL` only if the API is on a different origin.

### 3. Deployment (Nginx + Python)

- [ ] **Build**: `npm run build` → static files in `dist/` (or similar).
- [ ] **Nginx**: Serve `dist/` at `/`; proxy ` /api` to FastAPI (e.g. `http://127.0.0.1:8000`). Prefer HTTPS (e.g. Let’s Encrypt).
- [ ] **Process**: Run FastAPI with gunicorn/uvicorn (e.g. behind systemd or supervisor) so Nginx can proxy to it.
- [ ] **Config**: Set `DATABASE_URL`, `STORAGE_PATH`, `STORAGE_MAIN_FOLDER` (and optionally `STORAGE_USER`/`STORAGE_PASSWORD` for remote), `SECRET_KEY`, `ALLOWED_ORIGINS` (your frontend origin), etc. in env or `.env` on the VM.

---

## Summary

- **“Replacing Supabase with Nginx and Python”** means: the **database** is managed PostgreSQL (no Supabase), the **API** is FastAPI (replacing Supabase client + RPCs), and **files** go through the backend to Blob/Cloud Storage. **Nginx** serves the React app and proxies to FastAPI.
- The ~$50/month stack (VM + managed Postgres + 300 GB blob) is enough for this setup; the VM runs Nginx + FastAPI and optionally serves the frontend from the same host.
