/*
  # Add townhouses field to buildings table

  1. Changes
    - Add `townhouses` (text) column to buildings table
  
  2. Notes
    - Field is nullable to allow for existing data
    - This field corresponds to טוריים (townhouses) and aligns with the townhouses field in asset_types table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'townhouses'
  ) THEN
    ALTER TABLE buildings ADD COLUMN townhouses text;
  END IF;
END $$;
