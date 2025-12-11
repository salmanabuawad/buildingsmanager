-- ============================================================================
-- TEMPORARY SQL SCRIPT: Populate field_configurations for all grids
-- This script updates the table structure and inserts all fields per grid
-- ============================================================================

-- Step 1: Update table structure to support grid_name and column_order
-- First, drop the existing primary key constraint
ALTER TABLE field_configurations DROP CONSTRAINT IF EXISTS field_configurations_pkey;

-- Add new columns if they don't exist
DO $$
BEGIN
  -- Add grid_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'field_configurations' AND column_name = 'grid_name'
  ) THEN
    ALTER TABLE field_configurations ADD COLUMN grid_name TEXT;
  END IF;

  -- Add column_order column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'field_configurations' AND column_name = 'column_order'
  ) THEN
    ALTER TABLE field_configurations ADD COLUMN column_order INTEGER;
  END IF;

  -- Add pin_side column for left/right distinction if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'field_configurations' AND column_name = 'pin_side'
  ) THEN
    ALTER TABLE field_configurations ADD COLUMN pin_side TEXT;
  END IF;

  -- Add visible column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'field_configurations' AND column_name = 'visible'
  ) THEN
    ALTER TABLE field_configurations ADD COLUMN visible BOOLEAN DEFAULT true;
  END IF;

  -- Ensure visible has default if it doesn't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'field_configurations' 
    AND column_name = 'visible'
  ) THEN
    ALTER TABLE field_configurations 
      ALTER COLUMN visible SET DEFAULT true;
  END IF;

  -- Update pinned column to boolean if it's currently text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'field_configurations' 
    AND column_name = 'pinned' 
    AND data_type = 'text'
  ) THEN
    -- Store pin_side before converting
    UPDATE field_configurations 
    SET pin_side = CASE 
      WHEN pinned = 'left' THEN 'left'
      WHEN pinned = 'right' THEN 'right'
      ELSE NULL
    END;
    
    -- Convert text to boolean
    ALTER TABLE field_configurations 
      ALTER COLUMN pinned TYPE BOOLEAN 
      USING CASE 
        WHEN pinned IN ('left', 'right', 'true', 'כן') THEN true 
        ELSE false 
      END;
    ALTER TABLE field_configurations 
      ALTER COLUMN pinned SET DEFAULT false;
  END IF;

  -- Ensure pinned has default if it doesn't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'field_configurations' 
    AND column_name = 'pinned'
    AND data_type != 'boolean'
  ) THEN
    ALTER TABLE field_configurations 
      ALTER COLUMN pinned TYPE BOOLEAN 
      USING (pinned::boolean);
    ALTER TABLE field_configurations 
      ALTER COLUMN pinned SET DEFAULT false;
  END IF;
  
  -- Set default for pinned if column exists but no default
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'field_configurations' 
    AND column_name = 'pinned'
  ) THEN
    ALTER TABLE field_configurations 
      ALTER COLUMN pinned SET DEFAULT false;
  END IF;
END $$;

-- Create new composite primary key
ALTER TABLE field_configurations 
  ADD CONSTRAINT field_configurations_pkey PRIMARY KEY (grid_name, field_name);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_field_configurations_grid_name 
  ON field_configurations(grid_name);

-- Step 2: Clear existing data (optional - comment out if you want to keep existing)
-- DELETE FROM field_configurations;

