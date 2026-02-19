# Sync with database before applying migrations

**The live database is the single source of truth.** Migration files and code may be out of sync with what is actually deployed.

## Mandatory workflow

1. **Query the live database** (Supabase SQL Editor or `psql`):
   - Open **Supabase Dashboard → SQL Editor**.
   - Run the queries in **`sync_with_db_queries.sql`** (same folder as this README).
   - Or run the [quick reference queries](.cursor/rules/database-single-source-of-truth.mdc) for the tables you are changing.

2. **Use the results** to decide what to apply:
   - If a table or column already exists with the same definition, the migration may use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` and is safe to run.
   - If the live DB differs (e.g. different column types), adjust the migration or fix the DB first so they match.

3. **Then** run your migration (e.g. from Supabase SQL Editor or `supabase db push`).

## Quick reference

| Check            | Query |
|------------------|-------|
| Table columns    | `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'your_table';` |
| RLS policies     | `SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'your_table';` |
| Triggers         | `SELECT * FROM information_schema.triggers WHERE event_object_table = 'your_table';` |

See also: **`.cursor/rules/database-single-source-of-truth.mdc`** in the project root.
