/*
  # Move Business Total Area from Buildings to Assets
  
  This migration:
  1. Removes business_total_area column from buildings table
  2. Adds business_total_area column to assets table
  3. Removes triggers and functions related to buildings.business_total_area
  4. Creates function to calculate business_total_area per asset = asset_size + area_from_distribution (for business assets only)
  5. Creates trigger to automatically update business_total_area when asset_size or area_from_distribution changes
  6. Updates field configurations
*/

-- Remove business_total_area from buildings table
ALTER TABLE buildings
  DROP COLUMN IF EXISTS business_total_area;

-- Drop triggers and functions related to buildings.business_total_area
DROP TRIGGER IF EXISTS update_business_total_area_on_building_change ON buildings;
DROP TRIGGER IF EXISTS update_business_total_area_on_asset_change ON assets;
DROP FUNCTION IF EXISTS trigger_update_business_total_area();
DROP FUNCTION IF EXISTS update_business_total_area(BIGINT);

-- Add business_total_area column to assets table
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS business_total_area NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN assets.business_total_area IS 'Total business area for this asset = asset_size + area_from_distribution (only for business assets, 0 for non-business assets)';

-- Add business_total_area to assets_history table
ALTER TABLE assets_history
  ADD COLUMN IF NOT EXISTS business_total_area NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN assets_history.business_total_area IS 'Total business area for this asset = asset_size + area_from_distribution (only for business assets, 0 for non-business assets) - historical record';

-- Function to calculate business_total_area for a single asset
CREATE OR REPLACE FUNCTION calculate_asset_business_total_area(
  p_asset_size NUMERIC,
  p_area_from_distribution NUMERIC,
  p_main_asset_type TEXT
)
RETURNS NUMERIC AS $$
DECLARE
  v_is_business BOOLEAN := false;
BEGIN
  -- Check if asset is a business asset
  IF p_main_asset_type IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 
      FROM asset_types at 
      WHERE at.name = p_main_asset_type 
        AND at.active = 'כן'
        AND at.business_residence = 'עסקים'
    ) INTO v_is_business;
  END IF;
  
  -- If business asset, return asset_size + area_from_distribution, otherwise 0
  IF v_is_business THEN
    RETURN COALESCE(p_asset_size, 0) + COALESCE(p_area_from_distribution, 0);
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_asset_business_total_area IS 'Calculate business_total_area for an asset = asset_size + area_from_distribution (only for business assets)';

-- Function to update business_total_area for an asset
CREATE OR REPLACE FUNCTION update_asset_business_total_area()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate and set business_total_area
  NEW.business_total_area := calculate_asset_business_total_area(
    NEW.asset_size,
    NEW.area_from_distribution,
    NEW.main_asset_type
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_asset_business_total_area IS 'Trigger function to automatically calculate and update business_total_area when asset_size, area_from_distribution, or main_asset_type changes';

-- Create trigger to update business_total_area on insert or update
DROP TRIGGER IF EXISTS trigger_update_asset_business_total_area ON assets;
CREATE TRIGGER trigger_update_asset_business_total_area
  BEFORE INSERT OR UPDATE OF asset_size, area_from_distribution, main_asset_type ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_asset_business_total_area();

-- Update existing assets with calculated business_total_area
UPDATE assets
SET business_total_area = calculate_asset_business_total_area(
  asset_size,
  area_from_distribution,
  main_asset_type
);

-- Update existing assets_history records
UPDATE assets_history
SET business_total_area = calculate_asset_business_total_area(
  asset_size,
  area_from_distribution,
  main_asset_type
);

-- Remove business_total_area from buildings-list field configuration
DELETE FROM field_configurations
WHERE grid_name = 'buildings-list' AND field_name = 'business_total_area';

-- Add business_total_area to assets-list field configuration
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'business_total_area', 6, 2, 'סה"כ שטח עסקים', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, 
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    updated_at = now();

