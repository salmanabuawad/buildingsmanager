-- Add parking fields to field_configurations table for buildings-list grid

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('buildings-list', 'parking_area', 6, 2, 'שטח חניה', false, null, true, NULL),
  ('buildings-list', 'shared_parking_area', 6, 2, 'שטח חניה משותף', false, null, true, NULL),
  ('buildings-list', 'number_of_parking_units', 6, 2, 'מספר יחידות חניה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars,
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    visible = EXCLUDED.visible,
    updated_at = now();

COMMENT ON TABLE field_configurations IS 'Field width, padding, and display configurations for grid columns. parking_area, shared_parking_area, number_of_parking_units added for buildings-list.';
