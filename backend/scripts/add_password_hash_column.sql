-- Add password_hash to users table (required for session login).
-- Run against your database: psql -U postgres -d your_db -f backend/scripts/add_password_hash_column.sql
-- Or run this in your SQL client (pgAdmin, DBeaver, etc.)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN users.password_hash IS 'Bcrypt hash for users-table auth.';

-- Set default passwords for admin and user (admin123, user123)
UPDATE users
  SET password_hash = crypt('admin123', gen_salt('bf'))
  WHERE user_name = 'admin' AND (password_hash IS NULL OR password_hash = '');

UPDATE users
  SET password_hash = crypt('user123', gen_salt('bf'))
  WHERE user_name = 'user' AND (password_hash IS NULL OR password_hash = '');
