/*
  # Add asset group field to assets table

  1. Changes
    - Add `asset_group` (text) column to assets table
  
  2. Notes
    - Field is nullable to allow for existing data
    - This field corresponds to קבוצת נכס (asset group) and aligns with the asset_group field in asset_types table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'asset_group'
  ) THEN
    ALTER TABLE assets ADD COLUMN asset_group text;
  END IF;
END $$;
