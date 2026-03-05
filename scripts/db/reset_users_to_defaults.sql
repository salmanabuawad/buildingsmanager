-- Reset users table: remove all users, then add admin/admin123 and user/user123.
-- Local DB: from repo root, with backend/.env containing DATABASE_URL:
--   psql postgresql://postgres:postgres@localhost:5432/buildingsmanager -f scripts/db/reset_users_to_defaults.sql
-- Or: cd backend && python scripts/reset_users_local.py

-- Require pgcrypto for users_create_internal (crypt/gen_salt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Remove all users
DELETE FROM users;

-- Recreate default users via RPC (sets password_hash and auth_user_id correctly)
SELECT users_create_internal('admin', 'admin@buildingsmanager.local', 'admin123', 'admin');
SELECT users_create_internal('user', 'user@buildingsmanager.local', 'user123', 'user');
