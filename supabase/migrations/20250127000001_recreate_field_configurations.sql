-- ============================================================================
-- Migration: Recreate Field Configurations with Specific Widths and Paddings
-- ============================================================================
-- This migration recreates the field_configurations table and sets specific
-- widths and paddings for all grids in the application.

-- Drop existing field_configurations table and recreate
DROP TABLE IF EXISTS field_configurations CASCADE;

CREATE TABLE field_configurations (
  grid_name text NOT NULL,
  field_name text NOT NULL,
  width_chars integer NOT NULL DEFAULT 10,
  padding integer NOT NULL DEFAULT 8,
  hebrew_name text,
  pinned boolean DEFAULT false,
  pin_side text,
  visible boolean DEFAULT true,
  column_order integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (grid_name, field_name)
);

CREATE INDEX IF NOT EXISTS idx_field_configurations_grid_name ON field_configurations(grid_name);
CREATE INDEX IF NOT EXISTS idx_field_configurations_field_name ON field_configurations(field_name);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_field_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_field_configurations_updated_at ON field_configurations;
CREATE TRIGGER trigger_update_field_configurations_updated_at
  BEFORE UPDATE ON field_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_field_configurations_updated_at();

ALTER TABLE field_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Field configurations are viewable by everyone" ON field_configurations;
DROP POLICY IF EXISTS "Field configurations can be inserted by anyone" ON field_configurations;
DROP POLICY IF EXISTS "Field configurations can be updated by anyone" ON field_configurations;
DROP POLICY IF EXISTS "Field configurations can be deleted by anyone" ON field_configurations;

CREATE POLICY "Field configurations are viewable by everyone"
  ON field_configurations FOR SELECT
  USING (true);

CREATE POLICY "Field configurations can be inserted by anyone"
  ON field_configurations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Field configurations can be updated by anyone"
  ON field_configurations FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Field configurations can be deleted by anyone"
  ON field_configurations FOR DELETE
  USING (true);

COMMENT ON TABLE field_configurations IS 'Stores field width and padding configurations for all grids in the application';

-- ============================================================================
-- Helper function to insert field configurations for all grids
-- ============================================================================

-- Actions: width 8, padding 2 (for all grids that have actions)
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('assets-list', 'actions', 8, 2, 'פעולות', true, 0),
('buildings-list', 'actions', 8, 2, 'פעולות', true, 0),
('asset-types', 'actions', 8, 2, 'פעולות', true, 0),
('validation-rules', 'actions', 8, 2, 'פעולות', true, 0),
('address-list', 'actions', 8, 2, 'פעולות', true, 0),
('asset-details-main', 'actions', 8, 2, 'פעולות', true, 0),
('asset-details-history', 'actions', 8, 2, 'פעולות', true, 0);

-- ============================================================================
-- ASSETS LIST GRID
-- ============================================================================

-- Checkboxes: width 4, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('assets-list', 'elevator', 4, 2, 'מעלית', true, 1),
('assets-list', 'single_double_family', 4, 2, 'בית פרטי', true, 2),
('assets-list', 'condo', 4, 2, 'בית משותף', true, 3),
('assets-list', 'townhouses', 4, 2, 'צמודי קרקע', true, 4),
('assets-list', 'penthouse', 4, 2, 'נטהאוז', true, 5);

-- Building number, Asset ID, Payer ID: width 10, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('assets-list', 'building_number', 10, 2, 'מזהה מבנה', true, 10),
('assets-list', 'asset_id', 10, 2, 'מזהה נכס', true, 11),
('assets-list', 'payer_id', 10, 2, 'מספר משלם', true, 12);

-- Asset types and subtypes: width 4, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('assets-list', 'main_asset_type', 4, 2, 'סוג נכס ראשי', true, 20),
('assets-list', 'sub_asset_type_1', 4, 2, 'סוג נכס משנה 1', true, 21),
('assets-list', 'sub_asset_type_2', 4, 2, 'סוג נכס משנה 2', true, 22),
('assets-list', 'sub_asset_type_3', 4, 2, 'סוג נכס משנה 3', true, 23),
('assets-list', 'sub_asset_type_4', 4, 2, 'סוג נכס משנה 4', true, 24),
('assets-list', 'sub_asset_type_5', 4, 2, 'סוג נכס משנה 5', true, 25),
('assets-list', 'sub_asset_type_6', 4, 2, 'סוג נכס משנה 6', true, 26);

