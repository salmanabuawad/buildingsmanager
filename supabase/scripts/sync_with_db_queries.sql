-- =============================================================================
-- SYNC WITH DB: Run this in Supabase SQL Editor BEFORE applying any migration.
-- The live database is the single source of truth. Use the results to confirm
-- current state, then apply migrations that match or safely extend it.
-- =============================================================================

-- 1) Tables that exist in public schema (optional: see if operators / tax_regions_mailing_list exist)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('operators', 'assets', 'tax_regions_mailing_list')
ORDER BY table_name;

-- 2) assets table columns (check for operator_id)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'assets'
ORDER BY ordinal_position;

-- 3) operators table columns (if table exists)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'operators'
ORDER BY ordinal_position;

-- 4) tax_regions_mailing_list columns (if table exists)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tax_regions_mailing_list'
ORDER BY ordinal_position;

-- 5) RLS policies on operators (if table exists)
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'operators';

-- 6) Triggers on operators (if table exists)
SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'operators';

-- 7) export_email_queue table (for email enqueue / worker)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'export_email_queue'
ORDER BY ordinal_position;

-- 8) users table columns (for auth_login / X-Users-Table-Session validation)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 9) Applied migrations (Supabase CLI history; may not exist on hosted project)
-- If this errors with "schema does not exist", ignore; use Dashboard or CLI to see migration history.
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
