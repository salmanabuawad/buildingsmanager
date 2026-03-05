# Architecture: React + FastAPI + PostgreSQL + Nginx (REST)

## Stack

| Layer   | Technology   | Role |
|---------|--------------|------|
| Frontend | React (Vite) | SPA; calls REST API only |
| API      | FastAPI      | REST endpoints; service layer; Postgres |
| Database | PostgreSQL   | Data + business logic (functions) |
| Reverse proxy | Nginx  | Serve static build; proxy `/api` to FastAPI |

## Design patterns

### Backend (FastAPI)

- **REST resources:** All operations use resource-based URLs (e.g. `POST /api/auth/session`, `POST /api/assets/save-bulk-transactional`). No generic `/api/rpc/{name}` in frontend.
- **Service layer:** `app/services/` holds business logic and DB access. Routers are thin and call services only.
- **Dependency injection:** FastAPI `Depends()` for auth, DB session, etc.
- **Request/response:** Pydantic models for body and response where applicable; dict for flexible RPC-style payloads that mirror Postgres function params.
- **Errors:** HTTP status codes and consistent error body (`detail`); 500 for unexpected failures.

### Frontend (React)

- **REST client:** `src/lib/restClient.ts` – typed functions per operation (e.g. `authSessionLogin()`, `assetsSaveBulkTransactional()`). No generic `rpc(name, params)`.
- **Table data:** Still via `apiClient` → `GET/POST/PATCH/DELETE /api/data/{table}` for CRUD on address_list, buildings, assets, asset_types, etc. (REST-style resource URLs).
- **Auth:** Session login via `POST /api/auth/session`; session stored in `sessionStorage`; optional JWT for other endpoints.

### Nginx

- **Static:** `root` points to React build (`dist/`); `try_files $uri $uri/ /index.html` for SPA routing.
- **API:** `location /api/` proxies to FastAPI upstream (e.g. `127.0.0.1:8000`).
- **Headers:** `X-Forwarded-*` and `Host` set for backend.

## REST API map (main operations)

| Purpose | Method + path | Body / notes |
|--------|----------------|---------------|
| Session login | `POST /api/auth/session` | `{ user_name, password }` → `{ user_id, user_name, user_role }` |
| Assets bulk save | `POST /api/assets/save-bulk-transactional` | Same as former RPC payload |
| Asset delete | `POST /api/assets/delete-transactional` | RPC payload |
| Assets bulk delete | `POST /api/assets/delete-bulk-transactional` | RPC payload |
| Assets by IDs | `POST /api/assets/by-ids` | `{ p_asset_ids: number[] }` |
| Assets with history | `POST /api/assets/with-history` | RPC payload |
| Copy asset to history | `POST /api/assets/copy-to-history` | `{ p_asset_id }` |
| Mark assets exported | `POST /api/assets/mark-exported` | (none) |
| Search assets by range | `POST /api/assets/search-by-range` | RPC payload |
| Building total area | `POST /api/buildings/update-total-area` | `{ p_building_number }` |
| Buildings bulk distribution | `POST /api/buildings/bulk-distribution-flags` | `{ p_buildings_data }` |
| Asset type update + reset | `POST /api/asset-types/update-with-distribution-reset` | RPC payload |
| Asset types bulk reset | `POST /api/asset-types/bulk-distribution-reset` | RPC payload |
| Audit entry | `POST /api/audit/entry` | RPC payload |
| Audit for asset/building | `POST /api/audit/for-asset`, `.../for-building` | RPC payload |
| Change log entry | `POST /api/change-log/entry` | RPC payload |
| Change log history | `POST /api/change-log/history` | RPC payload |
| Users internal | `POST /api/users/internal`, `.../set-password`, `.../ensure-defaults` | RPC payload |
| Metadata | `GET /api/metadata/tables-fields-types` | (none) |
| Table CRUD | `GET/POST/PATCH/DELETE /api/data/{table}` | Query params or body |

## File layout (relevant)

```
backend/
  app/
    main.py              # FastAPI app; mounts routers
    routers/
      auth.py            # POST /api/auth/login, /api/auth/session
      rest_operations.py # REST wrappers (assets, buildings, asset-types, audit, users, metadata)
      data.py            # /api/data/{table} CRUD
      rpc.py             # Legacy POST /api/rpc/{name} (kept for compatibility)
    services/            # Business logic
      auth_service.py
      asset_service.py
      building_service.py
      asset_type_service.py
      audit_service.py
      user_management_service.py
      metadata_service.py
    db_rpc.py            # execute_sql, transaction, execute_in_transaction, fetch_in_transaction

src/
  lib/
    restClient.ts        # REST API client (auth, assets, buildings, …)
    apiClient.ts         # from(), request(); used for /api/data and legacy
    api.ts               # High-level API facade; uses restClient + apiClient (Postgres/FastAPI)
    usersTableAuth.ts    # Session login via restClient.authSessionLogin()

nginx/
  nginx.conf             # Static + /api proxy
```

## Deployment (production)

1. **Build frontend:** `npm run build` → `dist/`
2. **Run backend:** e.g. `gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000`
3. **Configure Nginx:** Use `nginx/nginx.conf`; set `root` to `dist/` and proxy `/api` to backend.
4. **Database:** Apply Supabase/Postgres migrations; set `DATABASE_URL` for FastAPI.

See **STANDALONE_FASTAPI_NGINX.md** and **nginx/nginx.conf** for details.
