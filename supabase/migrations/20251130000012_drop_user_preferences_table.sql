-- Drop user_preferences table and all related objects

-- Drop the trigger first
DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;

-- Drop the table (CASCADE will drop dependent objects like indexes)
DROP TABLE IF EXISTS user_preferences CASCADE;

