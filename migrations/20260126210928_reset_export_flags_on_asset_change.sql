/*
  # Reset export flags when asset data changes

  1. Overview
    - When asset data is modified, reset export flags to indicate need for re-export
    
  2. Changes
    - Create trigger function to reset exported_to_automation to false
    - Set export_to_automation_at to null when data changes
    - Trigger fires on UPDATE of assets table
    - Only resets if actual data fields changed (not metadata like updated_at)
*/

-- Create function to reset export flags when asset data changes
CREATE OR REPLACE FUNCTION reset_export_flags_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only reset flags if actual data changed (not just metadata or the export flags themselves)
  -- Check if any field other than exported_to_automation, export_to_automation_at, updated_at, or updated_by changed
  IF (
    NEW.building_id IS DISTINCT FROM OLD.building_id OR
    NEW.asset_number IS DISTINCT FROM OLD.asset_number OR
    NEW.asset_name IS DISTINCT FROM OLD.asset_name OR
    NEW.asset_type_id IS DISTINCT FROM OLD.asset_type_id OR
    NEW.asset_size IS DISTINCT FROM OLD.asset_size OR
    NEW.balcony_area IS DISTINCT FROM OLD.balcony_area OR
    NEW.shared_area IS DISTINCT FROM OLD.shared_area OR
    NEW.area_from_distribution IS DISTINCT FROM OLD.area_from_distribution OR
    NEW.business_total_area IS DISTINCT FROM OLD.business_total_area OR
    NEW.measurement_date IS DISTINCT FROM OLD.measurement_date OR
    NEW.measured IS DISTINCT FROM OLD.measured OR
    NEW.include_in_shared_area_distribution IS DISTINCT FROM OLD.include_in_shared_area_distribution OR
    NEW.use_area_from_distribution IS DISTINCT FROM OLD.use_area_from_distribution OR
    NEW.tax_region IS DISTINCT FROM OLD.tax_region OR
    NEW.comment IS DISTINCT FROM OLD.comment OR
    NEW.data_from_automation IS DISTINCT FROM OLD.data_from_automation OR
    NEW.floor IS DISTINCT FROM OLD.floor OR
    NEW.room_count IS DISTINCT FROM OLD.room_count OR
    NEW.active IS DISTINCT FROM OLD.active
  ) THEN
    -- Reset export flags
    NEW.exported_to_automation := false;
    NEW.export_to_automation_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_reset_export_flags_on_change ON assets;

-- Create trigger on assets table
CREATE TRIGGER trigger_reset_export_flags_on_change
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION reset_export_flags_on_change();
