/*
  # Fix address_list street_code uniqueness constraint
  
  1. Changes
    - Remove duplicate street_code entries (keep the most recent one)
    - Ensure PRIMARY KEY constraint exists on street_code
    - Add UNIQUE constraint if PRIMARY KEY is missing
  
  2. Data cleanup
    - If duplicates exist, keep the row with the latest updated_at timestamp
    - Delete older duplicate entries
*/

-- Step 1: Drop foreign key constraints that depend on address_list PRIMARY KEY
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

-- Step 2: Drop PRIMARY KEY constraint if it exists (to allow duplicate removal)
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

-- Step 3: Find and report duplicates (for logging)
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
    RAISE NOTICE 'Found % duplicate street_code values', duplicate_count;
  ELSE
    RAISE NOTICE 'No duplicate street_code values found';
  END IF;
END $$;

-- Step 4: Remove duplicates, keeping the most recent entry for each street_code
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

-- Step 5: Ensure PRIMARY KEY constraint exists on street_code
DO $$
DECLARE
  existing_pk_name TEXT;
  pk_column_name TEXT;
BEGIN
  -- Check if PRIMARY KEY constraint exists and get its name and column
  SELECT 
    tc.constraint_name,
    kcu.column_name
  INTO 
    existing_pk_name,
    pk_column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'address_list' 
    AND tc.constraint_type = 'PRIMARY KEY'
  LIMIT 1;
  
  IF existing_pk_name IS NOT NULL THEN
    -- PRIMARY KEY exists
    IF pk_column_name = 'street_code' THEN
      RAISE NOTICE 'PRIMARY KEY constraint already exists on street_code (constraint: %)', existing_pk_name;
    ELSE
      -- PRIMARY KEY exists but on a different column
      -- We need to drop it and recreate on street_code
      RAISE NOTICE 'Found PRIMARY KEY on column % (constraint: %), will recreate on street_code', pk_column_name, existing_pk_name;
      
      -- Drop the existing PRIMARY KEY
      EXECUTE format('ALTER TABLE address_list DROP CONSTRAINT %I', existing_pk_name);
      
      -- Add PRIMARY KEY on street_code
      ALTER TABLE address_list
      ADD CONSTRAINT address_list_street_code_pkey PRIMARY KEY (street_code);
      
      RAISE NOTICE 'Recreated PRIMARY KEY constraint on street_code';
    END IF;
  ELSE
    -- No PRIMARY KEY exists, check for UNIQUE constraint
    IF EXISTS (
      SELECT 1 
      FROM information_schema.table_constraints 
      WHERE table_name = 'address_list' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%street_code%'
    ) THEN
      -- Drop UNIQUE constraint and add PRIMARY KEY
      ALTER TABLE address_list
      DROP CONSTRAINT IF EXISTS address_list_street_code_key;
      
      ALTER TABLE address_list
      ADD CONSTRAINT address_list_street_code_pkey PRIMARY KEY (street_code);
      
      RAISE NOTICE 'Converted UNIQUE constraint to PRIMARY KEY on street_code';
    ELSE
      -- No constraints exist, add PRIMARY KEY
      ALTER TABLE address_list
      ADD CONSTRAINT address_list_street_code_pkey PRIMARY KEY (street_code);
      
      RAISE NOTICE 'Added PRIMARY KEY constraint on street_code';
    END IF;
  END IF;
END $$;

-- Step 6: Re-add foreign key constraints
DO $$
BEGIN
  -- Re-add fk_buildings_building_address if building_address column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'buildings' AND column_name = 'building_address'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_buildings_building_address'
      AND table_name = 'buildings'
    ) THEN
      ALTER TABLE buildings
      ADD CONSTRAINT fk_buildings_building_address
      FOREIGN KEY (building_address)
      REFERENCES address_list(street_code)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
      RAISE NOTICE 'Re-added foreign key constraint: fk_buildings_building_address';
    END IF;
  END IF;
  
  -- Re-add fk_buildings_address if address column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'buildings' AND column_name = 'address'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_buildings_address'
      AND table_name = 'buildings'
    ) THEN
      ALTER TABLE buildings
      ADD CONSTRAINT fk_buildings_address
      FOREIGN KEY (address)
      REFERENCES address_list(street_code)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
      RAISE NOTICE 'Re-added foreign key constraint: fk_buildings_address';
    END IF;
  END IF;
END $$;

-- Step 7: Verify uniqueness (should return 0 if all is well)
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

-- Add comment on PRIMARY KEY constraint (if it exists)
DO $$
DECLARE
  pk_constraint_name TEXT;
BEGIN
  -- Get the actual PRIMARY KEY constraint name
  SELECT constraint_name INTO pk_constraint_name
  FROM information_schema.table_constraints 
  WHERE table_name = 'address_list' 
    AND constraint_type = 'PRIMARY KEY'
  LIMIT 1;
  
  IF pk_constraint_name IS NOT NULL THEN
    -- Add comment using the actual constraint name
    EXECUTE format('COMMENT ON CONSTRAINT %I ON address_list IS %L', 
      pk_constraint_name, 
      'Primary key ensuring street_code is unique');
    RAISE NOTICE 'Added comment to PRIMARY KEY constraint: %', pk_constraint_name;
  END IF;
END $$;
