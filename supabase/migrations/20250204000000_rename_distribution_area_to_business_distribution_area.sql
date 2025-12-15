-- ============================================================================
-- Rename distribution_area to business_distribution_area
-- ============================================================================
-- This migration renames the distribution_area column to business_distribution_area
-- in both assets and assets_history tables to better reflect that it's specifically
-- for business shared area distribution.

-- Rename column in assets table
ALTER TABLE assets RENAME COLUMN distribution_area TO business_distribution_area;

-- Rename column in assets_history table
ALTER TABLE assets_history RENAME COLUMN distribution_area TO business_distribution_area;

-- Update comments for documentation
COMMENT ON COLUMN assets.business_distribution_area IS 'Area distributed to this asset from business shared area distribution';
COMMENT ON COLUMN assets_history.business_distribution_area IS 'Area distributed to this asset from business shared area distribution (historical record)';

