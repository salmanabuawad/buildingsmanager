/*
  # Ensure All Storage Buckets Exist
  
  This migration ensures both required storage buckets exist:
  1. structure-drawings - for asset structure drawings
  2. dwg-files - for measurement drawings
  
  This migration is idempotent and can be run multiple times safely.
*/

-- Create structure-drawings bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'structure-drawings',
  'structure-drawings',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create dwg-files bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dwg-files',
  'dwg-files',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

SELECT 'All required storage buckets verified/created successfully' as status;
