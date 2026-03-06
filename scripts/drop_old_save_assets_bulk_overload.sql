-- Drop the OLD 9-parameter overload of save_assets_bulk_transactional.
-- This resolves "Could not choose the best candidate function" when both
-- the 9-param and 10-param (with p_set_distribution_flags_on_type_or_size_change) exist.
-- Run in Supabase SQL Editor.

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

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
