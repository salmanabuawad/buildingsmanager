-- Add shared_business_area field to buildings table
-- This field represents shared business/commercial area in the building

ALTER TABLE buildings 
ADD COLUMN IF NOT EXISTS shared_business_area NUMERIC(10, 2);

-- Add comment
COMMENT ON COLUMN buildings.shared_business_area IS 'Shared business/commercial area in the building (שטח משותף עסקים)';

