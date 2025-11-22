/*
  # Create User Preferences Table

  1. New Table
    - `user_preferences`
      - `id` (uuid, primary key) - Unique identifier
      - `user_id` (text) - User identifier (can be session-based or auth-based)
      - `preference_key` (text) - Key for the preference (e.g., 'buildings_list_column_state')
      - `preference_value` (jsonb) - JSON value for the preference
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record update timestamp
      - Unique constraint on (user_id, preference_key)

  2. Security
    - Enable RLS on the table
    - Add policies for anonymous access (for local dev without auth)
*/

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

-- Policy for anonymous access (for local dev)
CREATE POLICY "Allow all access to user preferences" ON user_preferences
  FOR ALL USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

