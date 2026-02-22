-- Building total area = net_area + residence_shared_area + business_shared_area + shared_parking_area.
-- update_building_total_area currently omitted residence_shared_area; add it.

CREATE OR REPLACE FUNCTION public.update_building_total_area(p_building_number bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_asset_sum NUMERIC := 0;
  v_asset_count INTEGER := 0;
  v_residence_shared_area NUMERIC := 0;
  v_business_shared_area NUMERIC := 0;
  v_shared_parking_area NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(a.asset_size), 0) INTO v_asset_sum
  FROM (
    SELECT DISTINCT ON (asset_id)
      asset_id,
      asset_size,
      main_asset_type
    FROM assets
    WHERE building_number = p_building_number
    ORDER BY asset_id, updated_at DESC
  ) a
  WHERE (
    a.main_asset_type IS NULL
    OR EXISTS (
      SELECT 1
      FROM asset_types at
      WHERE at.name = a.main_asset_type
        AND COALESCE(at.active, false) = true
        AND (at.non_accountable_for_total_area IS NULL OR at.non_accountable_for_total_area = false)
    )
  );

  SELECT COUNT(*)::INTEGER INTO v_asset_count
  FROM (
    SELECT DISTINCT ON (asset_id) asset_id
    FROM assets
    WHERE building_number = p_building_number
    ORDER BY asset_id, updated_at DESC
  ) x;

  SELECT COALESCE(residence_shared_area, 0), COALESCE(business_shared_area, 0), COALESCE(shared_parking_area, 0)
  INTO v_residence_shared_area, v_business_shared_area, v_shared_parking_area
  FROM buildings
  WHERE building_number = p_building_number;

  UPDATE buildings
  SET total_building_area = v_asset_sum + v_residence_shared_area + v_business_shared_area + v_shared_parking_area,
      net_area = v_asset_sum,
      asset_count = v_asset_count
  WHERE building_number = p_building_number;
END;
$function$;

COMMENT ON FUNCTION public.update_building_total_area(bigint) IS 'total_building_area = net_area + residence_shared_area + business_shared_area + shared_parking_area. Recalculates net_area and asset_count.';

-- Backfill: recalculate total_building_area for all buildings with new formula
SELECT update_building_total_area(building_number) FROM buildings;
