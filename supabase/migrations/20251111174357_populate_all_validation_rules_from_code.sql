/*
  # Populate All Validation Rules from Code

  1. Purpose
    - Migrate all hardcoded validation rules from validation.ts to the database
    - Enable complete rule management through UI without code changes
    
  2. Rule Categories
    - Asset Type validation rules (name, description, tax region)
    - Asset validation rules (ID, building number, payer ID, sizes)
    - Building validation rules (number, tax region)
    - Measurement validation rules (date, areas)
    
  3. Notes
    - All rules are enabled by default
    - Error messages match current validation.ts behavior
    - Includes both basic and advanced validation types
*/

-- Delete any existing rules that we're about to recreate (to avoid conflicts)
DELETE FROM validation_rules WHERE rule_key IN (
  'asset_type_name_required',
  'asset_type_name_length',
  'asset_type_name_pattern',
  'asset_type_tax_region_numeric',
  'asset_id_required',
  'asset_building_number_required',
  'asset_building_number_numeric',
  'asset_size_numeric',
  'asset_size_positive',
  'building_number_numeric',
  'building_number_positive',
  'building_tax_region_numeric',
  'measurement_date_required',
  'measurement_area_numeric',
  'measurement_area_positive'
);

-- Asset Type Validation Rules
INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('asset_type_name_required', 'required', 'name', 'asset_type', NULL, NULL, 'Type name is required', 'Asset type name must be provided', true),
  ('asset_type_name_length', 'exact_length', 'name', 'asset_type', 3, NULL, 'Type name must be exactly 3 characters', 'Asset type name must be exactly 3 digits', true),
  ('asset_type_name_pattern', 'pattern', 'name', 'asset_type', NULL, '^\d{3}$', 'Type name must contain only digits', 'Asset type name must be 3 digits (0-9)', true),
  ('asset_type_tax_region_numeric', 'numeric', 'tax_region', 'asset_type', NULL, NULL, 'Tax region must be a number', 'Tax region must be a valid number', true);

-- Asset Validation Rules
INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('asset_id_required', 'required', 'asset_id', 'asset', NULL, NULL, 'Asset ID is required', 'Asset ID must be provided', true),
  ('asset_id_not_empty', 'min_length', 'asset_id', 'asset', 1, NULL, 'Asset ID cannot be empty', 'Asset ID must have at least 1 character', true),
  
  ('asset_building_number_required', 'required', 'building_number', 'asset', NULL, NULL, 'Building number is required', 'Building number must be provided', true),
  ('asset_building_number_numeric', 'numeric', 'building_number', 'asset', NULL, NULL, 'Building number must be a number', 'Building number must be a valid number', true),
  
  ('asset_payer_id_required', 'required', 'payer_id', 'asset', NULL, NULL, 'Payer ID is required', 'Payer ID must be provided', true),
  ('asset_payer_id_not_empty', 'min_length', 'payer_id', 'asset', 1, NULL, 'Payer ID cannot be empty', 'Payer ID must have at least 1 character', true),
  
  ('asset_main_size_numeric', 'numeric', 'main_asset_size', 'asset', NULL, NULL, 'Main asset size must be a number', 'Main asset size must be a valid number', true),
  ('asset_main_size_positive', 'positive_number', 'main_asset_size', 'asset', NULL, NULL, 'Main asset size must be positive', 'Main asset size must be greater than 0', true),
  
  ('asset_sub_size_1_numeric', 'numeric', 'sub_asset_size_1', 'asset', NULL, NULL, 'Sub asset size 1 must be a number', 'Sub asset size 1 must be a valid number', true),
  ('asset_sub_size_1_positive', 'positive_number', 'sub_asset_size_1', 'asset', NULL, NULL, 'Sub asset size 1 must be positive', 'Sub asset size 1 must be greater than 0', true),
  
  ('asset_sub_size_2_numeric', 'numeric', 'sub_asset_size_2', 'asset', NULL, NULL, 'Sub asset size 2 must be a number', 'Sub asset size 2 must be a valid number', true),
  ('asset_sub_size_2_positive', 'positive_number', 'sub_asset_size_2', 'asset', NULL, NULL, 'Sub asset size 2 must be positive', 'Sub asset size 2 must be greater than 0', true),
  
  ('asset_sub_size_3_numeric', 'numeric', 'sub_asset_size_3', 'asset', NULL, NULL, 'Sub asset size 3 must be a number', 'Sub asset size 3 must be a valid number', true),
  ('asset_sub_size_3_positive', 'positive_number', 'sub_asset_size_3', 'asset', NULL, NULL, 'Sub asset size 3 must be positive', 'Sub asset size 3 must be greater than 0', true),
  
  ('asset_sub_size_4_numeric', 'numeric', 'sub_asset_size_4', 'asset', NULL, NULL, 'Sub asset size 4 must be a number', 'Sub asset size 4 must be a valid number', true),
  ('asset_sub_size_4_positive', 'positive_number', 'sub_asset_size_4', 'asset', NULL, NULL, 'Sub asset size 4 must be positive', 'Sub asset size 4 must be greater than 0', true),
  
  ('asset_sub_size_5_numeric', 'numeric', 'sub_asset_size_5', 'asset', NULL, NULL, 'Sub asset size 5 must be a number', 'Sub asset size 5 must be a valid number', true),
  ('asset_sub_size_5_positive', 'positive_number', 'sub_asset_size_5', 'asset', NULL, NULL, 'Sub asset size 5 must be positive', 'Sub asset size 5 must be greater than 0', true),
  
  ('asset_sub_size_6_numeric', 'numeric', 'sub_asset_size_6', 'asset', NULL, NULL, 'Sub asset size 6 must be a number', 'Sub asset size 6 must be a valid number', true),
  ('asset_sub_size_6_positive', 'positive_number', 'sub_asset_size_6', 'asset', NULL, NULL, 'Sub asset size 6 must be positive', 'Sub asset size 6 must be greater than 0', true);

