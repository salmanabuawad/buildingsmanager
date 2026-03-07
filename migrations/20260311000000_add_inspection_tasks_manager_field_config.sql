-- Add field_configurations for inspection tasks manager grid (ניהול משימות ביקורת)
-- Grid: inspection-tasks-manager. Columns: id, building_number, assigned_to_name, status, created_at, actions

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('inspection-tasks-manager', 'id', 8, 2, 'מזהה', true, 'right', true, 1),
  ('inspection-tasks-manager', 'building_number', 12, 2, 'בניין', false, null, true, 2),
  ('inspection-tasks-manager', 'assigned_to_name', 14, 2, 'פקח', false, null, true, 3),
  ('inspection-tasks-manager', 'status', 14, 2, 'סטטוס', false, null, true, 4),
  ('inspection-tasks-manager', 'created_at', 12, 2, 'נוצר', false, null, true, 5),
  ('inspection-tasks-manager', 'actions', 20, 2, 'פעולות', true, 'right', true, 6)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars,
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    pinned = EXCLUDED.pinned,
    pin_side = EXCLUDED.pin_side,
    visible = EXCLUDED.visible,
    column_order = EXCLUDED.column_order,
    updated_at = now();
