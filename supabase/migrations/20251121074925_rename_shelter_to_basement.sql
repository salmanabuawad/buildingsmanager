/*
  # Rename shelter to basement

  1. Changes
    - Rename `shelter` column to `basement` in buildings table
    - Rename `shelter` column to `basement` in asset_types table
  
  2. Notes
    - This is a simple column rename operation
    - All existing data will be preserved
*/

-- Rename shelter to basement in buildings table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'shelter'
  ) THEN
    ALTER TABLE buildings RENAME COLUMN shelter TO basement;
  END IF;
END $$;

-- Rename shelter to basement in asset_types table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_types' AND column_name = 'shelter'
  ) THEN
    ALTER TABLE asset_types RENAME COLUMN shelter TO basement;
  END IF;
END $$;
