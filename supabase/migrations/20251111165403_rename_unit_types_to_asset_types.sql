/*
  # Rename unit_types table to asset_types and update buildings table

  1. Changes
    - Rename `unit_types` table to `asset_types`
    - Rename `total_units` column in `buildings` table to `total_assets`
  
  2. Details
    - All existing data is preserved
    - Indexes, constraints, and RLS policies are maintained
    - Table structure remains identical, only names change
*/

-- Rename unit_types table to asset_types
ALTER TABLE IF EXISTS unit_types RENAME TO asset_types;

-- Rename total_units column to total_assets in buildings table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'total_units'
  ) THEN
    ALTER TABLE buildings RENAME COLUMN total_units TO total_assets;
  END IF;
END $$;
