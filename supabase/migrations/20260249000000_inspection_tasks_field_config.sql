-- Add field configurations for the inspection tasks list grid (משימות ביקורת)

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('inspection-tasks', 'id', 8, 2, 'מזהה', false, null, true, 0),
  ('inspection-tasks', 'title', 20, 2, 'כותרת', false, null, true, 1),
  ('inspection-tasks', 'building_number', 8, 2, 'מבנה', false, null, true, 2),
  ('inspection-tasks', 'status', 12, 2, 'סטטוס', false, null, true, 3),
  ('inspection-tasks', 'created_at', 12, 2, 'נוצר', false, null, true, 4)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars,
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    visible = EXCLUDED.visible,
    updated_at = now();
