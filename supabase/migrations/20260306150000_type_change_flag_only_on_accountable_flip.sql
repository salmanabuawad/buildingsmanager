-- Only set distribution flag when asset type change flips non_accountable_for_distribution
-- (i.e. accountable→non_accountable or non_accountable→accountable).
-- Previously: OR condition triggered on any change involving a non_accountable type
-- (including non_accountable→non_accountable). Now: only when the flag flips.
CREATE OR REPLACE FUNCTION set_distribution_flags_for_asset_type_change(
  p_building_number BIGINT,
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
  v_building_record RECORD;
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

  -- Only set flags when non_accountable_for_distribution flips (accountable↔non_accountable)
  IF v_old_is_non_accountable IS DISTINCT FROM v_new_is_non_accountable THEN
    -- Use the new type's business_residence, fall back to old type
    v_business_residence := COALESCE(v_new_type_data.business_residence, v_old_type_data.business_residence);

    -- Get building's shared area values
    SELECT business_shared_area, residence_shared_area
    INTO v_building_record
    FROM buildings
    WHERE building_number = p_building_number;

    -- Set appropriate distribution flag(s) - only if relevant shared area > 0
    IF v_business_residence = 'עסקים' THEN
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_business_distribution = TRUE
        WHERE building_number = p_building_number;
        v_business_flag_set := TRUE;
      END IF;

    ELSIF v_business_residence = 'מגורים' THEN
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_residence_distribution = TRUE
        WHERE building_number = p_building_number;
        v_residence_flag_set := TRUE;
      END IF;

    ELSE
      -- Unknown type or NULL: set both flags to be safe, but only if relevant shared area > 0
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings SET need_business_distribution = TRUE WHERE building_number = p_building_number;
        v_business_flag_set := TRUE;
      END IF;
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings SET need_residence_distribution = TRUE WHERE building_number = p_building_number;
        v_residence_flag_set := TRUE;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_distribution_flags_for_asset_type_change IS 'Sets building distribution flags only when asset type change flips non_accountable_for_distribution (accountable↔non_accountable). Ignores changes between two accountable or two non-accountable types.';
