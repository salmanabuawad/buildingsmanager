# Supabase as single source of truth

**Supabase DB is the single source of truth** for table structures, functions, and triggers. Local DB and Python code should align with it.

## Workflow

1. **Get schema from Supabase**  
   Run the schema export script against your Supabase Postgres URL (Dashboard → Settings → Database → Connection string, or `SUPABASE_DATABASE_URL`):

   ```bash
   cd backend
   SUPABASE_DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" python scripts/export_schema_from_db.py
   ```

   Or use your local DB to inspect current state:

   ```bash
   cd backend
   python scripts/export_schema_from_db.py
   ```

   This writes `scripts/db/schema_export.json` (table columns, functions, triggers) and prints a short report.

2. **Update local DB structure**  
   Use the export to see what exists in Supabase. Apply migrations from `migrations/` in order so local matches Supabase. The **only intentional difference** between Supabase and local is below.

3. **Python for functions and triggers**  
   Business logic that used to live in DB functions/triggers is implemented in Python under `backend/app/transactions/` (e.g. `building_assets.py`, `audit.py`, `save_assets_bulk.py`). The backend uses the same Postgres (Supabase or local) via `DATABASE_URL`; code uses **introspection** where needed (e.g. `assets_history` columns from `information_schema`) so it works against the live schema. No need to regenerate Python from SQL; keep transaction logic in Python and align schema from Supabase.

## Only local diff: "כן" fields are boolean

In **Supabase**, some columns may still be **TEXT** storing `'כן'` / `'לא'`. In the **local DB**, the migration `20260247100000_convert_ken_lo_text_to_boolean.sql` converts those columns to **BOOLEAN** (כן → true, לא/null/other → false).

Affected columns (by table):

- **buildings**: `elevator`, `single_double_family`, `condo`, `townhouses`
- **assets**: `elevator`, `single_double_family`, `condo`, `townhouses`, `penthouse`, `exported_to_automation`, `data_from_automation`
- **assets_history**: same as assets for elevator/penthouse/etc.; `exported_to_automation`, `data_from_automation`
- **asset_types**: `elevator`, `single_double_family`, `penthouse`, `condo`, `townhouses`, `active`

When syncing or writing migrations:

- **Supabase**: treat these as in the live DB (TEXT or already boolean).
- **Local**: after applying the boolean migration, these columns are boolean; Python and API already handle both (e.g. `extract_boolean_from_jsonb` in DB, or booleans in JSON).

## Audit table: PK is `id`, not `action_id`

The audit table primary key column is **`id`** (not `action_id`). Migrations and Supabase schema use `id`. The backend returns this value as `action_id` in API responses for compatibility. Any INSERT into `audit` should use `RETURNING id`.

## Quick reference

| What              | Where / how |
|-------------------|-------------|
| Table columns     | Run `export_schema_from_db.py` or: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit';` |
| Functions         | Export script dumps public function names and definitions. |
| Triggers          | Export script dumps triggers. Python replaces trigger behavior in `app.transactions`. |
| Align local       | Apply migrations in order; use export to compare with Supabase. |
