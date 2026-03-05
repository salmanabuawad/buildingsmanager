# Repository Layer (API → Service → Repo → DB)

This document describes the **Windows-friendly** Repository pattern added to the backend: clean separation **API → Service → Repo → DB**. No Docker.

## Backend structure (with Repository)

```
backend/
  app/
    main.py
    api/
      v1.py              # Example: health, users (Repository pattern)
    core/                # (config lives in app/config.py)
    db/
      base.py            # Re-exports Base from app.database
      session.py         # Re-exports get_db, engine from app.database
    models.py            # SQLAlchemy models (User, Building, Asset, ...)
    schemas/
      user.py            # UserCreate, UserOut (Pydantic)
    repos/
      user_repo.py       # UserRepo: list(), get_by_email(), create(), ...
    services/
      user_service.py    # UserService: list_users(), create_user(), ...
    routers/             # Existing routers (auth, buildings, assets, data, ...)
  requirements.txt
  .env
```

## Flow

1. **API** (`app/api/v1.py`): HTTP routes; depends on `get_db`, builds `UserService(UserRepo(db))`, returns responses.
2. **Service** (`app/services/user_service.py`): Business logic (e.g. "email already exists" → `ValueError`).
3. **Repo** (`app/repos/user_repo.py`): DB access only (query, add, commit, refresh).
4. **DB**: Existing `app.database` (engine, SessionLocal, get_db).

## Example: User

- **Repo**: `UserRepo(db).list()`, `.get_by_email(email)`, `.get_by_id(id)`, `.create(email=..., full_name=..., ...)`.
- **Service**: `UserService(UserRepo(db)).list_users()`, `.create_user(UserCreate(...))`; raises `ValueError` on duplicate email.
- **API**: `GET /api/v1/users`, `GET /api/v1/users/{user_id}`, `POST /api/v1/users` (body: `UserCreate`).

## Windows: run backend only

From repo root:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1   # if using venv
uvicorn app.main:app --reload --port 8000
```

Or use the script:

```powershell
.\scripts\run-backend.ps1
```

- API docs: `http://localhost:8000/docs`
- Repository-layer health: `http://localhost:8000/api/v1/health`
- List users: `http://localhost:8000/api/v1/users`

## Optional: DI (dependency injection)

Right now the API creates `UserService(UserRepo(db))` inline. For larger apps you can add dependency providers (e.g. `get_user_service`) so wiring is in one place.

## Nginx on Windows

Nginx on Windows is possible but not common for production. Typical options:

- **IIS** as reverse proxy, or
- **Nginx on Linux** (recommended for production), or
- Nginx on Windows for local/prototype only.

If using Nginx on Windows: serve frontend `dist` and proxy `/api` → `http://127.0.0.1:8000`. See `docs/PROXY_API.md` and `nginx/nginx-windows.conf`.

## Frontend (unchanged)

Frontend remains as-is (Vite). Dev on Windows:

```powershell
cd frontend
npm install
npm run dev -- --port 5173
```
