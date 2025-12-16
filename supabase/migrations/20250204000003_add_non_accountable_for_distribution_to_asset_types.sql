-- ============================================================================
-- Add non_accountable_for_distribution field to asset_types table
-- ============================================================================
-- This migration adds a new field to indicate if an asset type should be
-- excluded from distribution calculations (business shared area distribution)

-- Add column to asset_types table
ALTER TABLE asset_types ADD COLUMN IF NOT EXISTS non_accountable_for_distribution boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN asset_types.non_accountable_for_distribution IS 'Indicates if the asset type should be excluded from distribution calculations (business shared area distribution). Values: true (לא נספר בפיזור) or false (נספר בפיזור)';

