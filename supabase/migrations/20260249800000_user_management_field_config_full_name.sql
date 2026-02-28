-- Add user-management grid field configurations including full_name

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('user-management', 'user_name', 12, 2, 'שם משתמש', true, 'right', true, 1),
  ('user-management', 'full_name', 14, 2, 'שם מלא', false, null, true, 2),
  ('user-management', 'user_email', 18, 2, 'אימייל', false, null, true, 3),
  ('user-management', 'user_role', 8, 2, 'תפקיד', false, null, true, 4),
  ('user-management', 'active', 6, 2, 'סטטוס', false, null, true, 5),
  ('user-management', 'created_at', 10, 2, 'תאריך יצירה', false, null, true, 6),
  ('user-management', 'actions', 12, 2, 'פעולות', true, 'right', true, 7)
ON CONFLICT (grid_name, field_name) DO UPDATE SET
  hebrew_name = EXCLUDED.hebrew_name,
  width_chars = EXCLUDED.width_chars,
  padding = EXCLUDED.padding,
  visible = EXCLUDED.visible,
  column_order = EXCLUDED.column_order,
  updated_at = now();
