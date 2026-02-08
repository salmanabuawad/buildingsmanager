/*
  # Add Document File Types to Storage Buckets
  
  This migration adds support for additional file types:
  - .docx (Word documents)
  - .doc (Word documents - legacy)
  - .txt (Text files)
  - .xlsx (Excel spreadsheets)
  
  Updates both storage buckets:
  1. structure-drawings
  2. dwg-files
*/

-- Update structure-drawings bucket to allow document file types
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf', 
  'image/jpeg', 
  'image/jpg', 
  'image/png', 
  'image/gif', 
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- .docx
  'application/msword', -- .doc
  'text/plain', -- .txt
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' -- .xlsx
]
WHERE id = 'structure-drawings';

-- Update dwg-files bucket to allow document file types
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf', 
  'image/jpeg', 
  'image/jpg', 
  'image/png', 
  'image/gif', 
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- .docx
  'application/msword', -- .doc
  'text/plain', -- .txt
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' -- .xlsx
]
WHERE id = 'dwg-files';

SELECT 'Storage buckets updated to allow document file types (.docx, .doc, .txt, .xlsx)' as status;
