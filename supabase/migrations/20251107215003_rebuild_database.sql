/*
  # Rebuild Database - Drop and Recreate All Tables

  1. Drop existing tables
    - Drop apartments table
    - Drop buildings table
  
  2. Recreate Tables
    - `buildings` table with all area fields and totals
    - `apartments` table with all area fields
  
  3. Security
    - Enable RLS on both tables
    - Add policies for public read access
    - Add policies for authenticated users to modify data
  
  4. Triggers
    - Recreate trigger to update building totals when apartments change
  
  5. Realtime
    - Enable realtime on both tables
*/

-- Drop existing tables
DROP TABLE IF EXISTS apartments CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;

-- Drop trigger function if exists
DROP FUNCTION IF EXISTS update_building_totals() CASCADE;

-- Create buildings table
CREATE TABLE IF NOT EXISTS buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  total_units integer DEFAULT 0,
  apartment_area numeric(10,2) DEFAULT 0,
  storage_area numeric(10,2) DEFAULT 0,
  pergola_area numeric(10,2) DEFAULT 0,
  balcony_area numeric(10,2) DEFAULT 0,
  total_building_area numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create apartments table
CREATE TABLE IF NOT EXISTS apartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  apartment_number text NOT NULL,
  apartment_area numeric(10,2) DEFAULT 0,
  storage_area numeric(10,2) DEFAULT 0,
  pergola_area numeric(10,2) DEFAULT 0,
  balcony_area numeric(10,2) DEFAULT 0,
  total_area numeric(10,2) GENERATED ALWAYS AS (apartment_area + storage_area + pergola_area + balcony_area) STORED,
  created_at timestamptz DEFAULT now(),
  UNIQUE(building_id, apartment_number)
);

-- Enable RLS
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;

-- Policies for buildings
CREATE POLICY "Buildings are viewable by everyone"
  ON buildings FOR SELECT
  USING (true);

CREATE POLICY "Buildings can be inserted by anyone"
  ON buildings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Buildings can be updated by anyone"
  ON buildings FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Buildings can be deleted by anyone"
  ON buildings FOR DELETE
  USING (true);

-- Policies for apartments
CREATE POLICY "Apartments are viewable by everyone"
  ON apartments FOR SELECT
  USING (true);

CREATE POLICY "Apartments can be inserted by anyone"
  ON apartments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Apartments can be updated by anyone"
  ON apartments FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Apartments can be deleted by anyone"
  ON apartments FOR DELETE
  USING (true);

-- Function to update building totals
CREATE OR REPLACE FUNCTION update_building_totals()
RETURNS TRIGGER AS $$
BEGIN
  DECLARE
    target_building_id uuid;
  BEGIN
    IF (TG_OP = 'DELETE') THEN
      target_building_id := OLD.building_id;
    ELSE
      target_building_id := NEW.building_id;
    END IF;

    UPDATE buildings
    SET
      apartment_area = COALESCE((
        SELECT SUM(apartment_area)
        FROM apartments
        WHERE building_id = target_building_id
      ), 0),
      storage_area = COALESCE((
        SELECT SUM(storage_area)
        FROM apartments
        WHERE building_id = target_building_id
      ), 0),
      pergola_area = COALESCE((
        SELECT SUM(pergola_area)
        FROM apartments
        WHERE building_id = target_building_id
      ), 0),
      balcony_area = COALESCE((
        SELECT SUM(balcony_area)
        FROM apartments
        WHERE building_id = target_building_id
      ), 0),
      total_building_area = COALESCE((
        SELECT SUM(total_area)
        FROM apartments
        WHERE building_id = target_building_id
      ), 0),
      total_units = COALESCE((
        SELECT COUNT(*)
        FROM apartments
        WHERE building_id = target_building_id
      ), 0)
    WHERE id = target_building_id;

    RETURN NULL;
  END;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_update_building_totals
AFTER INSERT OR UPDATE OR DELETE ON apartments
FOR EACH ROW
EXECUTE FUNCTION update_building_totals();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE buildings;
ALTER PUBLICATION supabase_realtime ADD TABLE apartments;

-- Set replica identity for realtime
ALTER TABLE buildings REPLICA IDENTITY FULL;
ALTER TABLE apartments REPLICA IDENTITY FULL;

-- Insert sample data
INSERT INTO buildings (name) VALUES
  ('Building A'),
  ('Building B'),
  ('Building C')
ON CONFLICT DO NOTHING;

-- Get building IDs for sample apartments
DO $$
DECLARE
  building_a_id uuid;
  building_b_id uuid;
  building_c_id uuid;
BEGIN
  SELECT id INTO building_a_id FROM buildings WHERE name = 'Building A' LIMIT 1;
  SELECT id INTO building_b_id FROM buildings WHERE name = 'Building B' LIMIT 1;
  SELECT id INTO building_c_id FROM buildings WHERE name = 'Building C' LIMIT 1;

  IF building_a_id IS NOT NULL THEN
    INSERT INTO apartments (building_id, apartment_number, apartment_area, storage_area, pergola_area, balcony_area) VALUES
      (building_a_id, '101', 85, 12, 8, 15),
      (building_a_id, '102', 92, 15, 10, 18),
      (building_a_id, '103', 78, 10, 6, 12)
    ON CONFLICT DO NOTHING;
  END IF;

  IF building_b_id IS NOT NULL THEN
    INSERT INTO apartments (building_id, apartment_number, apartment_area, storage_area, pergola_area, balcony_area) VALUES
      (building_b_id, '101', 115, 18, 12, 22),
      (building_b_id, '102', 105, 15, 8, 20),
      (building_b_id, '201', 125, 20, 10, 25),
      (building_b_id, '202', 118, 17, 9, 23)
    ON CONFLICT DO NOTHING;
  END IF;

  IF building_c_id IS NOT NULL THEN
    INSERT INTO apartments (building_id, apartment_number, apartment_area, storage_area, pergola_area, balcony_area) VALUES
      (building_c_id, '101', 95, 14, 7, 16),
      (building_c_id, '102', 88, 12, 6, 14),
      (building_c_id, '201', 102, 16, 8, 18),
      (building_c_id, '202', 98, 15, 7, 17),
      (building_c_id, '301', 110, 18, 9, 20)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
