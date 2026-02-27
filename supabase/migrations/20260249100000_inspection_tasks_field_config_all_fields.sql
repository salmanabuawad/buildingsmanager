-- Add remaining inspection task list grid columns to field_configurations

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('inspection-tasks', 'asset_ids', 10, 2, 'נכסים', false, null, true, 5),
  ('inspection-tasks', 'assigned_to', 14, 2, 'מוקצה אל', false, null, true, 6),
  ('inspection-tasks', 'note', 18, 2, 'הערה', false, null, true, 7),
  ('inspection-tasks', 'created_by', 10, 2, 'נוצר על ידי', false, null, true, 8),
  ('inspection-tasks', 'updated_at', 12, 2, 'עודכן', false, null, true, 9),
  ('inspection-tasks', 'taken_at', 12, 2, 'התחיל', false, null, true, 10),
  ('inspection-tasks', 'submitted_at', 12, 2, 'נשלח לאישור', false, null, true, 11),
  ('inspection-tasks', 'approved_at', 12, 2, 'אושר', false, null, true, 12),
  ('inspection-tasks', 'approved_by', 10, 2, 'אושר על ידי', false, null, true, 13)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars,
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    visible = EXCLUDED.visible,
    column_order = EXCLUDED.column_order,
    updated_at = now();
