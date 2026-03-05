# Full System Sync: Supabase → Python/FastAPI

**Supabase** is the single source of truth. The **Python backend** uses Postgres directly and **does not use Supabase** at runtime—no `@supabase/supabase-js`, no Supabase Auth, no Supabase Storage.

## Architecture

| Supabase (source of truth) | Python/FastAPI (runtime) |
|----------------------------|---------------------------|
| Postgres DB                | Same or different Postgres via `DATABASE_URL` |
| Supabase Auth (optional)   | `users` table + `password_hash` (users-table auth) |
| Supabase Storage           | Local/filesystem or S3-style storage |
| Direct Supabase client     | **Not used** – REST API via FastAPI |

## What Must Be Synced

### 1. Schema (tables, columns, constraints, functions, triggers)

Apply migrations from `migrations/` so your Postgres matches Supabase. Use Supabase MCP to verify:

- `list_tables` – full schema
- `list_migrations` – applied migrations
- `execute_sql` – spot-checks

### 2. Reference / Lookup Data (sync from Supabase)

| Table                | Supabase rows | Sync method                          |
|----------------------|---------------|--------------------------------------|
| `field_configurations` | 356         | `sync_field_configs_to_local.py`     |
| `asset_types`          | 163         | `export_supabase_to_seed.py` → JSON → import |
| `address_list`         | 1052        | Same                                 |
| `validation_rules`     | 65          | Same                                 |
| `system_configuration`  | 5           | Same (email templates, config)       |
| `operators`            | 3           | Same                                 |
| `managers`             | 1           | Same                                 |

### 3. Transactional Data (usually not synced)

- `buildings`, `assets`, `assets_history` – per-environment
- `audit`, `change_log` – operational history
- `users` – may sync structure; passwords are env-specific
- `inspection_tasks`, `inspection_reports`, etc. – task data

## Full Sync Workflow

### Option A: Direct DB Connection (recommended)

```powershell
# 1. Export reference data from Supabase to standalone/seed/data/*.json
$env:SUPABASE_DATABASE_URL="postgresql://postgres.[ref]:[pwd]@aws-0-[region].pooler.supabase.com:6543/postgres"
python scripts/export_supabase_to_seed.py

# 2. Apply migrations to target DB (if not already done)
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/buildingsmanager"
.\standalone\apply_migrations.ps1   # or setup_local_db.py --seed

# 3. Import reference data into target DB
python scripts/import_mcp_json_to_local.py --truncate   # if replacing
python scripts/import_mcp_json_to_local.py              # or without truncate for upsert-style

# 4. field_configurations uses upsert (ON CONFLICT DO UPDATE)
python scripts/sync_field_configs_to_local.py --input standalone/seed/data/field_configurations_supabase.json
```

### Option B: MCP-Only (no direct Supabase connection)

1. Use Supabase MCP `execute_sql` to export each reference table:
   - `SELECT * FROM field_configurations` → save to `field_configurations_supabase.json`
   - `SELECT * FROM asset_types` → save to `asset_types.json`
   - etc.
2. Run `import_mcp_json_to_local.py` and `sync_field_configs_to_local.py` as above.

### Option C: Python Backend Points at Supabase Postgres

If `DATABASE_URL` is your Supabase Postgres URL, no data sync is needed—schema and data are already there. Ensure migrations are applied via Supabase MCP `apply_migration` or Dashboard.

## Reference Tables Detail

| Table               | Primary key                      | Upsert/Replace |
|---------------------|----------------------------------|----------------|
| field_configurations| (grid_name, field_name)         | Upsert         |
| asset_types         | id                              | Replace (truncate + insert) |
| address_list        | id                              | Replace       |
| validation_rules     | id (uuid)                       | Replace       |
| system_configuration| id (or name)                    | Replace       |
| operators           | operator_id                     | Replace       |
| managers            | manager_id                      | Replace       |

## Key Differences (Supabase vs Python)

| Aspect       | Supabase                     | Python backend                     |
|-------------|------------------------------|------------------------------------|
| Auth        | Supabase Auth / `auth.users` | `users` table + `password_hash`    |
| Storage     | Supabase Storage buckets     | Local path or S3-compatible       |
| API         | Supabase client, RPC         | FastAPI REST, SQL via psycopg2    |
| DB access   | Supabase pooler/API          | Direct Postgres `DATABASE_URL`     |

## Quick Reference

```powershell
# 1. Export from Supabase (run from machine with Supabase DB access)
$env:SUPABASE_DATABASE_URL="postgresql://postgres.[ref]:[pwd]@...pooler.supabase.com:6543/postgres"
python scripts/export_supabase_to_seed.py

# 2. Import into target DB (Python backend's Postgres)
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/buildingsmanager"
python scripts/import_mcp_json_to_local.py --truncate   # or without --truncate for additive
python scripts/sync_field_configs_to_local.py           # upserts field_configurations
```