-- Asset type sizes: width 6, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('assets-list', 'asset_size', 6, 2, 'גודל נכס', true, 30),
('assets-list', 'sub_asset_size_1', 6, 2, 'גודל נכס משנה 1', true, 31),
('assets-list', 'sub_asset_size_2', 6, 2, 'גודל נכס משנה 2', true, 32),
('assets-list', 'sub_asset_size_3', 6, 2, 'גודל נכס משנה 3', true, 33),
('assets-list', 'sub_asset_size_4', 6, 2, 'גודל נכס משנה 4', true, 34),
('assets-list', 'sub_asset_size_5', 6, 2, 'גודל נכס משנה 5', true, 35),
('assets-list', 'sub_asset_size_6', 6, 2, 'גודל נכס משנה 6', true, 36);

-- Dates: width 10, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('assets-list', 'measurement_date', 10, 2, 'תאריך מדידה', true, 40),
('assets-list', 'discount_date_from', 10, 2, 'תאריך הנחה מ', true, 44),
('assets-list', 'discount_date_to', 10, 2, 'תאריך הנחה עד', true, 45);

-- Tax region: width 5, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('assets-list', 'tax_region', 5, 2, 'אזור מס', true, 41);

-- All other fields: width 6, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('assets-list', 'floor', 6, 2, 'קומה', true, 42),
('assets-list', 'discount_type', 6, 2, 'סוג הנחה', true, 43),
('assets-list', 'structure_drawing_url', 6, 2, 'שרטוט מבנה', true, 46);

-- ============================================================================
-- BUILDINGS LIST GRID
-- ============================================================================

-- Checkboxes: width 4, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('buildings-list', 'elevator', 4, 2, 'מעלית', true, 3),
('buildings-list', 'single_double_family', 4, 2, 'בית פרטי', true, 4),
('buildings-list', 'condo', 4, 2, 'בית משותף', true, 5),
('buildings-list', 'townhouses', 4, 2, 'צמודי קרקע', true, 6);

-- Building number: width 10, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('buildings-list', 'building_number', 10, 2, 'מזהה מבנה', true, 1);

-- Tax region: width 5, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('buildings-list', 'tax_region', 5, 2, 'אזור מיסים', true, 2);

-- All other fields: width 6, padding 2
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('buildings-list', 'overload_ratio', 6, 2, 'אחוז העמסה', true, 7),
('buildings-list', 'residence_shared_area', 6, 2, 'שטח משותף מגורים', true, 8),
('buildings-list', 'business_shared_area', 6, 2, 'שטח משותף עסקים', true, 9),
('buildings-list', 'total_building_area', 6, 2, 'ס"כ גודל', true, 10),
('buildings-list', 'area_for_control', 6, 2, 'שטח לבקרה', true, 11),
('buildings-list', 'building_address', 6, 2, 'כתובת', true, 12),
('buildings-list', 'gosh', 6, 2, 'גוש', true, 13),
('buildings-list', 'helka', 6, 2, 'חלקה', true, 14),
('buildings-list', 'building_number_in_street', 6, 2, 'מספר בניין', true, 15);

-- ============================================================================
-- ASSET TYPES GRID
-- ============================================================================

