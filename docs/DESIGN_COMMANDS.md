# Design Commands – Keep Architecture When Adding Changes

Run these checks and follow these steps when adding or changing code. Use Cursor rules or this doc as reference.

---

## Quick checks (run before commit)

```powershell
# Full design compliance check (recommended)
.\scripts\check_design.ps1
```

On Linux/macOS:
```bash
./scripts/check_design.sh
```

**Manual checks:**
```powershell
# Backend imports
cd backend; python -c "from app.main import app; print('OK')"

# No direct db_rpc outside base_repo (use ripgrep if available)
rg "from app\.db_rpc|import db_rpc" backend/app --glob "!**/base_repo.py" --glob "!**/db_rpc.py"

# No CREATE FUNCTION / TRIGGER in migrations
rg "CREATE (FUNCTION|TRIGGER)" migrations/

# Frontend build
npm run build
```

---

## Layer flow

| Layer | Location | Does | Does NOT |
|-------|----------|------|----------|
| **Router** | `routers/` | Parse request, call service, return HTTP | Business logic, SQL, direct DB |
| **Service** | `services/` | Orchestrate, validate, call transaction/repo | Raw SQL, HTTP details, direct DB |
| **Transaction** | `transactions/` | Multi-step DB work, call repos | db_rpc directly, db.query() |
| **Repo** | `repos/` | SQL via BaseRepo (db_rpc) | Skip repos |

**No direct DB access** – All table access goes through repos. No `db.execute(text(...))` or `db.query(Model)` outside repos. See `.cursor/rules/no-direct-db-use-repos.mdc`.

---

## Adding a new resource endpoint

1. **Repo** (if new table or new queries):
   ```text
   backend/app/repos/{resource}_repo.py
   - Extend BaseRepo
   - Methods: get_by_id, get_all, insert, update, delete (as needed)
   - Only this file and base_repo import db_rpc
   ```

2. **Transaction** (if multi-step or audit):
   ```text
   backend/app/transactions/{resource}.py
   - Use transaction() from app.repos
   - Call repos with conn for transactional work
   ```

3. **Service**:
   ```text
   backend/app/services/{resource}_service.py
   - Static methods that call transaction/repo
   - No HTTP, no raw SQL
   ```

4. **Router**:
   ```text
   backend/app/routers/{resource}.py
   - Depends(get_current_user_users_table) for protected routes
   - Router → Service only
   - HTTPException with appropriate status
   ```

5. **Register router** in `main.py`:
   ```python
   app.include_router(resource.router, prefix="/api/resource-name", tags=["Resource"])
   ```

---

## Adding a migration

```text
migrations/YYYYMMDDHHMMSS_description.sql
```

**Allowed:**
- `CREATE TABLE`, `ALTER TABLE`, `ADD COLUMN`, `DROP COLUMN`
- `CREATE INDEX`, `DROP INDEX`
- `ADD CONSTRAINT`, `DROP CONSTRAINT`
- `COMMENT ON`

**Not allowed:**
- `CREATE FUNCTION`
- `CREATE TRIGGER`
- `CREATE OR REPLACE FUNCTION`

If logic is needed → implement in `backend/app/transactions/`.

---

## Adding auth to an endpoint

```python
from app.users_table import get_current_user_users_table

@router.post("/path")
def handler(body: Body, _user=Depends(get_current_user_users_table)):
    ...
```

- Session login returns `access_token`; frontend sends `Authorization: Bearer <token>`.
- All mutation and data endpoints require auth.

---

## Adding a frontend API call

1. **REST endpoint** → use `restClient.ts` (sends Bearer from session):
   ```typescript
   export async function resourceAction(payload: Payload) {
     return rest<Response>('POST', '/resource/action', payload);
   }
   ```

2. **Data API** (read-only) → use `apiClient.ts`:
   ```typescript
   const { data } = await api.from('table').select('*').eq('col', val);
   ```

3. **Both** use `getAccessToken()` from `usersTableAuth.ts` for Bearer.

---

## Rate limiting (auth-like endpoints)

```python
from app.limiter import limiter

@router.post("/sensitive")
@limiter.limit("10/minute")
def handler(request: Request, ...):
    ...
```

---

## Error handling

- **Router**: `raise HTTPException(status_code=500, detail=_error_detail(e))`
- **Production**: No `str(exc)` in responses. Use `_error_detail()` from rest_operations or settings.ENVIRONMENT check.

---

## Checklist for new features

- [ ] DB logic in Python (transactions/repos), not in Postgres
- [ ] No direct DB access – use repos only (no db.execute(text), no db.query in routers)
- [ ] Migrations: schema only (no functions/triggers)
- [ ] New endpoints: `Depends(get_current_user_users_table)`
- [ ] Router → Service → Transaction/Repo flow
- [ ] One REST call per use case (no chained generic deletes)
- [ ] HTTPException with safe `detail` in production
- [ ] Frontend uses `restClient` or `apiClient` with Bearer

---

## File reference

| Concern | File |
|---------|------|
| Architecture | `docs/PROJECT_STRUCTURE.md` |
| API rules | `docs/API_DESIGN_STANDARDS.md` |
| No DB functions | `.cursor/rules/no-db-functions-triggers.mdc` |
| No direct DB (use repos) | `.cursor/rules/no-direct-db-use-repos.mdc` |
| API design | `.cursor/rules/api-design-standards.mdc` |
| Auth | `backend/app/users_table.py`, `backend/app/routers/auth.py` |
| Repos | `backend/app/repos/` |
| Services | `backend/app/services/` |
| Transactions | `backend/app/transactions/` |
