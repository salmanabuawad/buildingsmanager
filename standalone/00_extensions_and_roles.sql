-- =============================================================================
-- Standalone Postgres: extensions and roles (run once before migrations)
-- =============================================================================
-- Use this on a fresh Postgres database that will replace Supabase.
-- Run 00_extensions_and_roles.sql first, then apply migrations, then
-- post_migration_standalone.sql (optional, for RLS compatibility).
-- =============================================================================

-- Extensions required by the schema (same as Supabase project)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Optional: for gen_random_uuid() if not using pgcrypto
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Roles used by RLS policies (Supabase uses anon, authenticated)
-- Create them so policies apply; grant your app user these roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- Grant usage on schema public to anon and authenticated
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- After migrations: grant your app database user (e.g. app_user) so RLS sees it as authenticated:
-- GRANT authenticated TO app_user;
-- GRANT anon TO app_user;
