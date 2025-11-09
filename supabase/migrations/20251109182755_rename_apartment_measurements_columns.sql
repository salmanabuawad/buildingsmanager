/*
  # Rename apartment-related columns in apartment_measurements table

  1. Changes
    - Delete orphaned measurement records that reference non-existent assets
    - Rename `apartment_id` column to `asset_id`
    - Rename `apartment_area` column to `asset_area`
    - Update foreign key constraint to reference assets table
    - Recreate generated column with new column name
  
  2. Security
    - All existing RLS policies are preserved
*/

-- Delete orphaned measurement records
DELETE FROM apartment_measurements 
WHERE apartment_id NOT IN (SELECT id FROM assets);

-- Rename the columns
ALTER TABLE apartment_measurements RENAME COLUMN apartment_id TO asset_id;
ALTER TABLE apartment_measurements RENAME COLUMN apartment_area TO asset_area;

-- Update the foreign key constraint to reference the assets table
DO $$
BEGIN
  -- Drop existing foreign key if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'apartment_measurements_asset_id_fkey'
    AND table_name = 'apartment_measurements'
  ) THEN
    ALTER TABLE apartment_measurements DROP CONSTRAINT apartment_measurements_asset_id_fkey;
  END IF;
  
  -- Add new foreign key constraint referencing assets
  ALTER TABLE apartment_measurements 
  ADD CONSTRAINT apartment_measurements_asset_id_fkey 
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;
END $$;

-- Drop and recreate the total_area column with the new formula
ALTER TABLE apartment_measurements DROP COLUMN total_area;
ALTER TABLE apartment_measurements ADD COLUMN total_area numeric 
  GENERATED ALWAYS AS (asset_area + storage_area + pergola_area + balcony_area + COALESCE(garden_area, 0)) STORED;