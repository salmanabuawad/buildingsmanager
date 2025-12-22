-- ============================================================================
-- Migration: Add business_distribution and residence_distribution action types
-- ============================================================================
-- This migration adds 'business_distribution' and 'residence_distribution'
-- to the distribution_audit_action_type enum. This allows us to distinguish
-- between business and residence distributions in the audit table without
-- needing a separate tax_region field.
-- ============================================================================

-- Add new enum values to distribution_audit_action_type
DO $$ 
BEGIN
  -- Add 'business_distribution' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'business_distribution' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'distribution_audit_action_type')
  ) THEN
    ALTER TYPE distribution_audit_action_type ADD VALUE 'business_distribution';
  END IF;
  
  -- Add 'residence_distribution' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'residence_distribution' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'distribution_audit_action_type')
  ) THEN
    ALTER TYPE distribution_audit_action_type ADD VALUE 'residence_distribution';
  END IF;
END $$;

-- ============================================================================
-- Note: The save_assets_bulk_transactional function will be updated in
-- 20250124000000_update_distribution_audit_and_logging.sql to use these
-- new action types based on the business_residence field from asset_types.
-- ============================================================================

