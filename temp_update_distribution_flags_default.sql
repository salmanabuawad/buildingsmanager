-- Update distribution flags default values to true
-- Both business_shared_area_distributed and residence_shared_area_distributed should default to true

-- First, update the column defaults
ALTER TABLE buildings 
  ALTER COLUMN residence_shared_area_distributed SET DEFAULT true,
  ALTER COLUMN business_shared_area_distributed SET DEFAULT true;

-- Update existing NULL values to true (if any)
UPDATE buildings 
SET residence_shared_area_distributed = true
WHERE residence_shared_area_distributed IS NULL;

UPDATE buildings 
SET business_shared_area_distributed = true
WHERE business_shared_area_distributed IS NULL;

-- Note: We keep existing false values as false (they need distribution)
-- Only NULL values are set to true (assuming they were distributed before)

-- Verify the changes
SELECT 
  column_name,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'buildings'
  AND column_name IN ('residence_shared_area_distributed', 'business_shared_area_distributed');

-- Show current distribution status
SELECT 
  building_number,
  residence_shared_area_distributed,
  business_shared_area_distributed,
  residence_shared_area,
  business_shared_area
FROM buildings
ORDER BY building_number
LIMIT 10;
