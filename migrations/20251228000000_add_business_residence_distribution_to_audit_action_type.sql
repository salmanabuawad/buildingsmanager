-- ============================================================================
-- Migration: Add business_distribution and residence_distribution to audit_action_type
-- ============================================================================
-- This migration adds 'business_distribution' and 'residence_distribution'
-- to the audit_action_type enum, replacing the generic 'distribute_shared' value
-- for distribution operations.

-- Add new enum values to audit_action_type
DO $$ 
BEGIN
  -- Add 'business_distribution' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'business_distribution' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action_type')
  ) THEN
    ALTER TYPE audit_action_type ADD VALUE 'business_distribution';
  END IF;
  
  -- Add 'residence_distribution' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'residence_distribution' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action_type')
  ) THEN
    ALTER TYPE audit_action_type ADD VALUE 'residence_distribution';
  END IF;
END $$;

-- Note: We do NOT migrate existing 'distribute_shared' records to the new types
-- because we cannot determine from the data alone whether they were business or residence
-- distributions. The old records will remain with 'distribute_shared' for historical accuracy.
-- New distribution operations will use 'business_distribution' or 'residence_distribution'.

-- ============================================================================
-- COMMENT
-- ============================================================================
COMMENT ON TYPE audit_action_type IS 'Action types for audit table: manual_update, import_file, transfer_area, distribute_shared (deprecated), business_distribution, residence_distribution';

