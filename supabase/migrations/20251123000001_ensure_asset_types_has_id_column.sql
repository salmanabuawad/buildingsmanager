/*
  # Ensure asset_types table has id column
  
  1. Changes
    - If asset_type column exists, rename it back to id
    - This ensures consistency with the API code that uses .eq('id', id)
  
  2. Notes
    - The table should have id as primary key based on the latest migration (20251122140000)
    - This migration handles the case where migration 20251121073327 renamed id to asset_type
*/

-- Check if asset_type column exists and rename it to id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'asset_types' 
    AND column_name = 'asset_type'
  ) THEN
    ALTER TABLE asset_types RENAME COLUMN asset_type TO id;
  END IF;
END $$;

