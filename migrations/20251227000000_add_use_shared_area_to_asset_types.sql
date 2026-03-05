-- ============================================================================
-- ADD use_shared_area COLUMN TO asset_types TABLE
-- ============================================================================
-- Add "שימוש בשטח משותף" (use of shared area) checkbox field to asset_types table
-- Type: BOOLEAN, Default: NULL

-- Add the use_shared_area column to asset_types table
ALTER TABLE asset_types 
ADD COLUMN IF NOT EXISTS use_shared_area BOOLEAN DEFAULT NULL;

-- Add comment to document the field
COMMENT ON COLUMN asset_types.use_shared_area IS 'שימוש בשטח משותף - Checkbox indicating if asset type uses shared area';

-- ============================================================================
-- ADD FIELD CONFIGURATION FOR use_shared_area IN asset-types GRID
-- ============================================================================
-- Add field configuration for the new checkbox field (width_chars = 4, padding = 2 for checkboxes)

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-types', 'use_shared_area', 4, 2, 'שימוש בשטח משותף', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- ============================================================================
-- UPDATE SPECIFIC ASSET TYPES TO SET use_shared_area = true
-- ============================================================================
-- Set use_shared_area to true for asset types 251, 252, and 253

UPDATE asset_types
SET use_shared_area = true
WHERE name IN ('251', '252', '253');

