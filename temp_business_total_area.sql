-- ============================================================================
-- FIELD CONFIGURATION SQL FOR BUSINESS_TOTAL_AREA
-- This script updates field configurations to move business_total_area
-- from buildings-list to assets-list
-- ============================================================================

-- Remove business_total_area from buildings-list field configuration
DELETE FROM field_configurations
WHERE grid_name = 'buildings-list' AND field_name = 'business_total_area';

-- Add business_total_area to assets-list field configuration
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'business_total_area', 6, 2, 'סה"כ שטח עסקים', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, 
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    updated_at = now();

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check field configuration for business_total_area
SELECT grid_name, field_name, hebrew_name, width_chars, padding, visible, pinned, pin_side
FROM field_configurations
WHERE field_name = 'business_total_area';


-- Verify it was added to assets-list
SELECT COUNT(*) as assets_list_count
FROM field_configurations
WHERE grid_name = 'assets-list' AND field_name = 'business_total_area';
-- Should return 1
