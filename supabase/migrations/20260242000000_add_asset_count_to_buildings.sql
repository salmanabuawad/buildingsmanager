-- Add asset_count to buildings: count of distinct assets per building.
-- update_building_total_area is called when assets change; add asset_count there.

-- 1) Add column
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS asset_count INTEGER;
COMMENT ON COLUMN buildings.asset_count IS 'מספר נכסים ברמת בניין - Count of distinct assets in this building.';

-- 2) Update update_building_total_area to set asset_count
CREATE OR REPLACE FUNCTION public.update_building_total_area(p_building_number bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_asset_sum NUMERIC := 0;
  v_asset_count INTEGER := 0;
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

  SELECT COALESCE(business_shared_area, 0), COALESCE(shared_parking_area, 0)
  INTO v_business_shared_area, v_shared_parking_area
  FROM buildings
  WHERE building_number = p_building_number;

  UPDATE buildings
  SET total_building_area = v_asset_sum + v_business_shared_area + v_shared_parking_area,
      net_area = v_asset_sum,
      asset_count = v_asset_count
  WHERE building_number = p_building_number;
END;
$function$;

COMMENT ON FUNCTION public.update_building_total_area(bigint) IS 'Recalculates building total_area, net_area, and asset_count.';

-- 3) Backfill asset_count for existing buildings
UPDATE buildings b
SET asset_count = (
  SELECT COUNT(*)::INTEGER
  FROM (
    SELECT DISTINCT ON (asset_id) asset_id
    FROM assets
    WHERE building_number = b.building_number
    ORDER BY asset_id, updated_at DESC
  ) x
)
WHERE asset_count IS NULL;

-- 4) Field configuration for buildings-list
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('buildings-list', 'asset_count', 8, 2, 'מספר נכסים ברמת בניין', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();
