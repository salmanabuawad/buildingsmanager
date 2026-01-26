/*
  # Add RLS Policies for Storage Bucket
  
  This migration adds Row Level Security policies for the structure-drawings
  storage bucket to allow anonymous and authenticated users to upload, read,
  update, and delete files.
  
  This fixes the error: "new row violates row-level security policy"
  when uploading files to the storage bucket.
*/

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