-- ============================================================================
-- BUILDINGS LIST GRID (buildings-list)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order) VALUES
('buildings-list', 'actions', 8, 8, 'פעולות', true, 'right', true, 0),
('buildings-list', 'building_number', 12, 8, 'מזהה מבנה', false, NULL, true, 1),
('buildings-list', 'tax_region', 10, 8, 'אזור מיסים', false, NULL, true, 2),
('buildings-list', 'overload_ratio', 12, 8, 'אחוז העמסה', false, NULL, true, 3),
('buildings-list', 'residence_shared_area', 18, 8, 'שטח משותף מגורים', false, NULL, true, 4),
('buildings-list', 'business_shared_area', 18, 8, 'שטח משותף עסקים', false, NULL, true, 5),
('buildings-list', 'total_building_area', 12, 8, 'ס"כ גודל', false, NULL, true, 6),
('buildings-list', 'area_for_control', 12, 8, 'שטח לבקרה', false, NULL, true, 7),
('buildings-list', 'elevator', 8, 8, 'מעלית', false, NULL, true, 8),
('buildings-list', 'single_double_family', 30, 8, 'בית פרטי חד משפחתי דו משפחתי', false, NULL, true, 9),
('buildings-list', 'condo', 12, 8, 'בית משותף', false, NULL, true, 10),
('buildings-list', 'townhouses', 35, 8, 'מבנים צמודי קרקע טוריים מעל 2 יחידות', false, NULL, true, 11),
('buildings-list', 'building_address', 20, 8, 'כתובת', false, NULL, true, 12),
('buildings-list', 'gosh', 8, 8, 'גוש', false, NULL, true, 13),
('buildings-list', 'helka', 8, 8, 'חלקה', false, NULL, true, 14),
('buildings-list', 'building_number_in_street', 20, 8, 'מספר בניין ברחוב', false, NULL, true, 15)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

-- ============================================================================
-- ASSETS LIST GRID (assets-list)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order) VALUES
('assets-list', 'actions', 10, 8, 'פעולות', true, 'right', true, 0),
('assets-list', 'asset_id', 12, 8, 'מזהה נכס', true, 'right', true, 1),
('assets-list', 'measurement_date', 12, 8, 'תאריך מדידה', false, NULL, true, 2),
('assets-list', 'payer_id', 12, 8, 'מזהה משלם', false, NULL, true, 3),
('assets-list', 'tax_region', 10, 8, 'אזור מס', false, NULL, true, 4),
('assets-list', 'penthouse', 10, 8, 'דירת גג', false, NULL, true, 5),
('assets-list', 'floor', 8, 8, 'קומה', false, NULL, true, 6),
('assets-list', 'discount_type', 12, 8, 'סוג הנחה', false, NULL, true, 7),
('assets-list', 'discount_date_from', 12, 8, 'תאריך הנחה מ', false, NULL, true, 8),
('assets-list', 'discount_date_to', 12, 8, 'תאריך הנחה עד', false, NULL, true, 9),
('assets-list', 'main_asset_type', 12, 8, 'סוג נכס ראשי', false, NULL, true, 10),
('assets-list', 'asset_size', 12, 8, 'גודל נכס', false, NULL, true, 11),
('assets-list', 'sub_asset_type_1', 12, 8, 'סוג נכס משנה 1', false, NULL, true, 12),
('assets-list', 'sub_asset_size_1', 12, 8, 'גודל נכס משנה 1', false, NULL, true, 13),
('assets-list', 'sub_asset_type_2', 12, 8, 'סוג נכס משנה 2', false, NULL, true, 14),
('assets-list', 'sub_asset_size_2', 12, 8, 'גודל נכס משנה 2', false, NULL, true, 15),
('assets-list', 'sub_asset_type_3', 12, 8, 'סוג נכס משנה 3', false, NULL, true, 16),
('assets-list', 'sub_asset_size_3', 12, 8, 'גודל נכס משנה 3', false, NULL, true, 17),
('assets-list', 'sub_asset_type_4', 12, 8, 'סוג נכס משנה 4', false, NULL, true, 18),
('assets-list', 'sub_asset_size_4', 12, 8, 'גודל נכס משנה 4', false, NULL, true, 19),
('assets-list', 'sub_asset_type_5', 12, 8, 'סוג נכס משנה 5', false, NULL, true, 20),
('assets-list', 'sub_asset_size_5', 12, 8, 'גודל נכס משנה 5', false, NULL, true, 21),
('assets-list', 'sub_asset_type_6', 12, 8, 'סוג נכס משנה 6', false, NULL, true, 22),
('assets-list', 'sub_asset_size_6', 12, 8, 'גודל נכס משנה 6', false, NULL, true, 23),
('assets-list', 'extra_field', 12, 8, 'שדה נוסף', false, NULL, true, 24),
('assets-list', 'extra_field_1', 12, 8, 'שדה נוסף 1', false, NULL, true, 25),
('assets-list', 'extra_field_2', 12, 8, 'שדה נוסף 2', false, NULL, true, 26)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

