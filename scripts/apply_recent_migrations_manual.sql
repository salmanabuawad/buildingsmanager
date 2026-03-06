-- Run this in Supabase Dashboard > SQL Editor to apply migrations 20260306120000–20260306150000
-- Run each block in order (or run all at once).

-- ========== 1. 20260306120000: Fix audit INSERT vs UPDATE check + add p_set_distribution_flags param ==========
DO $$
DECLARE
  fdef text;
  orig text;
  changed boolean := false;
  pos int;
  prefix text;
  suffix text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;
  orig := fdef;
  IF fdef !~ 'p_set_distribution_flags_on_type_or_size_change' THEN
    prefix := (regexp_match(fdef, '(.*?)\)\s*RETURNS', 'si'))[1];
    IF prefix IS NOT NULL THEN pos := length(prefix) + 1; ELSE pos := 0; END IF;
    IF pos > 1 THEN
      suffix := substring(fdef from pos);
      fdef := prefix || ', p_set_distribution_flags_on_type_or_size_change boolean DEFAULT true' || suffix;
      orig := fdef;
      changed := true;
    END IF;
  END IF;
  fdef := replace(fdef,
    $s$CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END$s$,
    $s$CASE WHEN NOT v_asset_found THEN 'INSERT' ELSE 'UPDATE' END$s$
  );
  IF fdef <> orig THEN changed := true; END IF;
  IF changed THEN
    EXECUTE fdef;
    RAISE NOTICE '20260306120000: applied';
    PERFORM pg_notify('pgrst', 'reload schema');
  ELSE
    RAISE NOTICE '20260306120000: no change needed';
  END IF;
END $$;

-- ========== 2. 20260306130000: Drop old 9-param overload ==========
DROP FUNCTION IF EXISTS public.save_assets_bulk_transactional(
  jsonb[], boolean, text, text, text, jsonb, jsonb, text, boolean
);

-- ========== 3. 20260306140000: Fix type change detection for distribution flag ==========
-- Ensures type-change sets distribution flag when main_asset_type is in payload (Assets List).
DO $$
DECLARE
  fdef text;
  orig text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN RAISE EXCEPTION 'save_assets_bulk_transactional not found'; END IF;
  IF fdef LIKE '%v_type_changed := (v_asset_data ? ''main_asset_type'' AND%' THEN
    RAISE NOTICE '20260306140000: already patched';
    RETURN;
  END IF;
  orig := fdef;
  -- Pattern 1: full assignment
  fdef := regexp_replace(fdef,
    'v_type_changed\s*:=\s*\(\s*v_old_main_asset_type\s+IS\s+DISTINCT\s+FROM\s+v_new_main_asset_type\s*\)\s*;',
    E'v_type_changed := (v_asset_data ? ''main_asset_type'' AND (v_old_main_asset_type IS DISTINCT FROM NULLIF(TRIM((v_asset_data->>''main_asset_type'')::TEXT), ''''))) ;',
    'g'
  );
  -- Pattern 2: just comparison expression (fallback)
  IF fdef = orig THEN
    fdef := regexp_replace(fdef,
      '\(\s*v_old_main_asset_type\s+IS\s+DISTINCT\s+FROM\s+v_new_main_asset_type\s*\)',
      E'(v_asset_data ? ''main_asset_type'' AND (v_old_main_asset_type IS DISTINCT FROM NULLIF(TRIM((v_asset_data->>''main_asset_type'')::TEXT), '''')))',
      'g'
    );
  END IF;
  IF fdef <> orig THEN
    EXECUTE fdef;
    RAISE NOTICE '20260306140000: applied';
    PERFORM pg_notify('pgrst', 'reload schema');
  ELSE
    RAISE NOTICE '20260306140000: pattern not found - skipped. Frontend fix (sanitizeAssetInput) should still help.';
  END IF;
END $$;

-- ========== 4. 20260306150000: Type change flag only when accountable↔non_accountable ==========
CREATE OR REPLACE FUNCTION set_distribution_flags_for_asset_type_change(
  p_building_number BIGINT,
  p_old_main_asset_type TEXT,
  p_new_main_asset_type TEXT
)
RETURNS TABLE (business_flag_set BOOLEAN, residence_flag_set BOOLEAN) AS $$
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
  IF p_building_number IS NULL THEN
    RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
    RETURN;
  END IF;
  IF p_old_main_asset_type = p_new_main_asset_type OR p_old_main_asset_type IS NOT DISTINCT FROM p_new_main_asset_type THEN
    RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
    RETURN;
  END IF;
  IF p_old_main_asset_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution INTO v_old_type_data FROM asset_types WHERE name = p_old_main_asset_type;
    v_old_is_non_accountable := COALESCE(v_old_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_old_is_non_accountable := FALSE;
  END IF;
  IF p_new_main_asset_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution INTO v_new_type_data FROM asset_types WHERE name = p_new_main_asset_type;
    v_new_is_non_accountable := COALESCE(v_new_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_new_is_non_accountable := FALSE;
  END IF;
  IF v_old_is_non_accountable IS DISTINCT FROM v_new_is_non_accountable THEN
    v_business_residence := COALESCE(v_new_type_data.business_residence, v_old_type_data.business_residence);
    SELECT business_shared_area, residence_shared_area INTO v_building_record FROM buildings WHERE building_number = p_building_number;
    IF v_business_residence = 'עסקים' THEN
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings SET need_business_distribution = TRUE WHERE building_number = p_building_number;
        v_business_flag_set := TRUE;
      END IF;
    ELSIF v_business_residence = 'מגורים' THEN
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings SET need_residence_distribution = TRUE WHERE building_number = p_building_number;
        v_residence_flag_set := TRUE;
      END IF;
    ELSE
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

COMMENT ON FUNCTION set_distribution_flags_for_asset_type_change IS 'Sets building distribution flags only when asset type change flips non_accountable_for_distribution (accountable↔non_accountable).';
