-- Allow user_role 'inspector' (פקח) in addition to admin and user.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_role_check;
ALTER TABLE users ADD CONSTRAINT users_user_role_check
  CHECK (user_role IN ('admin', 'user', 'inspector'));
COMMENT ON COLUMN users.user_role IS 'User role: admin (full), user (read-only), inspector (פקח)';
