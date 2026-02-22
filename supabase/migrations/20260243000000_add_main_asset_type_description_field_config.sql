-- Add "מהות שימוש" (main_asset_type description) to assets-list field_configurations.
-- Column is derived from asset_types.description for main_asset_type (no DB column on assets).
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('assets-list', 'main_asset_type_description', 20, 2, 'מהות שימוש', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();
