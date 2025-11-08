/*
  # Remove Generated Building Fields

  1. Changes
    - Remove columns from `buildings` table that are not part of the core building attributes:
      - `address` - Removing address field
      - `city` - Removing city field
      - `total_floors` - Removing total floors field
      - `year_built` - Removing year built field
    - Keep only: id, name, apartment_area, storage_area, pergola_area, balcony_area, total_building_area, created_at
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'address'
  ) THEN
    ALTER TABLE buildings DROP COLUMN address;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'city'
  ) THEN
    ALTER TABLE buildings DROP COLUMN city;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'total_floors'
  ) THEN
    ALTER TABLE buildings DROP COLUMN total_floors;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buildings' AND column_name = 'year_built'
  ) THEN
    ALTER TABLE buildings DROP COLUMN year_built;
  END IF;
END $$;
