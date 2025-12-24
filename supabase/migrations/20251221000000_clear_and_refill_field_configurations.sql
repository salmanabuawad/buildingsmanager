/*
  # Clear and Refill Field Configurations
  
  This migration:
  1. Updates the default padding value to 2 in the table schema
  2. Removes all existing field configuration data from the table
  
  The table should be refilled with updated configurations through the
  application UI or a subsequent migration. All new configurations will
  default to padding = 2.
  
  The field_configurations table stores column width, padding, visibility,
  and other display properties for grid fields across the application.
*/

-- Update the default padding value to 2
ALTER TABLE field_configurations
  ALTER COLUMN padding SET DEFAULT 2;

-- Delete all existing field configurations
DELETE FROM field_configurations;

-- Insert field configurations for asset_id, building_number, and payer_id
-- with width_chars = 10 and padding = 2 across all relevant grids

-- Assets List grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('assets-list', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('assets-list', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN true ELSE field_configurations.pinned END, 
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Buildings List grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('buildings-list', 'building_number', 10, 2, 'מספר בניין', true, 'left', true, NULL),
  ('buildings-list', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'building_number' THEN 'left' WHEN EXCLUDED.field_name = 'actions' THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Asset Details Main grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('asset-details-main', 'building_number', 10, 2, 'מספר בניין', true, 'left', true, NULL),
  ('asset-details-main', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('asset-details-main', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'asset_id' THEN 'right' WHEN EXCLUDED.field_name = 'building_number' THEN 'left' WHEN EXCLUDED.field_name = 'actions' THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Asset Details History grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('asset-details-history', 'building_number', 10, 2, 'מספר בניין', true, 'left', true, NULL),
  ('asset-details-history', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('asset-details-history', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'asset_id' THEN 'right' WHEN EXCLUDED.field_name = 'building_number' THEN 'left' WHEN EXCLUDED.field_name = 'actions' THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Asset Data Entry grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('asset-data-entry', 'building_number', 10, 2, 'מספר בניין', true, 'left', true, NULL),
  ('asset-data-entry', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('asset-data-entry', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'asset_id' THEN 'right' WHEN EXCLUDED.field_name = 'building_number' THEN 'left' WHEN EXCLUDED.field_name = 'actions' THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Transfer Areas grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('transfer-areas', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('transfer-areas', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'actions') THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Assets File Import grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'asset_id', 10, 2, 'מזהה נכס', true, 'right', true, NULL),
  ('assets-file-import', 'building_number', 10, 2, 'מספר בניין', true, 'left', true, NULL),
  ('assets-file-import', 'actions', 10, 2, 'פעולות', true, 'right', true, NULL),
  ('assets-file-import', 'payer_id', 10, 2, 'מזהה משלם', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, padding = EXCLUDED.padding, 
    pinned = CASE WHEN EXCLUDED.field_name IN ('asset_id', 'building_number', 'actions') THEN true ELSE field_configurations.pinned END,
    pin_side = CASE WHEN EXCLUDED.field_name = 'asset_id' THEN 'right' WHEN EXCLUDED.field_name = 'building_number' THEN 'left' WHEN EXCLUDED.field_name = 'actions' THEN 'right' ELSE field_configurations.pin_side END, 
    updated_at = now();

-- Insert checkbox field configurations with width_chars = 4 and padding = 2
-- Checkbox fields are boolean/yes-no fields that display as checkboxes

-- Asset Types grid - checkbox fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-types', 'active', 4, 2, 'פעיל', false, null, true, NULL),
  ('asset-types', 'elevator', 4, 2, 'מעלית', false, null, true, NULL),
  ('asset-types', 'single_double_family', 4, 2, 'בית פרטי', false, null, true, NULL),
  ('asset-types', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL),
  ('asset-types', 'condo', 4, 2, 'בית משותף', false, null, true, NULL),
  ('asset-types', 'townhouses', 4, 2, 'טוריים', false, null, true, NULL),
  ('asset-types', 'non_accountable_for_total_area', 4, 2, 'לא נספר בחישוב שטח מבנה', false, null, true, NULL),
  ('asset-types', 'non_accountable_for_distribution', 4, 2, 'לא נספר בפיזור', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Buildings List grid - checkbox fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('buildings-list', 'elevator', 4, 2, 'מעלית', false, null, true, NULL),
  ('buildings-list', 'single_double_family', 4, 2, 'בית פרטי', false, null, true, NULL),
  ('buildings-list', 'condo', 4, 2, 'בית משותף', false, null, true, NULL),
  ('buildings-list', 'townhouses', 4, 2, 'טוריים', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Assets List grid - checkbox fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Asset Data Entry grid - checkbox fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Assets File Import grid - checkbox fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'penthouse', 4, 2, 'דירת גג', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Insert asset type and subtype field configurations with width_chars = 4 and padding = 2
-- Asset type fields: main_asset_type, sub_asset_type_1 through sub_asset_type_6

-- Assets List grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('assets-list', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Asset Details Main grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Asset Details History grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Asset Data Entry grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Transfer Areas grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Assets File Import grid - asset type fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'main_asset_type', 4, 2, 'סוג נכס ראשי', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_1', 4, 2, 'סוג נכס משני 1', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_2', 4, 2, 'סוג נכס משני 2', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_3', 4, 2, 'סוג נכס משני 3', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_4', 4, 2, 'סוג נכס משני 4', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_5', 4, 2, 'סוג נכס משני 5', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_type_6', 4, 2, 'סוג נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 4, padding = 2, updated_at = now();

-- Insert asset size and subsize field configurations with width_chars = 6 and padding = 2
-- Asset size fields: asset_size, sub_asset_size_1 through sub_asset_size_6

-- Assets List grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('assets-list', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Details Main grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('asset-details-main', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Details History grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('asset-details-history', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Asset Data Entry grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('asset-data-entry', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Transfer Areas grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('transfer-areas', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Assets File Import grid - asset size fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'asset_size', 6, 2, 'גודל נכס ראשי', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_1', 6, 2, 'גודל נכס משני 1', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_2', 6, 2, 'גודל נכס משני 2', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_3', 6, 2, 'גודל נכס משני 3', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_4', 6, 2, 'גודל נכס משני 4', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_5', 6, 2, 'גודל נכס משני 5', false, null, true, NULL),
  ('assets-file-import', 'sub_asset_size_6', 6, 2, 'גודל נכס משני 6', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 6, padding = 2, updated_at = now();

-- Insert tax_region field configurations with width_chars = 5 and padding = 2

-- Assets List grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 5, padding = 2, updated_at = now();

-- Asset Details Main grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 5, padding = 2, updated_at = now();

-- Asset Details History grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 5, padding = 2, updated_at = now();

-- Asset Data Entry grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 5, padding = 2, updated_at = now();

-- Transfer Areas grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 5, padding = 2, updated_at = now();

-- Assets File Import grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 5, padding = 2, updated_at = now();

-- Asset Types grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-types', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 5, padding = 2, updated_at = now();

-- Buildings List grid - tax_region
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('buildings-list', 'tax_region', 5, 2, 'אזור מס', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 5, padding = 2, updated_at = now();

-- Insert date field configurations with width_chars = 10 and padding = 2
-- Date fields: measurement_date, discount_date_from, discount_date_to

-- Assets List grid - date fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-list', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('assets-list', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('assets-list', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Asset Details Main grid - date fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-main', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('asset-details-main', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('asset-details-main', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Asset Details History grid - date fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-details-history', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('asset-details-history', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('asset-details-history', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Asset Data Entry grid - date fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('asset-data-entry', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('asset-data-entry', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('asset-data-entry', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Transfer Areas grid - date fields (if applicable)
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('transfer-areas', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('transfer-areas', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('transfer-areas', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Assets File Import grid - date fields
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('assets-file-import', 'measurement_date', 10, 2, 'תאריך מדידה', false, null, true, NULL),
  ('assets-file-import', 'discount_date_from', 10, 2, 'תאריך הנחה מ', false, null, true, NULL),
  ('assets-file-import', 'discount_date_to', 10, 2, 'תאריך הנחה עד', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = 10, padding = 2, updated_at = now();

-- Set width_chars = 5 and padding = 2 for all other fields that don't have specific widths (10, 4, or 6)
-- This covers any existing fields like: measurement_date, floor, discount_type, discount_date_from, 
-- discount_date_to, structure_drawing_url, area_from_distribution, name, description,
-- area_description_for_tab, business_residence, min_size, max_size, and any other fields
-- Note: This UPDATE will affect any fields that were already in the table before the DELETE above
-- or fields that get added later through other means (UI, other migrations, etc.)
UPDATE field_configurations
SET width_chars = 5, padding = 2, updated_at = now()
WHERE width_chars IS NULL OR width_chars NOT IN (10, 4, 6, 5);

-- Note: Additional field configurations can be added through the Field Config Manager UI
-- or by importing a configuration file with the updated field definitions.

