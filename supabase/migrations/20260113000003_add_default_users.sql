-- ============================================================================
-- Migration: Add default users (admin/admin123 and user/user123)
-- ============================================================================
-- This migration adds two default users to the users table:
-- - admin/admin123: Admin role with full permissions
-- - user/user123: User role with read-only permissions
-- Note: Passwords must be at least 6 characters (Supabase requirement)
-- ============================================================================

-- Insert admin user (if not exists)
INSERT INTO users (auth_user_id, user_name, user_email, user_role, active, created_at, updated_at)
SELECT 
  NULL, -- auth_user_id will be NULL for default users (can be updated later when auth users are created)
  'admin',
  'admin@buildingsmanager.local',
  'admin',
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE user_name = 'admin'
);

-- Insert read-only user (if not exists)
INSERT INTO users (auth_user_id, user_name, user_email, user_role, active, created_at, updated_at)
SELECT 
  NULL, -- auth_user_id will be NULL for default users (can be updated later when auth users are created)
  'user',
  'user@buildingsmanager.local',
  'user',
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE user_name = 'user'
);

-- Add comment
COMMENT ON TABLE users IS 'Users table with role-based access control. Default users: admin (admin role) and user (read-only role)';
