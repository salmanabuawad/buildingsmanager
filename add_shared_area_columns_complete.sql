-- Complete script to add and rename shared area columns in buildings table
-- Run this script directly in your Supabase SQL editor or PostgreSQL client
-- This combines all the migration steps into one script

-- Step 1: Add shared_business_area column if it doesn't exist (for databases that don't have it yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'buildings' 
    AND column_name = 'shared_business_area'
  ) THEN
    ALTER TABLE buildings
    ADD COLUMN shared_business_area numeric(10,2);
    
    RAISE NOTICE 'Column shared_business_area added';
  ELSE
    RAISE NOTICE 'Column shared_business_area already exists';
  END IF;
END $$;

-- Step 2: Rename shared_area to private_shared_area if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'buildings' 
    AND column_name = 'shared_area'
  ) THEN
    ALTER TABLE buildings
    RENAME COLUMN shared_area TO private_shared_area;
    
    RAISE NOTICE 'Column shared_area renamed to private_shared_area';
  ELSE
    RAISE NOTICE 'Column shared_area does not exist (may have been renamed already)';
  END IF;
END $$;

-- Step 3: Rename shared_business_area to business_shared_area if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'buildings' 
    AND column_name = 'shared_business_area'
  ) THEN
    ALTER TABLE buildings
    RENAME COLUMN shared_business_area TO business_shared_area;
    
    RAISE NOTICE 'Column shared_business_area renamed to business_shared_area';
  ELSE
    RAISE NOTICE 'Column shared_business_area does not exist (may have been renamed already)';
  END IF;
END $$;

-- Step 4: Add business_shared_area if it doesn't exist (in case shared_business_area didn't exist before rename)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'buildings' 
    AND column_name = 'business_shared_area'
  ) THEN
    ALTER TABLE buildings
    ADD COLUMN business_shared_area numeric(10,2);
    
    RAISE NOTICE 'Column business_shared_area added';
  ELSE
    RAISE NOTICE 'Column business_shared_area already exists';
  END IF;
END $$;

-- Step 5: Update comments
COMMENT ON COLUMN buildings.private_shared_area IS 'Private/residential shared area in the building (שטח משותף מגורים)';
COMMENT ON COLUMN buildings.business_shared_area IS 'Business/commercial shared area in the building (שטח משותף עסקים)';

