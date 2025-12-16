-- ============================================================================
-- Remove old not_accountable column from asset_types table
-- This column has been replaced by non_accountable_for_total_area
-- ============================================================================

DO $$
BEGIN
  -- Check if the old column exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'asset_types' 
      AND column_name = 'not_accountable'
  ) THEN
    -- Verify that the new columns exist before removing the old one
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = 'asset_types' 
        AND column_name = 'non_accountable_for_total_area'
    ) AND EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = 'asset_types' 
        AND column_name = 'non_accountable_for_distribution'
    ) THEN
      -- Safe to remove the old column
      ALTER TABLE asset_types DROP COLUMN not_accountable;
      RAISE NOTICE 'Removed old not_accountable column from asset_types table';
    ELSE
      RAISE WARNING 'Cannot remove not_accountable: new columns (non_accountable_for_total_area or non_accountable_for_distribution) do not exist';
    END IF;
  ELSE
    RAISE NOTICE 'Column not_accountable does not exist in asset_types table (already removed or never existed)';
  END IF;
END $$;

