/*
  # Remove Tax Region Validation from Asset Trigger
  
  1. Changes
    - Removes tax region validation checks from validate_asset_before_insert trigger
    - Tax region validation is now handled only by frontend code
    - Keeps other validations (elevator, size, etc.)
  
  2. Security
    - No RLS changes
*/

CREATE OR REPLACE FUNCTION public.validate_asset_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
v_building_tax_region TEXT;
v_building_has_elevator BOOLEAN;
v_asset_type_record RECORD;
v_error_message TEXT;
BEGIN
-- Validation 1: Asset ID must be numeric and positive
IF NEW.asset_id IS NULL THEN
RAISE EXCEPTION 'VALIDATION_ERROR: מזהה נכס הוא שדה חובה (Asset ID is required)';
END IF;

IF NEW.asset_id <= 0 THEN
RAISE EXCEPTION 'VALIDATION_ERROR: מזהה נכס חייב להיות מספר חיובי (Asset ID must be positive)';
END IF;

-- Validation 2: Building number must be numeric and positive
IF NEW.building_number IS NULL THEN
RAISE EXCEPTION 'VALIDATION_ERROR: מספר בניין הוא שדה חובה (Building number is required)';
END IF;

IF NEW.building_number <= 0 THEN
RAISE EXCEPTION 'VALIDATION_ERROR: מספר בניין חייב להיות מספר חיובי (Building number must be positive)';
END IF;

-- Validation 3: Measurement date is required
IF NEW.measurement_date IS NULL OR NEW.measurement_date = '' THEN
RAISE EXCEPTION 'VALIDATION_ERROR: תאריך מדידה הוא שדה חובה (Measurement date is required)';
END IF;

-- Validation 4: Building must exist and get its properties
SELECT tax_region, has_elevator 
INTO v_building_tax_region, v_building_has_elevator
FROM buildings 
WHERE building_number = NEW.building_number;

IF NOT FOUND THEN
RAISE EXCEPTION 'VALIDATION_ERROR: בניין מספר % לא קיים במערכת (Building number % does not exist)', NEW.building_number, NEW.building_number;
END IF;

-- Validation 5: Main asset type validation
IF NEW.main_asset_type IS NULL OR NEW.main_asset_type = '' THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג נכס ראשי הוא שדה חובה (Main asset type is required)';
END IF;

-- Get asset type record for elevator and size validation (tax region validation removed - handled by frontend)
SELECT * INTO v_asset_type_record
FROM asset_types
WHERE code::TEXT = NEW.main_asset_type
LIMIT 1;

-- Note: Tax region validation is now handled by frontend only
-- If asset type not found, we still need it for elevator/size validation, so check exists
IF NOT FOUND THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג הנכס % לא קיים במערכת (Asset type % does not exist)', 
NEW.main_asset_type, NEW.main_asset_type;
END IF;

-- Validation 6: Elevator requirement must match (if specified in asset type)
IF v_asset_type_record.has_elevator IS NOT NULL THEN
IF v_asset_type_record.has_elevator != v_building_has_elevator THEN
IF v_building_has_elevator THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג הנכס % מיועד לבניינים ללא מעלית, אך הבניין כולל מעלית (Asset type % is for buildings without elevator, but building has elevator)', 
NEW.main_asset_type, NEW.main_asset_type;
ELSE
RAISE EXCEPTION 'VALIDATION_ERROR: סוג הנכס % מיועד לבניינים עם מעלית, אך הבניין ללא מעלית (Asset type % is for buildings with elevator, but building has no elevator)', 
NEW.main_asset_type, NEW.main_asset_type;
END IF;
END IF;
END IF;

-- Validation 7: Asset size must be positive
IF NEW.asset_size IS NULL THEN
RAISE EXCEPTION 'VALIDATION_ERROR: גודל נכס הוא שדה חובה (Asset size is required)';
END IF;

