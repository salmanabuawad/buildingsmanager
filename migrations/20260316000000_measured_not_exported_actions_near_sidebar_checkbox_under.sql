-- Move actions near sidebar (right), put checkbox under (to the left of actions)
-- Column order: 0 = actions (near sidebar), 1 = exportSelect (checkbox under)

UPDATE field_configurations
SET column_order = 0, pinned = true, pin_side = 'right', updated_at = now()
WHERE grid_name = 'measured-not-exported-assets' AND field_name = 'actions';

UPDATE field_configurations
SET column_order = 1, pinned = false, pin_side = null, updated_at = now()
WHERE grid_name = 'measured-not-exported-assets' AND field_name = 'exportSelect';
