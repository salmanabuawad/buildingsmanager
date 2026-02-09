/*
  # Add Field Configurations for Tax Regions Mailing List Grid
  
  This migration adds default field configurations for the tax-regions-mailing-list grid
  with proper Hebrew headers and column settings.
*/

-- Tax Regions Mailing List grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('tax-regions-mailing-list', 'tax_region', 15, 2, 'אזור מס', false, null, true, 1),
  ('tax-regions-mailing-list', 'email', 25, 2, 'אימייל', false, null, true, 2),
  ('tax-regions-mailing-list', 'actions', 10, 2, 'פעולות', true, 'right', true, 3)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET 
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  pinned = EXCLUDED.pinned,
  pin_side = EXCLUDED.pin_side,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();

COMMENT ON TABLE field_configurations IS 'Field width, padding, and display configurations for grid columns';
