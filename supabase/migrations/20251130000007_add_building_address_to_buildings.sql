/*
  # Add building_address field to buildings table
  
  1. Changes
    - Add building_address column to buildings table
    - building_address: integer that references address_list.street_code
    - This field stores the street code for the building's address
  
  2. Structure
    - building_address: integer (nullable, foreign key to address_list.street_code)
    - Foreign key constraint ensures referential integrity
  
  3. Notes
    - Field is nullable to allow existing buildings without addresses
    - Foreign key constraint ensures only valid street codes can be used
*/

-- Add building_address column to buildings table
ALTER TABLE buildings
ADD COLUMN IF NOT EXISTS building_address integer;

-- Add foreign key constraint to address_list table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_buildings_building_address'
    AND table_name = 'buildings'
  ) THEN
    ALTER TABLE buildings
    ADD CONSTRAINT fk_buildings_building_address
    FOREIGN KEY (building_address)
    REFERENCES address_list(street_code)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

-- Create index on building_address for faster lookups
CREATE INDEX IF NOT EXISTS idx_buildings_building_address ON buildings(building_address);

-- Add comment
COMMENT ON COLUMN buildings.building_address IS 'Street code from address_list table (foreign key to address_list.street_code)';

