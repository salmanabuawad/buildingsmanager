/*
  # Fix trigger and make apartment numbers unique system-wide

  1. Changes
    - Fix the update_building_totals() trigger to use correct column name (total_apartment_area instead of total_area)
    - Update existing apartment numbers to include building prefix (e.g., "A-101", "B-101")
    - Add unique constraint to apartment_number column
  
  2. Migration Strategy
    - First fix the trigger
    - Then update apartment numbers with building prefix
    - Finally add unique constraint
  
  3. Notes
    - Existing data will be transformed: "101" in "Building A" becomes "A-101"
    - Future inserts must follow this unique numbering scheme
*/

-- Fix the trigger function to use correct column name
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
        SELECT SUM(total_apartment_area)
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

-- Update apartment numbers to include building prefix
UPDATE apartments a
SET apartment_number = CONCAT(
  UPPER(SUBSTRING(b.name FROM 10 FOR 1)),
  '-',
  a.apartment_number
)
FROM buildings b
WHERE a.building_id = b.id
AND a.apartment_number NOT LIKE '%-%';

-- Add unique constraint to apartment_number
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'apartments_apartment_number_key'
  ) THEN
    ALTER TABLE apartments 
    ADD CONSTRAINT apartments_apartment_number_key 
    UNIQUE (apartment_number);
  END IF;
END $$;
