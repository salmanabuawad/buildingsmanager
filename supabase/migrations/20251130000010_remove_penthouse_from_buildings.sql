/*
  # Remove penthouse column from buildings table
  
  1. Changes
    - Remove `penthouse` column from buildings table
    - This field is not used in the buildings table (it's only used in assets table)
  
  2. Notes
    - This migration is safe to run even if the column doesn't exist
    - The penthouse field remains in the assets table where it's actually used
*/

-- Remove penthouse column from buildings table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'penthouse'
  ) THEN
    ALTER TABLE buildings DROP COLUMN penthouse;
  END IF;
END $$;

