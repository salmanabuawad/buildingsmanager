-- Add all field_configurations for inspection tasks manager grid (ניהול משימות ביקורת)
-- Shows all task fields: id, title, building_number, asset_ids, assigned_to_name, status, priority,
-- created_at, created_by_name, updated_at, taken_at, submitted_at, approved_at, approved_by_name, note, actions

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('inspection-tasks-manager', 'id', 8, 2, 'מזהה', true, 'right', true, 1),
  ('inspection-tasks-manager', 'title', 14, 2, 'כותרת', false, null, true, 2),
  ('inspection-tasks-manager', 'building_number', 10, 2, 'בניין', false, null, true, 3),
  ('inspection-tasks-manager', 'asset_ids', 16, 2, 'נכסים', false, null, true, 4),
  ('inspection-tasks-manager', 'assigned_to_name', 12, 2, 'פקח', false, null, true, 5),
  ('inspection-tasks-manager', 'status', 14, 2, 'סטטוס', false, null, true, 6),
  ('inspection-tasks-manager', 'priority', 10, 2, 'עדיפות', false, null, true, 7),
  ('inspection-tasks-manager', 'created_at', 12, 2, 'נוצר', false, null, true, 8),
  ('inspection-tasks-manager', 'created_by_name', 12, 2, 'נוצר ע"י', false, null, true, 9),
  ('inspection-tasks-manager', 'updated_at', 12, 2, 'עודכן', false, null, true, 10),
  ('inspection-tasks-manager', 'taken_at', 12, 2, 'נלקח', false, null, true, 11),
  ('inspection-tasks-manager', 'submitted_at', 12, 2, 'הוגש', false, null, true, 12),
  ('inspection-tasks-manager', 'approved_at', 12, 2, 'אושר', false, null, true, 13),
  ('inspection-tasks-manager', 'approved_by_name', 12, 2, 'אושר ע"י', false, null, true, 14),
  ('inspection-tasks-manager', 'note', 20, 2, 'הערה', false, null, true, 15),
  ('inspection-tasks-manager', 'actions', 20, 2, 'פעולות', true, 'right', true, 16)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars,
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    pinned = EXCLUDED.pinned,
    pin_side = EXCLUDED.pin_side,
    visible = EXCLUDED.visible,
    column_order = EXCLUDED.column_order,
    updated_at = now();
