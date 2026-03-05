-- Remove column "floor" from the distribution after-data SELECT in save_assets_bulk_transactional.
-- Live DB: assets table has no "floor" (replaced by apartment_floor, storage_floor). Sync confirmed via MCP.

DO $$
DECLARE
  fdef text;
  orig text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;

  orig := fdef;

  -- Remove ", floor" from the SELECT in the distribution after-data branch (column was dropped from assets)
  fdef := replace(fdef, 'structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,' || E'\r\n' || 'business_distribution_area',
    'structure_drawing_url, discount_type, discount_date_from, discount_date_to,' || E'\r\n' || 'business_distribution_area');
  fdef := replace(fdef, 'structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,' || E'\n' || 'business_distribution_area',
    'structure_drawing_url, discount_type, discount_date_from, discount_date_to,' || E'\n' || 'business_distribution_area');

  IF fdef <> orig THEN
    EXECUTE fdef;
    RAISE NOTICE 'save_assets_bulk_transactional: removed floor from distribution after-data SELECT';
  ELSE
    RAISE NOTICE 'save_assets_bulk_transactional: no change (floor already removed or pattern not found)';
  END IF;
END $$;
