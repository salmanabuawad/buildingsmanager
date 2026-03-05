/*
  # Create Storage Bucket for DWG Files (Measurement Drawings)
  
  1. Overview
    - Creates a storage bucket named "dwg-files" for storing PDF/image files for measurements
    - Bucket is created with public=false for security
  
  2. Bucket Details
    - Name: dwg-files
    - Public: false (requires authentication)
    - File size limits: 50MB
    - Allowed mime types: PDFs and images
  
  3. Note
    - RLS policies for storage.objects need to be configured (see next migration)
    - This migration only creates the bucket itself
*/

-- Create the storage bucket for DWG files (measurement drawings)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dwg-files',
  'dwg-files',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

SELECT 'Storage bucket dwg-files created successfully' as status;
