-- Add building_notes and address fields to field_configurations table for buildings-list grid

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES 
  ('buildings-list', 'building_notes', 30, 2, 'הערות', false, null, true, NULL),
  ('buildings-list', 'address', 30, 2, 'כתובת (dropdown)', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars, 
    padding = EXCLUDED.padding, 
    hebrew_name = EXCLUDED.hebrew_name,
    visible = EXCLUDED.visible,
    updated_at = now();

COMMENT ON TABLE field_configurations IS 'Stores field width and padding configurations for all grids in the application. building_notes and address added for buildings-list grid.';
