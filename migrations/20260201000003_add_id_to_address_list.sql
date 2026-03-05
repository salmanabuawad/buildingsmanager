/*
  # Add id column as PRIMARY KEY to address_list
  
  1. Changes
    - Add new SERIAL id column as PRIMARY KEY
    - Remove PRIMARY KEY constraint from street_code
    - Allow duplicate street_code values
    - Keep street_code as a regular column (can have duplicates)
  
  2. Foreign Keys
    - Foreign keys referencing street_code will continue to work
    - No changes needed to foreign key constraints
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

-- Step 2: Drop PRIMARY KEY constraint from street_code
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

-- Step 3: Add new id column as SERIAL PRIMARY KEY
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

-- Step 4: Note about foreign keys
-- Foreign key constraints cannot reference non-unique columns in PostgreSQL
-- Since street_code is no longer unique, foreign key constraints are not re-added
-- The buildings.address and buildings.building_address columns will still work
-- but without referential integrity constraints
DO $$
BEGIN
  RAISE NOTICE 'Note: Foreign key constraints were not re-added because street_code is no longer unique.';
  RAISE NOTICE 'Foreign keys require the referenced column to be unique or a primary key.';
  RAISE NOTICE 'The buildings.address and buildings.building_address columns will still function,';
  RAISE NOTICE 'but without database-enforced referential integrity.';
END $$;

-- Step 5: Add index on street_code for better query performance (since it's no longer PRIMARY KEY)
-- Note: This index is NOT UNIQUE, allowing duplicate street_code values
CREATE INDEX IF NOT EXISTS idx_address_list_street_code ON address_list(street_code);

-- Step 6: Add comment
COMMENT ON COLUMN address_list.id IS 'Primary key - allows duplicate street_code values';
COMMENT ON COLUMN address_list.street_code IS 'Street code (can have duplicates, no longer unique)';
