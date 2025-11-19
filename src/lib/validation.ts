import { api, ValidationRule } from './api';
import { supabase } from './supabase';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface CrossTableValidationContext {
  entityType: string;
  entityData: any;
  joinFieldValue: any;
}

let cachedRules: ValidationRule[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60000;

export async function loadValidationRules(forceRefresh = false): Promise<ValidationRule[]> {
  const now = Date.now();

  if (!forceRefresh && cachedRules && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRules;
  }

  try {
    const rules = await api.validationRules.getEnabled();
    cachedRules = rules;
    cacheTimestamp = now;
    return rules;
  } catch (error) {
    console.error('Failed to load validation rules:', error);
    return cachedRules || [];
  }
}

function getRuleValue(rules: ValidationRule[], ruleKey: string, valueType: 'numeric' | 'text'): any {
  const rule = rules.find(r => r.rule_key === ruleKey && r.enabled);
  if (!rule) return null;

  return valueType === 'numeric' ? rule.value_numeric : rule.value_text;
}

function getRuleError(rules: ValidationRule[], ruleKey: string, defaultError: string): string {
  const rule = rules.find(r => r.rule_key === ruleKey && r.enabled);
  return rule?.error_message || defaultError;
}

export const validators = {
  required: (value: any, fieldName: string): ValidationResult => {
    const trimmedValue = typeof value === 'string' ? value.trim() : value;
    if (!trimmedValue && trimmedValue !== 0) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true };
  },

  exactLength: (value: string, length: number, fieldName: string): ValidationResult => {
    if (value.length !== length) {
      return { valid: false, error: `${fieldName} must be exactly ${length} characters` };
    }
    return { valid: true };
  },

  minLength: (value: string, length: number, fieldName: string): ValidationResult => {
    if (value.length < length) {
      return { valid: false, error: `${fieldName} must be at least ${length} characters` };
    }
    return { valid: true };
  },

  maxLength: (value: string, length: number, fieldName: string): ValidationResult => {
    if (value.length > length) {
      return { valid: false, error: `${fieldName} must be at most ${length} characters` };
    }
    return { valid: true };
  },

  pattern: (value: string, pattern: RegExp, fieldName: string, message?: string): ValidationResult => {
    if (!pattern.test(value)) {
      return {
        valid: false,
        error: message || `${fieldName} format is invalid`
      };
    }
    return { valid: true };
  },

  digitsOnly: (value: string, fieldName: string): ValidationResult => {
    return validators.pattern(value, /^\d+$/, fieldName, `${fieldName} must contain only digits`);
  },

  numeric: (value: any, fieldName: string): ValidationResult => {
    if (isNaN(Number(value))) {
      return { valid: false, error: `${fieldName} must be a number` };
    }
    return { valid: true };
  },

  positiveNumber: (value: number, fieldName: string, errorMessage?: string): ValidationResult => {
    if (value <= 0) {
      return { valid: false, error: errorMessage || `${fieldName} must be a positive number` };
    }
    return { valid: true };
  },

  email: (value: string, fieldName: string, errorMessage?: string): ValidationResult => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return validators.pattern(value, emailPattern, fieldName, errorMessage || `${fieldName} must be a valid email address`);
  },
};

