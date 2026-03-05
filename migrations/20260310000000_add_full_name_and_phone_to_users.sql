/*
  Add full_name and phone as optional columns to users table.
  Aligns with Supabase schema (full_name, phone).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE users ADD COLUMN full_name text;
    COMMENT ON COLUMN users.full_name IS 'Full display name of the user (e.g. John Doe)';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone'
  ) THEN
    ALTER TABLE users ADD COLUMN phone text;
    COMMENT ON COLUMN users.phone IS 'Phone number (optional)';
  END IF;
END $$;
