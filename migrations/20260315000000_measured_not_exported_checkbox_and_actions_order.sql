-- Put checkbox (exportSelect) first and actions (פעולות) second in measured-not-exported-assets grid
-- Column order: 0 = first (checkbox), 1 = second (actions), others keep NULL/Infinity

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('measured-not-exported-assets', 'exportSelect', 6, 2, '', false, null, true, 0)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET column_order = 0, updated_at = now();

UPDATE field_configurations
SET column_order = 1, updated_at = now()
WHERE grid_name = 'measured-not-exported-assets' AND field_name = 'actions';
