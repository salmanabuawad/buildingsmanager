/*
  Fix calculate_asset_business_total_area: asset_types.active is boolean.
  Replaces at.active = 'כן' with COALESCE(at.active, false) = true
  so INSERT into assets (and trigger) does not fail with "??" / invalid boolean.
*/
CREATE OR REPLACE FUNCTION calculate_asset_business_total_area(
  p_asset_size NUMERIC,
  p_area_from_distribution NUMERIC,
  p_main_asset_type TEXT
)
RETURNS NUMERIC AS $$
DECLARE
  v_is_business BOOLEAN := false;
BEGIN
  IF p_main_asset_type IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM asset_types at
      WHERE at.name = p_main_asset_type
        AND COALESCE(at.active, false) = true
        AND at.business_residence = 'עסקים'
    ) INTO v_is_business;
  END IF;

  IF v_is_business THEN
    RETURN COALESCE(p_asset_size, 0) + COALESCE(p_area_from_distribution, 0);
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_asset_business_total_area IS 'Calculate business_total_area for an asset (only for active business asset types)';
