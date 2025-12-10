/*
  # Complete Setup: Total Building Area with Trigger (Combined)
  
  This migration combines all changes for total_building_area calculation:
  1. Removes old triggers and functions
  2. Adds total_building_area column
  3. Creates new trigger-based calculation
  4. Initializes existing buildings
  
  Calculation Logic:
  - Only includes assets where not_accountable = false or NULL (accountable assets)
  - Only sums asset_size (main asset size), NOT subtype sizes
  - Only includes active asset types (active = 'כן')
  - Updates the building's total_building_area column automatically on asset changes
*/

-- ============================================================================
-- STEP 1: Ensure total_building_area column exists in buildings table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'buildings' 
    AND column_name = 'total_building_area'
  ) THEN
    ALTER TABLE buildings
    ADD COLUMN total_building_area numeric(10,2) DEFAULT 0;
    
    RAISE NOTICE 'Column total_building_area added to buildings table';
  ELSE
    RAISE NOTICE 'Column total_building_area already exists in buildings table';
  END IF;
END $$;

-- Add comment to the column
COMMENT ON COLUMN buildings.total_building_area IS 'Total building area in square meters. Automatically updated by trigger when assets change. Sum of all accountable assets main size (asset_size) only.';

-- ============================================================================
-- STEP 2: Drop old functions and triggers (if they exist)
-- ============================================================================

-- Drop old triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_building_totals ON assets;
DROP TRIGGER IF EXISTS trigger_update_building_total_area ON assets;

-- Drop old functions if they exist
DROP FUNCTION IF EXISTS update_building_totals() CASCADE;
DROP FUNCTION IF EXISTS get_building_stats(bigint) CASCADE;
DROP FUNCTION IF EXISTS update_building_total_area() CASCADE;

-- ============================================================================
-- STEP 3: Create function to update total_building_area
-- ============================================================================

CREATE OR REPLACE FUNCTION update_building_total_area()
RETURNS TRIGGER AS $$
DECLARE
  target_building_number bigint;
BEGIN
  -- Determine which building to update
  IF TG_OP = 'DELETE' THEN
    target_building_number := OLD.building_number;
  ELSE
    target_building_number := NEW.building_number;
  END IF;

  -- Update total_building_area for the building
  -- Sum of all accountable assets' main size (asset_size) only
  -- Only includes assets where not_accountable = false or NULL (accountable assets)
  UPDATE buildings
  SET total_building_area = COALESCE((
    SELECT SUM(a.asset_size) 
    FROM assets a
    LEFT JOIN asset_types at ON at.name = a.main_asset_type AND at.active = 'כן'
    WHERE a.building_number = target_building_number 
      AND (at.not_accountable IS NULL OR at.not_accountable = false)
  ), 0)
  WHERE building_number = target_building_number;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment to the function
COMMENT ON FUNCTION update_building_total_area() IS 'Updates total_building_area in buildings table when assets are inserted, updated, or deleted. Sums all accountable assets main size (asset_size) only. Excludes non-accountable assets and subtype sizes.';

-- ============================================================================
-- STEP 4: Create trigger on assets table
-- ============================================================================

CREATE TRIGGER trigger_update_building_total_area
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_building_total_area();

-- ============================================================================
-- STEP 5: Initialize total_building_area for existing buildings
-- ============================================================================

-- Update all existing buildings with their current total area
UPDATE buildings b
SET total_building_area = COALESCE((
  SELECT SUM(a.asset_size) 
  FROM assets a
  LEFT JOIN asset_types at ON at.name = a.main_asset_type AND at.active = 'כן'
  WHERE a.building_number = b.building_number 
    AND (at.not_accountable IS NULL OR at.not_accountable = false)
), 0);

