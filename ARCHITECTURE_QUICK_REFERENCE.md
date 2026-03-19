# Architecture Quick Reference

## Target Rule

Business logic belongs in `Python/FastAPI`, not in `Postgres` functions or triggers.

Use the database for:

- tables
- indexes
- foreign keys
- unique constraints
- check constraints

Do not use the database for:

- save orchestration
- audit orchestration
- totals recalculation workflows
- side effects triggered by writes

## Required Pattern

### React

- Keep `App` thin and lazy-load large screens
- Put data access behind typed API/service helpers
- Avoid loading whole tables unless the screen truly needs them

### FastAPI / Python

- Validate input at the schema/service layer
- Put business workflows in service functions
- Wrap multi-step writes in one explicit transaction
- Keep routers thin

### Postgres

- Enforce integrity with schema constraints
- Prefer explicit SQLAlchemy queries from Python services
- Add indexes for real query patterns

### Nginx

- Serve the built frontend statically
- Reverse proxy `/api/*` to FastAPI
- Cache hashed assets aggressively and HTML conservatively

## Do This

```python
with Session(engine) as session:
    with session.begin():
        asset = asset_repo.save(session, payload)
        building_service.update_totals(session, asset.building_number)
        distribution_service.refresh_flags(session, asset.building_number)
        audit_service.log_asset_change(session, asset, user)
```

```tsx
const BuildingsList = lazy(() => import('./components/BuildingsList').then((m) => ({ default: m.BuildingsList })));
```

## Do Not Do This

```sql
select save_asset_transactional(...);
```

```sql
create trigger assets_after_update ...;
```

```ts
await saveAsset();
await updateTotals();
await writeAudit();
```

## Refactor Note

When touching an existing write flow, move orchestration into Python transactions instead of extending DB-side business logic.
