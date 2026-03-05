-- Add use_nature (מהות שימוש) as free-text editable column on assets.
-- When empty, UI can show asset_types.description for main_asset_type.

-- 1) Add column
ALTER TABLE assets ADD COLUMN IF NOT EXISTS use_nature TEXT;
ALTER TABLE assets_history ADD COLUMN IF NOT EXISTS use_nature TEXT;
COMMENT ON COLUMN assets.use_nature IS 'מהות שימוש - Free-text use nature; when empty, UI may show asset type description.';
COMMENT ON COLUMN assets_history.use_nature IS 'מהות שימוש (historical).';

-- 2) get_assets_by_ids: return use_nature (after comment)
DROP FUNCTION IF EXISTS get_assets_by_ids(bigint[]);
CREATE OR REPLACE FUNCTION get_assets_by_ids(p_asset_ids bigint[])
RETURNS TABLE (
  building_number bigint,
  payer_id text,
  asset_id bigint,
  measurement_date text,
  main_asset_type text,
  asset_size numeric,
  sub_asset_type_1 text,
  sub_asset_size_1 numeric,
  sub_asset_type_2 text,
  sub_asset_size_2 numeric,
  sub_asset_type_3 text,
  sub_asset_size_3 numeric,
  sub_asset_type_4 text,
  sub_asset_size_4 numeric,
  sub_asset_type_5 text,
  sub_asset_size_5 numeric,
  sub_asset_type_6 text,
  sub_asset_size_6 numeric,
  structure_drawing_url text,
  created_at timestamptz,
  updated_at timestamptz,
  elevator boolean,
  single_double_family boolean,
  condo boolean,
  townhouses boolean,
  penthouse boolean,
  tax_region integer,
  discount_type text,
  discount_date_from text,
  discount_date_to text,
  is_new_measurement boolean,
  business_distribution_area numeric,
  business_total_area numeric,
  exported_to_automation boolean,
  data_from_automation boolean,
  export_to_automation_at text,
  comment text,
  use_nature text,
  apartment_number text,
  apartment_floor text,
  storage_number text,
  storage_floor text,
  operator_id bigint,
  shared_parking_area numeric,
  number_of_parking_units integer
) AS $func$
BEGIN
  RETURN QUERY
  SELECT
    a.building_number, a.payer_id, a.asset_id, a.measurement_date, a.main_asset_type, a.asset_size,
    a.sub_asset_type_1, a.sub_asset_size_1, a.sub_asset_type_2, a.sub_asset_size_2,
    a.sub_asset_type_3, a.sub_asset_size_3, a.sub_asset_type_4, a.sub_asset_size_4,
    a.sub_asset_type_5, a.sub_asset_size_5, a.sub_asset_type_6, a.sub_asset_size_6,
    a.structure_drawing_url, a.created_at, a.updated_at,
    a.elevator, a.single_double_family, a.condo, a.townhouses, a.penthouse,
    a.tax_region, a.discount_type, a.discount_date_from, a.discount_date_to,
    a.is_new_measurement, a.business_distribution_area, a.business_total_area,
    a.exported_to_automation, a.data_from_automation, a.export_to_automation_at,
    a.comment, a.use_nature, a.apartment_number, a.apartment_floor, a.storage_number, a.storage_floor,
    a.operator_id, a.shared_parking_area, a.number_of_parking_units
  FROM assets a
  WHERE a.asset_id = ANY(p_asset_ids)
  ORDER BY a.asset_id;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_assets_by_ids(bigint[]) IS 'Returns assets by IDs (includes use_nature, shared_parking_area, number_of_parking_units).';

-- 3) reset_export_flags_on_change: reset when use_nature changes
CREATE OR REPLACE FUNCTION reset_export_flags_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.building_number IS DISTINCT FROM OLD.building_number OR
    NEW.asset_id IS DISTINCT FROM OLD.asset_id OR
    NEW.payer_id IS DISTINCT FROM OLD.payer_id OR
    NEW.main_asset_type IS DISTINCT FROM OLD.main_asset_type OR
    NEW.asset_size IS DISTINCT FROM OLD.asset_size OR
    NEW.measurement_date IS DISTINCT FROM OLD.measurement_date OR
    NEW.tax_region IS DISTINCT FROM OLD.tax_region OR
    NEW.operator_id IS DISTINCT FROM OLD.operator_id OR
    NEW.sub_asset_type_1 IS DISTINCT FROM OLD.sub_asset_type_1 OR
    NEW.sub_asset_size_1 IS DISTINCT FROM OLD.sub_asset_size_1 OR
    NEW.sub_asset_type_2 IS DISTINCT FROM OLD.sub_asset_type_2 OR
    NEW.sub_asset_size_2 IS DISTINCT FROM OLD.sub_asset_size_2 OR
    NEW.sub_asset_type_3 IS DISTINCT FROM OLD.sub_asset_type_3 OR
    NEW.sub_asset_size_3 IS DISTINCT FROM OLD.sub_asset_size_3 OR
    NEW.sub_asset_type_4 IS DISTINCT FROM OLD.sub_asset_type_4 OR
    NEW.sub_asset_size_4 IS DISTINCT FROM OLD.sub_asset_size_4 OR
    NEW.sub_asset_type_5 IS DISTINCT FROM OLD.sub_asset_type_5 OR
    NEW.sub_asset_size_5 IS DISTINCT FROM OLD.sub_asset_size_5 OR
    NEW.sub_asset_type_6 IS DISTINCT FROM OLD.sub_asset_type_6 OR
    NEW.sub_asset_size_6 IS DISTINCT FROM OLD.sub_asset_size_6 OR
    NEW.business_distribution_area IS DISTINCT FROM OLD.business_distribution_area OR
    NEW.elevator IS DISTINCT FROM OLD.elevator OR
    NEW.single_double_family IS DISTINCT FROM OLD.single_double_family OR
    NEW.condo IS DISTINCT FROM OLD.condo OR
    NEW.townhouses IS DISTINCT FROM OLD.townhouses OR
    NEW.penthouse IS DISTINCT FROM OLD.penthouse OR
    NEW.structure_drawing_url IS DISTINCT FROM OLD.structure_drawing_url OR
    NEW.apartment_number IS DISTINCT FROM OLD.apartment_number OR
    NEW.apartment_floor IS DISTINCT FROM OLD.apartment_floor OR
    NEW.storage_number IS DISTINCT FROM OLD.storage_number OR
    NEW.storage_floor IS DISTINCT FROM OLD.storage_floor OR
    NEW.discount_type IS DISTINCT FROM OLD.discount_type OR
    NEW.discount_date_from IS DISTINCT FROM OLD.discount_date_from OR
    NEW.discount_date_to IS DISTINCT FROM OLD.discount_date_to OR
    NEW.comment IS DISTINCT FROM OLD.comment OR
    NEW.use_nature IS DISTINCT FROM OLD.use_nature OR
    NEW.shared_parking_area IS DISTINCT FROM OLD.shared_parking_area OR
    NEW.number_of_parking_units IS DISTINCT FROM OLD.number_of_parking_units
  ) THEN
    NEW.exported_to_automation := false;
    NEW.export_to_automation_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 4) save_assets_bulk_transactional: add use_nature after comment (column list, VALUES, UPDATE SET)