-- Building Validation Rules
INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('building_number_required', 'required', 'building_number', 'building', NULL, NULL, 'Building number is required', 'Building number must be provided', true),
  ('building_number_numeric', 'numeric', 'building_number', 'building', NULL, NULL, 'Building number must be a number', 'Building number must be a valid number', true),
  ('building_number_positive', 'positive_number', 'building_number', 'building', NULL, NULL, 'Building number must be positive', 'Building number must be greater than 0', true),
  ('building_tax_region_numeric', 'numeric', 'tax_region', 'building', NULL, NULL, 'Tax region must be a number', 'Tax region must be a valid number', true);

-- Measurement Validation Rules
INSERT INTO validation_rules (rule_key, rule_type, field_name, entity_type, value_numeric, value_text, error_message, description, enabled) VALUES
  ('measurement_date_required', 'required', 'measurement_date', 'measurement', NULL, NULL, 'Measurement date is required', 'Measurement date must be provided', true),
  
  ('measurement_asset_area_numeric', 'numeric', 'asset_area', 'measurement', NULL, NULL, 'Asset area must be a number', 'Asset area must be a valid number', true),
  ('measurement_asset_area_positive', 'positive_number', 'asset_area', 'measurement', NULL, NULL, 'Asset area must be positive', 'Asset area must be greater than 0', true),
  
  ('measurement_storage_area_numeric', 'numeric', 'storage_area', 'measurement', NULL, NULL, 'Storage area must be a number', 'Storage area must be a valid number', true),
  ('measurement_storage_area_positive', 'positive_number', 'storage_area', 'measurement', NULL, NULL, 'Storage area must be positive', 'Storage area must be greater than 0', true),
  
  ('measurement_pergola_area_numeric', 'numeric', 'pergola_area', 'measurement', NULL, NULL, 'Pergola area must be a number', 'Pergola area must be a valid number', true),
  ('measurement_pergola_area_positive', 'positive_number', 'pergola_area', 'measurement', NULL, NULL, 'Pergola area must be positive', 'Pergola area must be greater than 0', true),
  
  ('measurement_balcony_area_numeric', 'numeric', 'balcony_area', 'measurement', NULL, NULL, 'Balcony area must be a number', 'Balcony area must be a valid number', true),
  ('measurement_balcony_area_positive', 'positive_number', 'balcony_area', 'measurement', NULL, NULL, 'Balcony area must be positive', 'Balcony area must be greater than 0', true),
  
  ('measurement_garden_area_numeric', 'numeric', 'garden_area', 'measurement', NULL, NULL, 'Garden area must be a number', 'Garden area must be a valid number', true),
  ('measurement_garden_area_positive', 'positive_number', 'garden_area', 'measurement', NULL, NULL, 'Garden area must be positive', 'Garden area must be greater than 0', true);
