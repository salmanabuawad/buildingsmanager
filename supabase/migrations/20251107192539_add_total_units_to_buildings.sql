/*
  # Add Total Units to Buildings

  1. Changes
    - Add `total_units` column to `buildings` table
      - `total_units` (integer) - Total number of units in the building
      - Default value: 0
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'total_units'
  ) THEN
    ALTER TABLE buildings ADD COLUMN total_units integer DEFAULT 0;
  END IF;
END $$;