-- ============================================================================
-- ASSET DETAILS MAIN GRID (asset-details-main)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order) VALUES
('asset-details-main', 'structure_drawing_url', 10, 8, 'שרטוט מבנה', true, 'right', true, 0),
('asset-details-main', 'asset_id', 12, 8, 'מזהה נכס', true, 'right', true, 1),
('asset-details-main', 'measurement_date', 12, 8, 'תאריך מדידה', false, NULL, true, 2),
('asset-details-main', 'payer_id', 12, 8, 'מזהה משלם', false, NULL, true, 3),
('asset-details-main', 'tax_region', 10, 8, 'אזור מס', false, NULL, true, 4),
('asset-details-main', 'penthouse', 10, 8, 'דירת גג', false, NULL, true, 5),
('asset-details-main', 'floor', 8, 8, 'קומה', false, NULL, true, 6),
('asset-details-main', 'discount_type', 12, 8, 'סוג הנחה', false, NULL, true, 7),
('asset-details-main', 'discount_date_from', 12, 8, 'תאריך הנחה מ', false, NULL, true, 8),
('asset-details-main', 'discount_date_to', 12, 8, 'תאריך הנחה עד', false, NULL, true, 9),
('asset-details-main', 'main_asset_type', 12, 8, 'סוג נכס ראשי', false, NULL, true, 10),
('asset-details-main', 'asset_size', 12, 8, 'גודל נכס', false, NULL, true, 11),
('asset-details-main', 'sub_asset_type_1', 12, 8, 'סוג נכס משנה 1', false, NULL, true, 12),
('asset-details-main', 'sub_asset_size_1', 12, 8, 'גודל נכס משנה 1', false, NULL, true, 13),
('asset-details-main', 'sub_asset_type_2', 12, 8, 'סוג נכס משנה 2', false, NULL, true, 14),
('asset-details-main', 'sub_asset_size_2', 12, 8, 'גודל נכס משנה 2', false, NULL, true, 15),
('asset-details-main', 'sub_asset_type_3', 12, 8, 'סוג נכס משנה 3', false, NULL, true, 16),
('asset-details-main', 'sub_asset_size_3', 12, 8, 'גודל נכס משנה 3', false, NULL, true, 17),
('asset-details-main', 'sub_asset_type_4', 12, 8, 'סוג נכס משנה 4', false, NULL, true, 18),
('asset-details-main', 'sub_asset_size_4', 12, 8, 'גודל נכס משנה 4', false, NULL, true, 19),
('asset-details-main', 'sub_asset_type_5', 12, 8, 'סוג נכס משנה 5', false, NULL, true, 20),
('asset-details-main', 'sub_asset_size_5', 12, 8, 'גודל נכס משנה 5', false, NULL, true, 21),
('asset-details-main', 'sub_asset_type_6', 12, 8, 'סוג נכס משנה 6', false, NULL, true, 22),
('asset-details-main', 'sub_asset_size_6', 12, 8, 'גודל נכס משנה 6', false, NULL, true, 23),
('asset-details-main', 'extra_field_1', 12, 8, 'שדה נוסף 1', false, NULL, true, 24),
('asset-details-main', 'extra_field_2', 12, 8, 'שדה נוסף 2', false, NULL, true, 25)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

