-- extract_boolean_from_jsonb: treat JSON string "כן" as true (strip quotes before comparing).
-- (p_value)::text for a jsonb string is '"כן"', so (p_value)::text = 'כן' was false and "כן" was never converted.

CREATE OR REPLACE FUNCTION extract_boolean_from_jsonb(p_value JSONB, p_default BOOLEAN DEFAULT false)
RETURNS BOOLEAN AS $$
DECLARE
  v_text TEXT;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    RETURN p_default;
  END IF;

  IF jsonb_typeof(p_value) = 'boolean' THEN
    RETURN (p_value)::text::boolean;
  END IF;

  IF jsonb_typeof(p_value) = 'string' THEN
    v_text := TRIM(BOTH '"' FROM (p_value)::text);
    RETURN CASE
      WHEN v_text = 'כן' OR LOWER(v_text) IN ('yes', 'true', '1', 't') THEN true
      WHEN v_text = 'לא' OR LOWER(v_text) IN ('no', 'false', '0', 'f', '') THEN false
      ELSE p_default
    END;
  END IF;

  RETURN p_default;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION extract_boolean_from_jsonb IS 'JSONB to boolean; treats "כן"/yes/true/1 as true, "לא"/no/false/0 as false (strips JSON quotes).';
