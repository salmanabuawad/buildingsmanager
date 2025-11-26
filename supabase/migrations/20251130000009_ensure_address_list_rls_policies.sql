/*
  # Ensure address_list RLS policies allow all operations
  
  1. Changes
    - Drop all existing policies on address_list to avoid conflicts
    - Recreate policies that allow both anon and authenticated users
    - This ensures inserts work during import operations
  
  2. Notes
    - This migration is idempotent - safe to run multiple times
    - Ensures the application can import addresses without authentication
*/

-- Drop all existing policies on address_list
DROP POLICY IF EXISTS "Allow public read access to address_list" ON address_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert address_list" ON address_list;
DROP POLICY IF EXISTS "Allow authenticated users to insert address_list" ON address_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update address_list" ON address_list;
DROP POLICY IF EXISTS "Allow authenticated users to update address_list" ON address_list;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete address_list" ON address_list;
DROP POLICY IF EXISTS "Allow authenticated users to delete address_list" ON address_list;

-- Ensure RLS is enabled
ALTER TABLE address_list ENABLE ROW LEVEL SECURITY;

-- Create policies that allow both anon and authenticated users for all operations
CREATE POLICY "Allow public read access to address_list"
  ON address_list
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anonymous and authenticated users to insert address_list"
  ON address_list
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to update address_list"
  ON address_list
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to delete address_list"
  ON address_list
  FOR DELETE
  TO anon, authenticated
  USING (true);

