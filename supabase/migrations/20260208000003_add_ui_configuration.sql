/*
  # Add UI Configuration
  
  This migration adds a default UI configuration entry to control visibility
  of UI features like validation rules management.
  
  Note: This migration will be updated by migration 20260208000005 to work
  with the simplified name-value structure. If run after that migration,
  it will insert the ui_config entry directly.
*/

-- Check if the table has the old structure (config_type column exists)
DO $$
BEGIN
  -- Try to insert using old structure first (will fail if column doesn't exist)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_configuration' AND column_name = 'config_type'
  ) THEN
    -- Old structure - insert with config_type
    INSERT INTO system_configuration (config_type, name, description, config_data, is_active)
    VALUES (
      'ui',
      'default',
      'UI feature visibility settings',
      '{"validation_rules_enabled": false}'::jsonb,
      true
    )
    ON CONFLICT (config_type, name) DO UPDATE
    SET 
      config_data = COALESCE(
        system_configuration.config_data || '{"validation_rules_enabled": false}'::jsonb,
        '{"validation_rules_enabled": false}'::jsonb
      ),
      updated_at = now();
  ELSE
    -- New structure - insert as name-value
    INSERT INTO system_configuration (name, value, description)
    VALUES (
      'ui_config',
      '{"validation_rules_enabled": false}',
      'UI feature visibility settings'
    )
    ON CONFLICT (name) DO UPDATE
    SET 
      value = '{"validation_rules_enabled": false}',
      updated_at = now();
  END IF;
END $$;
