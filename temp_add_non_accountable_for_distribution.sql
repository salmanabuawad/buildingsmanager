-- ============================================================================
-- Temporary SQL script to add non_accountable_for_distribution column
-- ============================================================================

-- Add non_accountable_for_distribution column to asset_types table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'asset_types' 
      AND column_name = 'non_accountable_for_distribution'
  ) THEN
    ALTER TABLE asset_types 
    ADD COLUMN non_accountable_for_distribution boolean DEFAULT false;
    
    COMMENT ON COLUMN asset_types.non_accountable_for_distribution IS 'Indicates if the asset type should be excluded from distribution calculations (business shared area distribution). Values: true (לא נספר בפיזור) or false (נספר בפיזור)';
    
    RAISE NOTICE 'Added non_accountable_for_distribution column to asset_types table';
  ELSE
    RAISE NOTICE 'Column non_accountable_for_distribution already exists in asset_types table';
  END IF;
END $$;

