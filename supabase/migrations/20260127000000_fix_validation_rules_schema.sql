-- ============================================================================
-- Fix validation_rules table schema to match code expectations
-- ============================================================================
-- This migration fixes the validation_rules table structure to match
-- what the application code expects (rule_key, entity_type, field_name, enabled, etc.)
-- instead of the consolidated schema (rule_name, rule_value JSONB, active)

-- First, check if the table exists with the new schema and needs to be migrated
DO $$ 
BEGIN
  -- Check if table has the new schema (rule_name, rule_value)
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'validation_rules' 
    AND column_name = 'rule_name'
  ) THEN
    -- Drop the table and recreate with correct schema
    DROP TABLE IF EXISTS validation_rules CASCADE;
    
    -- Recreate with correct schema
    CREATE TABLE validation_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_key text UNIQUE NOT NULL,
      rule_type text NOT NULL,
      field_name text NOT NULL,
      entity_type text NOT NULL,
      value_numeric integer,
      value_text text,
      enabled boolean DEFAULT true,
      error_message text,
      description text,
      compare_table text,
      compare_field text,
      join_field text,
      comparison_operator text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_validation_rules_entity_type ON validation_rules(entity_type);
    CREATE INDEX IF NOT EXISTS idx_validation_rules_field_name ON validation_rules(field_name);
    CREATE INDEX IF NOT EXISTS idx_validation_rules_enabled ON validation_rules(enabled);
    CREATE INDEX IF NOT EXISTS idx_validation_rules_rule_key ON validation_rules(rule_key);

    -- Enable RLS
    ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Allow public read access to validation_rules" ON validation_rules;
    DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert validation_rules" ON validation_rules;
    DROP POLICY IF EXISTS "Allow anonymous and authenticated users to update validation_rules" ON validation_rules;
    DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete validation_rules" ON validation_rules;
    DROP POLICY IF EXISTS "Allow anonymous read access to validation rules" ON validation_rules;
    DROP POLICY IF EXISTS "Allow anonymous insert validation rules" ON validation_rules;
    DROP POLICY IF EXISTS "Allow anonymous update validation rules" ON validation_rules;
    DROP POLICY IF EXISTS "Allow anonymous delete validation rules" ON validation_rules;

    -- Create policies
    CREATE POLICY "Allow anonymous read access to validation rules"
      ON validation_rules FOR SELECT
      USING (true);

    CREATE POLICY "Allow anonymous insert validation rules"
      ON validation_rules FOR INSERT
      WITH CHECK (true);

    CREATE POLICY "Allow anonymous update validation rules"
      ON validation_rules FOR UPDATE
      USING (true)
      WITH CHECK (true);

    CREATE POLICY "Allow anonymous delete validation rules"
      ON validation_rules FOR DELETE
      USING (true);

    RAISE NOTICE 'Recreated validation_rules table with correct schema';
  END IF;
END $$;

-- If table doesn't exist at all, create it
CREATE TABLE IF NOT EXISTS validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text UNIQUE NOT NULL,
  rule_type text NOT NULL,
  field_name text NOT NULL,
  entity_type text NOT NULL,
  value_numeric integer,
  value_text text,
  enabled boolean DEFAULT true,
  error_message text,
  description text,
  compare_table text,
  compare_field text,
  join_field text,
  comparison_operator text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_validation_rules_entity_type ON validation_rules(entity_type);
CREATE INDEX IF NOT EXISTS idx_validation_rules_field_name ON validation_rules(field_name);
CREATE INDEX IF NOT EXISTS idx_validation_rules_enabled ON validation_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_validation_rules_rule_key ON validation_rules(rule_key);

-- Enable RLS
ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;

-- Create or replace policies
DROP POLICY IF EXISTS "Allow anonymous read access to validation rules" ON validation_rules;
CREATE POLICY "Allow anonymous read access to validation rules"
  ON validation_rules FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow anonymous insert validation rules" ON validation_rules;
CREATE POLICY "Allow anonymous insert validation rules"
  ON validation_rules FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous update validation rules" ON validation_rules;
CREATE POLICY "Allow anonymous update validation rules"
  ON validation_rules FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous delete validation rules" ON validation_rules;
CREATE POLICY "Allow anonymous delete validation rules"
  ON validation_rules FOR DELETE
  USING (true);

-- Create or replace trigger function for updated_at
CREATE OR REPLACE FUNCTION update_validation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS validation_rules_updated_at ON validation_rules;
CREATE TRIGGER validation_rules_updated_at
  BEFORE UPDATE ON validation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_validation_rules_updated_at();

COMMENT ON TABLE validation_rules IS 'Dynamic validation rules for assets and buildings';
