-- =============================================================================
-- Standalone Postgres: run after all migrations (optional)
-- =============================================================================
-- Ensures your application database user can satisfy RLS policies.
-- Replace 'app_user' with the role name you use in DATABASE_URL.
-- =============================================================================

-- Option A: Grant anon and authenticated to your app user (recommended)
-- Then your FastAPI app (using this user) will pass RLS as authenticated.
-- For local dev with user 'postgres' uncomment:
-- GRANT anon TO postgres;
-- GRANT authenticated TO postgres;
-- GRANT anon TO app_user;
-- GRANT authenticated TO app_user;

-- Option B: Disable RLS on all tables (simplest; authorization via FastAPI only)
-- Uncomment the block below if you prefer no RLS and rely entirely on FastAPI auth.
/*
ALTER TABLE address_list DISABLE ROW LEVEL SECURITY;
ALTER TABLE validation_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE buildings DISABLE ROW LEVEL SECURITY;
ALTER TABLE assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE assets_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE field_configurations DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit DISABLE ROW LEVEL SECURITY;
ALTER TABLE change_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE asset_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE asset_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_configuration DISABLE ROW LEVEL SECURITY;
ALTER TABLE operators DISABLE ROW LEVEL SECURITY;
ALTER TABLE managers DISABLE ROW LEVEL SECURITY;
*/

-- Ensure default user exists for audit (used when no JWT)
INSERT INTO users (user_name, auth_user_id, user_email, active, user_role)
SELECT 'default', NULL, NULL, true, 'user'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE user_name = 'default' AND auth_user_id IS NULL LIMIT 1);
