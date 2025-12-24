-- Fix asset-types grid: ensure "name" field is pinned to the right
-- The "name" field should be pinned to match the columnDefs configuration

UPDATE field_configurations
SET pinned = true, pin_side = 'right', updated_at = now()
WHERE grid_name = 'asset-types' AND field_name = 'name';

