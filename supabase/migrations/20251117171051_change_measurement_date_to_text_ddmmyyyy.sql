/*
  # Change measurement_date format to DD/MM/YYYY text

  1. Changes
    - Convert measurement_date from DATE type to TEXT type
    - Migrate all existing dates from YYYY-MM-DD to DD/MM/YYYY format
    - Update the composite primary key
    
  2. Security
    - Maintains existing RLS policies (no changes needed)
*/

-- Step 1: Add a temporary column
ALTER TABLE assets ADD COLUMN measurement_date_new TEXT;

-- Step 2: Convert and copy existing dates to DD/MM/YYYY format
UPDATE assets 
SET measurement_date_new = 
  LPAD(EXTRACT(DAY FROM measurement_date)::TEXT, 2, '0') || '/' ||
  LPAD(EXTRACT(MONTH FROM measurement_date)::TEXT, 2, '0') || '/' ||
  EXTRACT(YEAR FROM measurement_date)::TEXT
WHERE measurement_date IS NOT NULL;

-- Step 3: Drop the old primary key constraint
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_pkey;

-- Step 4: Drop the old column
ALTER TABLE assets DROP COLUMN measurement_date;

-- Step 5: Rename the new column
ALTER TABLE assets RENAME COLUMN measurement_date_new TO measurement_date;

-- Step 6: Set NOT NULL constraint
ALTER TABLE assets ALTER COLUMN measurement_date SET NOT NULL;

-- Step 7: Recreate the primary key with the new column
ALTER TABLE assets ADD PRIMARY KEY (building_number, asset_id, measurement_date);
