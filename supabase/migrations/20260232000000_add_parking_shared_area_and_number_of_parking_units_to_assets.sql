-- Add parking_shared_area (numeric) and number_of_parking_units (integer) to assets and assets_history.
-- Also wire them into get_assets_by_ids, reset_export_flags_on_change, and save_assets_bulk_transactional.

-- 1) Add columns to assets and assets_history
ALTER TABLE assets ADD COLUMN IF NOT EXISTS parking_shared_area NUMERIC;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS number_of_parking_units INTEGER;
COMMENT ON COLUMN assets.parking_shared_area IS 'Per-asset shared parking area (sqm)';
COMMENT ON COLUMN assets.number_of_parking_units IS 'Number of parking units for this asset';

ALTER TABLE assets_history ADD COLUMN IF NOT EXISTS parking_shared_area NUMERIC;
ALTER TABLE assets_history ADD COLUMN IF NOT EXISTS number_of_parking_units INTEGER;
COMMENT ON COLUMN assets_history.parking_shared_area IS 'Per-asset shared parking area (historical)';
COMMENT ON COLUMN assets_history.number_of_parking_units IS 'Number of parking units (historical)';

-- 2) get_assets_by_ids: return the new columns
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
  apartment_number text,
  apartment_floor text,
  storage_number text,
  storage_floor text,
  operator_id bigint,
  parking_shared_area numeric,
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
    a.comment, a.apartment_number, a.apartment_floor, a.storage_number, a.storage_floor,
    a.operator_id,
    a.parking_shared_area,
    a.number_of_parking_units
  FROM assets a
  WHERE a.asset_id = ANY(p_asset_ids)
  ORDER BY a.asset_id;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_assets_by_ids(bigint[]) IS 'Returns assets by IDs (includes parking_shared_area and number_of_parking_units).';

-- 3) reset_export_flags_on_change: reset export when parking_shared_area or number_of_parking_units change
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
    NEW.parking_shared_area IS DISTINCT FROM OLD.parking_shared_area OR
    NEW.number_of_parking_units IS DISTINCT FROM OLD.number_of_parking_units
  ) THEN
    NEW.exported_to_automation := false;
    NEW.export_to_automation_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION reset_export_flags_on_change() IS 'Resets exported_to_automation when asset data that affects export changes (including parking_shared_area and number_of_parking_units).';

