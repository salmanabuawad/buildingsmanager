-- Add number_of_parking_units to field_configurations for asset grids (assets have this column since 20260232000000;
-- shared_parking_area was added to field_config in 20260225000003; number_of_parking_units was missing).
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('assets-list', 'number_of_parking_units', 8, 2, 'מספר יחידות חניה', false, null, true, NULL),
  ('asset-details-main', 'number_of_parking_units', 8, 2, 'מספר יחידות חניה', false, null, true, NULL),
  ('asset-details-history', 'number_of_parking_units', 8, 2, 'מספר יחידות חניה', false, null, true, NULL),
  ('assets-file-import', 'number_of_parking_units', 8, 2, 'מספר יחידות חניה', false, null, true, NULL),
  ('measured-not-exported-assets', 'number_of_parking_units', 8, 2, 'מספר יחידות חניה', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();
