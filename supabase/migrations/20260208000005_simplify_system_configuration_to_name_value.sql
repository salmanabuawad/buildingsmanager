/*
  # Simplify System Configuration Table to Name-Value Structure
  
  This migration simplifies the system_configuration table to use a simple
  name-value structure instead of multiple columns. All configuration values
  will be stored as TEXT in the value column.
*/

-- Create a backup of existing data if any exists
DO $$
BEGIN
  -- Only backup if table exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'system_configuration') THEN
    CREATE TABLE IF NOT EXISTS system_configuration_backup AS 
    SELECT * FROM system_configuration WHERE false;

    -- Backup existing data
    INSERT INTO system_configuration_backup 
    SELECT * FROM system_configuration;
  END IF;
END $$;

-- Drop the old table
DROP TABLE IF EXISTS system_configuration CASCADE;

-- Create simplified system_configuration table with only name and value
CREATE TABLE system_configuration (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_system_configuration_name ON system_configuration(name);
CREATE INDEX IF NOT EXISTS idx_system_configuration_created_at ON system_configuration(created_at);

-- Add comments
COMMENT ON TABLE system_configuration IS 'Stores system-wide configuration settings as name-value pairs';
COMMENT ON COLUMN system_configuration.name IS 'Unique configuration key/name';
COMMENT ON COLUMN system_configuration.value IS 'Configuration value stored as TEXT (can be JSON string for complex values)';
COMMENT ON COLUMN system_configuration.description IS 'Description of what this configuration is used for';
COMMENT ON COLUMN system_configuration.created_by IS 'User who created this configuration';
COMMENT ON COLUMN system_configuration.updated_by IS 'User who last updated this configuration';

-- Enable RLS
ALTER TABLE system_configuration ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Allow authenticated users to view system configuration" ON system_configuration;
CREATE POLICY "Allow authenticated users to view system configuration"
  ON system_configuration FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert system configuration" ON system_configuration;
CREATE POLICY "Allow authenticated users to insert system configuration"
  ON system_configuration FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update system configuration" ON system_configuration;
CREATE POLICY "Allow authenticated users to update system configuration"
  ON system_configuration FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete system configuration" ON system_configuration;
CREATE POLICY "Allow authenticated users to delete system configuration"
  ON system_configuration FOR DELETE
  TO authenticated
  USING (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_configuration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_system_configuration_updated_at ON system_configuration;
CREATE TRIGGER trigger_update_system_configuration_updated_at
  BEFORE UPDATE ON system_configuration
  FOR EACH ROW
  EXECUTE FUNCTION update_system_configuration_updated_at();

-- Migrate existing data from backup if it exists
-- Convert email configs to JSON strings
DO $$
DECLARE
  config_record RECORD;
  email_config_json TEXT;
  ui_config_json TEXT;
BEGIN
  -- Migrate email configurations
  FOR config_record IN 
    SELECT * FROM system_configuration_backup 
    WHERE config_type = 'email' AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  LOOP
    email_config_json := json_build_object(
      'smtp_host', config_record.smtp_host,
      'smtp_port', config_record.smtp_port,
      'smtp_encryption', config_record.smtp_encryption,
      'smtp_username', config_record.smtp_username,
      'smtp_password', config_record.smtp_password,
      'from_email', config_record.from_email,
      'from_name', config_record.from_name,
      'reply_to_email', config_record.reply_to_email,
      'max_retries', config_record.max_retries,
      'timeout_seconds', config_record.timeout_seconds
    )::TEXT;
    
    INSERT INTO system_configuration (name, value, description, created_at, updated_at, created_by, updated_by)
    VALUES ('email_config', email_config_json, config_record.description, config_record.created_at, config_record.updated_at, config_record.created_by, config_record.updated_by)
    ON CONFLICT (name) DO NOTHING;
  END LOOP;
  
  -- Migrate UI configurations
  FOR config_record IN 
    SELECT * FROM system_configuration_backup 
    WHERE config_type = 'ui' AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  LOOP
    ui_config_json := COALESCE(config_record.config_data::TEXT, '{}');
    
    INSERT INTO system_configuration (name, value, description, created_at, updated_at, created_by, updated_by)
    VALUES ('ui_config', ui_config_json, config_record.description, config_record.created_at, config_record.updated_at, config_record.created_by, config_record.updated_by)
    ON CONFLICT (name) DO NOTHING;
  END LOOP;
  
  -- Migrate mail configurations
  FOR config_record IN 
    SELECT * FROM system_configuration_backup 
    WHERE config_type = 'mail' AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  LOOP
    INSERT INTO system_configuration (name, value, description, created_at, updated_at, created_by, updated_by)
    VALUES ('mail_config', COALESCE(config_record.config_data::TEXT, '{}'), config_record.description, config_record.created_at, config_record.updated_at, config_record.created_by, config_record.updated_by)
    ON CONFLICT (name) DO NOTHING;
  END LOOP;
END $$;

-- Drop backup table
DROP TABLE IF EXISTS system_configuration_backup;

-- Create helper function to get configuration value
CREATE OR REPLACE FUNCTION get_config_value(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_value TEXT;
BEGIN
  SELECT value INTO v_value
  FROM system_configuration
  WHERE name = p_name
  LIMIT 1;
  
  RETURN v_value;
END;
$$;

COMMENT ON FUNCTION get_config_value IS 'Returns the value for a configuration by name';
