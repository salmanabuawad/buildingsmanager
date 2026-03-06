-- Drop the OLD 9-parameter overload of save_assets_bulk_transactional.
-- Resolves "Could not choose the best candidate function" when both overloads exist.
-- The 10-param version (with p_set_distribution_flags_on_type_or_size_change) is the correct one.

DROP FUNCTION IF EXISTS public.save_assets_bulk_transactional(
  jsonb[],
  boolean,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text,
  boolean
);
