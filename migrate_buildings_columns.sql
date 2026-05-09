-- Migration: Add missing columns to buildings table
-- Run this on both production servers

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS building_address integer;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS address integer;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS net_area numeric;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS asset_count integer;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS shared_parking_area numeric;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS number_of_parking_units integer;

-- Add FK constraint for building_address -> address_list(street_code)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_buildings_building_address'
      AND table_name = 'buildings'
  ) THEN
    ALTER TABLE buildings
      ADD CONSTRAINT fk_buildings_building_address
      FOREIGN KEY (building_address) REFERENCES address_list(street_code)
      ON DELETE SET NULL;
  END IF;
END$$;
