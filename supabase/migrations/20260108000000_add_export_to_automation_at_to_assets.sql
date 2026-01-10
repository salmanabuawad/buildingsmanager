/*
  # Add export_to_automation_at column to assets and assets_history tables
  
  This migration:
  1. Adds export_to_automation_at column to assets table (TEXT, nullable)
  2. Adds export_to_automation_at column to assets_history table (TEXT, nullable)
  3. Stores date in DD/MM/YYYY format (consistent with measurement_date, discount_date_from, discount_date_to)
  4. Creates index for efficient querying by export date
*/

-- Add export_to_automation_at column to assets table
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS export_to_automation_at TEXT;

-- Add export_to_automation_at column to assets_history table (for history consistency)
ALTER TABLE assets_history 
ADD COLUMN IF NOT EXISTS export_to_automation_at TEXT;

-- Create index for efficient querying on assets table
CREATE INDEX IF NOT EXISTS idx_assets_export_to_automation_at 
ON assets(export_to_automation_at);

-- Create index for efficient querying on assets_history table
CREATE INDEX IF NOT EXISTS idx_assets_history_export_to_automation_at 
ON assets_history(export_to_automation_at);

-- Add comments
COMMENT ON COLUMN assets.export_to_automation_at IS 'Date when asset was exported to automation system (DD/MM/YYYY format)';
COMMENT ON COLUMN assets_history.export_to_automation_at IS 'Date when asset was exported to automation system (DD/MM/YYYY format) - historical snapshot';

-- Update copy_asset_to_history_before_update function to include export_to_automation_at
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
      area_from_distribution, exported_to_automation, export_to_automation_at, comment
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
      v_asset.area_from_distribution, v_asset.exported_to_automation, v_asset.export_to_automation_at, v_asset.comment
    );
  END IF;
END;
$$ LANGUAGE plpgsql;
