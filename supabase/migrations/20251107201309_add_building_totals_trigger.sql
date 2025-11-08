/*
  # Add Trigger to Update Building Totals

  1. New Functions
    - `update_building_totals()` - PostgreSQL function that recalculates building totals
      when apartments are inserted, updated, or deleted
  
  2. New Triggers
    - Automatically updates building area totals and unit count when:
      - An apartment is inserted
      - An apartment is updated
      - An apartment is deleted
  
  3. How it Works
    - Sums all apartment areas (apartment_area, storage_area, pergola_area, balcony_area)
    - Counts total units per building
    - Updates the buildings table with aggregated values
*/

-- Function to update building totals
CREATE OR REPLACE FUNCTION update_building_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Get the building_id to update
  DECLARE
    target_building_id uuid;
  BEGIN
    -- Determine which building to update based on the operation
    IF (TG_OP = 'DELETE') THEN
      target_building_id := OLD.building_id;
    ELSE
      target_building_id := NEW.building_id;
    END IF;

    -- Update the building totals
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

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_building_totals ON apartments;

-- Create trigger for INSERT, UPDATE, DELETE operations on apartments
CREATE TRIGGER trigger_update_building_totals
AFTER INSERT OR UPDATE OR DELETE ON apartments
FOR EACH ROW
EXECUTE FUNCTION update_building_totals();
