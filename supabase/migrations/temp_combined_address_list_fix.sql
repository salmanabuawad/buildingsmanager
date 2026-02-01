/*
  # Combined Migration: Fix address_list to allow duplicate street_code values
  
  This migration combines all address_list fixes:
  1. Drops foreign key constraints
  2. Drops PRIMARY KEY constraint from street_code
  3. Adds new id column as SERIAL PRIMARY KEY
  4. Allows duplicate street_code values
  5. Adds index on street_code for performance
  
  IMPORTANT: Foreign key constraints are NOT re-added because street_code
  is no longer unique. Foreign keys require unique or primary key columns.
*/

-- ============================================================================
-- Step 1: Drop foreign key constraints that depend on address_list PRIMARY KEY
-- ============================================================================
DO $$
DECLARE
  fk_constraint_name TEXT;
  fk_table_name TEXT;
BEGIN
  -- Drop fk_buildings_building_address if it exists
  SELECT constraint_name INTO fk_constraint_name
  FROM information_schema.table_constraints 
  WHERE table_name = 'buildings' 
    AND constraint_name = 'fk_buildings_building_address'
    AND constraint_type = 'FOREIGN KEY'
  LIMIT 1;
  
  IF fk_constraint_name IS NOT NULL THEN
    RAISE NOTICE 'Dropping foreign key constraint: %', fk_constraint_name;
    EXECUTE format('ALTER TABLE buildings DROP CONSTRAINT %I', fk_constraint_name);
  END IF;
  
  -- Drop fk_buildings_address if it exists
  SELECT constraint_name INTO fk_constraint_name
  FROM information_schema.table_constraints 
  WHERE table_name = 'buildings' 
    AND constraint_name = 'fk_buildings_address'
    AND constraint_type = 'FOREIGN KEY'
  LIMIT 1;
  
  IF fk_constraint_name IS NOT NULL THEN
    RAISE NOTICE 'Dropping foreign key constraint: %', fk_constraint_name;
    EXECUTE format('ALTER TABLE buildings DROP CONSTRAINT %I', fk_constraint_name);
  END IF;
  
  -- Drop any other foreign key constraints that reference address_list.street_code
  FOR fk_constraint_name, fk_table_name IN
    SELECT DISTINCT
      tc.constraint_name,
      tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'address_list'
      AND ccu.column_name = 'street_code'
      AND tc.constraint_name NOT IN ('fk_buildings_building_address', 'fk_buildings_address')
  LOOP
    RAISE NOTICE 'Dropping foreign key constraint: % on table %', fk_constraint_name, fk_table_name;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', fk_table_name, fk_constraint_name);
  END LOOP;
END $$;

-- ============================================================================
-- Step 2: Drop PRIMARY KEY constraint from street_code
-- ============================================================================
DO $$
DECLARE
  existing_pk_name TEXT;
BEGIN
  -- Get the PRIMARY KEY constraint name
  SELECT constraint_name INTO existing_pk_name
  FROM information_schema.table_constraints 
  WHERE table_name = 'address_list' 
    AND constraint_type = 'PRIMARY KEY'
  LIMIT 1;
  
  IF existing_pk_name IS NOT NULL THEN
    RAISE NOTICE 'Dropping PRIMARY KEY constraint: %', existing_pk_name;
    EXECUTE format('ALTER TABLE address_list DROP CONSTRAINT %I', existing_pk_name);
  ELSE
    RAISE NOTICE 'No PRIMARY KEY constraint found to drop';
  END IF;
END $$;

-- ============================================================================
-- Step 3: Show duplicates before changes (for reference)
-- ============================================================================
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
    RAISE NOTICE 'No duplicates found - all street_code values are unique';
  END IF;
END $$;

-- ============================================================================
-- Step 4: Add new id column as SERIAL PRIMARY KEY
-- ============================================================================
DO $$
BEGIN
  -- Check if id column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'address_list' AND column_name = 'id'
  ) THEN
    -- Add id column as SERIAL PRIMARY KEY
    ALTER TABLE address_list
    ADD COLUMN id SERIAL PRIMARY KEY;
    
    RAISE NOTICE 'Added id column as PRIMARY KEY';
  ELSE
    -- If id exists but is not PRIMARY KEY, make it PRIMARY KEY
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_name = 'address_list' 
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name LIKE '%id%'
    ) THEN
      ALTER TABLE address_list
      ADD CONSTRAINT address_list_id_pkey PRIMARY KEY (id);
      
      RAISE NOTICE 'Added PRIMARY KEY constraint to existing id column';
    ELSE
      RAISE NOTICE 'id column already exists with PRIMARY KEY constraint';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Step 5: Add index on street_code for better query performance
-- Note: This index is NOT UNIQUE, allowing duplicate street_code values
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_address_list_street_code ON address_list(street_code);

-- ============================================================================
-- Step 6: Add comments
-- ============================================================================
COMMENT ON COLUMN address_list.id IS 'Primary key - allows duplicate street_code values';
COMMENT ON COLUMN address_list.street_code IS 'Street code (can have duplicates, no longer unique)';

-- ============================================================================
-- Step 7: Note about foreign keys
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'IMPORTANT: Foreign key constraints were NOT re-added.';
  RAISE NOTICE 'Reason: street_code is no longer unique.';
  RAISE NOTICE 'Foreign keys require the referenced column to be unique or primary key.';
  RAISE NOTICE '';
  RAISE NOTICE 'The buildings.address and buildings.building_address columns';
  RAISE NOTICE 'will still function, but without database-enforced referential integrity.';
  RAISE NOTICE '================================================================';
END $$;

-- ============================================================================
-- Step 8: Verify final state
-- ============================================================================
DO $$
DECLARE
  has_id_pk BOOLEAN;
  has_street_code_pk BOOLEAN;
  duplicate_count INTEGER;
BEGIN
  -- Check if id is PRIMARY KEY
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'address_list' 
    AND constraint_type = 'PRIMARY KEY'
    AND constraint_name LIKE '%id%'
  ) INTO has_id_pk;
  
  -- Check if street_code is PRIMARY KEY
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'address_list' 
    AND constraint_type = 'PRIMARY KEY'
    AND constraint_name LIKE '%street_code%'
  ) INTO has_street_code_pk;
  
  -- Count duplicates
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT street_code, COUNT(*) as cnt
    FROM address_list
    GROUP BY street_code
    HAVING COUNT(*) > 1
  ) duplicates;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Final State:';
  RAISE NOTICE '  - id column is PRIMARY KEY: %', has_id_pk;
  RAISE NOTICE '  - street_code is PRIMARY KEY: %', has_street_code_pk;
  RAISE NOTICE '  - Duplicate street_code values: %', duplicate_count;
  RAISE NOTICE '';
  
  IF has_id_pk AND NOT has_street_code_pk THEN
    RAISE NOTICE 'SUCCESS: Migration completed successfully!';
    RAISE NOTICE 'You can now insert duplicate street_code values.';
  ELSE
    RAISE WARNING 'WARNING: Migration may not have completed as expected.';
  END IF;
END $$;
