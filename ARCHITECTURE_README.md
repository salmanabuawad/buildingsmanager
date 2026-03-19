# Architecture Documentation Index

## Start Here

If you're changing save logic, validation, or backend workflows, read these first:

1. [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md)
2. [ARCHITECTURE_QUICK_REFERENCE.md](ARCHITECTURE_QUICK_REFERENCE.md)

## Architecture Direction

The target design is:

- `React` for UI composition
- `FastAPI/Python` for validation, orchestration, and transactions
- `Postgres` for storage and integrity constraints
- `Nginx` for SPA hosting and `/api` reverse proxy

Business logic should not live in Postgres triggers or stored functions.

## Current Status

The repo still contains transaction/function-oriented material and SQL artifacts from earlier iterations. Do not extend that pattern in new work.

## Recommended Reading Order

### For new feature work

1. Read `ARCHITECTURE_QUICK_REFERENCE.md`
2. Follow `CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md`
3. Implement orchestration in Python service-layer transactions

### For reviews

Check that:

- validation happens before commit
- Python owns the full transaction
- no new DB business functions or triggers were introduced
- schema constraints still protect integrity

## Key Implementation Areas

### Frontend

- `src/App.tsx`
- `src/lib/api.ts`
- `src/lib/apiClient.ts`
- `src/lib/validation.ts`

### Backend

- `backend/app/main.py`
- `backend/app/routers/`
- future service-layer modules should own transaction orchestration

### Database

- migrations should focus on schema, constraints, indexes, and data migration
- avoid adding new workflow logic to SQL functions/triggers

## Related Docs

- `VALIDATION_IMPLEMENTATION.md`
- `VALIDATION_PSEUDOCODE.md`
- `LOCAL_SETUP.md`
- `DEPLOY_SERVER.md`
