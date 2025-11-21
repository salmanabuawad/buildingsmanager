/*
  # Add fields to buildings table

  1. Changes
    - Add `single_double_family` (text) column to buildings table
    - Add `condo` (text) column to buildings table
    - Add `shelter` (text) column to buildings table
  
  2. Notes
    - All new fields are nullable to allow for existing data
    - These fields align with similar fields in the asset_types table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'single_double_family'
  ) THEN
    ALTER TABLE buildings ADD COLUMN single_double_family text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'condo'
  ) THEN
    ALTER TABLE buildings ADD COLUMN condo text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'shelter'
  ) THEN
    ALTER TABLE buildings ADD COLUMN shelter text;
  END IF;
END $$;
