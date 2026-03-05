-- Simplify normalize_asset_boolean_fields: delegate to extract_boolean_from_jsonb (single place for "כן"/"לא" logic).

CREATE OR REPLACE FUNCTION normalize_asset_boolean_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.elevator := extract_boolean_from_jsonb(to_jsonb(NEW.elevator), false);
  NEW.single_double_family := extract_boolean_from_jsonb(to_jsonb(NEW.single_double_family), false);
  NEW.condo := extract_boolean_from_jsonb(to_jsonb(NEW.condo), false);
  NEW.townhouses := extract_boolean_from_jsonb(to_jsonb(NEW.townhouses), false);
  NEW.penthouse := extract_boolean_from_jsonb(to_jsonb(NEW.penthouse), false);
  NEW.exported_to_automation := extract_boolean_from_jsonb(to_jsonb(NEW.exported_to_automation), false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION normalize_asset_boolean_fields IS 'Normalizes asset booleans via extract_boolean_from_jsonb (כן/לא/yes/no/true/false).';
