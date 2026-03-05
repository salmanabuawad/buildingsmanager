-- Run this in Supabase SQL Editor if you get "Could not find the function in schema cache"
-- It adds p_set_distribution_flags_on_type_or_size_change and reloads the schema cache.

DO $$
DECLARE
  fdef text;
  pos int;
  prefix text;
  suffix text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found - run migrations first';
  END IF;

  IF fdef !~ 'p_set_distribution_flags_on_type_or_size_change' THEN
    -- Find position of ) before RETURNS (handles newlines: ") \n RETURNS", ")\nRETURNS")
    -- regexp_match with 's' makes . match newlines; capture group is everything before the )
    prefix := (regexp_match(fdef, '(.*?)\)\s*RETURNS', 'si'))[1];
    IF prefix IS NOT NULL THEN
      pos := length(prefix) + 1;  -- position of the )
    ELSE
      pos := 0;
    END IF;
    IF pos > 1 THEN
      suffix := substring(fdef from pos);
      fdef := prefix || ', p_set_distribution_flags_on_type_or_size_change boolean DEFAULT true' || suffix;
      EXECUTE fdef;
      RAISE NOTICE 'Added p_set_distribution_flags_on_type_or_size_change';
    ELSE
      RAISE EXCEPTION 'Could not find ") RETURNS" in function def. First 500 chars: %', left(fdef, 500);
    END IF;
  ELSE
    RAISE NOTICE 'Parameter already exists';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Schema cache reload requested - wait ~10 seconds and retry';
END $$;
