-- Quick script to create user_preferences table
-- Run this in your database if the migration hasn't been applied yet

CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default',
  preference_key text NOT NULL,
  preference_value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, preference_key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_key ON user_preferences(user_id, preference_key);

-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists and create new one
DROP POLICY IF EXISTS "Allow all access to user preferences" ON user_preferences;
CREATE POLICY "Allow all access to user preferences" ON user_preferences
  FOR ALL USING (true);

-- Create trigger for updated_at (assuming the function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
    CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

