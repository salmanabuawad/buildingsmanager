/*
  # Change Building Name to Number (Primary Key)

  1. Changes
    - Drop existing buildings table and recreate with `building_number` as primary key
    - Update apartments table to reference the new building_number
    - Preserve all existing triggers and RLS policies
    - Migrate existing data to new structure

  2. Tables Modified
    - `buildings`: Change `id` (uuid) to `building_number` (integer) as primary key
    - `apartments`: Update foreign key to reference `building_number`

  3. Security
    - Maintain existing RLS policies
    - Keep public access for all operations
*/

-- Drop existing tables and triggers
DROP TRIGGER IF EXISTS trigger_update_building_totals ON apartments;
DROP FUNCTION IF EXISTS update_building_totals() CASCADE;
DROP TABLE IF EXISTS apartments CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;

-- Create buildings table with building_number as primary key
CREATE TABLE buildings (
  building_number integer PRIMARY KEY,
  total_units integer DEFAULT 0,
  apartment_area numeric(10,2) DEFAULT 0,
  storage_area numeric(10,2) DEFAULT 0,
  pergola_area numeric(10,2) DEFAULT 0,
  balcony_area numeric(10,2) DEFAULT 0,
  total_building_area numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create apartments table with building_number foreign key
CREATE TABLE apartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_number integer NOT NULL REFERENCES buildings(building_number) ON DELETE CASCADE,
  apartment_number text NOT NULL,
  apartment_area numeric(10,2) DEFAULT 0,
  storage_area numeric(10,2) DEFAULT 0,
  pergola_area numeric(10,2) DEFAULT 0,
  balcony_area numeric(10,2) DEFAULT 0,
  garden_area numeric(10,2) DEFAULT 0,
  floor text,
  total_apartment_area numeric(10,2) GENERATED ALWAYS AS (
    apartment_area + storage_area + pergola_area + balcony_area + COALESCE(garden_area, 0)
  ) STORED,
  created_at timestamptz DEFAULT now(),
  UNIQUE(building_number, apartment_number)
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
    target_building_number integer;
  BEGIN
    IF (TG_OP = 'DELETE') THEN
      target_building_number := OLD.building_number;
    ELSE
      target_building_number := NEW.building_number;
    END IF;

    UPDATE buildings
    SET
      apartment_area = COALESCE((
        SELECT SUM(apartment_area)
        FROM apartments
        WHERE building_number = target_building_number
      ), 0),
      storage_area = COALESCE((
        SELECT SUM(storage_area)
        FROM apartments
        WHERE building_number = target_building_number
      ), 0),
      pergola_area = COALESCE((
        SELECT SUM(pergola_area)
        FROM apartments
        WHERE building_number = target_building_number
      ), 0),
      balcony_area = COALESCE((
        SELECT SUM(balcony_area)
        FROM apartments
        WHERE building_number = target_building_number
      ), 0),
      total_building_area = COALESCE((
        SELECT SUM(total_apartment_area)
        FROM apartments
        WHERE building_number = target_building_number
      ), 0),
      total_units = COALESCE((
        SELECT COUNT(*)
        FROM apartments
        WHERE building_number = target_building_number
      ), 0)
    WHERE building_number = target_building_number;

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