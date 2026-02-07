/*
  # Fix mark_assets_as_exported_to_automation function

  1. Overview
    - Add measurement_date check to match getMeasuredNotExported query
    - Only mark assets that have been measured (measurement_date IS NOT NULL)

  2. Changes
    - Update mark_assets_as_exported_to_automation function to check measurement_date
    - This ensures consistency between assets shown in "נכסים שנמדדו ולא נשלחו לעירייה" and what gets marked as exported

  3. Security
    - Function uses SECURITY DEFINER for proper permissions
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
  -- Conditions:
  --   - measurement_date IS NOT NULL (asset has been measured)
  --   - exported_to_automation is false/null
  --   - data_from_automation is false/null
  SELECT ARRAY_AGG(asset_id)
  INTO v_asset_ids
  FROM assets
  WHERE measurement_date IS NOT NULL
    AND (exported_to_automation IS NULL OR exported_to_automation = false)
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
