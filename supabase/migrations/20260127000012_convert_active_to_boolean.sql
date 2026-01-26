/*
  Migration: Convert active field in asset_types from TEXT to BOOLEAN
  
  This migration:
  1. Converts all TEXT values ('כן', 'true', 'TRUE', '1') to boolean true
  2. Converts all other values (NULL, 'לא', 'false', etc.) to boolean false
  3. Changes the column type from TEXT to BOOLEAN
  4. Sets NOT NULL constraint with DEFAULT true
*/

-- Convert the column type from TEXT to BOOLEAN and set all values to true
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'asset_types' 
    AND column_name = 'active' 
    AND data_type = 'text'
  ) THEN
    -- First convert all TEXT values to boolean true (as requested)
    UPDATE asset_types
    SET active = true
    WHERE pg_typeof(active) = 'text'::regtype OR active IS NULL;
    
    -- Then convert the column type
    ALTER TABLE asset_types
      ALTER COLUMN active TYPE boolean USING true,
      ALTER COLUMN active SET DEFAULT true,
      ALTER COLUMN active SET NOT NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'asset_types' 
    AND column_name = 'active' 
    AND data_type = 'boolean'
  ) THEN
    -- Column is already boolean, just ensure all values are true
    UPDATE asset_types
    SET active = true
    WHERE active IS NULL OR active = false;
    
    -- Ensure constraints
    ALTER TABLE asset_types
      ALTER COLUMN active SET DEFAULT true,
      ALTER COLUMN active SET NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN asset_types.active IS 'Indicates if the asset type is active. Boolean (true/false, not null, default true)';
