/*
  # Add gosh, helka, and building_number_in_street columns to buildings table
  
  1. Changes
    - Add `gosh` BIGINT column to buildings table (גוש - Block number)
    - Add `helka` BIGINT column to buildings table (חלקה - Parcel number)
    - Add `building_number_in_street` BIGINT column to buildings table (מספר בניין - Building number in street)
    - All columns are nullable to allow for existing data
  
  2. Column Details
    - `gosh` (BIGINT) - גוש (Block number)
    - `helka` (BIGINT) - חלקה (Parcel number)
    - `building_number_in_street` (BIGINT) - מספר בניין (Building number in street)
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

  -- Add building_number_in_street column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'building_number_in_street'
  ) THEN
    ALTER TABLE buildings ADD COLUMN building_number_in_street BIGINT;
    COMMENT ON COLUMN buildings.building_number_in_street IS 'מספר בניין - Building number in street';
  END IF;
END $$;

-- Example queries to show gosh, helka, and building_number_in_street:
-- SELECT building_number, gosh, helka, building_number_in_street FROM buildings;
-- SELECT building_number, gosh, helka, building_number_in_street FROM buildings WHERE building_number = 1001;
-- UPDATE buildings SET gosh = 123, helka = 456, building_number_in_street = 789 WHERE building_number = 1001;

