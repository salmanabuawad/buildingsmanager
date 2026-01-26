/*
  Migration: Normalize boolean fields trigger
  
  This migration creates a trigger that ensures all boolean fields in the assets table
  are always stored as actual BOOLEAN values (true/false), never as strings like "כן" or "לא".
  
  This trigger runs BEFORE INSERT OR UPDATE and converts any string representations
  of booleans to actual boolean values, preventing "invalid input syntax for type boolean" errors.
  
  Note: This is a safety net - the frontend should already be converting "כן" to true,
  but this ensures database-level protection.
*/

-- Function to normalize boolean fields before insert/update
-- Uses jsonb to safely extract values as text, then converts them to boolean
CREATE OR REPLACE FUNCTION normalize_asset_boolean_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_val_text TEXT;
BEGIN
  -- Helper function to convert a value to boolean
  -- Returns true if value is "כן", "yes", "true", "1", etc.
  -- Returns false otherwise
  
  -- Convert elevator field
  BEGIN
    v_val_text := (to_jsonb(NEW.elevator)::text);
    -- Remove quotes if present
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.elevator := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.elevator := false;
    ELSE
      -- Try direct boolean cast
      NEW.elevator := COALESCE(NEW.elevator::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If anything fails, default to false
    NEW.elevator := false;
  END;

  -- Convert single_double_family field
  BEGIN
    v_val_text := (to_jsonb(NEW.single_double_family)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.single_double_family := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.single_double_family := false;
    ELSE
      NEW.single_double_family := COALESCE(NEW.single_double_family::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.single_double_family := false;
  END;

  -- Convert condo field
  BEGIN
    v_val_text := (to_jsonb(NEW.condo)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.condo := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.condo := false;
    ELSE
      NEW.condo := COALESCE(NEW.condo::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.condo := false;
  END;

  -- Convert townhouses field
  BEGIN
    v_val_text := (to_jsonb(NEW.townhouses)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.townhouses := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.townhouses := false;
    ELSE
      NEW.townhouses := COALESCE(NEW.townhouses::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.townhouses := false;
  END;

  -- Convert penthouse field
  BEGIN
    v_val_text := (to_jsonb(NEW.penthouse)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.penthouse := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.penthouse := false;
    ELSE
      NEW.penthouse := COALESCE(NEW.penthouse::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.penthouse := false;
  END;

  -- Convert exported_to_automation field
  BEGIN
    v_val_text := (to_jsonb(NEW.exported_to_automation)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.exported_to_automation := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.exported_to_automation := false;
    ELSE
      NEW.exported_to_automation := COALESCE(NEW.exported_to_automation::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.exported_to_automation := false;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_normalize_asset_boolean_fields ON assets;

-- Create trigger that runs BEFORE INSERT OR UPDATE
CREATE TRIGGER trigger_normalize_asset_boolean_fields
  BEFORE INSERT OR UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION normalize_asset_boolean_fields();

COMMENT ON FUNCTION normalize_asset_boolean_fields IS 'Normalizes boolean fields in assets table, converting Hebrew strings ("כן"/"לא") and other string representations to actual boolean values (true/false). This prevents "invalid input syntax for type boolean" errors.';
COMMENT ON TRIGGER trigger_normalize_asset_boolean_fields ON assets IS 'Ensures all boolean fields are stored as BOOLEAN type, never as TEXT. Converts "כן" to true and "לא" to false before insert/update.';
