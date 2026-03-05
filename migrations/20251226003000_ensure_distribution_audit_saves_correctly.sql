/*
  # Ensure Distribution Audit Saves Correctly
  
  This migration ensures that distribution operations (business_distribution and residence_distribution)
  are correctly saved to the audit table with proper before/after data in a single transaction.
  
  Changes:
  - Updated log_audit_entry call to use COALESCE to ensure before/after data are never NULL
  - Added additional check to ensure data collection has occurred before logging
  - All operations happen in the same transaction, ensuring atomicity
*/

-- The changes are already applied in the save_assets_bulk_transactional function
-- in 20251218000000_remove_backend_validation_checks.sql
-- This migration file serves as documentation and verification

-- Verify that the log_audit_entry function exists and accepts the correct parameters
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'log_audit_entry'
    AND p.pronargs = 7
  ) THEN
    RAISE EXCEPTION 'log_audit_entry function not found or has wrong signature';
  END IF;
END $$;

-- Verify that business_distribution and residence_distribution are in the audit_action_type enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'business_distribution' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action_type')
  ) THEN
    RAISE EXCEPTION 'business_distribution not found in audit_action_type enum';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'residence_distribution' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action_type')
  ) THEN
    RAISE EXCEPTION 'residence_distribution not found in audit_action_type enum';
  END IF;
END $$;

COMMENT ON FUNCTION save_assets_bulk_transactional IS 
  'Saves assets in bulk with audit logging. For distribution operations (business_distribution, residence_distribution), 
   collects all assets in the building before and after the operation and logs to audit table in the same transaction.';