-- ============================================================================
-- ASSET DETAILS HISTORY GRID (asset-details-history)
-- ============================================================================
-- Note: History grid typically has the same fields as main grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order) VALUES
('asset-details-history', 'structure_drawing_url', 10, 8, 'שרטוט מבנה', true, 'right', true, 0),
('asset-details-history', 'asset_id', 12, 8, 'מזהה נכס', true, 'right', true, 1),
('asset-details-history', 'measurement_date', 12, 8, 'תאריך מדידה', false, NULL, true, 2),
('asset-details-history', 'payer_id', 12, 8, 'מזהה משלם', false, NULL, true, 3),
('asset-details-history', 'tax_region', 10, 8, 'אזור מס', false, NULL, true, 4),
('asset-details-history', 'penthouse', 10, 8, 'דירת גג', false, NULL, true, 5),
('asset-details-history', 'floor', 8, 8, 'קומה', false, NULL, true, 6),
('asset-details-history', 'discount_type', 12, 8, 'סוג הנחה', false, NULL, true, 7),
('asset-details-history', 'discount_date_from', 12, 8, 'תאריך הנחה מ', false, NULL, true, 8),
('asset-details-history', 'discount_date_to', 12, 8, 'תאריך הנחה עד', false, NULL, true, 9),
('asset-details-history', 'main_asset_type', 12, 8, 'סוג נכס ראשי', false, NULL, true, 10),
('asset-details-history', 'asset_size', 12, 8, 'גודל נכס', false, NULL, true, 11),
('asset-details-history', 'sub_asset_type_1', 12, 8, 'סוג נכס משנה 1', false, NULL, true, 12),
('asset-details-history', 'sub_asset_size_1', 12, 8, 'גודל נכס משנה 1', false, NULL, true, 13),
('asset-details-history', 'sub_asset_type_2', 12, 8, 'סוג נכס משנה 2', false, NULL, true, 14),
('asset-details-history', 'sub_asset_size_2', 12, 8, 'גודל נכס משנה 2', false, NULL, true, 15),
('asset-details-history', 'sub_asset_type_3', 12, 8, 'סוג נכס משנה 3', false, NULL, true, 16),
('asset-details-history', 'sub_asset_size_3', 12, 8, 'גודל נכס משנה 3', false, NULL, true, 17),
('asset-details-history', 'sub_asset_type_4', 12, 8, 'סוג נכס משנה 4', false, NULL, true, 18),
('asset-details-history', 'sub_asset_size_4', 12, 8, 'גודל נכס משנה 4', false, NULL, true, 19),
('asset-details-history', 'sub_asset_type_5', 12, 8, 'סוג נכס משנה 5', false, NULL, true, 20),
('asset-details-history', 'sub_asset_size_5', 12, 8, 'גודל נכס משנה 5', false, NULL, true, 21),
('asset-details-history', 'sub_asset_type_6', 12, 8, 'סוג נכס משנה 6', false, NULL, true, 22),
('asset-details-history', 'sub_asset_size_6', 12, 8, 'גודל נכס משנה 6', false, NULL, true, 23),
('asset-details-history', 'extra_field_1', 12, 8, 'שדה נוסף 1', false, NULL, true, 24),
('asset-details-history', 'extra_field_2', 12, 8, 'שדה נוסף 2', false, NULL, true, 25)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