export async function applyRule(rule: ValidationRule, value: any): Promise<ValidationResult> {
  const fieldName = rule.field_name;
  const errorMessage = rule.error_message;

  switch (rule.rule_type) {
    case 'required':
      const trimmedValue = typeof value === 'string' ? value.trim() : value;
      if (!trimmedValue && trimmedValue !== 0) {
        return { valid: false, error: errorMessage || `${fieldName} is required` };
      }
      return { valid: true };

    case 'exact_length':
      if (rule.value_numeric == null) {
        return { valid: false, error: 'Exact length rule requires numeric value' };
      }
      if (String(value).length !== rule.value_numeric) {
        return { valid: false, error: errorMessage || `${fieldName} must be exactly ${rule.value_numeric} characters` };
      }
      return { valid: true };

    case 'min_length':
      if (rule.value_numeric == null) {
        return { valid: false, error: 'Min length rule requires numeric value' };
      }
      if (String(value).length < rule.value_numeric) {
        return { valid: false, error: errorMessage || `${fieldName} must be at least ${rule.value_numeric} characters` };
      }
      return { valid: true };

    case 'max_length':
      if (rule.value_numeric == null) {
        return { valid: false, error: 'Max length rule requires numeric value' };
      }
      if (String(value).length > rule.value_numeric) {
        return { valid: false, error: errorMessage || `${fieldName} must be at most ${rule.value_numeric} characters` };
      }
      return { valid: true };

    case 'pattern':
      if (!rule.value_text) {
        return { valid: false, error: 'Pattern rule requires text value' };
      }
      try {
        const pattern = new RegExp(rule.value_text);
        if (!pattern.test(String(value))) {
          return { valid: false, error: errorMessage || `${fieldName} format is invalid` };
        }
        return { valid: true };
      } catch (error) {
        return { valid: false, error: 'Invalid pattern in rule' };
      }

    case 'numeric':
      if (isNaN(Number(value))) {
        return { valid: false, error: errorMessage || `${fieldName} must be a number` };
      }
      return { valid: true };

    case 'positive_number':
      if (Number(value) <= 0) {
        return { valid: false, error: errorMessage || `${fieldName} must be a positive number` };
      }
      return { valid: true };

    case 'exists_in_table':
      if (!rule.compare_table || !rule.compare_field) {
        console.error('Missing compare_table or compare_field:', rule);
        return { valid: false, error: 'exists_in_table rule requires compare_table and compare_field' };
      }
      try {
        console.log(`Validating ${fieldName} = "${value}" exists in ${rule.compare_table}.${rule.compare_field}`);
        const { data, error, count } = await supabase
          .from(rule.compare_table)
          .select(rule.compare_field, { count: 'exact', head: true })
          .eq(rule.compare_field, value);

        if (error) {
          console.error('Exists in table validation query error:', error);
          return { valid: false, error: 'Failed to validate existence in table' };
        }

        if (!count || count === 0) {
          console.warn(`Value "${value}" not found in ${rule.compare_table}.${rule.compare_field}`);
          return {
            valid: false,
            error: errorMessage || `${fieldName} value "${value}" does not exist in asset types`
          };
        }

        console.log(`Validation passed: "${value}" exists in ${rule.compare_table} (${count} records)`);
        return { valid: true };
      } catch (error) {
        console.error('Exists in table validation error:', error);
        return { valid: false, error: 'Existence validation failed' };
      }

    default:
      return { valid: true };
  }
}

