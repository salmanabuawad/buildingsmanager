-- ============================================================================
-- ADD not_accountable_for_statistics COLUMN TO asset_types TABLE
-- ============================================================================
-- Add "not accountable for statistics" checkbox field to asset_types table
-- Type: BOOLEAN, Default: false

-- Add the new boolean column
ALTER TABLE asset_types
ADD COLUMN IF NOT EXISTS not_accountable_for_statistics BOOLEAN DEFAULT false;

-- Document the field
COMMENT ON COLUMN asset_types.not_accountable_for_statistics IS
  'Indicates if the asset type should be excluded from statistics calculations (UI statistics modal). true = excluded, false = included';

-- ============================================================================
-- ADD FIELD CONFIGURATION FOR not_accountable_for_statistics IN asset-types GRID
-- ============================================================================
-- Width/padding for checkboxes
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('asset-types', 'not_accountable_for_statistics', 4, 2, 'לא נספר בסטטיסטיקה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, hebrew_name = EXCLUDED.hebrew_name, updated_at = now();

