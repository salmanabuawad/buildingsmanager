/*
  # Add business_total_area to assets and assets_history (live DB uses business_distribution_area)

  Live DB has business_distribution_area (not area_from_distribution).
  This migration:
  1. Adds business_total_area column to assets and assets_history
  2. Creates trigger function that uses business_distribution_area
  3. Trigger to set business_total_area on INSERT/UPDATE
  4. Backfills existing rows using calculate_asset_business_total_area(asset_size, business_distribution_area, main_asset_type)
*/

-- Add business_total_area column to assets table
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS business_total_area NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN assets.business_total_area IS 'Total business area for this asset = asset_size + business_distribution_area (only for business assets, 0 for non-business)';

-- Add business_total_area to assets_history table
ALTER TABLE assets_history
  ADD COLUMN IF NOT EXISTS business_total_area NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN assets_history.business_total_area IS 'Total business area (historical) = asset_size + business_distribution_area for business assets';

-- Trigger function: use business_distribution_area (actual column name in DB)
CREATE OR REPLACE FUNCTION update_asset_business_total_area()
RETURNS TRIGGER AS $$
BEGIN
  NEW.business_total_area := calculate_asset_business_total_area(
    NEW.asset_size,
    NEW.business_distribution_area,
    NEW.main_asset_type
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_asset_business_total_area IS 'Sets business_total_area from asset_size + business_distribution_area for business assets';

-- Create trigger (BEFORE INSERT OR UPDATE of relevant columns)
DROP TRIGGER IF EXISTS trigger_update_asset_business_total_area ON assets;
CREATE TRIGGER trigger_update_asset_business_total_area
  BEFORE INSERT OR UPDATE OF asset_size, business_distribution_area, main_asset_type ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_asset_business_total_area();

-- Backfill existing assets
UPDATE assets
SET business_total_area = calculate_asset_business_total_area(
  asset_size,
  business_distribution_area,
  main_asset_type
);

-- Backfill existing assets_history
UPDATE assets_history
SET business_total_area = calculate_asset_business_total_area(
  asset_size,
  business_distribution_area,
  main_asset_type
);
