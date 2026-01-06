/*
  # Add Business Total Area Field
  
  This migration:
  1. Adds business_total_area column to buildings table
  2. Creates a function to calculate business_total_area = business_shared_area + sum(asset_size + area_from_distribution) for all business assets
  3. Creates a trigger to automatically update business_total_area when relevant fields change
  4. Adds business_total_area to field configuration table
*/

-- Add business_total_area column to buildings table
ALTER TABLE buildings
  ADD COLUMN IF NOT EXISTS business_total_area NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN buildings.business_total_area IS 'Total business area = business_shared_area + sum of (asset_size + area_from_distribution) for all business assets';

-- Function to calculate and update business_total_area for a building
CREATE OR REPLACE FUNCTION update_business_total_area(p_building_number BIGINT)
RETURNS void AS $$
DECLARE
  v_business_shared_area NUMERIC := 0;
  v_business_assets_total NUMERIC := 0;
BEGIN
  -- Get business_shared_area from building
  SELECT COALESCE(business_shared_area, 0) INTO v_business_shared_area
  FROM buildings
  WHERE building_number = p_building_number;
  
  -- Calculate sum of (asset_size + area_from_distribution) for all business assets
  -- Business assets are those where main_asset_type has business_residence = 'עסקים'
  SELECT COALESCE(SUM(COALESCE(a.asset_size, 0) + COALESCE(a.area_from_distribution, 0)), 0) INTO v_business_assets_total
  FROM (
    SELECT DISTINCT ON (asset_id)
      asset_id,
      asset_size,
      area_from_distribution,
      main_asset_type
    FROM assets
    WHERE building_number = p_building_number
    ORDER BY asset_id, updated_at DESC
  ) a
  WHERE EXISTS (
    SELECT 1 
    FROM asset_types at 
    WHERE at.name = a.main_asset_type 
      AND at.active = 'כן'
      AND at.business_residence = 'עסקים'
  );
  
  -- Update business_total_area = business_shared_area + sum of business assets
  UPDATE buildings
  SET business_total_area = v_business_shared_area + v_business_assets_total
  WHERE building_number = p_building_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_business_total_area IS 'Calculate and update business_total_area for a building based on business_shared_area + sum of (asset_size + area_from_distribution) for all business assets';

-- Trigger function to update business_total_area when relevant fields change
CREATE OR REPLACE FUNCTION trigger_update_business_total_area()
RETURNS TRIGGER AS $$
BEGIN
  -- Update business_total_area when business_shared_area changes in buildings table
  IF TG_TABLE_NAME = 'buildings' THEN
    IF TG_OP = 'UPDATE' THEN
      -- Check if business_shared_area changed
      IF (OLD.business_shared_area IS DISTINCT FROM NEW.business_shared_area) THEN
        PERFORM update_business_total_area(NEW.building_number);
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      -- Calculate for new building
      PERFORM update_business_total_area(NEW.building_number);
    END IF;
    RETURN NEW;
  END IF;
  
  -- Update business_total_area when assets change (insert, update, delete)
  IF TG_TABLE_NAME = 'assets' THEN
    IF TG_OP = 'DELETE' THEN
      PERFORM update_business_total_area(OLD.building_number);
      RETURN OLD;
    ELSE
      PERFORM update_business_total_area(NEW.building_number);
      RETURN NEW;
    END IF;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS update_business_total_area_on_building_change ON buildings;
CREATE TRIGGER update_business_total_area_on_building_change
  AFTER INSERT OR UPDATE OF business_shared_area ON buildings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_business_total_area();

DROP TRIGGER IF EXISTS update_business_total_area_on_asset_change ON assets;
CREATE TRIGGER update_business_total_area_on_asset_change
  AFTER INSERT OR UPDATE OF asset_size, area_from_distribution, main_asset_type OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_business_total_area();

-- Update existing buildings with calculated business_total_area
DO $$
DECLARE
  building_rec RECORD;
BEGIN
  FOR building_rec IN SELECT building_number FROM buildings LOOP
    PERFORM update_business_total_area(building_rec.building_number);
  END LOOP;
END $$;

-- Add business_total_area to field configuration table
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('buildings-list', 'business_total_area', 6, 2, 'סה"כ שטח עסקים', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, 
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    updated_at = now();

