-- Create a view that joins assets (latest) and assets_history (historical records)
-- This view includes a flag to indicate if the record is from assets table (latest) or assets_history

CREATE OR REPLACE VIEW assets_with_history AS
SELECT 
  a.id,
  a.building_number,
  a.payer_id,
  a.asset_id,
  a.measurement_date,
  a.main_asset_type,
  a.asset_size,
  a.sub_asset_type_1,
  a.sub_asset_size_1,
  a.sub_asset_type_2,
  a.sub_asset_size_2,
  a.sub_asset_type_3,
  a.sub_asset_size_3,
  a.sub_asset_type_4,
  a.sub_asset_size_4,
  a.sub_asset_type_5,
  a.sub_asset_size_5,
  a.sub_asset_type_6,
  a.sub_asset_size_6,
  a.penthouse,
  a.created_at,
  a.updated_at,
  a.structure_drawing_url,
  true as is_latest,  -- Flag to indicate this is the latest record from assets table
  NULL::timestamp with time zone as history_created_at
FROM assets a

UNION ALL

SELECT 
  h.id,
  h.building_number,
  h.payer_id,
  h.asset_id,
  h.measurement_date,
  h.main_asset_type,
  h.asset_size,
  h.sub_asset_type_1,
  h.sub_asset_size_1,
  h.sub_asset_type_2,
  h.sub_asset_size_2,
  h.sub_asset_type_3,
  h.sub_asset_size_3,
  h.sub_asset_type_4,
  h.sub_asset_size_4,
  h.sub_asset_type_5,
  h.sub_asset_size_5,
  h.sub_asset_type_6,
  h.sub_asset_size_6,
  h.penthouse,
  h.created_at,
  h.updated_at,
  h.structure_drawing_url,
  false as is_latest,  -- Flag to indicate this is a historical record
  h.history_created_at
FROM assets_history h;

-- Grant SELECT permission on the view
GRANT SELECT ON assets_with_history TO public;

-- Add comment to document the view
COMMENT ON VIEW assets_with_history IS 'Combined view of assets (latest measurements) and assets_history (historical measurements). The is_latest flag indicates if the record is from the assets table (true) or assets_history (false). Only records with is_latest=true should be editable.';

