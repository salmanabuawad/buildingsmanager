/*
  # Create Storage Bucket for Structure Drawings
  
  1. Overview
    - Creates a storage bucket named "structure-drawings" for storing PDF/image files
    - Bucket is created with public=false for security
  
  2. Bucket Details
    - Name: structure-drawings
    - Public: false (requires authentication)
    - File size limits: 50MB
    - Allowed mime types: PDFs and images
  
  3. Note
    - RLS policies for storage.objects need to be configured via Supabase Dashboard
    - This migration only creates the bucket itself
*/

-- Create the storage bucket for structure drawings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'structure-drawings',
  'structure-drawings',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

SELECT 'Storage bucket structure-drawings created successfully' as status;