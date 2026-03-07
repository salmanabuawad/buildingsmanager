-- Ensure no PostgreSQL functions or triggers remain. All business logic lives in Python.
-- Drops any remaining app functions that may exist from older migrations.
-- Safe to run: DROP IF EXISTS does nothing when object is already gone.

-- Drop any remaining triggers (in case any were re-added)
DROP TRIGGER IF EXISTS trigger_update_system_configuration_updated_at ON system_configuration;

-- Drop any remaining app functions (Python implements equivalent logic)
DROP FUNCTION IF EXISTS public.get_config_value(text);
DROP FUNCTION IF EXISTS public.get_active_email_configuration();
DROP FUNCTION IF EXISTS public.get_configuration_by_type(text);
DROP FUNCTION IF EXISTS public.update_system_configuration_updated_at();
DROP FUNCTION IF EXISTS public.extract_boolean_from_jsonb(jsonb, boolean);