-- ============================================================================
-- ASSET TYPES GRID (asset-types)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order) VALUES
('asset-types', 'actions', 8, 8, 'פעולות', true, 'right', true, 0),
('asset-types', 'name', 10, 8, 'סוג נכס', true, 'right', true, 1),
('asset-types', 'active', 8, 8, 'פעיל', false, NULL, true, 2),
('asset-types', 'description', 20, 8, 'תיאור', false, NULL, true, 3),
('asset-types', 'tax_region', 10, 8, 'אזור מיסים', false, NULL, true, 4),
('asset-types', 'area_description_for_tab', 25, 8, 'תיאור אזור לתצוגה בלשונית', false, NULL, true, 5),
('asset-types', 'elevator', 8, 8, 'מעלית', false, NULL, true, 6),
('asset-types', 'single_double_family', 12, 8, 'בית פרטי', false, NULL, true, 7),
('asset-types', 'penthouse', 10, 8, 'דירת גג', false, NULL, true, 8),
('asset-types', 'condo', 12, 8, 'בית משותף', false, NULL, true, 9),
('asset-types', 'townhouses', 10, 8, 'טוריים', false, NULL, true, 10),
('asset-types', 'business_residence', 12, 8, 'עסקים/מגורים', false, NULL, true, 11),
('asset-types', 'shared_area_usage', 12, 8, 'שטח משותף', false, NULL, true, 12),
('asset-types', 'not_accountable', 10, 8, 'לא נספר', false, NULL, true, 13),
('asset-types', 'min_size', 10, 8, 'שטח מ', false, NULL, true, 14),
('asset-types', 'max_size', 10, 8, 'שטח עד', false, NULL, true, 15),
('asset-types', 'extra_field_1', 12, 8, 'שדה נוסף 1', false, NULL, true, 16),
('asset-types', 'extra_field_2', 12, 8, 'שדה נוסף 2', false, NULL, true, 17)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

-- ============================================================================
-- VALIDATION RULES GRID (validation-rules)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order) VALUES
('validation-rules', 'actions', 8, 8, 'פעולות', true, 'right', true, 0),
('validation-rules', 'enabled', 8, 8, 'מופעל', false, NULL, true, 1),
('validation-rules', 'rule_key', 15, 8, 'מפתח כלל', false, NULL, true, 2),
('validation-rules', 'entity_type', 12, 8, 'סוג ישות', false, NULL, true, 3),
('validation-rules', 'field_name', 15, 8, 'שם שדה', false, NULL, true, 4),
('validation-rules', 'rule_type', 15, 8, 'סוג כלל', false, NULL, true, 5),
('validation-rules', 'value_numeric', 12, 8, 'ערך מספרי', false, NULL, true, 6),
('validation-rules', 'value_text', 15, 8, 'ערך טקסט', false, NULL, true, 7),
('validation-rules', 'error_message', 25, 8, 'הודעת שגיאה', false, NULL, true, 8),
('validation-rules', 'description', 20, 8, 'תיאור', false, NULL, true, 9),
('validation-rules', 'compare_table', 15, 8, 'טבלת השוואה', false, NULL, true, 10),
('validation-rules', 'compare_field', 15, 8, 'שדה השוואה', false, NULL, true, 11),
('validation-rules', 'join_field', 12, 8, 'שדה חיבור', false, NULL, true, 12),
('validation-rules', 'comparison_operator', 12, 8, 'אופרטור', false, NULL, true, 13),
('validation-rules', 'extra_field_1', 12, 8, 'שדה נוסף 1', false, NULL, true, 14),
('validation-rules', 'extra_field_2', 12, 8, 'שדה נוסף 2', false, NULL, true, 15)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

-- ============================================================================
-- ADDRESS LIST GRID (address-list)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order) VALUES
('address-list', 'actions', 8, 8, 'פעולות', true, 'right', true, 0),
('address-list', 'street_code', 12, 8, 'סמל רחוב', false, NULL, true, 1),
('address-list', 'street_description', 30, 8, 'שם רחוב', false, NULL, true, 2)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

