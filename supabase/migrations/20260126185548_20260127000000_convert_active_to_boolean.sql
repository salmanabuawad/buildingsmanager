/*
  # Convert active column from text to boolean
  
  1. Changes
    - Converts asset_types.active column from TEXT to BOOLEAN
    - Migrates existing data: 'כן' → true, NULL/other → false
    - Sets default value to true
  
  2. Data Migration
    - All existing records with active='כן' become true
    - All other values (NULL, empty, etc.) become false
*/

-- Step 1: Add a temporary boolean column
ALTER TABLE asset_types ADD COLUMN IF NOT EXISTS active_new BOOLEAN DEFAULT true;

-- Step 2: Migrate data from text to boolean
UPDATE asset_types 
SET active_new = CASE 
  WHEN active = 'כן' THEN true
  ELSE false
END;

-- Step 3: Drop the old text column
ALTER TABLE asset_types DROP COLUMN IF EXISTS active;

-- Step 4: Rename the new column to 'active'
ALTER TABLE asset_types RENAME COLUMN active_new TO active;

-- Step 5: Set NOT NULL constraint and default
ALTER TABLE asset_types ALTER COLUMN active SET NOT NULL;
ALTER TABLE asset_types ALTER COLUMN active SET DEFAULT true;

-- Add comment
COMMENT ON COLUMN asset_types.active IS 'Indicates if the asset type is active. Values: true (active) or false (inactive). Default: true';

SELECT 'Successfully converted active column from text to boolean' as status;