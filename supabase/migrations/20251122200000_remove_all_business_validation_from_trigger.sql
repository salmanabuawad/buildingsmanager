/*
  # Remove All Business Validation from Asset Trigger
  
  1. Changes
    - Remove all business validation logic from validate_asset_before_insert trigger
    - Keep only basic data integrity checks (required fields, foreign keys)
    - All business validation (tax region, area, penthouse, elevator, etc.) is now handled by frontend validation handler
    - Business rules should be in validation.ts, not in database triggers
  
  2. What Remains (Data Integrity Only)
    - Required field checks (asset_id, building_number, measurement_date)
    - Building existence check (foreign key integrity)
    - Asset type existence check (foreign key integrity)
    - Basic numeric validation (positive numbers)
  
  3. What is Removed (Business Logic)
    - Tax region validation
    - Elevator requirement matching
    - Asset size min/max range validation
    - Penthouse validation
    - Building boolean field validation (single_double_family, condo, townhouses, etc.)
    - Sub-asset type composite type restrictions
    - All business rules that depend on asset_types table conditions
  
  4. Security
    - No RLS changes
    - Database still enforces data integrity
*/

CREATE OR REPLACE FUNCTION public.validate_asset_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Data Integrity Check 1: Asset ID must be numeric and positive
  IF NEW.asset_id IS NULL THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: מזהה נכס הוא שדה חובה (Asset ID is required)';
  END IF;

  IF NEW.asset_id <= 0 THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: מזהה נכס חייב להיות מספר חיובי (Asset ID must be positive)';
  END IF;

  -- Data Integrity Check 2: Building number must be numeric and positive
  IF NEW.building_number IS NULL THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: מספר בניין הוא שדה חובה (Building number is required)';
  END IF;

  IF NEW.building_number <= 0 THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: מספר בניין חייב להיות מספר חיובי (Building number must be positive)';
  END IF;

  -- Data Integrity Check 3: Measurement date is required
  IF NEW.measurement_date IS NULL OR NEW.measurement_date = '' THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: תאריך מדידה הוא שדה חובה (Measurement date is required)';
  END IF;

  -- Data Integrity Check 4: Building must exist (foreign key integrity)
  IF NOT EXISTS (SELECT 1 FROM buildings WHERE building_number = NEW.building_number) THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: בניין מספר % לא קיים במערכת (Building number % does not exist)', NEW.building_number, NEW.building_number;
  END IF;

  -- Data Integrity Check 5: Main asset type must exist (foreign key integrity)
  IF NEW.main_asset_type IS NOT NULL AND NEW.main_asset_type != '' THEN
    IF NOT EXISTS (SELECT 1 FROM asset_types WHERE name = NEW.main_asset_type) THEN
      RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: סוג הנכס % לא קיים במערכת (Asset type % does not exist)', NEW.main_asset_type, NEW.main_asset_type;
    END IF;
  END IF;

  -- Data Integrity Check 6: Asset size must be positive if provided
  IF NEW.asset_size IS NOT NULL AND NEW.asset_size <= 0 THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: גודל נכס חייב להיות מספר חיובי (Asset size must be positive)';
  END IF;

  -- Data Integrity Check 7: Sub-asset types must exist if provided (foreign key integrity)
  IF NEW.sub_asset_type_1 IS NOT NULL AND NEW.sub_asset_type_1 != '' THEN
    IF NOT EXISTS (SELECT 1 FROM asset_types WHERE name = NEW.sub_asset_type_1) THEN
      RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: סוג משנה 1 (%) לא קיים במערכת (Sub asset type 1 (%) does not exist)', NEW.sub_asset_type_1, NEW.sub_asset_type_1;
    END IF;
  END IF;

  IF NEW.sub_asset_type_2 IS NOT NULL AND NEW.sub_asset_type_2 != '' THEN
    IF NOT EXISTS (SELECT 1 FROM asset_types WHERE name = NEW.sub_asset_type_2) THEN
      RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: סוג משנה 2 (%) לא קיים במערכת (Sub asset type 2 (%) does not exist)', NEW.sub_asset_type_2, NEW.sub_asset_type_2;
    END IF;
  END IF;

  IF NEW.sub_asset_type_3 IS NOT NULL AND NEW.sub_asset_type_3 != '' THEN
    IF NOT EXISTS (SELECT 1 FROM asset_types WHERE name = NEW.sub_asset_type_3) THEN
      RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: סוג משנה 3 (%) לא קיים במערכת (Sub asset type 3 (%) does not exist)', NEW.sub_asset_type_3, NEW.sub_asset_type_3;
    END IF;
  END IF;

  IF NEW.sub_asset_type_4 IS NOT NULL AND NEW.sub_asset_type_4 != '' THEN
    IF NOT EXISTS (SELECT 1 FROM asset_types WHERE name = NEW.sub_asset_type_4) THEN
      RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: סוג משנה 4 (%) לא קיים במערכת (Sub asset type 4 (%) does not exist)', NEW.sub_asset_type_4, NEW.sub_asset_type_4;
    END IF;
  END IF;

  IF NEW.sub_asset_type_5 IS NOT NULL AND NEW.sub_asset_type_5 != '' THEN
    IF NOT EXISTS (SELECT 1 FROM asset_types WHERE name = NEW.sub_asset_type_5) THEN
      RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: סוג משנה 5 (%) לא קיים במערכת (Sub asset type 5 (%) does not exist)', NEW.sub_asset_type_5, NEW.sub_asset_type_5;
    END IF;
  END IF;

  IF NEW.sub_asset_type_6 IS NOT NULL AND NEW.sub_asset_type_6 != '' THEN
    IF NOT EXISTS (SELECT 1 FROM asset_types WHERE name = NEW.sub_asset_type_6) THEN
      RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: סוג משנה 6 (%) לא קיים במערכת (Sub asset type 6 (%) does not exist)', NEW.sub_asset_type_6, NEW.sub_asset_type_6;
    END IF;
  END IF;

  -- Data Integrity Check 8: Sub-asset sizes must be positive if provided
  IF NEW.sub_asset_size_1 IS NOT NULL AND NEW.sub_asset_size_1 <= 0 THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: גודל נכס משנה 1 חייב להיות מספר חיובי (Sub asset size 1 must be positive)';
  END IF;

  IF NEW.sub_asset_size_2 IS NOT NULL AND NEW.sub_asset_size_2 <= 0 THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: גודל נכס משנה 2 חייב להיות מספר חיובי (Sub asset size 2 must be positive)';
  END IF;

  IF NEW.sub_asset_size_3 IS NOT NULL AND NEW.sub_asset_size_3 <= 0 THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: גודל נכס משנה 3 חייב להיות מספר חיובי (Sub asset size 3 must be positive)';
  END IF;

  IF NEW.sub_asset_size_4 IS NOT NULL AND NEW.sub_asset_size_4 <= 0 THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: גודל נכס משנה 4 חייב להיות מספר חיובי (Sub asset size 4 must be positive)';
  END IF;

  IF NEW.sub_asset_size_5 IS NOT NULL AND NEW.sub_asset_size_5 <= 0 THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: גודל נכס משנה 5 חייב להיות מספר חיובי (Sub asset size 5 must be positive)';
  END IF;

  IF NEW.sub_asset_size_6 IS NOT NULL AND NEW.sub_asset_size_6 <= 0 THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_ERROR: גודל נכס משנה 6 חייב להיות מספר חיובי (Sub asset size 6 must be positive)';
  END IF;

  -- All data integrity checks passed
  -- Business validation (tax region, area, penthouse, elevator, etc.) is handled by frontend validation handler
  RETURN NEW;
END;
$function$;

-- Ensure trigger exists (create if not exists, replace if exists)
DROP TRIGGER IF EXISTS trigger_validate_asset_before_insert ON assets;
CREATE TRIGGER trigger_validate_asset_before_insert
  BEFORE INSERT ON assets
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_asset_before_insert();

