# Local / standalone Postgres (default database)

Use these scripts to create the schema, tables, triggers, and functions on **PostgreSQL** (local or managed). This is the **default** database for the app; the frontend talks to the FastAPI backend, which uses `DATABASE_URL`.

Schema and migrations live in `migrations/`. You can use **Supabase MCP** (if enabled) to compare schema or check for missing objects; the app does not use Supabase at runtime.

## Prerequisites

- PostgreSQL 14+ (or same version as your Supabase project)
- `psql` in PATH (or use the Python runner below)
- Empty database (or one where you want to apply migrations)

## Quick start

1. **Create a database** and set its URL:
   ```bash
   export DATABASE_URL="postgresql://user:password@host:5432/your_db"
   ```

2. **Bootstrap extensions and roles** (once):
   ```bash
   psql "$DATABASE_URL" -f standalone/00_extensions_and_roles.sql
   ```

3. **Apply all migrations** in order:
   - **Linux/macOS:**  
     `./standalone/apply_migrations.sh`
   - **Windows (PowerShell):**  
     `$env:DATABASE_URL = "postgresql://..."; .\standalone\apply_migrations.ps1`

4. **Optional – standalone RLS** (so your app user can access data):
   ```bash
   psql "$DATABASE_URL" -f standalone/post_migration_standalone.sql
   ```
   Edit that file to either:
   - Grant `anon` and `authenticated` to your app user (recommended), or
   - Uncomment the block to disable RLS and rely on FastAPI for auth.

## What you get

- **Tables:** address_list, validation_rules, buildings, assets, assets_history, field_configurations, users, audit, change_log, asset_files, asset_types, system_configuration, operators, managers (and any from migrations).
- **Types:** `audit_action_type` enum.
- **Functions:** All RPCs used by the app (e.g. `save_assets_bulk_transactional`, `update_building_total_area`, `get_assets_by_ids`, `delete_asset_transactional`, `log_audit_entry`, `auth_login`, etc.).
- **Triggers:** e.g. `update_updated_at_column`, `trigger_copy_asset_to_history`, `trigger_normalize_asset_boolean_fields`, `trigger_auto_set_distribution_flags_on_change`, `trigger_reset_export_flags_on_change`, `trigger_update_asset_business_total_area`, and table-specific `updated_at` triggers.
- **RLS:** Policies are applied; use `post_migration_standalone.sql` so your single DB user satisfies them (or disable RLS).

## Alternative: Python migration runner

If you prefer not to use `psql`:

```bash
cd backend
pip install psycopg2-binary
python -c "
import os, psycopg2
from pathlib import Path
conn = psycopg2.connect(os.environ['DATABASE_URL'])
conn.autocommit = True
migrations = sorted(Path('../migrations').glob('*.sql'))
skip = {'import_asset_types_latest.sql'}
for f in migrations:
    if f.name in skip: continue
    print('Applying', f.name)
    conn.cursor().execute(Path(f).read_text(encoding='utf-8', errors='replace'))
conn.close()
print('Done')
"
```

## Schema source

- **Tables/columns:** From Supabase MCP `list_tables` (live DB).
- **Triggers:** From `information_schema.triggers` (public schema).
- **Functions:** From `pg_proc` / `pg_get_functiondef` (public schema); definitions are applied via the migration files.
- **Policies:** From `pg_policies` (public schema); applied by migrations.

## Extensions

- `uuid-ossp`, `pgcrypto` (created in `00_extensions_and_roles.sql`).
- Supabase-specific extensions (`supabase_vault`, `pg_graphql`, etc.) are **not** required for this app.

## Next steps

- Point the **FastAPI** backend `DATABASE_URL` at this database.
- Use **nginx** to serve the React build and proxy `/api` to FastAPI (see `nginx/nginx.conf`).
- Replace frontend Supabase client calls with FastAPI endpoints (see `docs/replace-supabase-with-nginx-python.md` and `docs/STANDALONE_FASTAPI_NGINX.md`).
