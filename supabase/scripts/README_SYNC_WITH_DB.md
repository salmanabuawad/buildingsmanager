# Sync with database before applying migrations

**The live database is the single source of truth.** Migration files and code may be out of sync with what is actually deployed.

**Always sync with the DB before applying any migration.**

## Sync before apply (standard workflow)

1. **Sync first** – Probe the live DB so you know current state:
   - **With Supabase MCP**: Use `list_migrations` and `execute_sql` (e.g. run queries from `sync_with_db_queries.sql`) to see applied migrations and table/column state.
   - **Without MCP**: Run `npm run db:sync` (requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`), then run the queries in **Supabase Dashboard → SQL Editor** from `sync_with_db_queries.sql`.
2. **Apply only if needed** – Apply a migration only when:
   - It is **not** already in the applied migrations list, and
   - The schema change is not already present in the DB (e.g. column already exists).
3. **Never apply blindly** – Skipping sync can lead to duplicate migrations, missing columns, or trigger errors (e.g. referencing dropped columns like `floor`).

## Quick probe (runnable script)

From the project root, with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in env or `.env`:

```bash
npm run db:sync
```

This runs **`sync-with-db.mjs`**: it probes the live Supabase DB for `users`, `assets`, `operators` and reports whether each table exists. Use this to confirm state before applying changes.

## Mandatory workflow

1. **Check the live database**:
   - **Quick**: Run `npm run db:sync` (see above).
   - **Supabase MCP** (if enabled): Use `list_migrations`, `list_tables`, `execute_sql`; use `apply_migration` to apply after verifying.
   - **Without MCP**: Open **Supabase Dashboard → SQL Editor**, run the queries in **`sync_with_db_queries.sql`** (same folder as this README), or the [quick reference queries](.cursor/rules/database-single-source-of-truth.mdc).

2. **Use the results** to decide what to apply:
   - If a table or column already exists with the same definition, the migration may use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` and is safe to run.
   - If the live DB differs (e.g. different column types), adjust the migration or fix the DB first so they match.

3. **Then** run your migration (via MCP `apply_migration`, or Supabase SQL Editor, or `supabase db push`).

## Apply all migrations (when not using MCP)

1. **Option A – Supabase CLI** (after one-time setup):
   ```bash
   npx supabase login
   npx supabase link --project-ref mmqnrwjjxewrgwczezzf
   npx supabase db push
   ```
2. **Option B – Dashboard**: Open [Supabase](https://supabase.com/dashboard/project/mmqnrwjjxewrgwczezzf) → **SQL Editor**, then run each unapplied migration file from `supabase/migrations/` (in timestamp order). Use `npm run db:sync` first to see what already exists.

## Quick reference

| Check            | Query |
|------------------|-------|
| Table columns    | `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'your_table';` |
| RLS policies     | `SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'your_table';` |
| Triggers         | `SELECT * FROM information_schema.triggers WHERE event_object_table = 'your_table';` |

See also: **`.cursor/rules/database-single-source-of-truth.mdc`** in the project root.
