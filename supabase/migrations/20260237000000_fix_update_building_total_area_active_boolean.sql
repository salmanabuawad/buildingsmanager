-- Root cause of "invalid input syntax for type boolean: כן" on grid save (import was fine):
-- update_building_total_area is called by save_assets_bulk_transactional (RPC) after each asset,
-- but NOT by direct insert (import). It had: AND at.active = 'כן'
-- asset_types.active is boolean; comparing to string 'כן' forces a cast and throws.
-- Fix: use boolean comparison. COALESCE(at.active, false) = true so NULL is treated as false.

CREATE OR REPLACE FUNCTION public.update_building_total_area(p_building_number bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_asset_sum NUMERIC := 0;
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

  SELECT COALESCE(business_shared_area, 0), COALESCE(shared_parking_area, 0)
  INTO v_business_shared_area, v_shared_parking_area
  FROM buildings
  WHERE building_number = p_building_number;

  UPDATE buildings
  SET total_building_area = v_asset_sum + v_business_shared_area + v_shared_parking_area
  WHERE building_number = p_building_number;
END;
$function$;

COMMENT ON FUNCTION public.update_building_total_area(bigint) IS 'Recalculates building total area. Uses boolean check for asset_types.active (fixes invalid input syntax for type boolean: כן).';
