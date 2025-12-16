-- Rename distribution flags in buildings table
-- residence_shared_area_distributed -> need_residence_distribution
-- business_shared_area_distributed -> need_business_distribution
-- Logic is inverted: true = needs distribution, false = already distributed

-- Rename columns
ALTER TABLE buildings 
  RENAME COLUMN residence_shared_area_distributed TO need_residence_distribution;

ALTER TABLE buildings 
  RENAME COLUMN business_shared_area_distributed TO need_business_distribution;

-- Update defaults to true (needs distribution)
ALTER TABLE buildings 
  ALTER COLUMN need_residence_distribution SET DEFAULT true,
  ALTER COLUMN need_business_distribution SET DEFAULT true;

-- Invert existing values: true becomes false, false becomes true
-- (old: true = distributed, false = needs; new: true = needs, false = distributed)
UPDATE buildings 
SET need_residence_distribution = NOT COALESCE(need_residence_distribution, false);

UPDATE buildings 
SET need_business_distribution = NOT COALESCE(need_business_distribution, false);

-- Update NULL values to true (needs distribution)
UPDATE buildings 
SET need_residence_distribution = true
WHERE need_residence_distribution IS NULL;

UPDATE buildings 
SET need_business_distribution = true
WHERE need_business_distribution IS NULL;

-- Update comments
COMMENT ON COLUMN buildings.need_residence_distribution IS 
  'Flag indicating if residence shared area needs to be distributed to assets (true = needs distribution, false = already distributed)';

COMMENT ON COLUMN buildings.need_business_distribution IS 
  'Flag indicating if business shared area needs to be distributed to assets (true = needs distribution, false = already distributed)';

-- Verify the changes
SELECT 
  column_name,
  column_default,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name = 'buildings'
  AND column_name IN ('need_residence_distribution', 'need_business_distribution');

-- Show sample data
SELECT 
  building_number,
  need_residence_distribution,
  need_business_distribution,
  residence_shared_area,
  business_shared_area
FROM buildings
ORDER BY building_number
LIMIT 10;

