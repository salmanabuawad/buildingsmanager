/*
  # Create Storage Bucket for Structure Drawings

  1. New Storage Bucket
    - `structure-drawings` - Stores structure drawing files (PDF, DWG, images, etc.)
  
  2. Security
    - Allow authenticated and anonymous users to upload files
    - Allow authenticated and anonymous users to read/download files
    - Files are organized by asset ID for easy management
*/

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('structure-drawings', 'structure-drawings', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can upload structure drawings" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can view structure drawings" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can update structure drawings" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can delete structure drawings" ON storage.objects;
END $$;

-- Allow anyone to upload structure drawings
CREATE POLICY "Anyone can upload structure drawings"
  ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'structure-drawings');

-- Allow anyone to view structure drawings
CREATE POLICY "Anyone can view structure drawings"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'structure-drawings');

-- Allow anyone to update structure drawings
CREATE POLICY "Anyone can update structure drawings"
  ON storage.objects
  FOR UPDATE
  TO public
  USING (bucket_id = 'structure-drawings')
  WITH CHECK (bucket_id = 'structure-drawings');

-- Allow anyone to delete structure drawings
CREATE POLICY "Anyone can delete structure drawings"
  ON storage.objects
  FOR DELETE
  TO public
  USING (bucket_id = 'structure-drawings');