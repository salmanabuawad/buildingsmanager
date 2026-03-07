# Architecture Audit: Repos, No DB Functions/Triggers, Performance

**Last updated:** March 2025

## 1. Repository Pattern

### ✅ Uses Repos (correct)
- **Data router** (`/api/data/*`) – Uses `DataRepo` for all table access
- **rest_operations** – Uses `AssetService`, `BuildingService`, etc. → Python transactions → repos
- **Transactions** – `save_assets_bulk.py`, `building_assets.py`, `asset_types.py`, `buildings_bulk.py`, `users.py`, `metadata.py` – all use repos
- **Auth** – `users_table.py` uses `UsersRepo`
- **Inspection tasks** – Uses `InspectionTaskRepo`, `InspectionReportRepo`, etc.

### ⚠️ Legacy routers (direct ORM – migrate over time)
These use `db.query(Model)` and should eventually use repos:
- `routers/buildings.py` – Use `BuildingRepo` via DataRepo or dedicated endpoints
- `routers/assets.py` – Use `AssetRepo`
- `routers/asset_types.py` – Use `AssetTypeRepo`
- `routers/audit.py` – Use `AuditRepo`
- `routers/auth.py` – Legacy JWT auth; `users_table` auth uses `UsersRepo`
- `routers/files.py` – One `db.query(User)` for token validation

**Note:** The main frontend CRUD uses `/api/data/{table}` (DataRepo) and `/api/assets/save-bulk-transactional` (Python). The legacy `/api/buildings` and `/api/assets` routers may be unused or used for specific flows.

---

## 2. No DB Functions or Triggers

### Migrations
- **20260249000000** – Drops triggers and trigger-handler functions (auto_update_building_total_area, auto_set_distribution_flags_on_change, etc.)
- **20260313000000** – Drops get_config_value, get_active_email_configuration, etc.
- **20260314000000** – Drops remaining RPC functions (update_building_total_area, copy_asset_to_history_before_update, save_asset_transactional, save_assets_bulk_transactional, get_assets_by_ids, etc.)

### Python replacements
| DB function | Python implementation |
|-------------|------------------------|
| update_building_total_area | `BuildingRepo.update_total_area()` |
| copy_asset_to_history_before_update | `AssetRepo.copy_to_history()` |
| save_assets_bulk_transactional | `save_assets_bulk_transactional()` in `transactions/save_assets_bulk.py` |
| delete_asset_transactional | `delete_asset_transactional()` in `transactions/building_assets.py` |
| update_buildings_bulk_with_distribution_flags | `update_buildings_bulk_with_distribution_flags()` in `transactions/buildings_bulk.py` |
| auto_set_distribution_flags_on_change (trigger) | `BuildingRepo.recompute_distribution_flags()` called from `save_assets_bulk` |

### Apply migrations
```bash
# From repo root, run migrations on target DB
psql $DATABASE_URL -f migrations/20260249000000_drop_triggers_and_functions_supabase_truth.sql
psql $DATABASE_URL -f migrations/20260313000000_ensure_no_db_functions_triggers.sql
psql $DATABASE_URL -f migrations/20260314000000_drop_remaining_db_functions.sql
```

---

## 3. Performance

See `docs/PERFORMANCE_ANALYSIS.md`.

- **DB pool:** pool_size=3, max_overflow=2 (tuned for ~2 concurrent users)
- **Gunicorn:** -w 2 workers
- **Indexes:** Present on assets.building_number, audit, inspection_tasks, etc.
- **Heavy ops:** save_assets_bulk, get_assets_by_ids – single transaction, no N+1
