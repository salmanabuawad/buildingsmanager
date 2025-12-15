-- ============================================================================
-- Add distribution_area and exported_to_automation columns to assets table
-- ============================================================================
-- This migration adds two new fields to the assets and assets_history tables:
-- 1. distribution_area (numeric) - Area distributed to this asset
--    NOTE: This column was later renamed to business_distribution_area in migration 20250204000000
-- 2. exported_to_automation (boolean, default false) - Flag indicating if asset has been exported to automation

-- Add columns to assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS distribution_area numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS exported_to_automation boolean DEFAULT false;

-- Add columns to assets_history table (for consistency with assets table)
ALTER TABLE assets_history ADD COLUMN IF NOT EXISTS distribution_area numeric;
ALTER TABLE assets_history ADD COLUMN IF NOT EXISTS exported_to_automation boolean DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN assets.distribution_area IS 'Area distributed to this asset from shared area distribution (NOTE: Renamed to business_distribution_area in migration 20250204000000)';
COMMENT ON COLUMN assets.exported_to_automation IS 'Flag indicating if this asset has been exported to automation system (default: false)';
COMMENT ON COLUMN assets_history.distribution_area IS 'Area distributed to this asset from shared area distribution (historical record) (NOTE: Renamed to business_distribution_area in migration 20250204000000)';
COMMENT ON COLUMN assets_history.exported_to_automation IS 'Flag indicating if this asset has been exported to automation system (historical record)';

