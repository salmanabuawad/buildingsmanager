/*
  # Rename apartment column to asset in buildings table

  1. Changes
    - Rename apartment_area column to asset_area in buildings table
  
  2. Notes
    - This aligns naming convention with the assets table structure
*/

-- Rename the column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'apartment_area'
  ) THEN
    ALTER TABLE buildings RENAME COLUMN apartment_area TO asset_area;
  END IF;
END $$;