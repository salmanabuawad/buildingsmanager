-- Script to check and fix asset_files RLS policies
-- Run this directly in your database to check current policies and apply fix

-- 1. Check current policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'asset_files';

-- 2. Drop old policies (if they exist)
DROP POLICY IF EXISTS "Public can view asset files" ON asset_files;
DROP POLICY IF EXISTS "Public can insert asset files" ON asset_files;
DROP POLICY IF EXISTS "Public can update asset files" ON asset_files;
DROP POLICY IF EXISTS "Public can delete asset files" ON asset_files;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to view asset files" ON asset_files;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert asset files" ON asset_files;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update asset files" ON asset_files;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete asset files" ON asset_files;

-- 3. Create new policies with proper roles
CREATE POLICY "Allow anonymous and authenticated users to view asset files"
  ON asset_files FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anonymous and authenticated users to insert asset files"
  ON asset_files FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to update asset files"
  ON asset_files FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to delete asset files"
  ON asset_files FOR DELETE
  TO anon, authenticated
  USING (true);

-- 4. Verify new policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'asset_files';
