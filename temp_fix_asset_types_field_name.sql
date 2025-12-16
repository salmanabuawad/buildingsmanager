-- Fix field name in asset_types table
-- Ensure non_accountable_for_total_area column exists and is correctly named

DO $$
BEGIN
  -- Check if column exists with wrong name and rename it
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'asset_types' 
      AND column_name IN ('non_accountable', 'non_accountable_total_area', 'not_accountable')
  ) THEN
    -- Rename old column names to the correct name
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'asset_types' 
        AND column_name = 'non_accountable'
    ) THEN
      ALTER TABLE asset_types RENAME COLUMN non_accountable TO non_accountable_for_total_area;
      RAISE NOTICE 'Renamed column non_accountable to non_accountable_for_total_area';
    END IF;
    
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'asset_types' 
        AND column_name = 'non_accountable_total_area'
    ) THEN
      ALTER TABLE asset_types RENAME COLUMN non_accountable_total_area TO non_accountable_for_total_area;
      RAISE NOTICE 'Renamed column non_accountable_total_area to non_accountable_for_total_area';
    END IF;
    
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'asset_types' 
        AND column_name = 'not_accountable'
    ) THEN
      ALTER TABLE asset_types RENAME COLUMN not_accountable TO non_accountable_for_total_area;
      RAISE NOTICE 'Renamed column not_accountable to non_accountable_for_total_area';
    END IF;
  END IF;
  
  -- Ensure the column exists with correct name and type
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'asset_types' 
      AND column_name = 'non_accountable_for_total_area'
  ) THEN
    ALTER TABLE asset_types 
    ADD COLUMN non_accountable_for_total_area BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added column non_accountable_for_total_area';
  END IF;
  
  -- Ensure the column has the correct type
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'asset_types' 
      AND column_name = 'non_accountable_for_total_area'
      AND data_type != 'boolean'
  ) THEN
    -- Convert to boolean if it's not already
    ALTER TABLE asset_types 
    ALTER COLUMN non_accountable_for_total_area 
    TYPE boolean 
    USING CASE 
      WHEN non_accountable_for_total_area::text IN ('true', 'כן', '1', 'yes') THEN true
      ELSE false
    END;
    RAISE NOTICE 'Converted non_accountable_for_total_area to boolean type';
  END IF;
  
  -- Update comment to match UI display name
  COMMENT ON COLUMN asset_types.non_accountable_for_total_area IS 
    'Indicates if the asset type should be excluded from total area calculations. Values: true (לא נספר בחישוב שטח מבנה) or false (נספר בחישוב שטח מבנה)';
  
  RAISE NOTICE 'Field name check and fix completed';
END $$;

-- Verify the column exists and has correct properties
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'asset_types'
  AND column_name = 'non_accountable_for_total_area';

