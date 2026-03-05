# File Upload Types Update

## Summary
Added support for additional file types in file uploads:
- `.docx` (Word documents - modern format)
- `.doc` (Word documents - legacy format)
- `.txt` (Text files)
- `.xlsx` (Excel spreadsheets)

## Changes Made

### 1. Frontend Components

#### `src/components/AssetsList.tsx`
- **Line 4694**: Updated `accept` attribute from `"image/*,.pdf,.dwg"` to `"image/*,.pdf,.dwg,.docx,.doc,.txt,.xlsx"`

#### `src/components/AssetDetails.tsx`
- **Line 1929**: Updated `accept` attribute from `"*/*"` to `"image/*,.pdf,.dwg,.docx,.doc,.txt,.xlsx"`

### 2. Supabase Storage Buckets

Updated MIME type restrictions in storage bucket configurations to allow:
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`.docx`)
- `application/msword` (`.doc`)
- `text/plain` (`.txt`)
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (`.xlsx`)

#### Files Updated:
1. **`CREATE_BUCKETS_NOW.sql`** - Main bucket creation script
2. **`migrations/20260126035251_create_storage_bucket_structure_drawings_v2.sql`**
3. **`migrations/20260131000002_create_storage_bucket_dwg_files.sql`**
4. **`migrations/20260131000004_ensure_all_storage_buckets_exist.sql`**

#### New Migration Created:
- **`migrations/20260208000000_add_document_file_types_to_storage_buckets.sql`** - Migration to update existing buckets

### 3. File Type Detection

The file compression utility (`src/lib/fileCompression.ts`) already correctly handles these file types:
- Line 250-252: Recognizes `.doc`, `.docx`, `.xls`, `.xlsx`, `.txt`, `.rtf` as 'document' type
- These files will be categorized correctly for display purposes

## Deployment Steps

### For Existing Databases:

1. **Run the new migration** to update existing storage buckets:
   ```sql
   -- Run in Supabase SQL Editor
   \i migrations/20260208000000_add_document_file_types_to_storage_buckets.sql
   ```

   OR manually update buckets:
   ```sql
   UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     'application/pdf', 
     'image/jpeg', 
     'image/jpg', 
     'image/png', 
     'image/gif', 
     'image/webp',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/msword',
     'text/plain',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
   ]
   WHERE id IN ('structure-drawings', 'dwg-files');
   ```

2. **Deploy frontend changes** - The updated components will now accept these file types in the file input dialogs.

### For New Databases:

The updated migration files will automatically create buckets with the correct MIME types when run in order.

## Testing

After deployment, verify:
1. ✅ File input dialogs show the new file types in the file picker
2. ✅ Uploading `.docx`, `.doc`, `.txt`, `.xlsx` files succeeds
3. ✅ Files are stored correctly in Supabase storage
4. ✅ Files can be downloaded and viewed correctly

## Notes

- **File Compression**: Document files (`.docx`, `.doc`, `.txt`, `.xlsx`) will NOT be compressed (only images are compressed)
- **File Size Limit**: Still 50MB per file (unchanged)
- **Storage Buckets**: Both `structure-drawings` and `dwg-files` buckets support these types
- **Backward Compatibility**: Existing PDF and image uploads continue to work as before