IF NEW.asset_size <= 0 THEN
RAISE EXCEPTION 'VALIDATION_ERROR: גודל נכס חייב להיות מספר חיובי (Asset size must be positive)';
END IF;

-- Validation 8: Asset size must be within min/max range (if specified)
IF v_asset_type_record.min_asset_size IS NOT NULL AND NEW.asset_size < v_asset_type_record.min_asset_size THEN
RAISE EXCEPTION 'VALIDATION_ERROR: גודל הנכס %.2f קטן מהמינימום %.2f עבור סוג % (Asset size %.2f is below minimum %.2f for type %)', 
NEW.asset_size, v_asset_type_record.min_asset_size, NEW.main_asset_type,
NEW.asset_size, v_asset_type_record.min_asset_size, NEW.main_asset_type;
END IF;

IF v_asset_type_record.max_asset_size IS NOT NULL AND NEW.asset_size > v_asset_type_record.max_asset_size THEN
RAISE EXCEPTION 'VALIDATION_ERROR: גודל הנכס %.2f עולה על המקסימום %.2f עבור סוג % (Asset size %.2f exceeds maximum %.2f for type %)', 
NEW.asset_size, v_asset_type_record.max_asset_size, NEW.main_asset_type,
NEW.asset_size, v_asset_type_record.max_asset_size, NEW.main_asset_type;
END IF;

-- Validation 9: Validate sub-asset type 1
IF NEW.sub_asset_type_1 IS NOT NULL AND NEW.sub_asset_type_1 != '' THEN
IF NEW.sub_asset_type_1 IN ('199', '299') THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 1 לא יכול להיות סוג מורכב (199, 299) (Sub asset type 1 cannot be composite type)';
END IF;

-- Tax region validation removed - handled by frontend
-- Just check that asset type exists
IF NOT EXISTS (
SELECT 1 FROM asset_types 
WHERE code::TEXT = NEW.sub_asset_type_1
) THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 1 (%) לא קיים במערכת (Sub asset type 1 (%) does not exist)', 
NEW.sub_asset_type_1, NEW.sub_asset_type_1;
END IF;

IF NEW.sub_asset_size_1 IS NOT NULL AND NEW.sub_asset_size_1 <= 0 THEN
RAISE EXCEPTION 'VALIDATION_ERROR: גודל נכס משנה 1 חייב להיות מספר חיובי (Sub asset size 1 must be positive)';
END IF;
END IF;

-- Validation 10: Validate sub-asset type 2
IF NEW.sub_asset_type_2 IS NOT NULL AND NEW.sub_asset_type_2 != '' THEN
IF NEW.sub_asset_type_2 IN ('199', '299') THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 2 לא יכול להיות סוג מורכב (199, 299) (Sub asset type 2 cannot be composite type)';
END IF;

-- Tax region validation removed - handled by frontend
IF NOT EXISTS (
SELECT 1 FROM asset_types 
WHERE code::TEXT = NEW.sub_asset_type_2
) THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 2 (%) לא קיים במערכת (Sub asset type 2 (%) does not exist)', 
NEW.sub_asset_type_2, NEW.sub_asset_type_2;
END IF;

IF NEW.sub_asset_size_2 IS NOT NULL AND NEW.sub_asset_size_2 <= 0 THEN
RAISE EXCEPTION 'VALIDATION_ERROR: גודל נכס משנה 2 חייב להיות מספר חיובי (Sub asset size 2 must be positive)';
END IF;
END IF;

-- Validation 11: Validate sub-asset type 3
IF NEW.sub_asset_type_3 IS NOT NULL AND NEW.sub_asset_type_3 != '' THEN
IF NEW.sub_asset_type_3 IN ('199', '299') THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 3 לא יכול להיות סוג מורכב (199, 299) (Sub asset type 3 cannot be composite type)';
END IF;

