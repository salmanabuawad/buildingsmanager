/*
  # Fix address_list RLS policies to allow anonymous access
  
  1. Changes
    - Update RLS policies to allow anon users to insert, update, and delete
    - This fixes the 401 error when importing street files
    - Matches the pattern used in other tables like asset_types
  
  2. Notes
    - Drops existing policies and recreates them with anon access
    - This allows the application to work without authentication
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to insert address_list" ON address_list;
DROP POLICY IF EXISTS "Allow authenticated users to update address_list" ON address_list;
DROP POLICY IF EXISTS "Allow authenticated users to delete address_list" ON address_list;

-- Create new policies that allow both anon and authenticated users
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

