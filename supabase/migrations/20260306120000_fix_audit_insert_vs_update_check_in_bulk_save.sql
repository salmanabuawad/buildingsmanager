-- Fix INSERT vs UPDATE audit check in save_assets_bulk_transactional.
-- Also ensures p_set_distribution_flags_on_type_or_size_change exists (frontend requires it).
-- Bug: v_existing_asset IS NULL is unreliable in a loop - when SELECT finds no row,
-- the RECORD retains its previous value from the prior iteration.
-- Fix: Use NOT v_asset_found (set from FOUND after SELECT) which correctly tracks
-- whether the current asset existed.

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

  -- 1. Add p_set_distribution_flags_on_type_or_size_change if missing (fixes schema cache error)
  IF fdef !~ 'p_set_distribution_flags_on_type_or_size_change' THEN
    -- Find ) before RETURNS (handles newlines; 's' = . matches newline, 'i' = case-insensitive)
    prefix := (regexp_match(fdef, '(.*?)\)\s*RETURNS', 'si'))[1];
    IF prefix IS NOT NULL THEN
      pos := length(prefix) + 1;
    ELSE
      pos := 0;
    END IF;
    IF pos > 1 THEN
      suffix := substring(fdef from pos);
      fdef := prefix || ', p_set_distribution_flags_on_type_or_size_change boolean DEFAULT true' || suffix;
      orig := fdef;
      changed := true;
    END IF;
  END IF;

  -- 2. Replace the buggy audit check with the correct one
  fdef := replace(fdef,
    $s$CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END$s$,
    $s$CASE WHEN NOT v_asset_found THEN 'INSERT' ELSE 'UPDATE' END$s$
  );
  IF fdef <> orig THEN changed := true; END IF;

  IF changed THEN
    EXECUTE fdef;
    RAISE NOTICE 'save_assets_bulk_transactional: applied fixes';
    -- Reload PostgREST schema cache (Supabase) so the new function signature is picked up
    PERFORM pg_notify('pgrst', 'reload schema');
  ELSE
    RAISE NOTICE 'save_assets_bulk_transactional: no change needed';
  END IF;
END $$;
