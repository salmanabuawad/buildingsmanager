/*
  # Remove affected_assets_before and affected_assets_after columns from audit table
  
  This migration removes the legacy affected_assets_before and affected_assets_after columns
  from the audit table. The system now uses before_data and after_data JSONB columns instead,
  which are more flexible and can contain assets data within their structure.
  
  Changes:
  - Drop affected_assets_before column if it exists
  - Drop affected_assets_after column if it exists
  - Drop any log_audit function that uses these columns (legacy function)
*/

-- ============================================================================
-- DROP LEGACY log_audit FUNCTION (if it exists with old signature)
-- ============================================================================
-- Drop the old log_audit function that used affected_assets_before/after
-- This function is no longer used - distribution operations use log_audit_entry instead

DROP FUNCTION IF EXISTS log_audit(
  BIGINT,
  distribution_audit_action_type,
  JSONB,
  JSONB,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT
);

DROP FUNCTION IF EXISTS log_audit(
  BIGINT,
  distribution_audit_action_type,
  JSONB,
  JSONB,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT,
  TEXT
);

DROP FUNCTION IF EXISTS log_audit(
  BIGINT,
  audit_action_type,
  JSONB,
  JSONB,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT
);

DROP FUNCTION IF EXISTS log_audit(
  BIGINT,
  audit_action_type,
  JSONB,
  JSONB,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT,
  TEXT
);

-- Drop wrapper function if it exists
DROP FUNCTION IF EXISTS log_distribution_audit(
  BIGINT,
  distribution_audit_action_type,
  JSONB,
  JSONB,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT
);

-- ============================================================================
-- DROP COLUMNS FROM audit TABLE
-- ============================================================================
-- Drop affected_assets_before and affected_assets_after columns if they exist
-- These are legacy columns from the old distribution audit table structure

DO $$ 
BEGIN
  -- Drop affected_assets_before column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' 
    AND column_name = 'affected_assets_before'
  ) THEN
    ALTER TABLE audit DROP COLUMN affected_assets_before;
    RAISE NOTICE 'Dropped affected_assets_before column from audit table';
  END IF;
  
  -- Drop affected_assets_after column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' 
    AND column_name = 'affected_assets_after'
  ) THEN
    ALTER TABLE audit DROP COLUMN affected_assets_after;
    RAISE NOTICE 'Dropped affected_assets_after column from audit table';
  END IF;
END $$;

COMMENT ON TABLE audit IS 'Audit table tracking all changes to buildings and assets. Uses before_data and after_data JSONB columns to store audit data.';

