/*
  # Add business_total_area to asset grids in field_configurations

  Adds "סה"כ שטח עסקים" (business_total_area) to:
  - assets-list
  - asset-details-main (asset details business grid)
  - asset-details-history (asset details history grid)
*/

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('assets-list', 'business_total_area', 6, 2, 'סה"כ שטח עסקים', false, null, true, NULL),
  ('asset-details-main', 'business_total_area', 6, 2, 'סה"כ שטח עסקים', false, null, true, NULL),
  ('asset-details-history', 'business_total_area', 6, 2, 'סה"כ שטח עסקים', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  hebrew_name = EXCLUDED.hebrew_name,
  visible = EXCLUDED.visible,
  updated_at = now();