export async function validateAssetTypeForBuildingTaxRegion(
  buildingNumber: number,
  assetTypeName: string
): Promise<ValidationResult> {
  try {
    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select('tax_region, has_elevator')
      .eq('building_number', buildingNumber)
      .maybeSingle();

    if (buildingError) {
      console.error('Error fetching building:', buildingError);
      return { valid: false, error: 'Failed to validate building tax region' };
    }

    if (!building) {
      return { valid: false, error: 'Building not found' };
    }

    if (building.tax_region == null) {
      return { valid: true };
    }

    const assetTypeCode = typeof assetTypeName === 'string' ? parseInt(assetTypeName) : assetTypeName;
    const { data: assetType, error: assetTypeError } = await supabase
      .from('asset_types')
      .select('code, description, tax_region, has_elevator, min_asset_size, max_asset_size')
      .eq('code', assetTypeCode)
      .maybeSingle();

    if (assetTypeError) {
      console.error('Error fetching asset type:', assetTypeError);
      return { valid: false, error: 'Failed to validate asset type' };
    }

    if (!assetType) {
      return { valid: false, error: `Asset type "${assetTypeName}" does not exist` };
    }

    if (assetType.tax_region == null) {
      return { valid: true };
    }

    const buildingTaxRegions = String(building.tax_region).split(',').map(r => r.trim());
    const assetTaxRegion = String(assetType.tax_region);

    if (!buildingTaxRegions.includes(assetTaxRegion)) {
      return {
        valid: false,
        error: `סוג הנכס "${assetTypeName}" (אזור ${assetType.tax_region}) לא שייך לאזור המס של הבניין (אזור ${building.tax_region})`
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Asset type tax region validation error:', error);
    return { valid: false, error: 'Validation failed' };
  }
}

export async function validateAssetTypeComplete(
  buildingNumber: number,
  assetTypeName: string,
  assetSize: number
): Promise<ValidationResult> {
  try {
    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select('tax_region, has_elevator')
      .eq('building_number', buildingNumber)
      .maybeSingle();

    if (buildingError) {
      console.error('Error fetching building:', buildingError);
      return { valid: false, error: 'שגיאה באימות פרטי הבניין' };
    }

    if (!building) {
      return { valid: false, error: 'הבניין לא נמצא' };
    }

    const assetTypeCode = typeof assetTypeName === 'string' ? parseInt(assetTypeName) : assetTypeName;
    const { data: assetType, error: assetTypeError } = await supabase
      .from('asset_types')
      .select('code, description, tax_region, has_elevator, min_asset_size, max_asset_size')
      .eq('code', assetTypeCode)
      .maybeSingle();

    if (assetTypeError) {
      console.error('Error fetching asset type:', assetTypeError);
      return { valid: false, error: 'שגיאה באימות סוג הנכס' };
    }

    if (!assetType) {
      return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים` };
    }

    // Step 1: Check tax region match
    if (building.tax_region != null && assetType.tax_region != null) {
      const buildingTaxRegions = String(building.tax_region).split(',').map(r => r.trim());
      const assetTaxRegion = String(assetType.tax_region);

      if (!buildingTaxRegions.includes(assetTaxRegion)) {
        return {
          valid: false,
          error: `סוג הנכס "${assetTypeName}" (אזור מס ${assetType.tax_region}) לא קיים באזור המס של הבניין (${building.tax_region})`
        };
      }
    }

    // Step 2: Check elevator requirement match
    if (assetType.has_elevator != null && building.has_elevator !== assetType.has_elevator) {
      const elevatorMsg = building.has_elevator ? 'יש מעלית' : 'אין מעלית';
      const typeRequirement = assetType.has_elevator ? 'דורש מעלית' : 'לא דורש מעלית';
      return {
        valid: false,
        error: `סוג הנכס "${assetTypeName}" ${typeRequirement}, אבל בבניין ${elevatorMsg}`
      };
    }

    // Step 3: Check asset size is within range
    if (assetSize != null && assetSize > 0) {
      if (assetType.min_asset_size != null && assetSize < assetType.min_asset_size) {
        return {
          valid: false,
          error: `גודל הנכס (${assetSize}) קטן מהמינימום המותר לסוג "${assetTypeName}" (${assetType.min_asset_size})`
        };
      }

      if (assetType.max_asset_size != null && assetSize > assetType.max_asset_size) {
        return {
          valid: false,
          error: `גודל הנכס (${assetSize}) גדול מהמקסימום המותר לסוג "${assetTypeName}" (${assetType.max_asset_size})`
        };
      }
    }

    return { valid: true };
  } catch (error) {
    console.error('Complete asset type validation error:', error);
    return { valid: false, error: 'שגיאה באימות סוג הנכס' };
  }
}

export async function validateSubAssetSizeMatchesMain(
  mainAssetSize: number | undefined,
  subAssetTypes: (string | undefined)[],
  subAssetSizes: (number | undefined)[]
): Promise<ValidationResult> {
  const validSubAssets = subAssetTypes.filter(type => type && type.trim() !== '');

  if (validSubAssets.length === 0) {
    return { valid: true };
  }

  if (mainAssetSize == null || mainAssetSize <= 0) {
    return { valid: true };
  }

  const totalSubAssetSize = subAssetSizes
    .filter((size, idx) => {
      const hasType = subAssetTypes[idx] && subAssetTypes[idx]!.trim() !== '';
      return hasType && size != null;
    })
    .reduce((sum, size) => sum + (size || 0), 0);

  if (Math.abs(totalSubAssetSize - mainAssetSize) > 0.01) {
    return {
      valid: false,
      error: `סה"כ גודל נכסי משנה (${totalSubAssetSize}) חייב להיות שווה לגודל נכס ראשי (${mainAssetSize})`
    };
  }

  return { valid: true };
}

export async function validateMinimumSubAssets(
  subAssetTypes: (string | undefined)[]
): Promise<ValidationResult> {
  const validSubAssets = subAssetTypes.filter(type => type && type.trim() !== '');

  if (validSubAssets.length === 1) {
    return {
      valid: false,
      error: `אם משתמשים בנכסי משנה, חובה להזין לפחות 2 נכסי משנה`
    };
  }

  return { valid: true };
}

export async function validateSubAssetsFor199Or299(
  buildingNumber: number | null,
  mainAssetType: string | undefined,
  mainAssetSize: number | undefined,
  subAssetTypes: (string | undefined)[],
  subAssetSizes: (number | undefined)[]
): Promise<ValidationResult> {
  if (!mainAssetType || !buildingNumber) {
    return { valid: true };
  }

  if (mainAssetType !== '199' && mainAssetType !== '299') {
    return { valid: true };
  }

  const validSubAssets = subAssetTypes.filter(type => type && type.trim() !== '');

  if (validSubAssets.length < 2) {
    return {
      valid: false,
      error: `כאשר סוג הנכס הראשי הוא ${mainAssetType}, חייב להיות לפחות 2 נכסי משנה. נמצאו ${validSubAssets.length} נכסי משנה בלבד`
    };
  }

  for (let i = 0; i < subAssetTypes.length; i++) {
    const currentType = subAssetTypes[i];
    const hasCurrentType = currentType && currentType.trim() !== '';

    if (hasCurrentType && i > 0) {
      const previousType = subAssetTypes[i - 1];
      const hasPreviousType = previousType && previousType.trim() !== '';

      if (!hasPreviousType) {
        return {
          valid: false,
          error: `אין לדלג על סדר נכסי המשנה - נכס משנה ${i + 1} קיים אך נכס משנה ${i} חסר`
        };
      }
    }
  }

  if (mainAssetSize != null && mainAssetSize > 0) {
    const totalSubAssetSize = subAssetSizes
      .filter((size, idx) => {
        const hasType = subAssetTypes[idx] && subAssetTypes[idx]!.trim() !== '';
        return hasType && size != null;
      })
      .reduce((sum, size) => sum + (size || 0), 0);

    if (Math.abs(totalSubAssetSize - mainAssetSize) > 0.01) {
      return {
        valid: false,
        error: `כאשר סוג הנכס הראשי הוא ${mainAssetType}, סכום שטחי המשנה (${totalSubAssetSize}) חייב להיות שווה לשטח הראשי (${mainAssetSize})`
      };
    }
  }

  const { data: building, error: buildingError } = await supabase
    .from('buildings')
    .select('tax_region')
    .eq('building_number', buildingNumber)
    .maybeSingle();

  if (buildingError || !building) {
    return { valid: false, error: 'Failed to validate building' };
  }

  if (building.tax_region == null) {
    return { valid: true };
  }

  const buildingTaxRegions = String(building.tax_region).split(',').map(r => r.trim());

  for (const subAssetType of validSubAssets) {
    const assetTypeCode = typeof subAssetType === 'string' ? parseInt(subAssetType) : subAssetType;
    const { data: assetType, error: assetTypeError } = await supabase
      .from('asset_types')
      .select('code, description, tax_region')
      .eq('code', assetTypeCode)
      .maybeSingle();

    if (assetTypeError) {
      return { valid: false, error: `Failed to validate sub-asset type ${subAssetType}` };
    }

    if (!assetType) {
      return { valid: false, error: `סוג נכס משנה "${subAssetType}" לא קיים` };
    }

    if (assetType.tax_region != null && !buildingTaxRegions.includes(String(assetType.tax_region))) {
      return {
        valid: false,
        error: `סוג נכס משנה "${subAssetType}" (אזור ${assetType.tax_region}) לא שייך לאזור המס של הבניין (אזור ${building.tax_region})`
      };
    }
  }

  return { valid: true };
}

export async function validateField(
  entityType: string,
  fieldName: string,
  value: any
): Promise<ValidationResult[]> {
  const rules = await loadValidationRules();
  const fieldRules = rules.filter(
    r => r.entity_type === entityType && r.field_name === fieldName && r.enabled && r.rule_type !== 'cross_table_comparison'
  );

  console.log(`validateField(${entityType}, ${fieldName}, ${value}) - Found ${fieldRules.length} rules`, fieldRules.map(r => r.rule_type));

  if (value == null || value === '') {
    const requiredRule = fieldRules.find(r => r.rule_type === 'required');
    if (requiredRule) {
      const result = await applyRule(requiredRule, value);
      if (!result.valid) {
        return [result];
      }
    }
    return [{ valid: true }];
  }

  const results: ValidationResult[] = [];
  for (const rule of fieldRules) {
    const result = await applyRule(rule, value);
    results.push(result);
  }

  return results;
}

export async function validateEntity(
  entityType: string,
  entityData: Record<string, any>
): Promise<Record<string, ValidationResult[]>> {
  const rules = await loadValidationRules();
  const entityRules = rules.filter(
    r => r.entity_type === entityType && r.enabled && r.rule_type !== 'cross_table_comparison'
  );

  const fieldNames = [...new Set(entityRules.map(r => r.field_name))];
  const validationResults: Record<string, ValidationResult[]> = {};

  for (const fieldName of fieldNames) {
    const value = entityData[fieldName];
    validationResults[fieldName] = await validateField(entityType, fieldName, value);
  }

  return validationResults;
}

export const assetTypeValidators = {
  validateName: async (name: string): Promise<ValidationResult> => {
    const results = await validateField('asset_type', 'name', name);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validateDescription: (description: string): ValidationResult => {
    return { valid: true };
  },

  validateTaxRegion: async (taxRegion: string | number): Promise<ValidationResult> => {
    if (!taxRegion && taxRegion !== 0) {
      return { valid: true };
    }
    const results = await validateField('asset_type', 'tax_region', taxRegion);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },
};

export const assetValidators = {
  validateAssetId: async (assetId: string): Promise<ValidationResult> => {
    const results = await validateField('asset', 'asset_id', assetId);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validateBuildingNumber: async (buildingNumber: number | null): Promise<ValidationResult> => {
    const results = await validateField('asset', 'building_number', buildingNumber);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validatePayerId: async (payerId: string): Promise<ValidationResult> => {
    const results = await validateField('asset', 'payer_id', payerId);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validateSize: async (size: number, fieldName: string): Promise<ValidationResult> => {
    const results = await validateField('asset', fieldName, size);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validateAssetType: async (assetType: string | undefined, fieldName: string): Promise<ValidationResult> => {
    if (!assetType) {
      return { valid: true };
    }
    const results = await validateField('asset', fieldName, assetType);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validateMainAssetTypeForBuilding: async (
    buildingNumber: number | null,
    mainAssetType: string | undefined
  ): Promise<ValidationResult> => {
    if (!mainAssetType || !buildingNumber) {
      return { valid: true };
    }
    return await validateAssetTypeForBuildingTaxRegion(buildingNumber, mainAssetType);
  },

  validateMainAssetTypeComplete: async (
    buildingNumber: number | null,
    mainAssetType: string | undefined,
    assetSize: number | undefined
  ): Promise<ValidationResult> => {
    if (!mainAssetType || !buildingNumber || !assetSize) {
      return { valid: true };
    }
    return await validateAssetTypeComplete(buildingNumber, mainAssetType, assetSize);
  },

  validateSubAssetTypeComplete: async (
    buildingNumber: number | null,
    subAssetType: string | undefined,
    subAssetSize: number | undefined
  ): Promise<ValidationResult> => {
    if (!subAssetType || !buildingNumber || !subAssetSize) {
      return { valid: true };
    }
    return await validateAssetTypeComplete(buildingNumber, subAssetType, subAssetSize);
  },

  validateSubAssetsFor199Or299: async (
    buildingNumber: number | null,
    mainAssetType: string | undefined,
    mainAssetSize: number | undefined,
    subAssetTypes: (string | undefined)[],
    subAssetSizes: (number | undefined)[]
  ): Promise<ValidationResult> => {
    return await validateSubAssetsFor199Or299(buildingNumber, mainAssetType, mainAssetSize, subAssetTypes, subAssetSizes);
  },

  validateSubAssetSizeMatchesMain: async (
    mainAssetSize: number | undefined,
    subAssetTypes: (string | undefined)[],
    subAssetSizes: (number | undefined)[]
  ): Promise<ValidationResult> => {
    return await validateSubAssetSizeMatchesMain(mainAssetSize, subAssetTypes, subAssetSizes);
  },

  validateMinimumSubAssets: async (
    subAssetTypes: (string | undefined)[]
  ): Promise<ValidationResult> => {
    return await validateMinimumSubAssets(subAssetTypes);
  },
};

export async function validateAll(validations: (ValidationResult | Promise<ValidationResult>)[]): Promise<ValidationResult> {
  const resolvedValidations = await Promise.all(validations);
  for (const validation of resolvedValidations) {
    if (!validation.valid) {
      return validation;
    }
  }
  return { valid: true };
}

export function formatValidationErrors(errors: string[]): string {
  if (errors.length === 0) return '';
  if (errors.length === 1) return errors[0];
  return errors.map((err, idx) => `${idx + 1}. ${err}`).join('\n');
}

export const inputValidators = {
  allowDigitsOnly: (value: string, maxLength?: number): boolean => {
    if (maxLength !== undefined) {
      return value === '' || /^\d+$/.test(value) && value.length <= maxLength;
    }
    return value === '' || /^\d+$/.test(value);
  },

  allowDigitsWithMaxLength: (value: string, maxLength: number): boolean => {
    const pattern = new RegExp(`^\\d{0,${maxLength}}$`);
    return value === '' || pattern.test(value);
  },

  allowAlphanumeric: (value: string): boolean => {
    return /^[a-zA-Z0-9]*$/.test(value);
  },

  allowNumeric: (value: string): boolean => {
    return value === '' || !isNaN(Number(value));
  },

  allowDateFormat: (value: string): boolean => {
    if (value === '') return true;
    const match = value.match(/^(\d{0,2})(\/?)(\d{0,2})(\/?)(\d{0,4})$/);
    return match !== null;
  },

  validateDateFormat: (value: string): ValidationResult => {
    if (!value || value === '' || value === '01/01/1900') {
      return { valid: true };
    }

    const match = value.match(patterns.dateFormat);
    if (!match) {
      return {
        valid: false,
        error: 'תאריך חייב להיות בפורמט DD/MM/YYYY'
      };
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (month < 1 || month > 12) {
      return {
        valid: false,
        error: 'חודש לא תקין (1-12)'
      };
    }

    if (day < 1 || day > 31) {
      return {
        valid: false,
        error: 'יום לא תקין (1-31)'
      };
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) {
      return {
        valid: false,
        error: `יום לא תקין עבור חודש ${month} (1-${daysInMonth})`
      };
    }

    return { valid: true };
  },
};

export const patterns = {
  threeDigits: /^\d{3}$/,
  digitsOnly: /^\d+$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  numeric: /^-?\d*\.?\d+$/,
  dateFormat: /^(\d{2})\/(\d{2})\/(\d{4})$/,
};

export const measurementValidators = {
  validateDate: async (date: string): Promise<ValidationResult> => {
    const results = await validateField('measurement', 'measurement_date', date);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validateArea: async (area: number, fieldName: string): Promise<ValidationResult> => {
    const results = await validateField('measurement', fieldName, area);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },
};

export const buildingValidators = {
  validateBuildingNumber: async (buildingNumber: number): Promise<ValidationResult> => {
    const results = await validateField('building', 'building_number', buildingNumber);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validateTaxRegion: async (taxRegion: string | number | undefined, skipAssetTypeCheck: boolean = false): Promise<ValidationResult> => {
    if (!taxRegion && taxRegion !== 0) {
      return { valid: true };
    }

    // Convert to string if it's a number
    const taxRegionStr = typeof taxRegion === 'number' ? taxRegion.toString() : taxRegion;

    // Valid combinations: "10,40", "20,40", "30,40", or single values
    const validCombinations = ['10,40', '20,40', '30,40'];
    const trimmedValue = taxRegionStr.trim();

    // Check if it's a comma-separated value
    if (trimmedValue.includes(',')) {
      const normalized = trimmedValue.split(',').map(v => v.trim()).sort().join(',');
      if (!validCombinations.includes(normalized)) {
        return {
          valid: false,
          error: 'אזור מס יכול להיות ערך בודד או אחד מהצירופים הבאים בלבד: 10,40 או 20,40 או 30,40'
        };
      }

      // Only check asset_types existence when explicitly requested (during save/update)
      if (!skipAssetTypeCheck) {
        const components = trimmedValue.split(',').map(v => v.trim());
        for (const component of components) {
          const { count, error } = await supabase
            .from('asset_types')
            .select('tax_region', { count: 'exact', head: true })
            .eq('tax_region', parseInt(component));

          if (error || !count || count === 0) {
            return {
              valid: false,
              error: `אזור מס ${component} לא קיים בסוגי הנכסים`
            };
          }
        }
      }

      return { valid: true };
    }

    // For single values, use the standard validation rules
    const results = await validateField('building', 'tax_region', taxRegion);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  checkAreaMismatch: (totalAreaForControl: number | null, totalBuildingArea: number): boolean => {
    if (totalAreaForControl == null) return false;
    return totalAreaForControl !== totalBuildingArea;
  },

  checkTaxRegionInvalid: async (taxRegion: string | number | null | undefined): Promise<boolean> => {
    if (taxRegion == null) return false;
    const result = await buildingValidators.validateTaxRegion(taxRegion, true);
    return !result.valid;
  },
};

export async function validateCrossTable(
  rule: ValidationRule,
  context: CrossTableValidationContext
): Promise<ValidationResult> {
  if (rule.rule_type !== 'cross_table_comparison') {
    return { valid: false, error: 'Invalid rule type for cross-table validation' };
  }

  if (!rule.compare_table || !rule.compare_field || !rule.join_field || !rule.comparison_operator) {
    return { valid: false, error: 'Missing required fields for cross-table validation' };
  }

  try {
    const { data, error } = await supabase
      .from(rule.compare_table)
      .select(rule.compare_field)
      .eq(rule.join_field, context.joinFieldValue)
      .maybeSingle();

    if (error) {
      console.error('Cross-table validation query error:', error);
      return { valid: false, error: 'Failed to execute cross-table validation' };
    }

    if (!data) {
      return { valid: true };
    }

    const fieldValue = context.entityData[rule.field_name];
    const compareValue = data[rule.compare_field];

    if (fieldValue == null || compareValue == null) {
      return { valid: true };
    }

    let isValid = true;
    switch (rule.comparison_operator) {
      case '=':
      case '==':
        isValid = fieldValue === compareValue;
        break;
      case '!=':
      case '<>':
        isValid = fieldValue !== compareValue;
        break;
      case '>':
        isValid = fieldValue > compareValue;
        break;
      case '<':
        isValid = fieldValue < compareValue;
        break;
      case '>=':
        isValid = fieldValue >= compareValue;
        break;
      case '<=':
        isValid = fieldValue <= compareValue;
        break;
      default:
        return { valid: false, error: `Unknown comparison operator: ${rule.comparison_operator}` };
    }

    if (!isValid) {
      return {
        valid: false,
        error: rule.error_message || `Cross-table validation failed: ${rule.field_name} ${rule.comparison_operator} ${rule.compare_field}`
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Cross-table validation error:', error);
    return { valid: false, error: 'Cross-table validation failed due to unexpected error' };
  }
}

export async function validateEntityWithCrossTableRules(
  entityType: string,
  entityData: any,
  joinFieldValue: any
): Promise<ValidationResult[]> {
  const rules = await loadValidationRules();
  const crossTableRules = rules.filter(
    r => r.entity_type === entityType && r.rule_type === 'cross_table_comparison' && r.enabled
  );

  const results: ValidationResult[] = [];
  for (const rule of crossTableRules) {
    const result = await validateCrossTable(rule, {
      entityType,
      entityData,
      joinFieldValue
    });
    results.push(result);
  }

  return results;
}