-- 4) save_assets_bulk_transactional: add parking_shared_area and number_of_parking_units to INSERT and UPDATE
DO $$
DECLARE
  fdef text;
  orig text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;

  IF fdef NOT LIKE '%parking_shared_area%' OR fdef NOT LIKE '%number_of_parking_units%' THEN
    orig := fdef;

    -- Column list: add after operator_id (with or without shared_parking_area before apartment_number)
    fdef := replace(fdef,
      E'operator_id, shared_parking_area,\r\napartment_number, apartment_floor, storage_number, storage_floor',
      E'operator_id, shared_parking_area, parking_shared_area, number_of_parking_units,\r\napartment_number, apartment_floor, storage_number, storage_floor'
    );
    IF fdef = orig THEN
      fdef := replace(fdef,
        E'operator_id,\r\napartment_number, apartment_floor, storage_number, storage_floor',
        E'operator_id, parking_shared_area, number_of_parking_units,\r\napartment_number, apartment_floor, storage_number, storage_floor'
      );
    END IF;
    IF fdef = orig THEN
      fdef := replace(fdef,
        E'operator_id, shared_parking_area,\napartment_number, apartment_floor, storage_number, storage_floor',
        E'operator_id, shared_parking_area, parking_shared_area, number_of_parking_units,\napartment_number, apartment_floor, storage_number, storage_floor'
      );
    END IF;
    IF fdef = orig THEN
      fdef := replace(fdef,
        E'operator_id,\napartment_number, apartment_floor, storage_number, storage_floor',
        E'operator_id, parking_shared_area, number_of_parking_units,\napartment_number, apartment_floor, storage_number, storage_floor'
      );
    END IF;
    -- Column list with "comment, " prefix (format from 20260225/20260227)
    IF fdef = orig THEN
      fdef := replace(fdef,
        E'comment, operator_id, shared_parking_area,\r\napartment_number, apartment_floor, storage_number, storage_floor',
        E'comment, operator_id, shared_parking_area, parking_shared_area, number_of_parking_units,\r\napartment_number, apartment_floor, storage_number, storage_floor'
      );
    END IF;
    IF fdef = orig THEN
      fdef := replace(fdef,
        E'comment, operator_id,\r\napartment_number, apartment_floor, storage_number, storage_floor',
        E'comment, operator_id, parking_shared_area, number_of_parking_units,\r\napartment_number, apartment_floor, storage_number, storage_floor'
      );
    END IF;
    IF fdef = orig THEN
      fdef := replace(fdef,
        E'comment, operator_id, shared_parking_area,\napartment_number, apartment_floor, storage_number, storage_floor',
        E'comment, operator_id, shared_parking_area, parking_shared_area, number_of_parking_units,\napartment_number, apartment_floor, storage_number, storage_floor'
      );
    END IF;
    IF fdef = orig THEN
      fdef := replace(fdef,
        E'comment, operator_id,\napartment_number, apartment_floor, storage_number, storage_floor',
        E'comment, operator_id, parking_shared_area, number_of_parking_units,\napartment_number, apartment_floor, storage_number, storage_floor'
      );
    END IF;

    -- VALUES: add after operator_id value (and optional shared_parking_area)
    fdef := replace(fdef,
      E'(CASE WHEN v_asset_data ? ''shared_parking_area'' THEN (v_asset_data->>''shared_parking_area'')::NUMERIC ELSE NULL END),\r\n(v_asset_data->>''apartment_number'')::TEXT',
      E'(CASE WHEN v_asset_data ? ''shared_parking_area'' THEN (v_asset_data->>''shared_parking_area'')::NUMERIC ELSE NULL END),\r\n(CASE WHEN v_asset_data ? ''parking_shared_area'' THEN (v_asset_data->>''parking_shared_area'')::NUMERIC ELSE NULL END),\r\n(CASE WHEN v_asset_data ? ''number_of_parking_units'' THEN (v_asset_data->>''number_of_parking_units'')::INTEGER ELSE NULL END),\r\n(v_asset_data->>''apartment_number'')::TEXT'
    );
    IF fdef = orig THEN
      fdef := replace(fdef,
        E'(CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE NULL END),\r\n(v_asset_data->>''apartment_number'')::TEXT',
        E'(CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE NULL END),\r\n(CASE WHEN v_asset_data ? ''parking_shared_area'' THEN (v_asset_data->>''parking_shared_area'')::NUMERIC ELSE NULL END),\r\n(CASE WHEN v_asset_data ? ''number_of_parking_units'' THEN (v_asset_data->>''number_of_parking_units'')::INTEGER ELSE NULL END),\r\n(v_asset_data->>''apartment_number'')::TEXT'
      );
    END IF;
    IF fdef NOT LIKE '%parking_shared_area%' THEN
      fdef := replace(fdef,
        E'(CASE WHEN v_asset_data ? ''shared_parking_area'' THEN (v_asset_data->>''shared_parking_area'')::NUMERIC ELSE NULL END),\n(v_asset_data->>''apartment_number'')::TEXT',
        E'(CASE WHEN v_asset_data ? ''shared_parking_area'' THEN (v_asset_data->>''shared_parking_area'')::NUMERIC ELSE NULL END),\n(CASE WHEN v_asset_data ? ''parking_shared_area'' THEN (v_asset_data->>''parking_shared_area'')::NUMERIC ELSE NULL END),\n(CASE WHEN v_asset_data ? ''number_of_parking_units'' THEN (v_asset_data->>''number_of_parking_units'')::INTEGER ELSE NULL END),\n(v_asset_data->>''apartment_number'')::TEXT'
      );
    END IF;
    IF fdef NOT LIKE '%parking_shared_area%' THEN
      fdef := replace(fdef,
        E'(CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE NULL END),\n(v_asset_data->>''apartment_number'')::TEXT',
        E'(CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE NULL END),\n(CASE WHEN v_asset_data ? ''parking_shared_area'' THEN (v_asset_data->>''parking_shared_area'')::NUMERIC ELSE NULL END),\n(CASE WHEN v_asset_data ? ''number_of_parking_units'' THEN (v_asset_data->>''number_of_parking_units'')::INTEGER ELSE NULL END),\n(v_asset_data->>''apartment_number'')::TEXT'
      );
    END IF;

    -- UPDATE SET: add after operator_id (and optional shared_parking_area)
    fdef := replace(fdef,
      E'operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\r\nshared_parking_area = CASE WHEN v_asset_data ? ''shared_parking_area'' THEN (v_asset_data->>''shared_parking_area'')::NUMERIC ELSE shared_parking_area END,\r\napartment_number = COALESCE',
      E'operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\r\nshared_parking_area = CASE WHEN v_asset_data ? ''shared_parking_area'' THEN (v_asset_data->>''shared_parking_area'')::NUMERIC ELSE shared_parking_area END,\r\nparking_shared_area = CASE WHEN v_asset_data ? ''parking_shared_area'' THEN (v_asset_data->>''parking_shared_area'')::NUMERIC ELSE parking_shared_area END,\r\nnumber_of_parking_units = CASE WHEN v_asset_data ? ''number_of_parking_units'' THEN (v_asset_data->>''number_of_parking_units'')::INTEGER ELSE number_of_parking_units END,\r\napartment_number = COALESCE'
    );
    IF fdef NOT LIKE '%number_of_parking_units%' THEN
      fdef := replace(fdef,
        E'operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\r\napartment_number = COALESCE',
        E'operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\r\nparking_shared_area = CASE WHEN v_asset_data ? ''parking_shared_area'' THEN (v_asset_data->>''parking_shared_area'')::NUMERIC ELSE parking_shared_area END,\r\nnumber_of_parking_units = CASE WHEN v_asset_data ? ''number_of_parking_units'' THEN (v_asset_data->>''number_of_parking_units'')::INTEGER ELSE number_of_parking_units END,\r\napartment_number = COALESCE'
      );
    END IF;
    IF fdef NOT LIKE '%number_of_parking_units%' THEN
      fdef := replace(fdef,
        E'operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\nshared_parking_area = CASE WHEN v_asset_data ? ''shared_parking_area'' THEN (v_asset_data->>''shared_parking_area'')::NUMERIC ELSE shared_parking_area END,\napartment_number = COALESCE',
        E'operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\nshared_parking_area = CASE WHEN v_asset_data ? ''shared_parking_area'' THEN (v_asset_data->>''shared_parking_area'')::NUMERIC ELSE shared_parking_area END,\nparking_shared_area = CASE WHEN v_asset_data ? ''parking_shared_area'' THEN (v_asset_data->>''parking_shared_area'')::NUMERIC ELSE parking_shared_area END,\nnumber_of_parking_units = CASE WHEN v_asset_data ? ''number_of_parking_units'' THEN (v_asset_data->>''number_of_parking_units'')::INTEGER ELSE number_of_parking_units END,\napartment_number = COALESCE'
      );
    END IF;
    IF fdef NOT LIKE '%number_of_parking_units%' THEN
      fdef := replace(fdef,
        E'operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\napartment_number = COALESCE',
        E'operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\nparking_shared_area = CASE WHEN v_asset_data ? ''parking_shared_area'' THEN (v_asset_data->>''parking_shared_area'')::NUMERIC ELSE parking_shared_area END,\nnumber_of_parking_units = CASE WHEN v_asset_data ? ''number_of_parking_units'' THEN (v_asset_data->>''number_of_parking_units'')::INTEGER ELSE number_of_parking_units END,\napartment_number = COALESCE'
      );
    END IF;

    IF fdef NOT LIKE '%parking_shared_area%' OR fdef NOT LIKE '%number_of_parking_units%' THEN
      RAISE NOTICE 'save_assets_bulk_transactional: patch had no effect (function format may differ). Columns parking_shared_area and number_of_parking_units exist; add them to the function INSERT/UPDATE manually if needed.';
    ELSE
      EXECUTE fdef;
    END IF;
  END IF;
END $$;
