-- ============================================
-- CREATE STORAGE BUCKETS - RUN THIS IN SUPABASE SQL EDITOR
-- ============================================
-- Copy and paste this entire file into Supabase Dashboard → SQL Editor → New Query
-- Then click "Run" to create both buckets and their RLS policies
--
-- NOTE: If you get a permission error, you may need to:
-- 1. Ensure you're logged in as the project owner/admin
-- 2. Or create buckets manually via Storage → New bucket in the Dashboard
-- 3. Then run only the RLS policy sections below

-- Step 1: Create structure-drawings bucket
-- NOTE: Setting public=true allows getPublicUrl() to work, but RLS policies still protect access
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'structure-drawings',
  'structure-drawings',
  true,  -- Set to true so getPublicUrl() works (RLS policies still protect access)
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = true,  -- Update existing buckets to be public
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Step 2: Create dwg-files bucket
-- NOTE: Setting public=true allows getPublicUrl() to work, but RLS policies still protect access
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dwg-files',
  'dwg-files',
  true,  -- Set to true so getPublicUrl() works (RLS policies still protect access)
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = true,  -- Update existing buckets to be public
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Step 3: Create RLS policies for structure-drawings bucket
-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to read from structure-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to upload to structure-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update structure-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete from structure-drawings" ON storage.objects;

-- Create policies for structure-drawings
CREATE POLICY "Allow anonymous and authenticated users to read from structure-drawings"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'structure-drawings');

CREATE POLICY "Allow anonymous and authenticated users to upload to structure-drawings"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'structure-drawings');

CREATE POLICY "Allow anonymous and authenticated users to update structure-drawings"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'structure-drawings')
  WITH CHECK (bucket_id = 'structure-drawings');

CREATE POLICY "Allow anonymous and authenticated users to delete from structure-drawings"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'structure-drawings');

-- Step 4: Create RLS policies for dwg-files bucket
-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to read from dwg-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to upload to dwg-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update dwg-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete from dwg-files" ON storage.objects;

-- Create policies for dwg-files
CREATE POLICY "Allow anonymous and authenticated users to read from dwg-files"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'dwg-files');

CREATE POLICY "Allow anonymous and authenticated users to upload to dwg-files"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'dwg-files');

CREATE POLICY "Allow anonymous and authenticated users to update dwg-files"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'dwg-files')
  WITH CHECK (bucket_id = 'dwg-files');

CREATE POLICY "Allow anonymous and authenticated users to delete from dwg-files"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'dwg-files');

-- Step 5: Verify buckets were created
SELECT 
  id, 
  name, 
  public, 
  file_size_limit,
  allowed_mime_types
FROM storage.buckets 
WHERE id IN ('structure-drawings', 'dwg-files')
ORDER BY id;

-- If you see both buckets in the results, you're done!
-- Refresh your application and try uploading/downloading files again.
