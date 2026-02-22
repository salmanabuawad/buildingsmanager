-- Fix normalize_asset_boolean_fields: "כן" stays true; never use ::boolean on raw value.
-- ELSE used COALESCE(NEW.xxx::boolean, false), which throws when value is "כן".
-- Now: only cast when jsonb_typeof is 'boolean'; else default false (so "כן" is only handled in IF branch).

CREATE OR REPLACE FUNCTION normalize_asset_boolean_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_val_text TEXT;
  v_j JSONB;
BEGIN
  -- elevator: "כן" -> true
  BEGIN
    v_j := to_jsonb(NEW.elevator);
    v_val_text := TRIM(BOTH '"' FROM (v_j::text));
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.elevator := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.elevator := false;
    ELSIF jsonb_typeof(v_j) = 'boolean' THEN
      NEW.elevator := (v_j::text)::boolean;
    ELSE
      NEW.elevator := false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.elevator := false;
  END;

  BEGIN
    v_j := to_jsonb(NEW.single_double_family);
    v_val_text := TRIM(BOTH '"' FROM (v_j::text));
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.single_double_family := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.single_double_family := false;
    ELSIF jsonb_typeof(v_j) = 'boolean' THEN
      NEW.single_double_family := (v_j::text)::boolean;
    ELSE
      NEW.single_double_family := false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.single_double_family := false;
  END;

  BEGIN
    v_j := to_jsonb(NEW.condo);
    v_val_text := TRIM(BOTH '"' FROM (v_j::text));
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.condo := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.condo := false;
    ELSIF jsonb_typeof(v_j) = 'boolean' THEN
      NEW.condo := (v_j::text)::boolean;
    ELSE
      NEW.condo := false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.condo := false;
  END;

  BEGIN
    v_j := to_jsonb(NEW.townhouses);
    v_val_text := TRIM(BOTH '"' FROM (v_j::text));
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.townhouses := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.townhouses := false;
    ELSIF jsonb_typeof(v_j) = 'boolean' THEN
      NEW.townhouses := (v_j::text)::boolean;
    ELSE
      NEW.townhouses := false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.townhouses := false;
  END;

  BEGIN
    v_j := to_jsonb(NEW.penthouse);
    v_val_text := TRIM(BOTH '"' FROM (v_j::text));
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.penthouse := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.penthouse := false;
    ELSIF jsonb_typeof(v_j) = 'boolean' THEN
      NEW.penthouse := (v_j::text)::boolean;
    ELSE
      NEW.penthouse := false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.penthouse := false;
  END;

  BEGIN
    v_j := to_jsonb(NEW.exported_to_automation);
    v_val_text := TRIM(BOTH '"' FROM (v_j::text));
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.exported_to_automation := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.exported_to_automation := false;
    ELSIF jsonb_typeof(v_j) = 'boolean' THEN
      NEW.exported_to_automation := (v_j::text)::boolean;
    ELSE
      NEW.exported_to_automation := false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.exported_to_automation := false;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION normalize_asset_boolean_fields IS 'Normalizes asset booleans: "כן"/yes/true/1 -> true, "לא"/no/false/0 -> false. No ::boolean on raw string.';
