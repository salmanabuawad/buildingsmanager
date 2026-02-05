-- ============================================================================
-- Fix: Refresh save_assets_bulk_transactional function in Supabase
-- ============================================================================
-- 
-- INSTRUCTIONS:
-- 1. Open Supabase Dashboard -> SQL Editor
-- 2. Copy and paste the contents of this file
-- 3. Run the SQL script
-- 4. This will refresh the function and update the schema cache
--
-- ALTERNATIVE: Use Supabase CLI
-- Run: supabase db reset (to apply all migrations)
-- Or: supabase migration up (to apply pending migrations)
--
-- ============================================================================

-- First, ensure the helper function exists
CREATE OR REPLACE FUNCTION extract_boolean_from_jsonb(p_value JSONB, p_default BOOLEAN DEFAULT false)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    RETURN p_default;
  END IF;
  
  IF jsonb_typeof(p_value) = 'boolean' THEN
    RETURN (p_value)::text::boolean;
  END IF;
  
  IF jsonb_typeof(p_value) = 'string' THEN
    RETURN CASE 
      WHEN LOWER((p_value)::text) IN ('true', '1') OR (p_value)::text = 'כן' THEN true 
      ELSE false 
    END;
  END IF;
  
  RETURN p_default;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Drop and recreate the main function to refresh schema cache
DROP FUNCTION IF EXISTS public.save_assets_bulk_transactional CASCADE;

-- Now run the complete migration file:
-- supabase/migrations/20260126212018_fix_data_type_casts_in_save_bulk_transactional.sql
--
-- OR copy the full function definition from that file and run it here.
--
-- The function signature should be:
-- save_assets_bulk_transactional(
--   p_assets_data JSONB[],
--   p_validation_passed BOOLEAN,
--   p_validation_errors TEXT DEFAULT NULL,
--   p_action_type TEXT DEFAULT 'manual_update',
--   p_user_id TEXT DEFAULT NULL,
--   p_before_data JSONB DEFAULT NULL,
--   p_after_data JSONB DEFAULT NULL,
--   p_description TEXT DEFAULT NULL,
--   p_is_business_context BOOLEAN DEFAULT NULL
-- )

-- After running the full migration, refresh the Supabase schema cache by:
-- 1. Going to Settings -> API in Supabase Dashboard
-- 2. Click "Reload" or wait a few minutes for auto-refresh
-- 3. Or restart your application