-- ============================================================================
-- ASSET DATA ENTRY GRID (asset-data-entry)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order) VALUES
('asset-data-entry', 'actions', 8, 8, 'פעולות', true, 'right', true, 0),
('asset-data-entry', 'building_number', 12, 8, 'מזהה מבנה', false, NULL, true, 1),
('asset-data-entry', 'payer_id', 12, 8, 'מזהה משלם', false, NULL, true, 2),
('asset-data-entry', 'penthouse', 10, 8, 'דירת גג', false, NULL, true, 3),
('asset-data-entry', 'floor', 8, 8, 'קומה', false, NULL, true, 4),
('asset-data-entry', 'discount_type', 12, 8, 'סוג הנחה', false, NULL, true, 5),
('asset-data-entry', 'discount_date_from', 12, 8, 'תאריך הנחה מ', false, NULL, true, 6),
('asset-data-entry', 'discount_date_to', 12, 8, 'תאריך הנחה עד', false, NULL, true, 7),
('asset-data-entry', 'asset_id', 12, 8, 'מזהה נכס', false, NULL, true, 8),
('asset-data-entry', 'measurement_date', 12, 8, 'תאריך מדידה', false, NULL, true, 9),
('asset-data-entry', 'main_asset_type', 12, 8, 'סוג נכס ראשי', false, NULL, true, 10),
('asset-data-entry', 'asset_size', 12, 8, 'גודל נכס', false, NULL, true, 11),
('asset-data-entry', 'sub_asset_type_1', 12, 8, 'סוג נכס משנה 1', false, NULL, true, 12),
('asset-data-entry', 'sub_asset_size_1', 12, 8, 'גודל נכס משנה 1', false, NULL, true, 13),
('asset-data-entry', 'sub_asset_type_2', 12, 8, 'סוג נכס משנה 2', false, NULL, true, 14),
('asset-data-entry', 'sub_asset_size_2', 12, 8, 'גודל נכס משנה 2', false, NULL, true, 15),
('asset-data-entry', 'sub_asset_type_3', 12, 8, 'סוג נכס משנה 3', false, NULL, true, 16),
('asset-data-entry', 'sub_asset_size_3', 12, 8, 'גודל נכס משנה 3', false, NULL, true, 17),
('asset-data-entry', 'sub_asset_type_4', 12, 8, 'סוג נכס משנה 4', false, NULL, true, 18),
('asset-data-entry', 'sub_asset_size_4', 12, 8, 'גודל נכס משנה 4', false, NULL, true, 19),
('asset-data-entry', 'sub_asset_type_5', 12, 8, 'סוג נכס משנה 5', false, NULL, true, 20),
('asset-data-entry', 'sub_asset_size_5', 12, 8, 'גודל נכס משנה 5', false, NULL, true, 21),
('asset-data-entry', 'sub_asset_type_6', 12, 8, 'סוג נכס משנה 6', false, NULL, true, 22),
('asset-data-entry', 'sub_asset_size_6', 12, 8, 'גודל נכס משנה 6', false, NULL, true, 23),
('asset-data-entry', 'extra_field_1', 12, 8, 'שדה נוסף 1', false, NULL, true, 24),
('asset-data-entry', 'extra_field_2', 12, 8, 'שדה נוסף 2', false, NULL, true, 25)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

