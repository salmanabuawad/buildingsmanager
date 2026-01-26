/*
  # Fix reset_export_flags_on_change trigger typo
  
  1. Overview
    - Fix typo in reset_export_flags_on_change trigger function
    - Line comparing "NEW.sub_asset_type_5 IS DISTINCT FROM OLD.sub_asset_size_5" is incorrect
    - Should be comparing type to type and size to size
    
  2. Changes
    - Fix comparison: NEW.sub_asset_type_5 should compare with OLD.sub_asset_type_5
    - This was causing "operator does not exist: text = numeric" error
*/

CREATE OR REPLACE FUNCTION reset_export_flags_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
-- Only reset flags if actual data changed (not just metadata or the export flags themselves)
-- Check if any field other than exported_to_automation, export_to_automation_at, updated_at, or updated_by changed
IF (
NEW.building_number IS DISTINCT FROM OLD.building_number OR
NEW.asset_id IS DISTINCT FROM OLD.asset_id OR
NEW.payer_id IS DISTINCT FROM OLD.payer_id OR
NEW.main_asset_type IS DISTINCT FROM OLD.main_asset_type OR
NEW.asset_size IS DISTINCT FROM OLD.asset_size OR
NEW.measurement_date IS DISTINCT FROM OLD.measurement_date OR
NEW.tax_region IS DISTINCT FROM OLD.tax_region OR
NEW.sub_asset_type_1 IS DISTINCT FROM OLD.sub_asset_type_1 OR
NEW.sub_asset_size_1 IS DISTINCT FROM OLD.sub_asset_size_1 OR
NEW.sub_asset_type_2 IS DISTINCT FROM OLD.sub_asset_type_2 OR
NEW.sub_asset_size_2 IS DISTINCT FROM OLD.sub_asset_size_2 OR
NEW.sub_asset_type_3 IS DISTINCT FROM OLD.sub_asset_type_3 OR
NEW.sub_asset_size_3 IS DISTINCT FROM OLD.sub_asset_size_3 OR
NEW.sub_asset_type_4 IS DISTINCT FROM OLD.sub_asset_type_4 OR
NEW.sub_asset_size_4 IS DISTINCT FROM OLD.sub_asset_size_4 OR
NEW.sub_asset_type_5 IS DISTINCT FROM OLD.sub_asset_type_5 OR
NEW.sub_asset_size_5 IS DISTINCT FROM OLD.sub_asset_size_5 OR
NEW.sub_asset_type_6 IS DISTINCT FROM OLD.sub_asset_type_6 OR
NEW.sub_asset_size_6 IS DISTINCT FROM OLD.sub_asset_size_6 OR
NEW.business_distribution_area IS DISTINCT FROM OLD.business_distribution_area OR
NEW.elevator IS DISTINCT FROM OLD.elevator OR
NEW.single_double_family IS DISTINCT FROM OLD.single_double_family OR
NEW.condo IS DISTINCT FROM OLD.condo OR
NEW.townhouses IS DISTINCT FROM OLD.townhouses OR
NEW.penthouse IS DISTINCT FROM OLD.penthouse OR
NEW.structure_drawing_url IS DISTINCT FROM OLD.structure_drawing_url OR
NEW.floor IS DISTINCT FROM OLD.floor OR
NEW.discount_type IS DISTINCT FROM OLD.discount_type OR
NEW.discount_date_from IS DISTINCT FROM OLD.discount_date_from OR
NEW.discount_date_to IS DISTINCT FROM OLD.discount_date_to OR
NEW.comment IS DISTINCT FROM OLD.comment
) THEN
-- Reset export flags
NEW.exported_to_automation := false;
NEW.export_to_automation_at := NULL;
END IF;

RETURN NEW;
END;
$$;
