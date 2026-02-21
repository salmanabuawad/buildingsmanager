-- When asset operator_id or shared_parking_area (parking) changes, reset need-to-send-to-automation flag.
-- Adds operator_id and shared_parking_area to the list of columns that trigger exported_to_automation := false.

CREATE OR REPLACE FUNCTION reset_export_flags_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
-- Only reset flags if actual data changed (not just metadata or the export flags themselves)
IF (
NEW.building_number IS DISTINCT FROM OLD.building_number OR
NEW.asset_id IS DISTINCT FROM OLD.asset_id OR
NEW.payer_id IS DISTINCT FROM OLD.payer_id OR
NEW.main_asset_type IS DISTINCT FROM OLD.main_asset_type OR
NEW.asset_size IS DISTINCT FROM OLD.asset_size OR
NEW.measurement_date IS DISTINCT FROM OLD.measurement_date OR
NEW.tax_region IS DISTINCT FROM OLD.tax_region OR
NEW.operator_id IS DISTINCT FROM OLD.operator_id OR
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
NEW.shared_parking_area IS DISTINCT FROM OLD.shared_parking_area OR
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
NEW.exported_to_automation := false;
NEW.export_to_automation_at := NULL;
END IF;

RETURN NEW;
END;
$$;

COMMENT ON FUNCTION reset_export_flags_on_change() IS 'Resets exported_to_automation when asset data that affects export changes (including operator_id and shared_parking_area).';
