-- Add shared_parking_area to field_configurations (apply after DB sync)
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('assets-list', 'shared_parking_area', 6, 2, 'שטח חניה משותף', false, null, true, NULL),
  ('asset-details-main', 'shared_parking_area', 6, 2, 'שטח חניה משותף', false, null, true, NULL),
  ('asset-details-history', 'shared_parking_area', 6, 2, 'שטח חניה משותף', false, null, true, NULL),
  ('assets-file-import', 'shared_parking_area', 6, 2, 'שטח חניה משותף', false, null, true, NULL),
  ('measured-not-exported-assets', 'shared_parking_area', 6, 2, 'שטח חניה משותף', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars,
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    visible = EXCLUDED.visible,
    updated_at = now();
