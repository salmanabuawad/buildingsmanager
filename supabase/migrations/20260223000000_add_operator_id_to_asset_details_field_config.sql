-- Add operator_id to field_configurations for asset-details-main and asset-details-history

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('asset-details-main', 'operator_id', 8, 2, 'מפעיל', false, null, true, NULL),
  ('asset-details-history', 'operator_id', 8, 2, 'מפעיל', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars,
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    visible = EXCLUDED.visible,
    updated_at = now();
