# Standalone deployment: FastAPI + Nginx + Postgres

This document ties together **replacing Supabase** with **standalone Postgres**, **FastAPI**, and **Nginx**.

## Architecture

```
Browser → Nginx (/: static React, /api/: proxy) → FastAPI → Postgres
                                    ↓
                            (optional) Azure Blob / local storage for files
```

- **Nginx:** Serves the React build and proxies `/api/*` to FastAPI.
- **FastAPI:** Uses `DATABASE_URL` (standalone Postgres). Auth via JWT; files via Azure Blob or local storage.
- **Postgres:** Same schema as Supabase (apply migrations from `standalone/`).

## 1. Database (standalone Postgres)

See **standalone/README_STANDALONE_POSTGRES.md**.

1. Create a Postgres database (e.g. Azure, Cloud SQL, or local).
2. Run:
   - `standalone/00_extensions_and_roles.sql`
   - `standalone/apply_migrations.sh` (or `.ps1` on Windows)
   - `standalone/post_migration_standalone.sql` (grant roles or disable RLS).

3. Set `DATABASE_URL` for the FastAPI backend.

## 2. Backend (FastAPI)

- **Config:** `backend/.env` (or environment) with:
  - `DATABASE_URL=postgresql://user:pass@host:5432/dbname`
  - `SECRET_KEY=...`
  - `STORAGE_PATH`, `STORAGE_MAIN_FOLDER` (and optionally `STORAGE_USER`/`STORAGE_PASSWORD` for remote storage)
  - `ALLOWED_ORIGINS` (e.g. `https://your-domain.com`)

- **Run:** From `backend/`:
  - Dev: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
  - Prod: `gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000`

- **Auth:** Session login: `POST /api/auth/session` (body: `user_name`, `password`) returns `{ user_id, user_name, user_role }`. JWT login: `POST /api/auth/login` (body: `username`, `password`). Both use the same `users` table.

## 3. Nginx

- **Config:** Use `nginx/nginx.conf` (copy to your Nginx config dir).
- **Paths:**
  - Set `root` to the directory that contains the React build (e.g. `dist/` after `npm run build`).
  - `upstream fastapi_backend` should point to where FastAPI listens (e.g. `127.0.0.1:8000`).
- **HTTPS:** Uncomment and adjust the HTTPS server block when using Let’s Encrypt or your certificate.

## 4. REST API (implemented)

The app uses **REST endpoints** (see **ARCHITECTURE_REST.md**). Main mappings:

| Operation | REST endpoint |
|-----------|----------------|
| Session login | `POST /api/auth/session` |
| Assets bulk save | `POST /api/assets/save-bulk-transactional` |
| Building total area | `POST /api/buildings/update-total-area` |
| Assets by IDs | `POST /api/assets/by-ids` |
| Delete asset(s) | `POST /api/assets/delete-transactional`, `.../delete-bulk-transactional` |
| Audit / change log | `POST /api/audit/entry`, `.../for-asset`, `.../for-building`, `POST /api/change-log/entry`, `.../history` |
| Users (internal) | `POST /api/users/internal`, `.../set-password`, `.../ensure-defaults` |
| Metadata | `GET /api/metadata/tables-fields-types` |
| Table CRUD | `GET/POST/PATCH/DELETE /api/data/{table}` |

Legacy `POST /api/rpc/{name}` remains available for compatibility.

## 5. Frontend changes

- **API base URL**: Same origin only (`''`). All requests go to `http://<host>/api/*` (e.g. `http://localhost/api/...`). The app does not call the backend by port; Nginx (or your proxy) must proxy `/api` to FastAPI. Override only if the API is on another origin.
- Frontend uses `api` from apiClient and `restClient`; all requests go to `/api/*` (Nginx → FastAPI).

## 6. Checklist

- [ ] Postgres: extensions + roles + migrations + post_migration applied.
- [ ] FastAPI: `DATABASE_URL` and auth aligned with `users` + `auth_login`.
- [ ] FastAPI: Endpoints for all RPCs and tables used by the frontend.
- [ ] Nginx: `root` = React build; proxy `/api` to FastAPI; HTTPS if needed.
- [ ] Frontend: API base URL set; all data via FastAPI.
