-- Add field configurations for new fields
-- This script adds default field configurations for:
-- 1. non_accountable_for_total_area in asset-types grid (renamed from non_accountable)
-- 2. non_accountable_for_distribution in asset-types grid
-- 3. business_distribution_area in assets-list grid

-- Remove old field configurations if they exist (non_accountable, non_accountable_total_area)
DELETE FROM field_configurations 
WHERE grid_name = 'asset-types' 
  AND field_name IN ('non_accountable', 'non_accountable_total_area');

-- Add non_accountable_for_total_area to asset-types grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES ('asset-types', 'non_accountable_for_total_area', 25, 8, 'לא נספר בחישוב שטח מבנה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET 
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();

-- Add non_accountable_for_distribution to asset-types grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES ('asset-types', 'non_accountable_for_distribution', 15, 8, 'לא נספר בפיזור', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET 
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();

-- Add business_distribution_area to assets-list grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES ('assets-list', 'business_distribution_area', 15, 8, 'שטח פיזור עסקים', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET 
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();

-- Verify the insertions
SELECT 
  grid_name,
  field_name,
  hebrew_name,
  width_chars,
  visible
FROM field_configurations
WHERE field_name IN ('non_accountable_for_total_area', 'non_accountable_for_distribution', 'business_distribution_area')
ORDER BY grid_name, field_name;

