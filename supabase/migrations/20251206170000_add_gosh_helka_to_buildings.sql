/*
  # Add gosh and helka columns to buildings table
  
  1. Changes
    - Add `gosh` BIGINT column to buildings table (גוש - Block number)
    - Add `helka` BIGINT column to buildings table (חלקה - Parcel number)
    - Both columns are nullable to allow for existing data
  
  2. Column Details
    - `gosh` (BIGINT) - גוש (Block number)
    - `helka` (BIGINT) - חלקה (Parcel number)
*/

DO $$
BEGIN
  -- Add gosh column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'gosh'
  ) THEN
    ALTER TABLE buildings ADD COLUMN gosh BIGINT;
    COMMENT ON COLUMN buildings.gosh IS 'גוש - Block number';
  END IF;

  -- Add helka column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'helka'
  ) THEN
    ALTER TABLE buildings ADD COLUMN helka BIGINT;
    COMMENT ON COLUMN buildings.helka IS 'חלקה - Parcel number';
  END IF;
END $$;

-- Example queries to show gosh and helka:
-- SELECT building_number, gosh, helka FROM buildings;
-- SELECT building_number, gosh, helka FROM buildings WHERE building_number = 1001;
-- UPDATE buildings SET gosh = 123, helka = 456 WHERE building_number = 1001;

