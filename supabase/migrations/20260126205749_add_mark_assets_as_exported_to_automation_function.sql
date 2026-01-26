/*
  # Add mark_assets_as_exported_to_automation function

  1. Overview
    - Creates a function to bulk mark assets as exported to automation
    - Updates assets where exported_to_automation is false/null and data_from_automation is false/null
    - Sets exported_to_automation = true and export_to_automation_at = NOW()
    
  2. Returns
    - updated_count: Number of assets updated
    - asset_ids: Array of asset IDs that were updated
*/

CREATE OR REPLACE FUNCTION mark_assets_as_exported_to_automation()
RETURNS TABLE(updated_count INTEGER, asset_ids BIGINT[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_ids BIGINT[];
  v_count INTEGER;
BEGIN
  -- Get all assets that need to be marked as exported
  -- Conditions: exported_to_automation is false/null AND data_from_automation is false/null
  SELECT ARRAY_AGG(asset_id)
  INTO v_asset_ids
  FROM assets
  WHERE (exported_to_automation IS NULL OR exported_to_automation = false)
    AND (data_from_automation IS NULL OR data_from_automation = false);
  
  -- If no assets found, return early
  IF v_asset_ids IS NULL THEN
    RETURN QUERY SELECT 0::INTEGER, ARRAY[]::BIGINT[];
    RETURN;
  END IF;
  
  -- Update the assets
  UPDATE assets
  SET 
    exported_to_automation = true,
    export_to_automation_at = NOW()
  WHERE asset_id = ANY(v_asset_ids);
  
  -- Get the count
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Return the results
  RETURN QUERY SELECT v_count, v_asset_ids;
END;
$$;
