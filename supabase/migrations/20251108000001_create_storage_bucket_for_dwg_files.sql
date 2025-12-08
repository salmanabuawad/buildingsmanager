/*
  # Create Storage Bucket for DWG PDF Files

  1. New Storage Bucket
    - Create `dwg-files` bucket for storing apartment DWG PDF files
  
  2. Security
    - Allow public read access to files
    - Allow anyone to upload files
    - Allow anyone to update/delete their uploaded files
*/

-- Create storage bucket for DWG files
INSERT INTO storage.buckets (id, name, public)
VALUES ('dwg-files', 'dwg-files', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow anyone to read files
CREATE POLICY "DWG files are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'dwg-files');

-- Policy: Allow anyone to upload files
CREATE POLICY "Anyone can upload DWG files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'dwg-files');

-- Policy: Allow anyone to update files
CREATE POLICY "Anyone can update DWG files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'dwg-files')
WITH CHECK (bucket_id = 'dwg-files');

-- Policy: Allow anyone to delete files
CREATE POLICY "Anyone can delete DWG files"
ON storage.objects FOR DELETE
USING (bucket_id = 'dwg-files');
