-- ============================================================================
-- Migration: Add user_role column to users table
-- ============================================================================
-- This migration adds a user_role column to the users table to support
-- role-based access control (admin with full permissions, user with read-only)
-- ============================================================================

-- Add user_role column with default 'user' (read-only)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS user_role text DEFAULT 'user' NOT NULL 
CHECK (user_role IN ('admin', 'user'));

-- Create index for faster role lookups
CREATE INDEX IF NOT EXISTS idx_users_user_role ON users(user_role);

-- Update existing users to have 'admin' role by default (can be changed later)
-- This ensures existing users maintain full access
UPDATE users 
SET user_role = 'admin' 
WHERE user_role = 'user' OR user_role IS NULL;

-- Add comment
COMMENT ON COLUMN users.user_role IS 'User role: admin (full permissions) or user (read-only)';