/*
  # Rename shared area columns and add business shared area column
  
  1. Changes
    - Add shared_business_area column if it doesn't exist (for databases that don't have it)
    - Rename shared_area to private_shared_area
    - Rename shared_business_area to business_shared_area
    - Add business_shared_area if it doesn't exist (in case shared_business_area didn't exist before rename)
  
  2. Column Details
    - private_shared_area: numeric(10,2) - Private/residential shared area (שטח משותף מגורים)
    - business_shared_area: numeric(10,2) - Business/commercial shared area (שטח משותף עסקים)
*/

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
  END IF;
END $$;

-- Step 5: Update comments
COMMENT ON COLUMN buildings.private_shared_area IS 'Private/residential shared area in the building (שטח משותף מגורים)';
COMMENT ON COLUMN buildings.business_shared_area IS 'Business/commercial shared area in the building (שטח משותף עסקים)';
