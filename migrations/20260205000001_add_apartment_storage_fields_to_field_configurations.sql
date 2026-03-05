/*
  # Add apartment/storage fields to field_configurations
  
  Adds field configurations for the new apartment/storage fields across all relevant grids
*/

-- Insert field configurations for assets-list grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('assets-list', 'apartment_number', 6, 2, 'מספר דירה', false, null, true, NULL),
  ('assets-list', 'storage_number', 6, 2, 'מספר מחסן', false, null, true, NULL),
  ('assets-list', 'apartment_floor', 6, 2, 'קומת דירה', false, null, true, NULL),
  ('assets-list', 'storage_floor', 6, 2, 'קומת מחסן', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO NOTHING;

-- Insert field configurations for asset-data-entry grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('asset-data-entry', 'apartment_number', 6, 2, 'מספר דירה', false, null, true, NULL),
  ('asset-data-entry', 'storage_number', 6, 2, 'מספר מחסן', false, null, true, NULL),
  ('asset-data-entry', 'apartment_floor', 6, 2, 'קומת דירה', false, null, true, NULL),
  ('asset-data-entry', 'storage_floor', 6, 2, 'קומת מחסן', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO NOTHING;

-- Insert field configurations for assets-file-import grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('assets-file-import', 'apartment_number', 6, 2, 'מספר דירה', false, null, true, NULL),
  ('assets-file-import', 'storage_number', 6, 2, 'מספר מחסן', false, null, true, NULL),
  ('assets-file-import', 'apartment_floor', 6, 2, 'קומת דירה', false, null, true, NULL),
  ('assets-file-import', 'storage_floor', 6, 2, 'קומת מחסן', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO NOTHING;

-- Insert field configurations for asset-details-main grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('asset-details-main', 'apartment_number', 6, 2, 'מספר דירה', false, null, true, NULL),
  ('asset-details-main', 'storage_number', 6, 2, 'מספר מחסן', false, null, true, NULL),
  ('asset-details-main', 'apartment_floor', 6, 2, 'קומת דירה', false, null, true, NULL),
  ('asset-details-main', 'storage_floor', 6, 2, 'קומת מחסן', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO NOTHING;

-- Insert field configurations for asset-details-history grid
INSERT INTO field_configurations (grid_name, field_name, width_chars, padding, hebrew_name, pinned, pin_side, visible, column_order)
VALUES
  ('asset-details-history', 'apartment_number', 6, 2, 'מספר דירה', false, null, true, NULL),
  ('asset-details-history', 'storage_number', 6, 2, 'מספר מחסן', false, null, true, NULL),
  ('asset-details-history', 'apartment_floor', 6, 2, 'קומת דירה', false, null, true, NULL),
  ('asset-details-history', 'storage_floor', 6, 2, 'קומת מחסן', false, null, true, NULL)
ON CONFLICT (grid_name, field_name) DO NOTHING;

-- Remove floor field configurations
DELETE FROM field_configurations WHERE field_name = 'floor';
