/*
  # Add Field Configurations for Measured Not Exported Assets Grid
  
  This migration adds field configurations for the 'measured-not-exported-assets' grid.
  It copies all field configurations from 'assets-list' and adds 'building_number'.
  
  The grid displays assets that have been measured but not yet exported to the municipality.
*/

-- ============================================================================
-- MEASURED NOT EXPORTED ASSETS GRID
-- (Same fields as assets-list + building_number)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('measured-not-exported-assets', 'actions', 10, 2, 'פעולות', true, 'left', true, NULL),
  ('measured-not-exported-assets', 'building_number', 10, 2, 'מספר בניין', false, null, true, NULL),
  ('measured-not-exported-assets', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('measured-not-exported-assets', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL),
  ('measured-not-exported-assets', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('measured-not-exported-assets', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL),
  ('measured-not-exported-assets', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL),
  ('measured-not-exported-assets', 'floor', 6, 2, 'קומה', false, null, true, NULL),
  ('measured-not-exported-assets', 'discount_type', 6, 2, 'סוג הנחה', false, null, true, NULL),
  ('measured-not-exported-assets', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('measured-not-exported-assets', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL),
  ('measured-not-exported-assets', 'comment', 6, 2, 'הערה', false, null, true, NULL),
  ('measured-not-exported-assets', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('measured-not-exported-assets', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL),
  ('measured-not-exported-assets', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL),
  ('measured-not-exported-assets', 'business_distribution_area', 6, 2, 'גודל שטח משותף', false, null, true, NULL),
  ('measured-not-exported-assets', 'business_total_area', 6, 2, 'סה"כ שטח עסקים', false, null, true, NULL),
  ('measured-not-exported-assets', 'residence_distribution_area', 6, 2, 'גודל שטח משותף מגורים', false, null, true, NULL),
  ('measured-not-exported-assets', 'extra_field', 6, 2, '', false, null, true, NULL),
  ('measured-not-exported-assets', 'extra_field_1', 6, 2, '', false, null, true, NULL),
  ('measured-not-exported-assets', 'extra_field_2', 6, 2, '', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, 
    padding = EXCLUDED.padding, 
    hebrew_name = EXCLUDED.hebrew_name,
    pinned = CASE WHEN EXCLUDED.field_name IN ('actions', 'asset_id') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE 
      WHEN EXCLUDED.field_name = 'actions' THEN 'left'
      WHEN EXCLUDED.field_name = 'asset_id' THEN 'right'
      WHEN field_configurations.pinned = true THEN field_configurations.pin_side
      ELSE field_configurations.pin_side 
    END,
    visible = EXCLUDED.visible,
    updated_at = now();