-- Tax region validation removed - handled by frontend
IF NOT EXISTS (
SELECT 1 FROM asset_types 
WHERE code::TEXT = NEW.sub_asset_type_3
) THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 3 (%) לא קיים במערכת (Sub asset type 3 (%) does not exist)', 
NEW.sub_asset_type_3, NEW.sub_asset_type_3;
END IF;

IF NEW.sub_asset_size_3 IS NOT NULL AND NEW.sub_asset_size_3 <= 0 THEN
RAISE EXCEPTION 'VALIDATION_ERROR: גודל נכס משנה 3 חייב להיות מספר חיובי (Sub asset size 3 must be positive)';
END IF;
END IF;

-- Validation 12: Validate sub-asset type 4
IF NEW.sub_asset_type_4 IS NOT NULL AND NEW.sub_asset_type_4 != '' THEN
IF NEW.sub_asset_type_4 IN ('199', '299') THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 4 לא יכול להיות סוג מורכב (199, 299) (Sub asset type 4 cannot be composite type)';
END IF;

-- Tax region validation removed - handled by frontend
IF NOT EXISTS (
SELECT 1 FROM asset_types 
WHERE code::TEXT = NEW.sub_asset_type_4
) THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 4 (%) לא קיים במערכת (Sub asset type 4 (%) does not exist)', 
NEW.sub_asset_type_4, NEW.sub_asset_type_4;
END IF;

IF NEW.sub_asset_size_4 IS NOT NULL AND NEW.sub_asset_size_4 <= 0 THEN
RAISE EXCEPTION 'VALIDATION_ERROR: גודל נכס משנה 4 חייב להיות מספר חיובי (Sub asset size 4 must be positive)';
END IF;
END IF;

-- Validation 13: Validate sub-asset type 5
IF NEW.sub_asset_type_5 IS NOT NULL AND NEW.sub_asset_type_5 != '' THEN
IF NEW.sub_asset_type_5 IN ('199', '299') THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 5 לא יכול להיות סוג מורכב (199, 299) (Sub asset type 5 cannot be composite type)';
END IF;

-- Tax region validation removed - handled by frontend
IF NOT EXISTS (
SELECT 1 FROM asset_types 
WHERE code::TEXT = NEW.sub_asset_type_5
) THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 5 (%) לא קיים במערכת (Sub asset type 5 (%) does not exist)', 
NEW.sub_asset_type_5, NEW.sub_asset_type_5;
END IF;

IF NEW.sub_asset_size_5 IS NOT NULL AND NEW.sub_asset_size_5 <= 0 THEN
RAISE EXCEPTION 'VALIDATION_ERROR: גודל נכס משנה 5 חייב להיות מספר חיובי (Sub asset size 5 must be positive)';
END IF;
END IF;

-- Validation 14: Validate sub-asset type 6
IF NEW.sub_asset_type_6 IS NOT NULL AND NEW.sub_asset_type_6 != '' THEN
IF NEW.sub_asset_type_6 IN ('199', '299') THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 6 לא יכול להיות סוג מורכב (199, 299) (Sub asset type 6 cannot be composite type)';
END IF;

-- Tax region validation removed - handled by frontend
IF NOT EXISTS (
SELECT 1 FROM asset_types 
WHERE code::TEXT = NEW.sub_asset_type_6
) THEN
RAISE EXCEPTION 'VALIDATION_ERROR: סוג משנה 6 (%) לא קיים במערכת (Sub asset type 6 (%) does not exist)', 
NEW.sub_asset_type_6, NEW.sub_asset_type_6;
END IF;

IF NEW.sub_asset_size_6 IS NOT NULL AND NEW.sub_asset_size_6 <= 0 THEN
RAISE EXCEPTION 'VALIDATION_ERROR: גודל נכס משנה 6 חייב להיות מספר חיובי (Sub asset size 6 must be positive)';
END IF;
END IF;

-- All validations passed
RETURN NEW;
END;
$function$;

