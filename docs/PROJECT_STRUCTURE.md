# Project Structure & Best Practices

React + Python FastAPI + Nginx + PostgreSQL. All business logic and transactions run in Python; the database has no functions or triggers.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Nginx                                                          │
│  ├── /          → static (React build)                           │
│  └── /api/*     → FastAPI backend                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│  FastAPI (Python)        │                                        │
│  ├── routers/           → API endpoints                          │
│  ├── services/          → business logic                         │
│  ├── transactions/      → multi-step DB work (replaces RPCs)    │
│  ├── repos/              → DB access layer                       │
│  └── db_rpc.py           → execute_sql, raw SQL (no RPC calls)  │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│  PostgreSQL                                                      │
│  • Tables, indexes, constraints only                             │
│  • NO stored functions, NO triggers                              │
│  • Logic: Python transactions                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend (Python)

### Layout

```
backend/app/
  main.py              # FastAPI app, router registration
  config.py            # Settings (DATABASE_URL, etc.)
  database.py          # SQLAlchemy engine, session
  auth.py              # JWT decode
  db_rpc.py            # execute_sql(), transaction context (raw SQL)
  
  routers/             # HTTP API
    auth.py
    buildings.py
    assets.py
    data.py
    files.py
    inspection_tasks.py
    ...
  
  services/            # Business logic (services call transactions)
    asset_service.py
    building_service.py
    audit_service.py
    ...
  
  transactions/        # Multi-step DB operations (replaces DB functions)
    save_assets_bulk.py
    building_assets.py
    audit.py
    asset_queries.py
    users.py
    asset_types.py
    ...
  
  repos/               # DB access layer (Repository pattern – all DB goes through repos)
    base_repo.py       # BaseRepo, transaction – only file that imports db_rpc
    building_repo.py
    asset_repo.py
    audit_repo.py
    users_repo.py
    inspection_repo.py
    asset_file_repo.py
    data_repo.py
    metadata_repo.py
    asset_type_repo.py
```

### DB Access Rules (no direct access – use repos)

1. **No direct DB access** – Routers, services, transactions, and auth must not use `db.execute(text(...))` or `db.query(Model)`. All table access goes through repos. See `.cursor/rules/no-direct-db-use-repos.mdc`.
2. **Only repos import `db_rpc`** – Routers, services, and transactions use repos; only `base_repo.py` imports `db_rpc`.
3. **Use `transaction()` from `app.repos`** for multi-statement work; pass `conn` to repos when needed.
4. **Repos encapsulate SQL** – `BuildingRepo`, `AssetRepo`, `AuditRepo`, `UsersRepo`, `AssetFileRepo`, `SystemConfigRepo`, etc.
5. **Migrations** – only schema: tables, columns, indexes, constraints. No `CREATE FUNCTION`, no `CREATE TRIGGER`.

---

## Database

### Schema Only

- Tables, columns, foreign keys, indexes
- No stored procedures, no functions, no triggers
- All behavior: Python transactions

### Migrations

- Location: `migrations/*.sql`
- Run in order by filename (timestamp prefix)
- Dropping functions/triggers: `20260249000000`, `20260250000000`, `20260251000000` – ensure these run if migrating from legacy DB

---

## Frontend (React)

### Layout

```
src/
  lib/
    api.ts             # High-level API (assets, buildings, etc.)
    apiClient.ts      # Supabase-like .from() → FastAPI /api/data/...
    restClient.ts     # REST helpers (save-bulk, delete, etc.)
    appConfig.ts      # API base URL
  components/
  ...
```

### Flow

- React → `api.from('table')` / `api.assets.saveBulkTransactional()` → FastAPI `/api/data/...` or `/api/assets/...` → Python → Postgres

---

## Nginx

- Static: React build from `dist/`
- Proxy: `/api` → `http://127.0.0.1:8000` (FastAPI)
- See `docs/replace-supabase-with-nginx-python.md`, `docs/PROXY_API.md`

---

## Checklist for New Features

- [ ] Backend logic in Python (transactions or services), not in Postgres
- [ ] Migrations change schema only (no functions/triggers)
- [ ] Use `execute_sql()` / `transaction()` for DB access
- [ ] Frontend calls FastAPI endpoints, not direct DB
