/*
  # Remove duplicate street_code values from address_list
  
  This migration removes duplicate street_code entries, keeping the most recent one
  based on updated_at and created_at timestamps.
  
  Run this if you're getting unique constraint violations on address_list_street_code_pkey
*/

-- Step 1: Show duplicates before removal (for reference)
DO $$
DECLARE
  duplicate_count INTEGER;
  duplicate_info RECORD;
BEGIN
  -- Count how many street_codes have duplicates
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT street_code, COUNT(*) as cnt
    FROM address_list
    GROUP BY street_code
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE NOTICE 'Found % street_code values with duplicates:', duplicate_count;
    
    -- Show details of duplicates
    FOR duplicate_info IN
      SELECT 
        street_code,
        COUNT(*) as duplicate_count,
        STRING_AGG(street_description, ' | ' ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST) as descriptions
      FROM address_list
      GROUP BY street_code
      HAVING COUNT(*) > 1
      ORDER BY street_code
    LOOP
      RAISE NOTICE '  street_code %: % duplicates (descriptions: %)', 
        duplicate_info.street_code, 
        duplicate_info.duplicate_count,
        duplicate_info.descriptions;
    END LOOP;
  ELSE
    RAISE NOTICE 'No duplicates found';
  END IF;
END $$;

-- Step 2: Remove duplicates, keeping the most recent entry for each street_code
-- This uses a CTE to identify duplicates and DELETE to remove older ones
WITH duplicates AS (
  SELECT 
    ctid,  -- Physical row identifier
    street_code,
    ROW_NUMBER() OVER (
      PARTITION BY street_code 
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) as rn
  FROM address_list
)
DELETE FROM address_list
WHERE ctid IN (
  SELECT ctid 
  FROM duplicates 
  WHERE rn > 1
);

-- Step 3: Verify no duplicates remain
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT street_code, COUNT(*) as cnt
    FROM address_list
    GROUP BY street_code
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE WARNING 'Warning: Still found % duplicate street_code values after cleanup', duplicate_count;
  ELSE
    RAISE NOTICE 'Success: All street_code values are now unique';
  END IF;
END $$;
