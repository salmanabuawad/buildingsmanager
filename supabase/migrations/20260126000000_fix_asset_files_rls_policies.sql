/*
  # Fix Asset Files RLS Policies
  
  This migration fixes the RLS policies for asset_files table to use
  'anon, authenticated' instead of 'public' to ensure proper access control.
  
  This fixes the error: "new row violates row-level security policy"
*/

-- Drop old policies (if they exist)
DROP POLICY IF EXISTS "Public can view asset files" ON asset_files;
DROP POLICY IF EXISTS "Public can insert asset files" ON asset_files;
DROP POLICY IF EXISTS "Public can update asset files" ON asset_files;
DROP POLICY IF EXISTS "Public can delete asset files" ON asset_files;

-- Create new policies with proper roles
-- Use 'anon, authenticated' like address_list table for consistency
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to view asset files" ON asset_files;
CREATE POLICY "Allow anonymous and authenticated users to view asset files"
  ON asset_files FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert asset files" ON asset_files;
CREATE POLICY "Allow anonymous and authenticated users to insert asset files"
  ON asset_files FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update asset files" ON asset_files;
CREATE POLICY "Allow anonymous and authenticated users to update asset files"
  ON asset_files FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete asset files" ON asset_files;
CREATE POLICY "Allow anonymous and authenticated users to delete asset files"
  ON asset_files FOR DELETE
  TO anon, authenticated
  USING (true);