-- All fields: width 6, padding 2 (default for asset-types grid)
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('asset-types', 'id', 6, 2, 'מזהה', true, 1),
('asset-types', 'name', 6, 2, 'שם', true, 2),
('asset-types', 'description', 6, 2, 'תיאור', true, 3),
('asset-types', 'tax_region', 5, 2, 'אזור מס', true, 4),
('asset-types', 'min_size', 6, 2, 'גודל מינימלי', true, 5),
('asset-types', 'max_size', 6, 2, 'גודל מקסימלי', true, 6),
('asset-types', 'elevator', 4, 2, 'מעלית', true, 7),
('asset-types', 'single_double_family', 4, 2, 'בית פרטי', true, 8),
('asset-types', 'condo', 4, 2, 'בית משותף', true, 9),
('asset-types', 'townhouses', 4, 2, 'צמודי קרקע', true, 10),
('asset-types', 'penthouse', 4, 2, 'נטהאוז', true, 11),
('asset-types', 'active', 4, 2, 'פעיל', true, 12);

-- ============================================================================
-- VALIDATION RULES GRID
-- ============================================================================

-- All fields: width 6, padding 2 (default for validation-rules grid)
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('validation-rules', 'rule_key', 6, 2, 'מפתח כלל', true, 1),
('validation-rules', 'entity_type', 6, 2, 'סוג ישות', true, 2),
('validation-rules', 'field_name', 6, 2, 'שם שדה', true, 3),
('validation-rules', 'rule_type', 6, 2, 'סוג כלל', true, 4),
('validation-rules', 'value_numeric', 6, 2, 'ערך מספרי', true, 5),
('validation-rules', 'value_text', 6, 2, 'ערך טקסט', true, 6),
('validation-rules', 'error_message', 6, 2, 'הודעת שגיאה', true, 7),
('validation-rules', 'priority', 6, 2, 'עדיפות', true, 8);

-- ============================================================================
-- ADDRESS LIST GRID
-- ============================================================================

-- All fields: width 6, padding 2 (default for address-list grid)
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('address-list', 'street_code', 6, 2, 'קוד רחוב', true, 1),
('address-list', 'street_description', 6, 2, 'תיאור רחוב', true, 2);

-- ============================================================================
-- ASSET DETAILS MAIN GRID
-- ============================================================================

-- Apply same configurations as assets-list
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('asset-details-main', 'elevator', 4, 2, 'מעלית', true, 1),
('asset-details-main', 'single_double_family', 4, 2, 'בית פרטי', true, 2),
('asset-details-main', 'condo', 4, 2, 'בית משותף', true, 3),
('asset-details-main', 'townhouses', 4, 2, 'צמודי קרקע', true, 4),
('asset-details-main', 'penthouse', 4, 2, 'נטהאוז', true, 5),
('asset-details-main', 'building_number', 10, 2, 'מזהה מבנה', true, 10),
('asset-details-main', 'asset_id', 10, 2, 'מזהה נכס', true, 11),
('asset-details-main', 'payer_id', 10, 2, 'מספר משלם', true, 12),
('asset-details-main', 'main_asset_type', 4, 2, 'סוג נכס ראשי', true, 20),
('asset-details-main', 'sub_asset_type_1', 4, 2, 'סוג נכס משנה 1', true, 21),
('asset-details-main', 'sub_asset_type_2', 4, 2, 'סוג נכס משנה 2', true, 22),
('asset-details-main', 'sub_asset_type_3', 4, 2, 'סוג נכס משנה 3', true, 23),
('asset-details-main', 'sub_asset_type_4', 4, 2, 'סוג נכס משנה 4', true, 24),
('asset-details-main', 'sub_asset_type_5', 4, 2, 'סוג נכס משנה 5', true, 25),
('asset-details-main', 'sub_asset_type_6', 4, 2, 'סוג נכס משנה 6', true, 26),
('asset-details-main', 'asset_size', 6, 2, 'גודל נכס', true, 30),
('asset-details-main', 'sub_asset_size_1', 6, 2, 'גודל נכס משנה 1', true, 31),
('asset-details-main', 'sub_asset_size_2', 6, 2, 'גודל נכס משנה 2', true, 32),
('asset-details-main', 'sub_asset_size_3', 6, 2, 'גודל נכס משנה 3', true, 33),
('asset-details-main', 'sub_asset_size_4', 6, 2, 'גודל נכס משנה 4', true, 34),
('asset-details-main', 'sub_asset_size_5', 6, 2, 'גודל נכס משנה 5', true, 35),
('asset-details-main', 'sub_asset_size_6', 6, 2, 'גודל נכס משנה 6', true, 36),
('asset-details-main', 'measurement_date', 10, 2, 'תאריך מדידה', true, 40),
('asset-details-main', 'discount_date_from', 10, 2, 'תאריך הנחה מ', true, 44),
('asset-details-main', 'discount_date_to', 10, 2, 'תאריך הנחה עד', true, 45),
('asset-details-main', 'tax_region', 5, 2, 'אזור מס', true, 41),
('asset-details-main', 'floor', 6, 2, 'קומה', true, 42),
('asset-details-main', 'discount_type', 6, 2, 'סוג הנחה', true, 43),
('asset-details-main', 'structure_drawing_url', 6, 2, 'שרטוט מבנה', true, 46);

