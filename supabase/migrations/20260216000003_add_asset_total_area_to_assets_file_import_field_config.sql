-- Add asset_total_area (סה"כ שטח נכס) to field_configurations for import/data-entry grids
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('assets-file-import', 'asset_total_area', 6, 2, 'סה"כ שטח נכס', false, null, true, NULL),
  ('asset-data-entry', 'asset_total_area', 6, 2, 'סה"כ שטח נכס', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();
