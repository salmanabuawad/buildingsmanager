/*
  # Drop and recreate asset_types table with new structure and data

  1. Changes
    - Drop existing asset_types table
    - Create new asset_types table with updated columns based on CSV
    - Import all data from the new CSV file with composite key
  
  2. New Table Structure
    - id as primary key (serial)
    - name (asset type code)
    - description
    - tax_region, shared_area_yn, has_elevator, condition fields, min/max size

  3. Security
    - Enable RLS on asset_types table
    - Allow public read access for all users
    - Allow authenticated users to manage asset types
*/

-- Drop existing asset_types table
DROP TABLE IF EXISTS asset_types CASCADE;

-- Create new asset_types table with columns matching the CSV
CREATE TABLE asset_types (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  tax_region integer,
  shared_area_yn text,
  has_elevator text,
  condition_elevator integer,
  condition_shared_area integer,
  condition_size integer,
  min_size numeric,
  max_size numeric,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on name for faster lookups
CREATE INDEX idx_asset_types_name ON asset_types(name);

-- Enable RLS
ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to asset_types"
  ON asset_types
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow authenticated users to manage asset types
CREATE POLICY "Allow authenticated users to insert asset_types"
  ON asset_types
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update asset_types"
  ON asset_types
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete asset_types"
  ON asset_types
  FOR DELETE
  TO authenticated
  USING (true);

-- Insert all asset types from the new CSV
INSERT INTO asset_types (name, description, tax_region, shared_area_yn, has_elevator, condition_elevator, condition_shared_area, condition_size, min_size, max_size) VALUES
('199', 'חדר עזר בנוסף', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('202', 'מחסן נפרד 1 עד אחד', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('203', 'מחסן נפרד 1 עד שניים', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('210', 'מחסן צמוד עד בנין ללא מעלית', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('211', 'מחסן צמוד 1', 10, NULL, 'א', NULL, 1, NULL, NULL, NULL),
('211', 'מחסן צמוד 1', 10, NULL, 'א', 1, NULL, NULL, 100, 9999),
('212', 'מחסן צמוד 1', 10, 1, 'א', NULL, NULL, 1, 110, 9999),
('212', 'מחסן צמוד 1', 10, NULL, 'א', NULL, NULL, 1, NULL, NULL),
('212', 'מחסן צמוד 1', 10, NULL, 'א', 1, NULL, NULL, 1, 100),
('213', 'מחסן צמוד 1', 10, 1, 'א', NULL, NULL, 1, 81, 110),
('213', 'מחסן צמוד 1', 10, NULL, 'א', NULL, NULL, 1, 111, 9999),
('214', 'מחסן צמוד 1', 10, 1, 'א', NULL, NULL, 1, 1, 80),
('214', 'מחסן צמוד 1', 10, NULL, 'א', NULL, NULL, 1, 1, 110),
('216', 'חניה צמוד לבית', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('221', 'מחסן צמוד 2', 20, NULL, 'א', NULL, 1, NULL, NULL, NULL),
('221', 'מחסן צמוד 2', 20, NULL, 'א', 1, NULL, NULL, 100, 9999),
('222', 'מחסן צמוד 2', 20, 1, 'א', NULL, NULL, 1, 110, 9999),
('222', 'מחסן צמוד 2', 20, NULL, 'א', NULL, NULL, 1, NULL, NULL),
('222', 'מחסן צמוד 2', 20, NULL, 'א', 1, NULL, NULL, 1, 100),
('223', 'מחסן צמוד 2', 20, 1, 'א', NULL, NULL, 1, 81, 110),
('223', 'מחסן צמוד 2', 20, NULL, 'א', NULL, NULL, 1, 111, 9999),
('224', 'מחסן צמוד 2', 20, 1, 'א', NULL, NULL, 1, 1, 80),
('224', 'מחסן צמוד 2', 20, NULL, 'א', NULL, NULL, 1, 1, 110),
('226', 'חניה צמוד לבית', 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('231', 'מחסן צמוד 3', 30, NULL, 'א', NULL, 1, NULL, NULL, NULL),
('231', 'מחסן צמוד 3', 30, NULL, 'א', 1, NULL, NULL, 100, 9999),
('232', 'מחסן צמוד 3', 30, 1, 'א', NULL, NULL, 1, 110, 9999),
('232', 'מחסן צמוד 3', 30, NULL, 'א', NULL, NULL, 1, NULL, NULL),
('232', 'מחסן צמוד 3', 30, NULL, 'א', 1, NULL, NULL, 1, 100),
('233', 'מחסן צמוד 3', 30, 1, 'א', NULL, NULL, 1, 81, 110),
('233', 'מחסן צמוד 3', 30, NULL, 'א', NULL, NULL, 1, 111, 9999),
('234', 'מחסן צמוד 3', 30, 1, 'א', NULL, NULL, 1, 1, 80),
('234', 'מחסן צמוד 3', 30, NULL, 'א', NULL, NULL, 1, 1, 110),
('236', 'חניה צמוד לבית', 30, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('241', 'מחסן צמוד 32', 32, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('242', 'מחסן צמוד 32', 32, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('243', 'מחסן צמוד 32', 32, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('244', 'מחסן צמוד 32', 32, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('245', 'מחסן צמוד 32', 32, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('250', 'שטח משולם צמוד 1', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('251', 'מחסן צמוד 1', 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('252', 'שטח משולם צמוד 2', 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('253', 'מחסן צמוד 2', 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('254', 'שטח משולם צמוד 3', 30, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('255', 'מחסן צמוד 3', 30, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('299', 'חדר דירתי בנוסף', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('300', 'דיו שטח דירתי', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('301', 'דירה למע 15,000 מ"ר', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('302', 'דירה בבינוי המטרופוליטני', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('310', 'מעליות משותף בניין עד אחד', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('311', 'מעליות משותף בניין צמוד 1', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('312', 'מעליות משותף בניין צמוד 1', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('313', 'חניות בניין צמוד 1', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('315', 'שטח כללי לבית', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('316', 'אח קומה במ"ר עולה 330 למעלה', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('317', 'אח קומה במ"ר עולה 330 אמצע', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('318', 'אח קומה במ"ר עולה 330 מתחת', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('321', 'מעליות משותף בניין צמוד 2', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('322', 'מעליות משותף בניין צמוד 2', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('323', 'חניות בניין צמוד 2', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('325', 'חניות בנייה', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('390', 'חניות בניין מרובות תקנות', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('397', 'חניות בנייה בניין מרובות', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('398', 'דיו שטח לכל 400 מטר מצורף', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('399', 'חניות מרובות לא כללי ללא מעלית', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('400', 'חניות בניין', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('401', 'חניות קומתי', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('402', 'דירת בנייה גדל לבית', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('403', 'חניות בניין גדל לבית', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('404', 'חניות קומת גדל לבית', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('405', 'דירת בנייה גדל אזור', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('406', 'מעליות בנייה גדל אזור', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('407', 'חניות בנייה גדל אזור', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('408', 'מערכות גדל אזור', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('409', 'מפעילות גדל אזור', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('410', 'מעליות בנייה גדל אזור', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('411', 'חניות גדל - בית אזור', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('412', 'דירת בנייה גדל מחוז', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('413', 'דירת בנייה בנייה גדולות', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('414', 'חניות בניין אחר', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('415', 'דיו בנייה באור,תרבותי אזור1', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('416', 'דיו בנייה באור,תרבותי אזור2', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('417', 'חניות קומת ,בית כדו לבש', 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
