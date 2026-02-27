-- Allow video files in structure-drawings bucket (asset files can be video too)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/ogg'
]
WHERE id = 'structure-drawings';
