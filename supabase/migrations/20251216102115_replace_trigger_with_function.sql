/*
  # Replace Distribution Flag Trigger with Callable Function

  1. Overview
    - Removes automatic trigger
    - Creates explicit function to set distribution flags
    - Application code will call this function when needed
    - Provides better visibility and control

  2. Function: set_distribution_flags_for_asset_type_change
    - Takes asset_id, old_main_asset_type, new_main_asset_type
    - Checks if type changed to/from non_accountable
    - Sets appropriate flags on buildings table

  3. Benefits
    - Explicit control over when flags are set
    - Easier debugging and logging
    - Clear function calls in application code
*/

-- Drop the trigger and its function
DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags ON assets;
DROP FUNCTION IF EXISTS auto_set_distribution_flags();

-- Create explicit function to set distribution flags
CREATE OR REPLACE FUNCTION set_distribution_flags_for_asset_type_change(
  p_building_number INTEGER,
  p_old_main_asset_type TEXT,
  p_new_main_asset_type TEXT
)
RETURNS TABLE (
  business_flag_set BOOLEAN,
  residence_flag_set BOOLEAN
) AS $$
DECLARE
  v_old_type_data RECORD;
  v_new_type_data RECORD;
  v_old_is_non_accountable BOOLEAN;
  v_new_is_non_accountable BOOLEAN;
  v_business_residence TEXT;
  v_business_flag_set BOOLEAN := FALSE;
  v_residence_flag_set BOOLEAN := FALSE;
BEGIN
  -- Skip if no building_number
  IF p_building_number IS NULL THEN
    RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
    RETURN;
  END IF;

  -- Exit early if type didn't change
  IF p_old_main_asset_type = p_new_main_asset_type 
     OR p_old_main_asset_type IS NOT DISTINCT FROM p_new_main_asset_type THEN
    RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
    RETURN;
  END IF;

  -- Lookup old asset type data
  IF p_old_main_asset_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution
    INTO v_old_type_data
    FROM asset_types
    WHERE name = p_old_main_asset_type;

    v_old_is_non_accountable := COALESCE(v_old_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_old_is_non_accountable := FALSE;
  END IF;

  -- Lookup new asset type data
  IF p_new_main_asset_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution
    INTO v_new_type_data
    FROM asset_types
    WHERE name = p_new_main_asset_type;

    v_new_is_non_accountable := COALESCE(v_new_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_new_is_non_accountable := FALSE;
  END IF;

  -- Only set flags if changing to/from non_accountable type
  IF v_old_is_non_accountable OR v_new_is_non_accountable THEN
    -- Use the new type's business_residence, fall back to old type
    v_business_residence := COALESCE(v_new_type_data.business_residence, v_old_type_data.business_residence);

    -- Set appropriate distribution flag(s)
    IF v_business_residence = 'עסקים' THEN
      -- Business type
      UPDATE buildings
      SET need_business_distribution = TRUE
      WHERE building_number = p_building_number;
      
      v_business_flag_set := TRUE;

    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence type
      UPDATE buildings
      SET need_residence_distribution = TRUE
      WHERE building_number = p_building_number;
      
      v_residence_flag_set := TRUE;

    ELSE
      -- Unknown type or NULL: set both flags to be safe
      UPDATE buildings
      SET need_business_distribution = TRUE,
          need_residence_distribution = TRUE
      WHERE building_number = p_building_number;
      
      v_business_flag_set := TRUE;
      v_residence_flag_set := TRUE;
    END IF;
  END IF;

  RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_distribution_flags_for_asset_type_change IS 'Explicitly sets building distribution flags when asset main_asset_type changes to/from non_accountable_for_distribution types. Call this function after updating asset types.';