DO $$
DECLARE
  fdef text;
  orig text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;

  IF fdef NOT LIKE '%use_nature%' THEN
    orig := fdef;

    -- Column list: add use_nature after comment (try different line endings)
    fdef := replace(fdef, E'comment, operator_id, shared_parking_area,\r\nnumber_of_parking_units',
      E'comment, use_nature, operator_id, shared_parking_area,\r\nnumber_of_parking_units');
    fdef := replace(fdef, E'comment, operator_id, shared_parking_area,\nnumber_of_parking_units',
      E'comment, use_nature, operator_id, shared_parking_area,\nnumber_of_parking_units');
    fdef := replace(fdef, E'comment, operator_id,\r\napartment_number',
      E'comment, use_nature, operator_id,\r\napartment_number');
    fdef := replace(fdef, E'comment, operator_id,\napartment_number',
      E'comment, use_nature, operator_id,\napartment_number');

    -- VALUES: after (v_asset_data->>'comment')::TEXT add use_nature
    fdef := replace(fdef,
      E'(v_asset_data->>''comment'')::TEXT,\r\n(CASE WHEN v_asset_data ? ''operator_id''',
      E'(v_asset_data->>''comment'')::TEXT,\r\nNULLIF(TRIM(v_asset_data->>''use_nature''), '''')::TEXT,\r\n(CASE WHEN v_asset_data ? ''operator_id''');
    fdef := replace(fdef,
      E'(v_asset_data->>''comment'')::TEXT,\n(CASE WHEN v_asset_data ? ''operator_id''',
      E'(v_asset_data->>''comment'')::TEXT,\nNULLIF(TRIM(v_asset_data->>''use_nature''), '''')::TEXT,\n(CASE WHEN v_asset_data ? ''operator_id''');

    -- UPDATE SET: after comment = ... add use_nature = ...
    fdef := replace(fdef,
      E'comment = COALESCE((v_asset_data->>''comment'')::TEXT, comment),\r\noperator_id',
      E'comment = COALESCE((v_asset_data->>''comment'')::TEXT, comment),\r\nuse_nature = CASE WHEN v_asset_data ? ''use_nature'' THEN NULLIF(TRIM(v_asset_data->>''use_nature''), '''')::TEXT ELSE use_nature END,\r\noperator_id');
    fdef := replace(fdef,
      E'comment = COALESCE((v_asset_data->>''comment'')::TEXT, comment),\noperator_id',
      E'comment = COALESCE((v_asset_data->>''comment'')::TEXT, comment),\nuse_nature = CASE WHEN v_asset_data ? ''use_nature'' THEN NULLIF(TRIM(v_asset_data->>''use_nature''), '''')::TEXT ELSE use_nature END,\noperator_id');

    IF fdef LIKE '%use_nature%' THEN
      EXECUTE fdef;
    ELSE
      RAISE NOTICE 'save_assets_bulk_transactional: use_nature patch had no effect - check function format.';
    END IF;
  END IF;
END $$;

-- 5) Field configuration: use_nature (מהות שימוש) for assets-list and related grids
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('assets-list', 'use_nature', 22, 2, 'מהות שימוש', false, null, true, NULL),
  ('asset-details-main', 'use_nature', 22, 2, 'מהות שימוש', false, null, true, NULL),
  ('asset-details-history', 'use_nature', 22, 2, 'מהות שימוש', false, null, true, NULL),
  ('assets-file-import', 'use_nature', 22, 2, 'מהות שימוש', false, null, true, NULL),
  ('measured-not-exported-assets', 'use_nature', 22, 2, 'מהות שימוש', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();
