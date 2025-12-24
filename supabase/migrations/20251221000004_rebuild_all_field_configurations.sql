/*
  # Rebuild All Field Configurations
  
  This migration rebuilds the entire field_configurations table with:
  - padding = 2 for all fields
  - default width_chars = 6 for all fields (except special cases)
  - All grids in the system included
  
  Special widths:
  - asset_id, building_number, payer_id, actions: 10
  - checkboxes (active, elevator, etc.): 4
  - asset types/subtypes: 4
  - asset sizes/subsizes: 6
  - dates (measurement_date, discount_date_from, discount_date_to): 10
  - All other fields: 6 (default)
*/

-- Update the default padding value to 2 and width_chars to 6
ALTER TABLE field_configurations
  ALTER COLUMN padding SET DEFAULT 2,
  ALTER COLUMN width_chars SET DEFAULT 6;

-- Delete all existing field configurations
DELETE FROM field_configurations;

-- ============================================================================
-- 1. BUILDINGS LIST GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('buildings-list', 'building_number', 10, 2, 'מספר בניין', true, 'right', true, NULL),
  ('buildings-list', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('buildings-list', 'tax_region', 5, 2, 'אזור מיסים', false, null, true, NULL),
  ('buildings-list', 'overload_ratio', 6, 2, 'אחוז העמסה', false, null, true, NULL),
  ('buildings-list', 'residence_shared_area', 6, 2, 'שטח משותף מגורים', false, null, true, NULL),
  ('buildings-list', 'business_shared_area', 6, 2, 'שטח משותף עסקים', false, null, true, NULL),
  ('buildings-list', 'total_building_area', 6, 2, 'ס"כ גודל', false, null, true, NULL),
  ('buildings-list', 'area_for_control', 6, 2, 'שטח לבקרה', false, null, true, NULL),
  ('buildings-list', 'elevator', 4, 2, 'מעלית', false, null, true, NULL),
  ('buildings-list', 'single_double_family', 4, 2, 'בית פרטי', false, null, true, NULL),
  ('buildings-list', 'condo', 4, 2, 'בית משותף', false, null, true, NULL),
  ('buildings-list', 'townhouses', 4, 2, 'טוריים', false, null, true, NULL),
  ('buildings-list', 'building_address', 6, 2, 'כתובת', false, null, true, NULL),
  ('buildings-list', 'gosh', 6, 2, 'גוש', false, null, true, NULL),
  ('buildings-list', 'helka', 6, 2, 'חלקה', false, null, true, NULL),
  ('buildings-list', 'building_number_in_street', 6, 2, 'מספר בניין ברחוב', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('building_number', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 2. ASSETS LIST GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('assets-list', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('assets-list', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL),
  ('assets-list', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('assets-list', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL),
  ('assets-list', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL),
  ('assets-list', 'floor', 6, 2, 'קומה', false, null, true, NULL),
  ('assets-list', 'discount_type', 6, 2, 'סוג הנחה', false, null, true, NULL),
  ('assets-list', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('assets-list', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL),
  ('assets-list', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('assets-list', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL),
  ('assets-list', 'comment', 6, 2, 'הערה', false, null, true, NULL),
  ('assets-list', 'area_from_distribution', 6, 2, 'שטח מפיזור', false, null, true, NULL),
  ('assets-list', 'structure_drawing_url', 6, 2, 'קישור לשרטוט', false, null, true, NULL),
  ('assets-list', 'elevator', 4, 2, 'מעלית', false, null, true, NULL),
  ('assets-list', 'single_double_family', 4, 2, 'בית פרטי', false, null, true, NULL),
  ('assets-list', 'condo', 4, 2, 'בית משותף', false, null, true, NULL),
  ('assets-list', 'townhouses', 4, 2, 'טוריים', false, null, true, NULL),
  ('assets-list', 'exported_to_automation', 4, 2, 'יוצא לאוטומציה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 3. ASSET TYPES GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-types', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('asset-types', 'active', 4, 2, 'פעיל', false, null, true, NULL),
  ('asset-types', 'name', 6, 2, 'קוד נכס', false, null, true, NULL),
  ('asset-types', 'description', 6, 2, 'תיאור', false, null, true, NULL),
  ('asset-types', 'tax_region', 5, 2, 'אזור מיסים', false, null, true, NULL),
  ('asset-types', 'area_description_for_tab', 6, 2, 'תיאור אזור לתצוגה בלשונית', false, null, true, NULL),
  ('asset-types', 'elevator', 4, 2, 'מעלית', false, null, true, NULL),
  ('asset-types', 'single_double_family', 4, 2, 'בית פרטי', false, null, true, NULL),
  ('asset-types', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL),
  ('asset-types', 'condo', 4, 2, 'בית משותף', false, null, true, NULL),
  ('asset-types', 'townhouses', 4, 2, 'טוריים', false, null, true, NULL),
  ('asset-types', 'business_residence', 6, 2, 'עסקים/מגורים', false, null, true, NULL),
  ('asset-types', 'non_accountable_for_total_area', 4, 2, 'לא נספר בחישוב שטח מבנה', false, null, true, NULL),
  ('asset-types', 'non_accountable_for_distribution', 4, 2, 'לא נספר בפיזור', false, null, true, NULL),
  ('asset-types', 'min_size', 6, 2, 'שטח מ', false, null, true, NULL),
  ('asset-types', 'max_size', 6, 2, 'שטח עד', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name = 'actions' THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'actions' THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 4. ADDRESS LIST GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('address-list', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('address-list', 'street_code', 6, 2, 'סמל רחוב', false, null, true, NULL),
  ('address-list', 'street_description', 6, 2, 'שם רחוב', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name = 'actions' THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'actions' THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 5. VALIDATION RULES MANAGER GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('validation-rules-manager', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('validation-rules-manager', 'enabled', 4, 2, 'מופעל', false, null, true, NULL),
  ('validation-rules-manager', 'rule_key', 6, 2, 'מפתח כלל', false, null, true, NULL),
  ('validation-rules-manager', 'entity_type', 6, 2, 'סוג ישות', false, null, true, NULL),
  ('validation-rules-manager', 'field_name', 6, 2, 'שם שדה', false, null, true, NULL),
  ('validation-rules-manager', 'rule_type', 6, 2, 'סוג כלל', false, null, true, NULL),
  ('validation-rules-manager', 'value_numeric', 6, 2, 'ערך מספרי', false, null, true, NULL),
  ('validation-rules-manager', 'value_text', 6, 2, 'ערך טקסט', false, null, true, NULL),
  ('validation-rules-manager', 'error_message', 6, 2, 'הודעת שגיאה', false, null, true, NULL),
  ('validation-rules-manager', 'compare_table', 6, 2, 'טבלת השוואה', false, null, true, NULL),
  ('validation-rules-manager', 'compare_field', 6, 2, 'שדה השוואה', false, null, true, NULL),
  ('validation-rules-manager', 'join_field', 6, 2, 'שדה חיבור', false, null, true, NULL),
  ('validation-rules-manager', 'comparison_operator', 6, 2, 'אופרטור השוואה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name = 'actions' THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'actions' THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 6. AUDIT LOG MASTER GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('audit-log-master', 'action_id', 10, 2, 'מזהה פעולה', false, null, true, NULL),
  ('audit-log-master', 'created_at', 10, 2, 'תאריך', false, null, true, NULL),
  ('audit-log-master', 'user_name', 6, 2, 'משתמש', false, null, true, NULL),
  ('audit-log-master', 'action_type', 6, 2, 'סוג פעולה', false, null, true, NULL),
  ('audit-log-master', 'entity_type', 6, 2, 'סוג ישות', false, null, true, NULL),
  ('audit-log-master', 'entity_id', 6, 2, 'מזהה ישות', false, null, true, NULL),
  ('audit-log-master', 'description', 6, 2, 'תיאור', false, null, true, NULL),
  ('audit-log-master', '_has_before_data', 4, 2, 'יש נתונים לפני', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, updated_at = now();

-- ============================================================================
-- 7. AUDIT LOG DETAIL GRID
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('audit-log-detail', '_type', 6, 2, 'סוג', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, updated_at = now();

-- ============================================================================
-- 8. ASSET DETAILS MAIN GRID (same fields as assets-list + building_number)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('asset-details-main', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('asset-details-main', 'building_number', 10, 2, 'מספר בניין', true, 'right', true, NULL),
  ('asset-details-main', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL),
  ('asset-details-main', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('asset-details-main', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL),
  ('asset-details-main', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL),
  ('asset-details-main', 'floor', 6, 2, 'קומה', false, null, true, NULL),
  ('asset-details-main', 'discount_type', 6, 2, 'סוג הנחה', false, null, true, NULL),
  ('asset-details-main', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('asset-details-main', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL),
  ('asset-details-main', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('asset-details-main', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL),
  ('asset-details-main', 'comment', 6, 2, 'הערה', false, null, true, NULL),
  ('asset-details-main', 'area_from_distribution', 6, 2, 'שטח מפיזור', false, null, true, NULL),
  ('asset-details-main', 'structure_drawing_url', 6, 2, 'קישור לשרטוט', false, null, true, NULL),
  ('asset-details-main', 'elevator', 4, 2, 'מעלית', false, null, true, NULL),
  ('asset-details-main', 'single_double_family', 4, 2, 'בית פרטי', false, null, true, NULL),
  ('asset-details-main', 'condo', 4, 2, 'בית משותף', false, null, true, NULL),
  ('asset-details-main', 'townhouses', 4, 2, 'טוריים', false, null, true, NULL),
  ('asset-details-main', 'exported_to_automation', 4, 2, 'יוצא לאוטומציה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 9. ASSET DETAILS HISTORY GRID (same fields as assets-list + building_number + history_created_at)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('asset-details-history', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('asset-details-history', 'building_number', 10, 2, 'מספר בניין', true, 'right', true, NULL),
  ('asset-details-history', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL),
  ('asset-details-history', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('asset-details-history', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL),
  ('asset-details-history', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL),
  ('asset-details-history', 'floor', 6, 2, 'קומה', false, null, true, NULL),
  ('asset-details-history', 'discount_type', 6, 2, 'סוג הנחה', false, null, true, NULL),
  ('asset-details-history', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('asset-details-history', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL),
  ('asset-details-history', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('asset-details-history', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL),
  ('asset-details-history', 'comment', 6, 2, 'הערה', false, null, true, NULL),
  ('asset-details-history', 'area_from_distribution', 6, 2, 'שטח מפיזור', false, null, true, NULL),
  ('asset-details-history', 'structure_drawing_url', 6, 2, 'קישור לשרטוט', false, null, true, NULL),
  ('asset-details-history', 'elevator', 4, 2, 'מעלית', false, null, true, NULL),
  ('asset-details-history', 'single_double_family', 4, 2, 'בית פרטי', false, null, true, NULL),
  ('asset-details-history', 'condo', 4, 2, 'בית משותף', false, null, true, NULL),
  ('asset-details-history', 'townhouses', 4, 2, 'טוריים', false, null, true, NULL),
  ('asset-details-history', 'exported_to_automation', 4, 2, 'יוצא לאוטומציה', false, null, true, NULL),
  ('asset-details-history', 'history_created_at', 10, 2, 'תאריך יצירת היסטוריה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 10. ASSET DATA ENTRY GRID (same fields as assets-list + building_number)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('asset-data-entry', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('asset-data-entry', 'building_number', 10, 2, 'מספר בניין', true, 'right', true, NULL),
  ('asset-data-entry', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL),
  ('asset-data-entry', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('asset-data-entry', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL),
  ('asset-data-entry', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL),
  ('asset-data-entry', 'floor', 6, 2, 'קומה', false, null, true, NULL),
  ('asset-data-entry', 'discount_type', 6, 2, 'סוג הנחה', false, null, true, NULL),
  ('asset-data-entry', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('asset-data-entry', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL),
  ('asset-data-entry', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('asset-data-entry', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL),
  ('asset-data-entry', 'comment', 6, 2, 'הערה', false, null, true, NULL),
  ('asset-data-entry', 'area_from_distribution', 6, 2, 'שטח מפיזור', false, null, true, NULL),
  ('asset-data-entry', 'structure_drawing_url', 6, 2, 'קישור לשרטוט', false, null, true, NULL),
  ('asset-data-entry', 'elevator', 4, 2, 'מעלית', false, null, true, NULL),
  ('asset-data-entry', 'single_double_family', 4, 2, 'בית פרטי', false, null, true, NULL),
  ('asset-data-entry', 'condo', 4, 2, 'בית משותף', false, null, true, NULL),
  ('asset-data-entry', 'townhouses', 4, 2, 'טוריים', false, null, true, NULL),
  ('asset-data-entry', 'exported_to_automation', 4, 2, 'יוצא לאוטומציה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 11. TRANSFER AREAS GRID (same fields as assets-list, but no building_number)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('transfer-areas', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('transfer-areas', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL),
  ('transfer-areas', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('transfer-areas', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL),
  ('transfer-areas', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL),
  ('transfer-areas', 'floor', 6, 2, 'קומה', false, null, true, NULL),
  ('transfer-areas', 'discount_type', 6, 2, 'סוג הנחה', false, null, true, NULL),
  ('transfer-areas', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('transfer-areas', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL),
  ('transfer-areas', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('transfer-areas', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL),
  ('transfer-areas', 'comment', 6, 2, 'הערה', false, null, true, NULL),
  ('transfer-areas', 'area_from_distribution', 6, 2, 'שטח מפיזור', false, null, true, NULL),
  ('transfer-areas', 'structure_drawing_url', 6, 2, 'קישור לשרטוט', false, null, true, NULL),
  ('transfer-areas', 'elevator', 4, 2, 'מעלית', false, null, true, NULL),
  ('transfer-areas', 'single_double_family', 4, 2, 'בית פרטי', false, null, true, NULL),
  ('transfer-areas', 'condo', 4, 2, 'בית משותף', false, null, true, NULL),
  ('transfer-areas', 'townhouses', 4, 2, 'טוריים', false, null, true, NULL),
  ('transfer-areas', 'exported_to_automation', 4, 2, 'יוצא לאוטומציה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- 12. ASSETS FILE IMPORT GRID (same fields as assets-list + building_number)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('assets-file-import', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('assets-file-import', 'building_number', 10, 2, 'מספר בניין', true, 'right', true, NULL),
  ('assets-file-import', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL),
  ('assets-file-import', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('assets-file-import', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL),
  ('assets-file-import', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL),
  ('assets-file-import', 'floor', 6, 2, 'קומה', false, null, true, NULL),
  ('assets-file-import', 'discount_type', 6, 2, 'סוג הנחה', false, null, true, NULL),
  ('assets-file-import', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('assets-file-import', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL),
  ('assets-file-import', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('assets-file-import', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL),
  ('assets-file-import', 'comment', 6, 2, 'הערה', false, null, true, NULL),
  ('assets-file-import', 'area_from_distribution', 6, 2, 'שטח מפיזור', false, null, true, NULL),
  ('assets-file-import', 'structure_drawing_url', 6, 2, 'קישור לשרטוט', false, null, true, NULL),
  ('assets-file-import', 'elevator', 4, 2, 'מעלית', false, null, true, NULL),
  ('assets-file-import', 'single_double_family', 4, 2, 'בית פרטי', false, null, true, NULL),
  ('assets-file-import', 'condo', 4, 2, 'בית משותף', false, null, true, NULL),
  ('assets-file-import', 'townhouses', 4, 2, 'טוריים', false, null, true, NULL),
  ('assets-file-import', 'exported_to_automation', 4, 2, 'יוצא לאוטומציה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN 'right' WHEN field_configurations.pinned = true THEN 'right' ELSE field_configurations.pin_side END,
    updated_at = now();

-- ============================================================================
-- FINAL: Set default width_chars = 6 and padding = 2 for any remaining fields
-- Also ensure all pinned fields have pin_side = 'right'
-- Also ensure all fields with "size" in the name have width_chars = 6
-- ============================================================================
UPDATE field_configurations
SET width_chars = 6, padding = 2, updated_at = now()
WHERE width_chars IS NULL OR width_chars NOT IN (10, 4, 6);

-- Ensure asset_id always has width_chars = 10
UPDATE field_configurations
SET width_chars = 10, updated_at = now()
WHERE field_name = 'asset_id' AND width_chars != 10;

-- Ensure building_number always has width_chars = 10
UPDATE field_configurations
SET width_chars = 10, updated_at = now()
WHERE field_name = 'building_number' AND width_chars != 10;

-- Ensure payer_id always has width_chars = 10
UPDATE field_configurations
SET width_chars = 10, updated_at = now()
WHERE field_name = 'payer_id' AND width_chars != 10;

-- Ensure all checkbox fields have width_chars = 4
-- Checkbox fields: active, elevator, single_double_family, penthouse, condo, townhouses,
-- non_accountable_for_total_area, non_accountable_for_distribution, exported_to_automation, enabled
UPDATE field_configurations
SET width_chars = 4, updated_at = now()
WHERE field_name IN ('active', 'elevator', 'single_double_family', 'penthouse', 'condo', 'townhouses', 
                      'non_accountable_for_total_area', 'non_accountable_for_distribution', 
                      'exported_to_automation', 'enabled', '_has_before_data')
  AND width_chars != 4;

-- Ensure all date fields have width_chars = 10
-- Date fields: measurement_date, discount_date_from, discount_date_to, created_at, updated_at, history_created_at
UPDATE field_configurations
SET width_chars = 10, updated_at = now()
WHERE field_name ILIKE '%date%' OR field_name IN ('created_at', 'updated_at', 'history_created_at')
  AND width_chars != 10;

-- Ensure all asset type and subtype fields have width_chars = 4
-- Asset type fields: main_asset_type, sub_asset_type_1 through sub_asset_type_6
UPDATE field_configurations
SET width_chars = 4, updated_at = now()
WHERE field_name ILIKE '%asset_type%' AND width_chars != 4;

-- Ensure tax_region always has width_chars = 5
UPDATE field_configurations
SET width_chars = 5, updated_at = now()
WHERE field_name = 'tax_region' AND width_chars != 5;

-- Ensure all fields with "size" in the name have width_chars = 6
UPDATE field_configurations
SET width_chars = 6, updated_at = now()
WHERE field_name ILIKE '%size%' AND width_chars != 6;

-- Ensure all pinned fields have pin_side = 'right'
UPDATE field_configurations
SET pin_side = 'right', updated_at = now()
WHERE pinned = true AND (pin_side IS NULL OR pin_side != 'right');

