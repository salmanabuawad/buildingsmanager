# Supabase Dump and Restore to Local PostgreSQL

Extract the full database (tables, functions, triggers, data) directly from Supabase using `pg_dump`, then restore to local PostgreSQL for an **identical copy**.

## Prerequisites

- **PostgreSQL client tools** – `pg_dump` and `psql` on PATH
- **Supabase database password** – Project Settings → Database → Connection string password
- **VITE_SUPABASE_URL** – In `.env` or `backend\.env` (e.g. `https://mmqnrwjjxewrgwczezzf.supabase.co`)

## One-command sync (recommended)

Dump from Supabase and restore to local in one step. Ensures tables, functions, triggers, and all data are copied:

```powershell
$env:SUPABASE_DB_PASSWORD = "your-supabase-db-password"
.\scripts\sync-local-from-supabase.ps1
```

By default restores into `buildings_manager`. Use `-DbName "other_db"` to change target.

## Manual steps

### 1. Dump from Supabase

Dumps the public schema (tables, functions, triggers, views, sequences, data) to `db_structure/supabase_dump.sql`:

```powershell
$env:SUPABASE_DB_PASSWORD = "your-supabase-db-password"
.\scripts\dump-from-supabase.ps1
```

Or enter the password when prompted.

**Options:**
- `-OutputPath "custom/path.sql"` – Custom output path
- `-SchemaOnly` – Schema only, no data
- `-AllSchemas` – Dump all schemas (auth, storage, etc.); may fail to restore on plain PostgreSQL

### 2. Restore to local

Restores the dump into `buildings_manager` (drops and recreates for a clean copy):

```powershell
.\scripts\restore-supabase-dump-to-local.ps1
```

**Options:**
- `-DumpPath "path/to/dump.sql"` – Custom dump file
- `-DbName "buildings_manager"` – Target database (default: `buildings_manager`)

Creates roles `anon`, `authenticated`, and `service_role` so RLS policies work. Updates `backend\.env` with `PGDATABASE` so the app points at the restored DB.

## Alternative: create-local-db (migrations + seed)

For local development without Supabase access, use migrations + seed (no Supabase connection):

```powershell
.\scripts\create-local-db.ps1
```

This uses `supabase/migrations/` and `db_structure/seed_data.sql` instead of a Supabase dump. Schema comes from migrations; data comes from static seed. For an **identical** copy of Supabase (functions, triggers, current data), use dump/restore or `sync-local-from-supabase.ps1`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `SUPABASE_DB_PASSWORD` | Database password from Supabase dashboard |
| `PGHOST`, `PGUSER`, `PGPORT`, `PGDATABASE`, `PGPASSWORD` | Local PostgreSQL connection (default in `backend\.env`) |

## Where to Find the Database Password

1. Open Supabase project
2. **Project Settings** → **Database**
3. Under **Connection string**, copy the password or use **Database password** / **Reset database password**
