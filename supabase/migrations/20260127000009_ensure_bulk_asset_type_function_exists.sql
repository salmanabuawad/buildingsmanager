/*
  Migration: Ensure update_asset_types_bulk_with_distribution_reset function exists
  
  This migration ensures the bulk asset type update function exists and is up to date.
  It calls update_asset_type_with_distribution_reset which was fixed in migration 20260127000007.
*/

CREATE OR REPLACE FUNCTION update_asset_types_bulk_with_distribution_reset(
  p_asset_types_data JSONB[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item JSONB;
  v_id BIGINT;
  v_updates JSONB;
  v_single_result JSONB;
  v_results JSONB[] := ARRAY[]::JSONB[];
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_single_affected BIGINT[];
  v_count INTEGER := 0;
BEGIN
  FOREACH v_item IN ARRAY p_asset_types_data
  LOOP
    v_id := (v_item->>'id')::BIGINT;
    v_updates := v_item->'updates';

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Asset type id is required for all updates';
    END IF;

    IF v_updates IS NULL OR v_updates = '{}'::jsonb THEN
      CONTINUE;
    END IF;

    -- Reuse the existing transactional function per asset type
    -- This function was fixed in migration 20260127000007 to support boolean fields
    v_single_result := update_asset_type_with_distribution_reset(v_id, v_updates);
    v_results := array_append(v_results, v_single_result);
    v_count := v_count + 1;

    -- Aggregate affected buildings across all updates
    v_single_affected := ARRAY(
      SELECT jsonb_array_elements_text(COALESCE(v_single_result->'affected_buildings', '[]'::jsonb))::BIGINT
    );

    IF v_single_affected IS NOT NULL AND array_length(v_single_affected, 1) > 0 THEN
      SELECT ARRAY(
        SELECT DISTINCT unnest(v_affected_buildings || v_single_affected)
      )
      INTO v_affected_buildings;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'count', v_count,
    'affected_buildings', COALESCE(v_affected_buildings, ARRAY[]::BIGINT[]),
    'results', v_results,
    'message', format('Successfully updated %s asset type(s)', v_count)
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Bulk asset type update failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION update_asset_types_bulk_with_distribution_reset IS 'Bulk update asset_types by calling update_asset_type_with_distribution_reset for each item, in a single transaction. Aggregates affected building_numbers. Supports boolean checkbox fields.';
