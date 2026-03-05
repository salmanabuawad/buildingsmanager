/*
  # Convert asset_types checkbox fields to boolean
  
  1. Changes
    - Convert elevator, single_double_family, penthouse, condo, townhouses from TEXT to BOOLEAN
    - Set defaults and NOT NULL constraints
    - This fixes the "CASE types text and boolean cannot be matched" error
  
  2. Security
    - No changes to RLS policies
*/

-- First set defaults for NULL values
UPDATE asset_types SET elevator = 'false' WHERE elevator IS NULL OR elevator = '';
UPDATE asset_types SET single_double_family = 'false' WHERE single_double_family IS NULL OR single_double_family = '';
UPDATE asset_types SET penthouse = 'false' WHERE penthouse IS NULL OR penthouse = '';
UPDATE asset_types SET condo = 'false' WHERE condo IS NULL OR condo = '';
UPDATE asset_types SET townhouses = 'false' WHERE townhouses IS NULL OR townhouses = '';

-- Convert TEXT to BOOLEAN for asset_types
ALTER TABLE asset_types 
  ALTER COLUMN elevator TYPE boolean 
  USING (elevator = 'כן' OR elevator = 'true' OR elevator = 'TRUE' OR elevator = '1' OR elevator::text = 'true');

ALTER TABLE asset_types 
  ALTER COLUMN single_double_family TYPE boolean 
  USING (single_double_family = 'כן' OR single_double_family = 'true' OR single_double_family = 'TRUE' OR single_double_family = '1' OR single_double_family::text = 'true');

ALTER TABLE asset_types 
  ALTER COLUMN penthouse TYPE boolean 
  USING (penthouse = 'כן' OR penthouse = 'true' OR penthouse = 'TRUE' OR penthouse = '1' OR penthouse::text = 'true');

ALTER TABLE asset_types 
  ALTER COLUMN condo TYPE boolean 
  USING (condo = 'כן' OR condo = 'true' OR condo = 'TRUE' OR condo = '1' OR condo::text = 'true');

ALTER TABLE asset_types 
  ALTER COLUMN townhouses TYPE boolean 
  USING (townhouses = 'כן' OR townhouses = 'true' OR townhouses = 'TRUE' OR townhouses = '1' OR townhouses::text = 'true');

-- Set defaults and NOT NULL constraints
ALTER TABLE asset_types
  ALTER COLUMN elevator SET DEFAULT false,
  ALTER COLUMN elevator SET NOT NULL,
  ALTER COLUMN single_double_family SET DEFAULT false,
  ALTER COLUMN single_double_family SET NOT NULL,
  ALTER COLUMN penthouse SET DEFAULT false,
  ALTER COLUMN penthouse SET NOT NULL,
  ALTER COLUMN condo SET DEFAULT false,
  ALTER COLUMN condo SET NOT NULL,
  ALTER COLUMN townhouses SET DEFAULT false,
  ALTER COLUMN townhouses SET NOT NULL;

-- Add use_shared_area column as nullable boolean (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'asset_types' AND column_name = 'use_shared_area'
  ) THEN
    ALTER TABLE asset_types ADD COLUMN use_shared_area boolean DEFAULT NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'asset_types' AND column_name = 'use_shared_area' AND data_type = 'text'
  ) THEN
    -- Convert from text to boolean if it's text
    ALTER TABLE asset_types 
      ALTER COLUMN use_shared_area TYPE boolean 
      USING (use_shared_area = 'כן' OR use_shared_area = 'true' OR use_shared_area = 'TRUE' OR use_shared_area = '1' OR use_shared_area::text = 'true');
  END IF;
END $$;
