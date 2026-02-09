/*
  # Drop asset_type_fields Table
  
  This migration drops the deprecated asset_type_fields table which is no longer in use.
  The system now uses field_configurations table for field-level configurations.
  
  This table was originally created in the initial schema but was replaced by 
  field_configurations. A previous migration (20251230000000) attempted to drop it,
  but this migration ensures it's properly removed.
*/

-- Drop the asset_type_fields table if it exists
DROP TABLE IF EXISTS asset_type_fields CASCADE;

-- Verify the table has been dropped
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'asset_type_fields'
  ) THEN
    RAISE EXCEPTION 'asset_type_fields table still exists after DROP command';
  END IF;
END $$;

COMMENT ON SCHEMA public IS 'asset_type_fields table has been removed. Use field_configurations table for field-level configurations.';
