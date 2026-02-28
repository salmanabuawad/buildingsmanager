-- Add priority column to inspection-tasks field_configurations (for grid column order/visibility)

INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES ('inspection-tasks', 'priority', 10, 2, 'עדיפות', false, null, true, 4)
ON CONFLICT (grid_name, field_name) DO UPDATE
SET width_chars = EXCLUDED.width_chars,
    padding = EXCLUDED.padding,
    hebrew_name = EXCLUDED.hebrew_name,
    visible = EXCLUDED.visible,
    column_order = EXCLUDED.column_order,
    updated_at = now();
