/*
  # Add System Configuration Table
  
  This migration creates a system_configuration table to store various system-wide
  settings including email/SMTP configuration and other system configurations.
  This allows the system to manage different types of configurations in a unified way.
*/

-- Create system_configuration table
CREATE TABLE IF NOT EXISTS system_configuration (
  id BIGSERIAL PRIMARY KEY,
  config_type TEXT NOT NULL DEFAULT 'email', -- 'email', 'general', 'notification', etc.
  name TEXT NOT NULL DEFAULT 'default',
  description TEXT,
  -- Email/SMTP configuration fields
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_encryption TEXT DEFAULT 'tls', -- 'tls', 'ssl', 'none'
  smtp_username TEXT,
  smtp_password TEXT, -- Should be encrypted in application layer
  from_email TEXT,
  from_name TEXT,
  reply_to_email TEXT,
  max_retries INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 30,
  -- General configuration fields (stored as JSONB for flexibility)
  config_data JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE(config_type, name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_system_configuration_config_type ON system_configuration(config_type);
CREATE INDEX IF NOT EXISTS idx_system_configuration_name ON system_configuration(name);
CREATE INDEX IF NOT EXISTS idx_system_configuration_is_active ON system_configuration(is_active);
CREATE INDEX IF NOT EXISTS idx_system_configuration_created_at ON system_configuration(created_at);
CREATE INDEX IF NOT EXISTS idx_system_configuration_config_type_active ON system_configuration(config_type, is_active);

-- Add comments
COMMENT ON TABLE system_configuration IS 'Stores system-wide configuration settings including email, notifications, and other system settings';
COMMENT ON COLUMN system_configuration.config_type IS 'Type of configuration: email, general, notification, etc.';
COMMENT ON COLUMN system_configuration.name IS 'Unique name/identifier for this configuration within its type';
COMMENT ON COLUMN system_configuration.description IS 'Description of what this configuration is used for';
COMMENT ON COLUMN system_configuration.smtp_host IS 'SMTP server hostname (e.g., smtp.gmail.com) - for email config type';
COMMENT ON COLUMN system_configuration.smtp_port IS 'SMTP server port (typically 587 for TLS, 465 for SSL, 25 for unencrypted)';
COMMENT ON COLUMN system_configuration.smtp_encryption IS 'Encryption type: tls, ssl, or none';
COMMENT ON COLUMN system_configuration.smtp_username IS 'SMTP authentication username';
COMMENT ON COLUMN system_configuration.smtp_password IS 'SMTP authentication password (should be encrypted)';
COMMENT ON COLUMN system_configuration.from_email IS 'Default sender email address';
COMMENT ON COLUMN system_configuration.from_name IS 'Default sender display name';
COMMENT ON COLUMN system_configuration.reply_to_email IS 'Reply-to email address (optional)';
COMMENT ON COLUMN system_configuration.max_retries IS 'Maximum number of retry attempts for failed sends';
COMMENT ON COLUMN system_configuration.timeout_seconds IS 'Connection timeout in seconds';
COMMENT ON COLUMN system_configuration.config_data IS 'Additional configuration data stored as JSONB for flexible schema';
COMMENT ON COLUMN system_configuration.is_active IS 'Whether this configuration is currently active';
COMMENT ON COLUMN system_configuration.created_by IS 'User who created this configuration';
COMMENT ON COLUMN system_configuration.updated_by IS 'User who last updated this configuration';

-- Enable RLS
ALTER TABLE system_configuration ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Note: You may want to restrict these policies based on user roles
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

-- Create function to get active email configuration
CREATE OR REPLACE FUNCTION get_active_email_configuration()
RETURNS TABLE (
  id BIGINT,
  name TEXT,
  description TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_encryption TEXT,
  smtp_username TEXT,
  smtp_password TEXT,
  from_email TEXT,
  from_name TEXT,
  reply_to_email TEXT,
  max_retries INTEGER,
  timeout_seconds INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.id,
    sc.name,
    sc.description,
    sc.smtp_host,
    sc.smtp_port,
    sc.smtp_encryption,
    sc.smtp_username,
    sc.smtp_password,
    sc.from_email,
    sc.from_name,
    sc.reply_to_email,
    sc.max_retries,
    sc.timeout_seconds
  FROM system_configuration sc
  WHERE sc.config_type = 'email'
    AND sc.is_active = true
  ORDER BY sc.created_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_active_email_configuration IS 'Returns the currently active email configuration';

-- Create function to get configuration by type
CREATE OR REPLACE FUNCTION get_configuration_by_type(p_config_type TEXT)
RETURNS TABLE (
  id BIGINT,
  config_type TEXT,
  name TEXT,
  description TEXT,
  config_data JSONB,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.id,
    sc.config_type,
    sc.name,
    sc.description,
    sc.config_data,
    sc.is_active,
    sc.created_at,
    sc.updated_at
  FROM system_configuration sc
  WHERE sc.config_type = p_config_type
    AND sc.is_active = true
  ORDER BY sc.created_at DESC;
END;
$$;

COMMENT ON FUNCTION get_configuration_by_type IS 'Returns all active configurations of a specific type';
