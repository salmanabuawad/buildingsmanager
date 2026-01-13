/*
  # Add data_from_automation flag to assets

  This migration:
  1. Adds data_from_automation boolean column to assets and assets_history
     - Default: false
     - Full import from automation sets it to true
  2. Adds trigger: when asset attributes change inside this app, data_from_automation is set to false
     - (meaning: the row is no longer "as received from automation")
  3. Updates copy_asset_to_history_before_update to include the new column
*/

-- 1) Add column to assets + history
ALTER TABLE assets
ADD COLUMN IF NOT EXISTS data_from_automation BOOLEAN DEFAULT false;

ALTER TABLE assets_history
ADD COLUMN IF NOT EXISTS data_from_automation BOOLEAN DEFAULT false;

COMMENT ON COLUMN assets.data_from_automation IS
  'Indicates if this asset row originated from the automation system (full import). If asset is edited in this app later, it is set to false.';

COMMENT ON COLUMN assets_history.data_from_automation IS
  'Historical snapshot of data_from_automation flag.';

-- 2) Trigger to set data_from_automation=false when asset attributes change
CREATE OR REPLACE FUNCTION set_data_from_automation_false_on_asset_change()
RETURNS TRIGGER AS $$
DECLARE
  v_changed BOOLEAN := FALSE;
BEGIN
  -- If any asset fields changed, mark as NOT from automation anymore.
  -- Do NOT consider export-related fields themselves as triggers.
  v_changed :=
    (NEW.building_number IS DISTINCT FROM OLD.building_number) OR
    (NEW.payer_id IS DISTINCT FROM OLD.payer_id) OR
    (NEW.measurement_date IS DISTINCT FROM OLD.measurement_date) OR
    (NEW.main_asset_type IS DISTINCT FROM OLD.main_asset_type) OR
    (NEW.asset_size IS DISTINCT FROM OLD.asset_size) OR
    (NEW.sub_asset_type_1 IS DISTINCT FROM OLD.sub_asset_type_1) OR
    (NEW.sub_asset_size_1 IS DISTINCT FROM OLD.sub_asset_size_1) OR
    (NEW.sub_asset_type_2 IS DISTINCT FROM OLD.sub_asset_type_2) OR
    (NEW.sub_asset_size_2 IS DISTINCT FROM OLD.sub_asset_size_2) OR
    (NEW.sub_asset_type_3 IS DISTINCT FROM OLD.sub_asset_type_3) OR
    (NEW.sub_asset_size_3 IS DISTINCT FROM OLD.sub_asset_size_3) OR
    (NEW.sub_asset_type_4 IS DISTINCT FROM OLD.sub_asset_type_4) OR
    (NEW.sub_asset_size_4 IS DISTINCT FROM OLD.sub_asset_size_4) OR
    (NEW.sub_asset_type_5 IS DISTINCT FROM OLD.sub_asset_type_5) OR
    (NEW.sub_asset_size_5 IS DISTINCT FROM OLD.sub_asset_size_5) OR
    (NEW.sub_asset_type_6 IS DISTINCT FROM OLD.sub_asset_type_6) OR
    (NEW.sub_asset_size_6 IS DISTINCT FROM OLD.sub_asset_size_6) OR
    (NEW.structure_drawing_url IS DISTINCT FROM OLD.structure_drawing_url) OR
    (NEW.elevator IS DISTINCT FROM OLD.elevator) OR
    (NEW.single_double_family IS DISTINCT FROM OLD.single_double_family) OR
    (NEW.condo IS DISTINCT FROM OLD.condo) OR
    (NEW.townhouses IS DISTINCT FROM OLD.townhouses) OR
    (NEW.penthouse IS DISTINCT FROM OLD.penthouse) OR
    (NEW.tax_region IS DISTINCT FROM OLD.tax_region) OR
    (NEW.floor IS DISTINCT FROM OLD.floor) OR
    (NEW.discount_type IS DISTINCT FROM OLD.discount_type) OR
    (NEW.discount_date_from IS DISTINCT FROM OLD.discount_date_from) OR
    (NEW.discount_date_to IS DISTINCT FROM OLD.discount_date_to) OR
    (NEW.area_from_distribution IS DISTINCT FROM OLD.area_from_distribution) OR
    (NEW.comment IS DISTINCT FROM OLD.comment);

  IF v_changed THEN
    NEW.data_from_automation := FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_data_from_automation_false_on_asset_change ON assets;
CREATE TRIGGER trigger_set_data_from_automation_false_on_asset_change
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION set_data_from_automation_false_on_asset_change();

-- 3) Update history copy function to include the new field
-- (this function is used by asset update workflows to snapshot old rows)
CREATE OR REPLACE FUNCTION copy_asset_to_history_before_update(p_asset_id BIGINT)
RETURNS void AS $$
DECLARE
  v_asset RECORD;
BEGIN
  SELECT * INTO v_asset
  FROM assets
  WHERE asset_id = p_asset_id;
  
  IF FOUND THEN
    INSERT INTO assets_history (
      asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family, condo, townhouses, penthouse,
      tax_region, floor, discount_type, discount_date_from, discount_date_to,
      area_from_distribution, exported_to_automation, export_to_automation_at, data_from_automation, comment
    )
    VALUES (
      v_asset.asset_id, v_asset.building_number, v_asset.payer_id, v_asset.measurement_date,
      v_asset.main_asset_type, v_asset.asset_size,
      v_asset.sub_asset_type_1, v_asset.sub_asset_size_1,
      v_asset.sub_asset_type_2, v_asset.sub_asset_size_2,
      v_asset.sub_asset_type_3, v_asset.sub_asset_size_3,
      v_asset.sub_asset_type_4, v_asset.sub_asset_size_4,
      v_asset.sub_asset_type_5, v_asset.sub_asset_size_5,
      v_asset.sub_asset_type_6, v_asset.sub_asset_size_6,
      v_asset.structure_drawing_url, v_asset.elevator, v_asset.single_double_family,
      v_asset.condo, v_asset.townhouses, v_asset.penthouse,
      v_asset.tax_region, v_asset.floor, v_asset.discount_type,
      v_asset.discount_date_from, v_asset.discount_date_to,
      v_asset.area_from_distribution, v_asset.exported_to_automation, v_asset.export_to_automation_at,
      v_asset.data_from_automation, v_asset.comment
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

