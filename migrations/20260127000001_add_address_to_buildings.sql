-- Add address column to buildings table
-- This column will reference address_list.street_code via foreign key
-- and will be displayed as a dropdown in the UI

ALTER TABLE buildings
ADD COLUMN IF NOT EXISTS address INTEGER;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_buildings_address ON buildings(address);

-- Add foreign key constraint to address_list
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'address_list'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_buildings_address'
      AND table_name = 'buildings'
    ) THEN
      ALTER TABLE buildings
      ADD CONSTRAINT fk_buildings_address
      FOREIGN KEY (address)
      REFERENCES address_list(street_code)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN buildings.address IS 'Street code from address_list table (foreign key to address_list.street_code) - displayed as dropdown in UI';
