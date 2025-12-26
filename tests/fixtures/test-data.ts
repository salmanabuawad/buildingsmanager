import { Building, Asset, AssetType, ValidationRule } from '../../src/lib/api';

/**
 * Reference data for tests
 */
export const testAddresses = [
  { street_code: 100, street_description: 'רחוב הרצל' },
  { street_code: 200, street_description: 'רחוב ויצמן' },
  { street_code: 300, street_description: 'רחוב בן גוריון' },
  { street_code: 400, street_description: 'רחוב רוטשילד' },
];

export const testAssetTypes: Omit<AssetType, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    name: '199',
    description: 'דירה רגילה',
    tax_region: 10,
    min_size: 20,
    max_size: 150,
    elevator: 'כן',
    condo: 'כן',
    business_residence: 'מגורים',
    active: 'כן',
  },
  {
    name: '299',
    description: 'דירה מורכבת',
    tax_region: 40,
    min_size: 30,
    max_size: 200,
    elevator: null,
    condo: 'כן',
    business_residence: 'מגורים',
    active: 'כן',
  },
  {
    name: '101',
    description: 'חנות',
    tax_region: 10,
    min_size: 10,
    max_size: 100,
    business_residence: 'עסקים',
    active: 'כן',
  },
  {
    name: '201',
    description: 'משרד',
    tax_region: 10,
    min_size: 15,
    max_size: 80,
    business_residence: 'עסקים',
    active: 'כן',
  },
];

export const testValidationRules: Omit<ValidationRule, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    rule_key: 'asset_id_required',
    entity_type: 'asset',
    field_name: 'asset_id',
    rule_type: 'required',
    error_message: 'מזהה נכס הוא שדה חובה',
    description: 'Asset ID is required',
    enabled: true,
  },
  {
    rule_key: 'asset_id_numeric',
    entity_type: 'asset',
    field_name: 'asset_id',
    rule_type: 'numeric',
    error_message: 'מזהה נכס חייב להיות מספר',
    description: 'Asset ID must be numeric',
    enabled: true,
  },
  {
    rule_key: 'building_number_required',
    entity_type: 'asset',
    field_name: 'building_number',
    rule_type: 'required',
    error_message: 'מספר בניין הוא שדה חובה',
    description: 'Building number is required',
    enabled: true,
  },
  {
    rule_key: 'asset_size_positive',
    entity_type: 'asset',
    field_name: 'asset_size',
    rule_type: 'positive_number',
    error_message: 'שטח נכס חייב להיות מספר חיובי',
    description: 'Asset size must be positive',
    enabled: true,
  },
  {
    rule_key: 'asset_type_name_required',
    entity_type: 'asset_type',
    field_name: 'name',
    rule_type: 'required',
    error_message: 'שם סוג הנכס הוא שדה חובה',
    description: 'Asset type name is required',
    enabled: true,
  },
];

/**
 * Valid test buildings
 */
export const validBuildings: Omit<Building, 'created_at'>[] = [
  {
    building_number: 1001,
    tax_region: '10',
    elevator: 'כן',
    building_address: 100,
    total_building_area: 500,
  },
  {
    building_number: 1002,
    tax_region: '40',
    elevator: null,
    building_address: 200,
    total_building_area: 300,
  },
  {
    building_number: 1003,
    tax_region: '10,40',
    elevator: 'כן',
    building_address: 300,
    total_building_area: 800,
  },
];

/**
 * Invalid test buildings (should fail validation)
 */
export const invalidBuildings: Omit<Building, 'created_at'>[] = [
  {
    building_number: 2001,
    tax_region: '', // Empty tax region (might be invalid depending on rules)
    elevator: 'כן',
    building_address: 9999, // Invalid address (doesn't exist)
  },
];

/**
 * Valid test assets
 */
export const validAssets: Omit<Asset, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    building_number: 1001,
    asset_id: 1,
    payer_id: '123456789',
    main_asset_type: '199',
    asset_size: 75.5,
    measurement_date: '01/01/2024',
    sub_asset_type_1: '101',
    sub_asset_size_1: 10,
    sub_asset_type_2: null,
    sub_asset_size_2: 0,
    sub_asset_type_3: null,
    sub_asset_size_3: 0,
    sub_asset_type_4: null,
    sub_asset_size_4: 0,
    sub_asset_type_5: null,
    sub_asset_size_5: 0,
    sub_asset_type_6: null,
    sub_asset_size_6: 0,
    tax_region: 10,
  },
  {
    building_number: 1001,
    asset_id: 2,
    payer_id: '987654321',
    main_asset_type: '299',
    asset_size: 120.0,
    measurement_date: '01/01/2024',
    sub_asset_type_1: null,
    sub_asset_size_1: 0,
    sub_asset_type_2: null,
    sub_asset_size_2: 0,
    sub_asset_type_3: null,
    sub_asset_size_3: 0,
    sub_asset_type_4: null,
    sub_asset_size_4: 0,
    sub_asset_type_5: null,
    sub_asset_size_5: 0,
    sub_asset_type_6: null,
    sub_asset_size_6: 0,
    tax_region: 40,
  },
  {
    building_number: 1002,
    asset_id: 1,
    payer_id: '111222333',
    main_asset_type: '101',
    asset_size: 50.0,
    measurement_date: '01/01/2024',
    sub_asset_type_1: null,
    sub_asset_size_1: 0,
    sub_asset_type_2: null,
    sub_asset_size_2: 0,
    sub_asset_type_3: null,
    sub_asset_size_3: 0,
    sub_asset_type_4: null,
    sub_asset_size_4: 0,
    sub_asset_type_5: null,
    sub_asset_size_5: 0,
    sub_asset_type_6: null,
    sub_asset_size_6: 0,
    tax_region: 10,
  },
];

/**
 * Invalid test assets (should fail validation)
 */
export const invalidAssets: Omit<Asset, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    building_number: 1001,
    asset_id: 999, // Missing required fields
    payer_id: 'invalid', // Non-numeric payer_id
    main_asset_type: '999', // Invalid asset type
    asset_size: -10, // Negative size (invalid)
    measurement_date: '01/01/2024',
    sub_asset_type_1: null,
    sub_asset_size_1: 0,
    sub_asset_type_2: null,
    sub_asset_size_2: 0,
    sub_asset_type_3: null,
    sub_asset_size_3: 0,
    sub_asset_type_4: null,
    sub_asset_size_4: 0,
    sub_asset_type_5: null,
    sub_asset_size_5: 0,
    sub_asset_type_6: null,
    sub_asset_size_6: 0,
  },
  {
    building_number: 9999, // Non-existent building
    asset_id: 1,
    payer_id: '123456789',
    main_asset_type: '199',
    asset_size: 75.5,
    measurement_date: '01/01/2024',
    sub_asset_type_1: null,
    sub_asset_size_1: 0,
    sub_asset_type_2: null,
    sub_asset_size_2: 0,
    sub_asset_type_3: null,
    sub_asset_size_3: 0,
    sub_asset_type_4: null,
    sub_asset_size_4: 0,
    sub_asset_type_5: null,
    sub_asset_size_5: 0,
    sub_asset_type_6: null,
    sub_asset_size_6: 0,
  },
];

