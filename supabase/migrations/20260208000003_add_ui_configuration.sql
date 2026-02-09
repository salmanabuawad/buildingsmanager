/*
  # Add UI Configuration
  
  This migration adds a default UI configuration entry to control visibility
  of UI features like validation rules management.
*/

-- Insert default UI configuration with validation rules disabled
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

COMMENT ON COLUMN system_configuration.config_data IS 'Additional configuration data stored as JSONB for flexible schema. For UI config type, contains settings like: {"validation_rules_enabled": true/false}';
