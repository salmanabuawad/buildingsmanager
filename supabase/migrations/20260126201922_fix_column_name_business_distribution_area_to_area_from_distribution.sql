/*
  # Fix column naming - Rename business_distribution_area to area_from_distribution
  
  1. Overview
    - The database column is currently named business_distribution_area
    - The frontend code uses area_from_distribution
    - This migration aligns the database with the frontend
  
  2. Changes
    - Rename business_distribution_area to area_from_distribution in assets table
    - Rename business_distribution_area to area_from_distribution in assets_history table
    - Update column comments
*/

-- Check if the column exists with the old name and rename it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assets' 
      AND column_name = 'business_distribution_area'
  ) THEN
    ALTER TABLE assets 
      RENAME COLUMN business_distribution_area TO area_from_distribution;
    
    RAISE NOTICE 'Renamed assets.business_distribution_area to area_from_distribution';
  ELSE
    RAISE NOTICE 'Column assets.business_distribution_area does not exist or already renamed';
  END IF;
END $$;

-- Rename in assets_history table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assets_history' 
      AND column_name = 'business_distribution_area'
  ) THEN
    ALTER TABLE assets_history 
      RENAME COLUMN business_distribution_area TO area_from_distribution;
    
    RAISE NOTICE 'Renamed assets_history.business_distribution_area to area_from_distribution';
  ELSE
    RAISE NOTICE 'Column assets_history.business_distribution_area does not exist or already renamed';
  END IF;
END $$;

-- Update column comments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assets' 
      AND column_name = 'area_from_distribution'
  ) THEN
    COMMENT ON COLUMN assets.area_from_distribution IS 'Area distributed to this asset from shared area distribution (business or residence, depending on asset type)';
  END IF;
  
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'assets_history' 
      AND column_name = 'area_from_distribution'
  ) THEN
    COMMENT ON COLUMN assets_history.area_from_distribution IS 'Area distributed to this asset from shared area distribution (business or residence, depending on asset type) - historical record';
  END IF;
END $$;
