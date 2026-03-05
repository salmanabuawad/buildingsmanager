/*
  # Rename business_distribution_area to area_from_distribution
  
  1. Overview
    - Renames business_distribution_area to area_from_distribution in assets and assets_history tables
    - This field will serve both business and residence distributions based on asset type
    - Removes residence_distribution_area if it exists (consolidating into single field)
  
  2. Changes
    - Rename column in assets table
    - Rename column in assets_history table
    - Update all comments
    - Remove residence_distribution_area if it exists
*/

-- Rename business_distribution_area to area_from_distribution in assets table
ALTER TABLE assets 
  RENAME COLUMN business_distribution_area TO area_from_distribution;

-- Rename business_distribution_area to area_from_distribution in assets_history table
ALTER TABLE assets_history 
  RENAME COLUMN business_distribution_area TO area_from_distribution;

-- Remove residence_distribution_area if it exists (consolidating into single field)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assets' 
      AND column_name = 'residence_distribution_area'
  ) THEN
    ALTER TABLE assets DROP COLUMN residence_distribution_area;
  END IF;
  
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assets_history' 
      AND column_name = 'residence_distribution_area'
  ) THEN
    ALTER TABLE assets_history DROP COLUMN residence_distribution_area;
  END IF;
END $$;

-- Update column comments
COMMENT ON COLUMN assets.area_from_distribution IS 'Area distributed to this asset from shared area distribution (business or residence, depending on asset type)';
COMMENT ON COLUMN assets_history.area_from_distribution IS 'Area distributed to this asset from shared area distribution (business or residence, depending on asset type) - historical record';

