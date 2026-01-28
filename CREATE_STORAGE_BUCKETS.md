# Create Storage Buckets

The application requires two storage buckets to be created in your Supabase project:

1. **`structure-drawings`** - For asset structure drawings (PDFs/images)
2. **`dwg-files`** - For measurement drawings (PDFs/images)

## ⚡ QUICK START - Run This SQL Script (Easiest Method)

**Fastest way to create both buckets:**

1. Open your Supabase Dashboard: https://app.supabase.com
2. Go to **SQL Editor** → **New Query**
3. Open the file `CREATE_BUCKETS_NOW.sql` in this project
4. Copy the entire contents and paste into the SQL Editor
5. Click **"Run"** (or press Ctrl+Enter)
6. You should see both buckets created successfully!

The script will:
- ✅ Create `structure-drawings` bucket
- ✅ Create `dwg-files` bucket  
- ✅ Set up all required RLS policies for both buckets
- ✅ Verify the buckets exist

**After running the script, refresh your application and try uploading/downloading files again.**

---

## Option 1: Create via Supabase Dashboard (Manual Method)

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to **Storage** in the left sidebar
4. Click **"New bucket"**
5. Create the first bucket:
   - **Name**: `structure-drawings`
   - **Public bucket**: Unchecked (private)
   - **File size limit**: 50 MB
   - **Allowed MIME types**: `application/pdf, image/jpeg, image/jpg, image/png, image/gif, image/webp`
   - Click **"Create bucket"**
6. Create the second bucket:
   - **Name**: `dwg-files`
   - **Public bucket**: Unchecked (private)
   - **File size limit**: 50 MB
   - **Allowed MIME types**: `application/pdf, image/jpeg, image/jpg, image/png, image/gif, image/webp`
   - Click **"Create bucket"**

7. After creating both buckets, you need to set up RLS policies. Go to **Storage** → **Policies** and create policies for each bucket:

   For `structure-drawings`:
   - **Policy name**: "Allow read from structure-drawings"
   - **Allowed operation**: SELECT
   - **Target roles**: anon, authenticated
   - **USING expression**: `bucket_id = 'structure-drawings'`
   
   - **Policy name**: "Allow upload to structure-drawings"
   - **Allowed operation**: INSERT
   - **Target roles**: anon, authenticated
   - **WITH CHECK expression**: `bucket_id = 'structure-drawings'`
   
   - **Policy name**: "Allow update structure-drawings"
   - **Allowed operation**: UPDATE
   - **Target roles**: anon, authenticated
   - **USING expression**: `bucket_id = 'structure-drawings'`
   - **WITH CHECK expression**: `bucket_id = 'structure-drawings'`
   
   - **Policy name**: "Allow delete from structure-drawings"
   - **Allowed operation**: DELETE
   - **Target roles**: anon, authenticated
   - **USING expression**: `bucket_id = 'structure-drawings'`

   Repeat the same policies for `dwg-files` bucket (replace `structure-drawings` with `dwg-files` in the expressions).

## Option 2: Run SQL Migrations

If you have the necessary permissions, you can run the SQL migrations:

1. Go to **SQL Editor** in your Supabase Dashboard
2. Run the migration file: `20260131000004_ensure_all_storage_buckets_exist.sql`
3. Then run: `20260131000003_add_storage_rls_policies_dwg_files.sql`
4. Also ensure the `structure-drawings` RLS policies exist (run `20260126183515_20260126040000_add_storage_rls_policies.sql`)

## Option 3: Use Supabase CLI

If you have Supabase CLI installed:

```bash
# Link your project (if not already linked)
supabase link --project-ref your-project-ref

# Run migrations
supabase migration up
```

## Verify Buckets Exist

After creating the buckets, verify they exist by:

1. Going to **Storage** in the Supabase Dashboard
2. You should see both `structure-drawings` and `dwg-files` buckets listed

Or run this SQL query in the SQL Editor:

```sql
SELECT id, name, public, file_size_limit 
FROM storage.buckets 
WHERE id IN ('structure-drawings', 'dwg-files');
```

You should see both buckets returned.

## Troubleshooting

If you still get "Bucket not found" errors:

1. **Check bucket names**: Ensure they are exactly `structure-drawings` and `dwg-files` (case-sensitive, with hyphens)
2. **Check RLS policies**: Make sure the policies allow the operations you need
3. **Check permissions**: Ensure your Supabase project has storage enabled
4. **Refresh the app**: After creating buckets, refresh your application
