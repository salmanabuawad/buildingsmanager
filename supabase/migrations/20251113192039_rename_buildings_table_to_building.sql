/*
  # Rename buildings table to building

  1. Purpose
    - Rename the buildings table to building for singular naming convention
    - Update all foreign key references
    - Update all RLS policies
    - Maintain all data integrity and relationships
    
  2. Changes
    - Rename buildings table to building
    - Update foreign key constraints in assets table
    - Update all RLS policies to reference the new table name
    - Update realtime publication
    - Update all triggers and functions
    
  3. Data Safety
    - Uses ALTER TABLE RENAME which preserves all data
    - All indexes, constraints, and triggers are automatically updated by PostgreSQL
*/

-- Rename the buildings table to building
ALTER TABLE buildings RENAME TO building;

-- Update the foreign key constraint name in assets table
-- PostgreSQL automatically updates the foreign key reference when table is renamed
-- But we should rename the constraint for clarity
ALTER TABLE assets DROP CONSTRAINT IF EXISTS apartments_building_number_fkey;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_building_number_fkey;
ALTER TABLE assets 
ADD CONSTRAINT assets_building_number_fkey 
FOREIGN KEY (building_number) REFERENCES building(building_number);

-- Drop old policies
DROP POLICY IF EXISTS "Anyone can view buildings" ON building;
DROP POLICY IF EXISTS "Anyone can insert buildings" ON building;
DROP POLICY IF EXISTS "Anyone can update buildings" ON building;
DROP POLICY IF EXISTS "Anyone can delete buildings" ON building;

-- Recreate RLS policies with updated names
CREATE POLICY "Anyone can view building"
  ON building FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert building"
  ON building FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update building"
  ON building FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete building"
  ON building FOR DELETE
  TO public
  USING (true);

-- Update realtime publication
-- First check if the publication exists and drop/recreate
DO $$
BEGIN
  -- Remove buildings from publication if it exists
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'buildings'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE buildings;
  END IF;
  
  -- Add building to publication if not already there
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'building'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE building;
  END IF;
END $$;

-- Update the trigger function that updates building totals
-- The function already references the table dynamically, but let's verify it works
-- Drop and recreate to ensure it works with the new table name
DROP TRIGGER IF EXISTS update_building_totals_trigger ON assets;

CREATE OR REPLACE FUNCTION update_building_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Update totals for the affected building(s)
  UPDATE building
  SET 
    total_assets = (
      SELECT COUNT(*) 
      FROM assets 
      WHERE building_number = COALESCE(NEW.building_number, OLD.building_number)
    ),
    total_building_area = (
      SELECT COALESCE(SUM(total_area), 0)
      FROM assets 
      WHERE building_number = COALESCE(NEW.building_number, OLD.building_number)
    )
  WHERE building_number = COALESCE(NEW.building_number, OLD.building_number);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER update_building_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_building_totals();
