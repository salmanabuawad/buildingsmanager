-- ============================================================================
-- Create asset_files table and fix RLS policies
-- Run this script in Supabase Dashboard > SQL Editor
-- ============================================================================

-- Step 1: Create asset_files table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS asset_files (
  id BIGSERIAL PRIMARY KEY,
  asset_id BIGINT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_size BIGINT,
  file_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by TEXT,
  measurement_date TEXT,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

-- Step 2: Add measurement_date column if it doesn't exist
ALTER TABLE asset_files 
ADD COLUMN IF NOT EXISTS measurement_date TEXT;

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_asset_files_asset_id ON asset_files(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_files_uploaded_at ON asset_files(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_asset_files_asset_id_measurement_date ON asset_files(asset_id, measurement_date);

-- Step 4: Add comments
COMMENT ON TABLE asset_files IS 'Stores multiple files (drawings, documents) associated with assets';
COMMENT ON COLUMN asset_files.asset_id IS 'Reference to the asset this file belongs to';
COMMENT ON COLUMN asset_files.file_url IS 'Public URL of the file in storage';
COMMENT ON COLUMN asset_files.file_name IS 'Original filename';
COMMENT ON COLUMN asset_files.file_size IS 'File size in bytes';
COMMENT ON COLUMN asset_files.file_type IS 'MIME type of the file';
COMMENT ON COLUMN asset_files.measurement_date IS 'Measurement date this file belongs to (NULL = belongs to all measurements, for backward compatibility)';

-- Step 5: Enable RLS
ALTER TABLE asset_files ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop old policies (if they exist)
DROP POLICY IF EXISTS "Public can view asset files" ON asset_files;
DROP POLICY IF EXISTS "Public can insert asset files" ON asset_files;
DROP POLICY IF EXISTS "Public can update asset files" ON asset_files;
DROP POLICY IF EXISTS "Public can delete asset files" ON asset_files;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to view asset files" ON asset_files;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert asset files" ON asset_files;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update asset files" ON asset_files;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete asset files" ON asset_files;

-- Step 7: Create new RLS policies with proper roles
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

-- Step 8: Migrate existing structure_drawing_url data to asset_files (optional)
-- This will copy existing drawing URLs from assets table to asset_files
INSERT INTO asset_files (asset_id, file_url, file_name, uploaded_at, measurement_date)
SELECT 
  asset_id,
  structure_drawing_url,
  CASE 
    WHEN structure_drawing_url IS NOT NULL THEN 
      SPLIT_PART(structure_drawing_url, '/', -1)
    ELSE NULL
  END,
  updated_at,
  measurement_date
FROM assets
WHERE structure_drawing_url IS NOT NULL 
  AND structure_drawing_url != ''
  AND NOT EXISTS (
    SELECT 1 FROM asset_files af 
    WHERE af.asset_id = assets.asset_id 
    AND af.file_url = assets.structure_drawing_url
  );

-- Step 9: Add Storage RLS Policies for structure-drawings bucket
-- Note: RLS is already enabled on storage.objects by Supabase
-- We only need to create the policies

-- Drop existing policies for structure-drawings bucket (if they exist)
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to upload to structure-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to read from structure-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update structure-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete from structure-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload to structure-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Public can read from structure-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Public can update structure-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete from structure-drawings" ON storage.objects;

-- Policy for SELECT (read files)
CREATE POLICY "Allow anonymous and authenticated users to read from structure-drawings"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'structure-drawings');

-- Policy for INSERT (upload files)
CREATE POLICY "Allow anonymous and authenticated users to upload to structure-drawings"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'structure-drawings');

-- Policy for UPDATE (update files)
CREATE POLICY "Allow anonymous and authenticated users to update structure-drawings"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'structure-drawings')
  WITH CHECK (bucket_id = 'structure-drawings');

-- Policy for DELETE (delete files)
CREATE POLICY "Allow anonymous and authenticated users to delete from structure-drawings"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'structure-drawings');

-- Step 10: Verify the table was created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'asset_files'
ORDER BY policyname;

-- Step 11: Verify storage policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage'
ORDER BY policyname;
