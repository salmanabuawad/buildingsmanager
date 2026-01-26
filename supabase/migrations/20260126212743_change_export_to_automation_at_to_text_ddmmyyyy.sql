/*
  # Change export_to_automation_at to text with DD/MM/YYYY format
  
  1. Overview
    - Change export_to_automation_at from timestamptz to text
    - Update the mark_assets_as_exported_to_automation function to format date as DD/MM/YYYY
    
  2. Changes
    - Alter column type from timestamptz to text with conversion
    - Update mark_assets_as_exported_to_automation function to use TO_CHAR for DD/MM/YYYY format
    
  3. Notes
    - Any existing timestamp values will be converted to DD/MM/YYYY text format
    - New values will be stored in DD/MM/YYYY format
*/

-- Change column type from timestamptz to text, converting existing values to DD/MM/YYYY format
ALTER TABLE assets 
ALTER COLUMN export_to_automation_at TYPE TEXT 
USING CASE 
  WHEN export_to_automation_at IS NOT NULL 
  THEN TO_CHAR(export_to_automation_at, 'DD/MM/YYYY')
  ELSE NULL
END;

-- Update the mark_assets_as_exported_to_automation function to use DD/MM/YYYY format
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
  
  -- Update the assets (set flag and timestamp in DD/MM/YYYY format)
  UPDATE assets
  SET exported_to_automation = true,
      export_to_automation_at = TO_CHAR(NOW(), 'DD/MM/YYYY')
  WHERE asset_id = ANY(v_asset_ids);
  
  -- Get the count
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Return the results
  RETURN QUERY SELECT v_count, v_asset_ids;
END;
$$;