-- ============================================================================
-- TRANSFER AREAS GRID (transfer-areas)
-- ============================================================================
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order) VALUES
('transfer-areas', 'actions', 8, 8, 'פעולות', true, 'right', true, 0),
('transfer-areas', 'asset_id', 12, 8, 'מזהה נכס', false, NULL, true, 1),
('transfer-areas', 'payer_id', 12, 8, 'מזהה משלם', false, NULL, true, 2),
('transfer-areas', 'main_asset_type', 12, 8, 'סוג נכס ראשי', false, NULL, true, 3),
('transfer-areas', 'asset_size', 12, 8, 'גודל נכס', false, NULL, true, 4),
('transfer-areas', 'sub_asset_type_1', 12, 8, 'סוג נכס משנה 1', false, NULL, true, 5),
('transfer-areas', 'sub_asset_size_1', 12, 8, 'גודל נכס משנה 1', false, NULL, true, 6),
('transfer-areas', 'sub_asset_type_2', 12, 8, 'סוג נכס משנה 2', false, NULL, true, 7),
('transfer-areas', 'sub_asset_size_2', 12, 8, 'גודל נכס משנה 2', false, NULL, true, 8),
('transfer-areas', 'sub_asset_type_3', 12, 8, 'סוג נכס משנה 3', false, NULL, true, 9),
('transfer-areas', 'sub_asset_size_3', 12, 8, 'גודל נכס משנה 3', false, NULL, true, 10),
('transfer-areas', 'sub_asset_type_4', 12, 8, 'סוג נכס משנה 4', false, NULL, true, 11),
('transfer-areas', 'sub_asset_size_4', 12, 8, 'גודל נכס משנה 4', false, NULL, true, 12),
('transfer-areas', 'sub_asset_type_5', 12, 8, 'סוג נכס משנה 5', false, NULL, true, 13),
('transfer-areas', 'sub_asset_size_5', 12, 8, 'גודל נכס משנה 5', false, NULL, true, 14),
('transfer-areas', 'sub_asset_type_6', 12, 8, 'סוג נכס משנה 6', false, NULL, true, 15),
('transfer-areas', 'sub_asset_size_6', 12, 8, 'גודל נכס משנה 6', false, NULL, true, 16),
('transfer-areas', 'extra_field_1', 12, 8, 'שדה נוסף 1', false, NULL, true, 17),
('transfer-areas', 'extra_field_2', 12, 8, 'שדה נוסף 2', false, NULL, true, 18)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

-- ============================================================================
-- ASSETS FILE IMPORT GRID (assets-file-import)
-- ============================================================================
-- Note: This grid shows imported assets, similar to assets-list
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order) VALUES
('assets-file-import', 'actions', 8, 8, 'פעולות', true, 'right', true, 0),
('assets-file-import', 'building_number', 12, 8, 'מזהה מבנה', false, NULL, true, 1),
('assets-file-import', 'asset_id', 12, 8, 'מזהה נכס', false, NULL, true, 2),
('assets-file-import', 'payer_id', 12, 8, 'מזהה משלם', false, NULL, true, 3),
('assets-file-import', 'measurement_date', 12, 8, 'תאריך מדידה', false, NULL, true, 4),
('assets-file-import', 'tax_region', 10, 8, 'אזור מס', false, NULL, true, 5),
('assets-file-import', 'main_asset_type', 12, 8, 'סוג נכס ראשי', false, NULL, true, 6),
('assets-file-import', 'asset_size', 12, 8, 'גודל נכס', false, NULL, true, 7),
('assets-file-import', 'sub_asset_type_1', 12, 8, 'סוג נכס משנה 1', false, NULL, true, 8),
('assets-file-import', 'sub_asset_size_1', 12, 8, 'גודל נכס משנה 1', false, NULL, true, 9),
('assets-file-import', 'sub_asset_type_2', 12, 8, 'סוג נכס משנה 2', false, NULL, true, 10),
('assets-file-import', 'sub_asset_size_2', 12, 8, 'גודל נכס משנה 2', false, NULL, true, 11),
('assets-file-import', 'penthouse', 10, 8, 'דירת גג', false, NULL, true, 12),
('assets-file-import', 'floor', 8, 8, 'קומה', false, NULL, true, 13)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

-- ============================================================================
-- Summary
-- ============================================================================
-- This script has populated field configurations for all grids:
-- 1. buildings-list: 16 fields
-- 2. assets-list: 27 fields
-- 3. asset-details-main: 26 fields
-- 4. asset-details-history: 26 fields
-- 5. asset-types: 18 fields
-- 6. validation-rules: 16 fields
-- 7. address-list: 3 fields
-- 8. asset-data-entry: 26 fields
-- 9. transfer-areas: 19 fields
-- 10. assets-file-import: 14 fields
--
-- Total: 191 field configurations across 10 grids

