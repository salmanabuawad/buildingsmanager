-- ============================================================================
-- Fix missing columns based on code expectations and db.csv
-- This script adds any missing columns that the code expects
-- ============================================================================

-- Fix asset_types table: Add non_accountable_for_distribution if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'asset_types' 
      AND column_name = 'non_accountable_for_distribution'
  ) THEN
    ALTER TABLE asset_types 
    ADD COLUMN non_accountable_for_distribution boolean DEFAULT false;
    
    COMMENT ON COLUMN asset_types.non_accountable_for_distribution IS 'Indicates if the asset type should be excluded from distribution calculations (business shared area distribution). Values: true (לא נספר בפיזור) or false (נספר בפיזור)';
    
    RAISE NOTICE 'Added non_accountable_for_distribution column to asset_types table';
  ELSE
    RAISE NOTICE 'Column non_accountable_for_distribution already exists in asset_types table';
  END IF;
END $$;

-- Fix asset_types table: Add non_accountable_for_total_area if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'asset_types' 
      AND column_name = 'non_accountable_for_total_area'
  ) THEN
    ALTER TABLE asset_types 
    ADD COLUMN non_accountable_for_total_area boolean DEFAULT false;
    
    COMMENT ON COLUMN asset_types.non_accountable_for_total_area IS 'Indicates if the asset type should be excluded from total area calculations. Values: true (לא נספר) or false (נספר)';
    
    RAISE NOTICE 'Added non_accountable_for_total_area column to asset_types table';
  ELSE
    RAISE NOTICE 'Column non_accountable_for_total_area already exists in asset_types table';
  END IF;
END $$;

-- Fix assets table: Add business_distribution_area if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'assets' 
      AND column_name = 'business_distribution_area'
  ) THEN
    ALTER TABLE assets 
    ADD COLUMN business_distribution_area numeric DEFAULT 0;
    
    COMMENT ON COLUMN assets.business_distribution_area IS 'Area distributed to this asset from business shared area distribution';
    
    RAISE NOTICE 'Added business_distribution_area column to assets table';
  ELSE
    RAISE NOTICE 'Column business_distribution_area already exists in assets table';
  END IF;
END $$;

-- Fix assets_history table: Add business_distribution_area if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'assets_history' 
      AND column_name = 'business_distribution_area'
  ) THEN
    ALTER TABLE assets_history 
    ADD COLUMN business_distribution_area numeric DEFAULT 0;
    
    COMMENT ON COLUMN assets_history.business_distribution_area IS 'Area distributed to this asset from business shared area distribution (historical record)';
    
    RAISE NOTICE 'Added business_distribution_area column to assets_history table';
  ELSE
    RAISE NOTICE 'Column business_distribution_area already exists in assets_history table';
  END IF;
END $$;

-- Fix buildings table: Add residence_shared_area_distributed if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'buildings' 
      AND column_name = 'residence_shared_area_distributed'
  ) THEN
    ALTER TABLE buildings 
    ADD COLUMN residence_shared_area_distributed boolean DEFAULT false;
    
    COMMENT ON COLUMN buildings.residence_shared_area_distributed IS 'Flag indicating if residence shared area has been distributed to assets';
    
    RAISE NOTICE 'Added residence_shared_area_distributed column to buildings table';
  ELSE
    RAISE NOTICE 'Column residence_shared_area_distributed already exists in buildings table';
  END IF;
END $$;

-- Fix buildings table: Add business_shared_area_distributed if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'buildings' 
      AND column_name = 'business_shared_area_distributed'
  ) THEN
    ALTER TABLE buildings 
    ADD COLUMN business_shared_area_distributed boolean DEFAULT false;
    
    COMMENT ON COLUMN buildings.business_shared_area_distributed IS 'Flag indicating if business shared area has been distributed to assets';
    
    RAISE NOTICE 'Added business_shared_area_distributed column to buildings table';
  ELSE
    RAISE NOTICE 'Column business_shared_area_distributed already exists in buildings table';
  END IF;
END $$;

-- Summary: Show all columns that should exist according to code
SELECT 
  'Expected columns in asset_types:' as info,
  string_agg(column_name, ', ' ORDER BY column_name) as columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'asset_types'
  AND column_name IN (
    'non_accountable_for_total_area',
    'non_accountable_for_distribution'
  );

