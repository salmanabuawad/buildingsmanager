-- Update field configurations for asset-types grid: increase each field width by 2 chars
-- This migration updates all field widths in the asset-types grid by adding 2 to the current width_chars value

UPDATE field_configurations
SET width_chars = width_chars + 2, updated_at = now()
WHERE grid_name = 'asset-types';

