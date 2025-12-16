-- ============================================================================
-- Rename non_accountable to non_accountable_for_total_area
-- ============================================================================
-- This migration renames the non_accountable column to 
-- non_accountable_for_total_area in the asset_types table
-- 
-- Handles multiple scenarios:
-- 1. If column is named "non_accountable" -> rename to "non_accountable_for_total_area"
-- 2. If column is named "non_accountable_total_area" -> rename to "non_accountable_for_total_area"
-- 3. If column is already "non_accountable_for_total_area" -> do nothing
-- 4. If column doesn't exist -> create it as "non_accountable_for_total_area"

DO $$
BEGIN
  -- Check if column exists as non_accountable
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'asset_types' 
      AND column_name = 'non_accountable'
  ) THEN
    ALTER TABLE asset_types RENAME COLUMN non_accountable TO non_accountable_for_total_area;
    RAISE NOTICE 'Renamed non_accountable to non_accountable_for_total_area';
  -- Check if column exists as non_accountable_total_area
  ELSIF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'asset_types' 
      AND column_name = 'non_accountable_total_area'
  ) THEN
    ALTER TABLE asset_types RENAME COLUMN non_accountable_total_area TO non_accountable_for_total_area;
    RAISE NOTICE 'Renamed non_accountable_total_area to non_accountable_for_total_area';
  -- Check if column already exists as non_accountable_for_total_area
  ELSIF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'asset_types' 
      AND column_name = 'non_accountable_for_total_area'
  ) THEN
    RAISE NOTICE 'Column non_accountable_for_total_area already exists, skipping rename';
  -- If column doesn't exist, create it
  ELSE
    ALTER TABLE asset_types ADD COLUMN non_accountable_for_total_area BOOLEAN DEFAULT false;
    RAISE NOTICE 'Created new column non_accountable_for_total_area';
  END IF;
END $$;

-- Update comment (only if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'asset_types' 
      AND column_name = 'non_accountable_for_total_area'
  ) THEN
    COMMENT ON COLUMN asset_types.non_accountable_for_total_area IS 'Indicates if the asset type should be excluded from total area calculations. Values: true (לא נספר) or false (נספר)';
  END IF;
END $$;

-- Drop the old trigger function (no parameters, returns TRIGGER) if it exists
DROP FUNCTION IF EXISTS update_building_total_area();

-- Update update_building_total_area function to use new column name
CREATE OR REPLACE FUNCTION update_building_total_area(p_building_number bigint)
RETURNS void AS $$
BEGIN
  UPDATE buildings
  SET total_building_area = COALESCE((
    SELECT SUM(a.asset_size)
    FROM (
      SELECT DISTINCT ON (asset_id)
        asset_id,
        asset_size,
        main_asset_type
      FROM assets
      WHERE building_number = p_building_number
      ORDER BY asset_id, updated_at DESC
    ) a
    WHERE (
      a.main_asset_type IS NULL 
      OR EXISTS (
        SELECT 1 
        FROM asset_types at 
        WHERE at.name = a.main_asset_type 
          AND at.active = 'כן'
          AND (at.non_accountable_for_total_area IS NULL OR at.non_accountable_for_total_area = false)
      )
    )
  ), 0)
  WHERE building_number = p_building_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_building_total_area IS 'Update building total area based on sum of asset sizes (excluding non_accountable_for_total_area assets)';
