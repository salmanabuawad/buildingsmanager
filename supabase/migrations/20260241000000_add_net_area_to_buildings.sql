-- Add net_area to buildings: sum of asset_size (same logic as in total_building_area).
-- update_building_total_area already computes v_asset_sum; set net_area = v_asset_sum there.
-- Then backfill and add field_config for buildings-list.

-- 1) Add column
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS net_area NUMERIC;
COMMENT ON COLUMN buildings.net_area IS 'שטח נטו - Sum of asset_size for assets in this building (active, accountable).';

-- 2) Update update_building_total_area to set net_area = v_asset_sum
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
  SET total_building_area = v_asset_sum + v_business_shared_area + v_shared_parking_area,
      net_area = v_asset_sum
  WHERE building_number = p_building_number;
END;
$function$;

COMMENT ON FUNCTION public.update_building_total_area(bigint) IS 'Recalculates building total_area and net_area. net_area = sum(asset_size); total_building_area = net_area + business_shared_area + shared_parking_area.';

-- 3) Backfill net_area for existing buildings (same formula as above)
UPDATE buildings b
SET net_area = COALESCE(
  (
    SELECT SUM(a.asset_size)
    FROM (
      SELECT DISTINCT ON (asset_id) asset_id, asset_size, main_asset_type
      FROM assets
      WHERE building_number = b.building_number
      ORDER BY asset_id, updated_at DESC
    ) a
    WHERE (
      a.main_asset_type IS NULL
      OR EXISTS (
        SELECT 1 FROM asset_types at
        WHERE at.name = a.main_asset_type
          AND COALESCE(at.active, false) = true
          AND (at.non_accountable_for_total_area IS NULL OR at.non_accountable_for_total_area = false)
      )
    )
  ),
  0
)
WHERE net_area IS NULL;

-- 4) Field configuration for buildings-list
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('buildings-list', 'net_area', 10, 2, 'שטח נטו', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();