-- ============================================================================
-- ASSET DETAILS HISTORY GRID
-- ============================================================================

-- Apply same configurations as assets-list
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, visible, column_order) VALUES
('asset-details-history', 'elevator', 4, 2, 'מעלית', true, 1),
('asset-details-history', 'single_double_family', 4, 2, 'בית פרטי', true, 2),
('asset-details-history', 'condo', 4, 2, 'בית משותף', true, 3),
('asset-details-history', 'townhouses', 4, 2, 'צמודי קרקע', true, 4),
('asset-details-history', 'penthouse', 4, 2, 'נטהאוז', true, 5),
('asset-details-history', 'building_number', 10, 2, 'מזהה מבנה', true, 10),
('asset-details-history', 'asset_id', 10, 2, 'מזהה נכס', true, 11),
('asset-details-history', 'payer_id', 10, 2, 'מספר משלם', true, 12),
('asset-details-history', 'main_asset_type', 4, 2, 'סוג נכס ראשי', true, 20),
('asset-details-history', 'sub_asset_type_1', 4, 2, 'סוג נכס משנה 1', true, 21),
('asset-details-history', 'sub_asset_type_2', 4, 2, 'סוג נכס משנה 2', true, 22),
('asset-details-history', 'sub_asset_type_3', 4, 2, 'סוג נכס משנה 3', true, 23),
('asset-details-history', 'sub_asset_type_4', 4, 2, 'סוג נכס משנה 4', true, 24),
('asset-details-history', 'sub_asset_type_5', 4, 2, 'סוג נכס משנה 5', true, 25),
('asset-details-history', 'sub_asset_type_6', 4, 2, 'סוג נכס משנה 6', true, 26),
('asset-details-history', 'asset_size', 6, 2, 'גודל נכס', true, 30),
('asset-details-history', 'sub_asset_size_1', 6, 2, 'גודל נכס משנה 1', true, 31),
('asset-details-history', 'sub_asset_size_2', 6, 2, 'גודל נכס משנה 2', true, 32),
('asset-details-history', 'sub_asset_size_3', 6, 2, 'גודל נכס משנה 3', true, 33),
('asset-details-history', 'sub_asset_size_4', 6, 2, 'גודל נכס משנה 4', true, 34),
('asset-details-history', 'sub_asset_size_5', 6, 2, 'גודל נכס משנה 5', true, 35),
('asset-details-history', 'sub_asset_size_6', 6, 2, 'גודל נכס משנה 6', true, 36),
('asset-details-history', 'measurement_date', 10, 2, 'תאריך מדידה', true, 40),
('asset-details-history', 'discount_date_from', 10, 2, 'תאריך הנחה מ', true, 44),
('asset-details-history', 'discount_date_to', 10, 2, 'תאריך הנחה עד', true, 45),
('asset-details-history', 'tax_region', 5, 2, 'אזור מס', true, 41),
('asset-details-history', 'floor', 6, 2, 'קומה', true, 42),
('asset-details-history', 'discount_type', 6, 2, 'סוג הנחה', true, 43),
('asset-details-history', 'structure_drawing_url', 6, 2, 'שרטוט מבנה', true, 46),
('asset-details-history', 'history_created_at', 10, 2, 'תאריך יצירת היסטוריה', true, 50);
