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
        // Convert value to integer if it's a numeric string and the field is tax_region
        const queryValue = (rule.field_name === 'tax_region' && !isNaN(Number(value)))
          ? parseInt(String(value))
          : value;

        console.log(`Validating ${fieldName} = "${value}" (query value: ${queryValue}) exists in ${rule.compare_table}.${rule.compare_field}`);
        const { data, error, count } = await supabase
          .from(rule.compare_table)
          .select(rule.compare_field, { count: 'exact', head: true })
          .eq(rule.compare_field, queryValue);

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
      return { valid: false, error: 'שגיאה באימות אזור המס של הבניין' };
    }

    if (!building) {
      return { valid: false, error: 'הבניין לא נמצא' };
    }

    if (building.tax_region == null) {
      return { valid: true };
    }

    // Special validation for asset types 299 and 199
    const buildingTaxRegions = String(building.tax_region).split(',').map(r => r.trim());
    
    if (assetTypeName === '299') {
      // Asset type 299 is only valid in tax region 40
      if (!buildingTaxRegions.includes('40')) {
        return { valid: false, error: 'סוג נכס 299 תקף רק בבניינים עם אזור מס 40' };
      }
    } else if (assetTypeName === '199') {
      // Asset type 199 is valid in all tax regions EXCEPT 40
      // If building has tax region 40 (alone or in combination), 199 is invalid
      if (buildingTaxRegions.includes('40')) {
        return { valid: false, error: 'סוג נכס 199 לא תקף בבניינים עם אזור מס 40. סוג נכס 199 תקף בכל אזורי המס למעט 40' };
      }
    }

    let query = supabase
      .from('asset_types')
      .select('*')
      .eq('name', assetTypeName);

    // For asset type 199, it's valid in all tax regions except 40
    // So we don't filter by building's tax region, just check it exists and is not in tax region 40
    if (assetTypeName === '199') {
      // Check that asset type 199 exists and is not in tax region 40
      query = query.neq('tax_region', 40);
    } else if (assetTypeName === '299') {
      // For 299, it must be in tax region 40
      query = query.eq('tax_region', 40);
    } else {
      // For other asset types, filter by building's tax region
      if (buildingTaxRegions.length > 0) {
        query = query.in('tax_region', buildingTaxRegions.map(r => parseInt(r)));
      }
    }

    const { data: assetTypes, error: assetTypeError } = await query;

    if (assetTypeError) {
      console.error('Error fetching asset type:', assetTypeError);
      return { valid: false, error: 'שגיאה באימות סוג הנכס' };
    }

    if (!assetTypes || assetTypes.length === 0) {
      if (assetTypeName === '199') {
        return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים או זמין רק באזור מס 40` };
      } else if (assetTypeName === '299') {
        return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים באזור מס 40` };
      }
      return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים באזור המס של הבניין` };
    }

    return { valid: true };
  } catch (error) {
    console.error('Asset type tax region validation error:', error);
    return { valid: false, error: 'אימות נכשל' };
  }
}

export async function validateAssetTypeComplete(
  buildingNumber: number,
  assetTypeName: string,
  assetSize: number,
  assetData?: any
): Promise<ValidationResult> {
  try {
    // First validate tax region (this will return early if invalid, avoiding duplicate errors)
    const taxRegionValidation = await validateAssetTypeForBuildingTaxRegion(buildingNumber, assetTypeName);
    if (!taxRegionValidation.valid) {
      return taxRegionValidation;
    }

    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select('tax_region, has_elevator, elevator, shared_area, single_double_family, condo, basement, townhouses')
      .eq('building_number', buildingNumber)
      .maybeSingle();

    if (buildingError) {
      console.error('Error fetching building:', buildingError);
      return { valid: false, error: 'שגיאה באימות פרטי הבניין' };
    }

    if (!building) {
      return { valid: false, error: 'הבניין לא נמצא' };
    }

    // Query asset types by name field (tax region validation already done above)
    let query = supabase
      .from('asset_types')
      .select('*')
      .eq('name', assetTypeName);

    // For asset type 199, it's valid in all tax regions except 40
    if (assetTypeName === '199') {
      query = query.neq('tax_region', 40);
    } else if (assetTypeName === '299') {
      // For 299, it must be in tax region 40
      query = query.eq('tax_region', 40);
    } else {
      // For other asset types, filter by building's tax region
      const buildingTaxRegions = building.tax_region != null
        ? String(building.tax_region).split(',').map(r => r.trim())
        : [];
      if (buildingTaxRegions.length > 0) {
        query = query.in('tax_region', buildingTaxRegions.map(r => parseInt(r)));
      }
    }

    const { data: assetTypes, error: assetTypeError } = await query;

    if (assetTypeError) {
      console.error('Error fetching asset type:', assetTypeError);
      return { valid: false, error: 'שגיאה באימות סוג הנכס' };
    }

    if (!assetTypes || assetTypes.length === 0) {
      // This should not happen if tax region validation passed, but if it does, log it
      // and return a generic error to avoid duplicate messages
      console.error(`Asset type ${assetTypeName} not found after tax region validation passed`);
      return { valid: false, error: 'שגיאה באימות סוג הנכס' };
    }

    // Filter by elevator requirement to find the best match
    let assetType = assetTypes[0];

    if (assetTypes.length > 1) {
      // Find asset type that matches elevator requirement
      const elevatorMatches = assetTypes.filter(at => {
        if (!at.elevator || at.elevator.trim() === '') return true;
        const elevatorValue = at.elevator.toLowerCase();
        if (elevatorValue === 'כן' || elevatorValue === 'yes') {
          return building.has_elevator;
        } else if (elevatorValue === 'לא' || elevatorValue === 'no') {
          return !building.has_elevator;
        }
        return true;
      });

      if (elevatorMatches.length > 0) {
        assetType = elevatorMatches[0];
      }
    }

    // Step 1: Check elevator requirement
    if (assetType.elevator != null && assetType.elevator.trim() !== '') {
      const requiredValue = assetType.elevator.toLowerCase();
      const buildingValue = building.elevator ? building.elevator.toLowerCase() : '';

      if (requiredValue === 'כן' || requiredValue === 'yes') {
        if (buildingValue !== 'כן' && buildingValue !== 'yes' && !building.has_elevator) {
          return {
            valid: false,
            error: `סוג הנכס "${assetTypeName}" דורש מעלית, אבל בבניין אין מעלית`
          };
        }
      } else if (requiredValue === 'לא' || requiredValue === 'no') {
        if ((buildingValue === 'כן' || buildingValue === 'yes') || building.has_elevator) {
          return {
            valid: false,
            error: `סוג הנכס "${assetTypeName}" מיועד לבניינים ללא מעלית, אבל בבניין יש מעלית`
          };
        }
      }
    }

    // Step 3: Check asset size is within range
    if (assetSize != null) {
      const minSize = assetType.min_size != null ? Number(assetType.min_size) : null;
      const maxSize = assetType.max_size != null ? Number(assetType.max_size) : null;
      const numericAssetSize = Number(assetSize);

      if (minSize != null && numericAssetSize < minSize) {
        return {
          valid: false,
          error: `גודל הנכס (${numericAssetSize}) קטן מהמינימום המותר לסוג "${assetTypeName}" (${minSize})`
        };
      }

      if (maxSize != null && numericAssetSize > maxSize) {
        return {
          valid: false,
          error: `גודל הנכס (${numericAssetSize}) גדול מהמקסימום המותר לסוג "${assetTypeName}" (${maxSize})`
        };
      }
    }

    // Step 4: Validate single_double_family
    if (assetType.single_double_family != null && assetType.single_double_family.trim() !== '') {
      const requiredValue = assetType.single_double_family.toLowerCase();
      const buildingValue = building.single_double_family ? building.single_double_family.toLowerCase() : '';

      if (requiredValue === 'כן' || requiredValue === 'yes') {
        if (buildingValue !== 'כן' && buildingValue !== 'yes') {
          return {
            valid: false,
            error: `סוג הנכס "${assetTypeName}" דורש משפחה יחידה/דו משפחתי, אבל הבניין לא מסומן ככזה`
          };
        }
      }
    }

    // Step 5: Validate condo
    if (assetType.condo != null && assetType.condo.trim() !== '') {
      const requiredValue = assetType.condo.toLowerCase();
      const buildingValue = building.condo ? building.condo.toLowerCase() : '';

      if (requiredValue === 'כן' || requiredValue === 'yes') {
        if (buildingValue !== 'כן' && buildingValue !== 'yes') {
          return {
            valid: false,
            error: `סוג הנכס "${assetTypeName}" דורש דירת גן, אבל הבניין לא מסומן ככזה`
          };
        }
      }
    }

    // Step 6: Validate townhouses
    if (assetType.townhouses != null && assetType.townhouses.trim() !== '') {
      const requiredValue = assetType.townhouses.toLowerCase();
      const buildingValue = building.townhouses ? building.townhouses.toLowerCase() : '';

      if (requiredValue === 'כן' || requiredValue === 'yes') {
        if (buildingValue !== 'כן' && buildingValue !== 'yes') {
          return {
            valid: false,
            error: `סוג הנכס "${assetTypeName}" דורש טוריים, אבל הבניין לא מסומן ככזה`
          };
        }
      }
    }

    return { valid: true };
  } catch (error) {
    console.error('Complete asset type validation error:', error);
    return { valid: false, error: 'שגיאה באימות סוג הנכס' };
  }
}

export async function validateSubAssetSizeRequiresType(
  subAssetTypes: (string | undefined)[],
  subAssetSizes: (number | undefined)[]
): Promise<ValidationResult> {
  // Validate that sub asset size cannot be filled without corresponding sub asset type
  for (let i = 0; i < subAssetSizes.length; i++) {
    const hasSize = subAssetSizes[i] != null && subAssetSizes[i] !== 0;
    const hasType = subAssetTypes[i] && subAssetTypes[i]!.trim() !== '';

    if (hasSize && !hasType) {
      return {
        valid: false,
        error: `שטח נכס משנה ${i + 1} לא יכול להיות מוזן ללא סוג נכס משנה ${i + 1}`
      };
    }
  }

  return { valid: true };
}

export async function validateSubAssetSizeMatchesMain(
  mainAssetSize: number | undefined,
  subAssetTypes: (string | undefined)[],
  subAssetSizes: (number | undefined)[]
): Promise<ValidationResult> {
  // First validate that sizes are not filled without types
  const sizeTypeValidation = await validateSubAssetSizeRequiresType(subAssetTypes, subAssetSizes);
  if (!sizeTypeValidation.valid) {
    return sizeTypeValidation;
  }

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
      return hasType && size != null && size !== '';
    })
    .map(size => {
      // Convert to number if it's a string
      if (typeof size === 'string') {
        const num = parseFloat(size);
        return isNaN(num) ? 0 : num;
      }
      return typeof size === 'number' ? size : 0;
    })
    .reduce((sum, size) => sum + size, 0);

  if (Math.abs(totalSubAssetSize - mainAssetSize) > 0.01) {
    return {
      valid: false,
      error: `סה"כ גודל נכסי משנה חייב להיות שווה לגודל נכס ראשי`
    };
  }

  return { valid: true };
}

export async function validateSubAssetOrder(
  subAssetTypes: (string | undefined)[]
): Promise<ValidationResult> {
  // Validate that sub asset types are filled in order without gaps
  // You cannot have subtype 2 if subtype 1 is blank, etc.
  let firstEmptyIndex = -1;
  for (let i = 0; i < subAssetTypes.length; i++) {
    const currentType = subAssetTypes[i];
    const hasCurrentType = currentType && currentType.trim() !== '';

    if (!hasCurrentType) {
      // Found first empty slot
      if (firstEmptyIndex === -1) {
        firstEmptyIndex = i;
      }
    } else {
      // Found a filled slot
      if (firstEmptyIndex !== -1) {
        // There's a gap - we found an empty slot before this filled one
        return {
          valid: false,
          error: `נכסי משנה חייבים להיות מוזנים בסדר רציף ללא רווחים. נכס משנה ${firstEmptyIndex + 1} חסר אך נכס משנה ${i + 1} קיים`
        };
      }
    }
  }

  return { valid: true };
}

export async function validateMinimumSubAssets(
  subAssetTypes: (string | undefined)[]
): Promise<ValidationResult> {
  const validSubAssets = subAssetTypes.filter(type => type && type.trim() !== '');

  // If there are no sub assets, validation passes
  if (validSubAssets.length === 0) {
    return { valid: true };
  }

  // Validate order first
  const orderValidation = await validateSubAssetOrder(subAssetTypes);
  if (!orderValidation.valid) {
    return orderValidation;
  }

  // If there are sub assets, there must be at least 2
  // Note: This assumes mainAssetType is 199 or 299 (validated by validateOnlyComplexTypesCanHaveSubAssets)
  if (validSubAssets.length === 1) {
    return {
      valid: false,
      error: `אם משתמשים בנכסי משנה, חובה להזין לפחות 2 נכסי משנה`
    };
  }

  return { valid: true };
}

export async function validateOnlyComplexTypesCanHaveSubAssets(
  mainAssetType: string | undefined,
  subAssetTypes: (string | undefined)[]
): Promise<ValidationResult> {
  const validSubAssets = subAssetTypes.filter(type => type && type.trim() !== '');

  // If there are no sub assets, validation passes
  if (validSubAssets.length === 0) {
    return { valid: true };
  }

  // If there are sub assets, main asset type MUST be 199 or 299
  if (!mainAssetType || (mainAssetType !== '199' && mainAssetType !== '299')) {
    return {
      valid: false,
      error: 'רק סוגי נכס 199 ו-299 יכולים לכלול נכסי משנה. נכסי משנה לא מותרים עבור סוגי נכס אחרים'
    };
  }

  return { valid: true };
}

export async function validateComplexTypesMustHaveSubAssets(
  mainAssetType: string | undefined,
  subAssetTypes: (string | undefined)[]
): Promise<ValidationResult> {
  if (!mainAssetType || (mainAssetType !== '199' && mainAssetType !== '299')) {
    return { valid: true };
  }

  const validSubAssets = subAssetTypes.filter(type => type && type.trim() !== '');

  if (validSubAssets.length < 2) {
    return {
      valid: false,
      error: `סוגי נכס 199 ו-299 חייבים לכלול לפחות 2 נכסי משנה. נמצאו ${validSubAssets.length} נכסי משנה בלבד`
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

  // First validate that sizes are not filled without types
  const sizeTypeValidation = await validateSubAssetSizeRequiresType(subAssetTypes, subAssetSizes);
  if (!sizeTypeValidation.valid) {
    return sizeTypeValidation;
  }

  const validSubAssets = subAssetTypes.filter(type => type && type.trim() !== '');

  // Check that no sub asset type is 199 or 299 (complex types cannot be sub types)
  for (const subAssetType of validSubAssets) {
    if (subAssetType === '199' || subAssetType === '299') {
      return {
        valid: false,
        error: `סוג משנה לא יכול להיות סוג מורכב (199, 299). נכסי משנה חייבים להיות סוגי נכס פשוטים`
      };
    }
  }

  if (validSubAssets.length < 2) {
    return {
      valid: false,
      error: `כאשר סוג הנכס הראשי הוא ${mainAssetType}, חייב להיות לפחות 2 נכסי משנה. נמצאו ${validSubAssets.length} נכסי משנה בלבד`
    };
  }

  // Validate that sub asset types are filled in order without gaps
  const orderValidation = await validateSubAssetOrder(subAssetTypes);
  if (!orderValidation.valid) {
    return orderValidation;
  }

  if (mainAssetSize != null && mainAssetSize > 0) {
    const totalSubAssetSize = subAssetSizes
      .filter((size, idx) => {
        const hasType = subAssetTypes[idx] && subAssetTypes[idx]!.trim() !== '';
        return hasType && size != null && size !== '';
      })
      .map(size => {
        // Convert to number if it's a string
        if (typeof size === 'string') {
          const num = parseFloat(size);
          return isNaN(num) ? 0 : num;
        }
        return typeof size === 'number' ? size : 0;
      })
      .reduce((sum, size) => sum + size, 0);

    if (Math.abs(totalSubAssetSize - mainAssetSize) > 0.01) {
      return {
        valid: false,
        error: `כאשר סוג הנכס הראשי הוא ${mainAssetType}, סכום שטחי המשנה חייב להיות שווה לשטח הראשי`
      };
    }
  }

  const { data: building, error: buildingError } = await supabase
    .from('buildings')
    .select('tax_region')
    .eq('building_number', buildingNumber)
    .maybeSingle();

  if (buildingError || !building) {
    return { valid: false, error: 'שגיאה באימות הבניין' };
  }

  if (building.tax_region == null) {
    return { valid: true };
  }

  const buildingTaxRegions = String(building.tax_region).split(',').map(r => r.trim());

  for (const subAssetType of validSubAssets) {
    let query = supabase
      .from('asset_types')
      .select('*')
      .eq('name', subAssetType);

    // Filter by building's tax region
    if (buildingTaxRegions.length > 0) {
      query = query.in('tax_region', buildingTaxRegions.map(r => parseInt(r)));
    }

    const { data: assetTypes, error: assetTypeError } = await query;

    if (assetTypeError) {
      return { valid: false, error: `שגיאה באימות סוג נכס משנה ${subAssetType}` };
    }

    if (!assetTypes || assetTypes.length === 0) {
      return { valid: false, error: `סוג נכס משנה "${subAssetType}" לא קיים באזור המס של הבניין` };
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
    if (!mainAssetType || !buildingNumber) {
      return { valid: true };
    }
    return await validateAssetTypeComplete(buildingNumber, mainAssetType, assetSize || 0);
  },

  validateSubAssetTypeComplete: async (
    buildingNumber: number | null,
    subAssetType: string | undefined,
    subAssetSize: number | undefined
  ): Promise<ValidationResult> => {
    if (!subAssetType || !buildingNumber) {
      return { valid: true };
    }

    // Sub asset types cannot be complex types (199 or 299)
    if (subAssetType === '199' || subAssetType === '299') {
      return {
        valid: false,
        error: 'סוג משנה לא יכול להיות סוג מורכב (199, 299). נכסי משנה חייבים להיות סוגי נכס פשוטים'
      };
    }

    return await validateAssetTypeComplete(buildingNumber, subAssetType, subAssetSize || 0);
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

  validateSubAssetSizeRequiresType: async (
    subAssetTypes: (string | undefined)[],
    subAssetSizes: (number | undefined)[]
  ): Promise<ValidationResult> => {
    return await validateSubAssetSizeRequiresType(subAssetTypes, subAssetSizes);
  },

  validateSubAssetSizeMatchesMain: async (
    mainAssetSize: number | undefined,
    subAssetTypes: (string | undefined)[],
    subAssetSizes: (number | undefined)[]
  ): Promise<ValidationResult> => {
    return await validateSubAssetSizeMatchesMain(mainAssetSize, subAssetTypes, subAssetSizes);
  },

  validateSubAssetOrder: async (
    subAssetTypes: (string | undefined)[]
  ): Promise<ValidationResult> => {
    return await validateSubAssetOrder(subAssetTypes);
  },

  validateMinimumSubAssets: async (
    subAssetTypes: (string | undefined)[]
  ): Promise<ValidationResult> => {
    return await validateMinimumSubAssets(subAssetTypes);
  },

  validateOnlyComplexTypesCanHaveSubAssets: async (
    mainAssetType: string | undefined,
    subAssetTypes: (string | undefined)[]
  ): Promise<ValidationResult> => {
    return await validateOnlyComplexTypesCanHaveSubAssets(mainAssetType, subAssetTypes);
  },

  validateComplexTypesMustHaveSubAssets: async (
    mainAssetType: string | undefined,
    subAssetTypes: (string | undefined)[]
  ): Promise<ValidationResult> => {
    return await validateComplexTypesMustHaveSubAssets(mainAssetType, subAssetTypes);
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

    const taxRegionStr = typeof taxRegion === 'number' ? taxRegion.toString() : taxRegion;
    const trimmedValue = taxRegionStr.trim();

    console.log('[checkTaxRegionInvalid] Checking tax region:', taxRegion, 'trimmed:', trimmedValue);

    // Check format first
    const formatResult = await buildingValidators.validateTaxRegion(taxRegion, true);
    console.log('[checkTaxRegionInvalid] Format validation result:', formatResult);
    if (!formatResult.valid) return true;

    // Then check if all components exist in asset_types
    const components = trimmedValue.includes(',')
      ? trimmedValue.split(',').map(v => v.trim())
      : [trimmedValue];

    console.log('[checkTaxRegionInvalid] Checking components:', components);

    for (const component of components) {
      const { count, error } = await supabase
        .from('asset_types')
        .select('tax_region', { count: 'exact', head: true })
        .eq('tax_region', parseInt(component));

      console.log('[checkTaxRegionInvalid] Component', component, 'count:', count, 'error:', error);

      if (error || !count || count === 0) {
        console.log('[checkTaxRegionInvalid] Tax region component', component, 'is INVALID');
        return true;
      }
    }

    console.log('[checkTaxRegionInvalid] All components valid, returning false');
    return false;
  },

  validateAllFields: async (building: any): Promise<{ valid: boolean; errors: Record<string, string> }> => {
    const errors: Record<string, string> = {};

    // Validate building_number
    if (building.building_number != null) {
      const results = await validateField('building', 'building_number', building.building_number);
      for (const result of results) {
        if (!result.valid) {
          errors.building_number = result.error || 'Building number is invalid';
          break;
        }
      }
    }

    // Validate tax_region with all rules
    if (building.tax_region != null) {
      const taxRegionResult = await buildingValidators.validateTaxRegion(building.tax_region, false);
      if (!taxRegionResult.valid) {
        errors.tax_region = taxRegionResult.error || 'Tax region is invalid';
      }
    }

    // Validate has_elevator (should be boolean)
    if (building.has_elevator !== true && building.has_elevator !== false) {
      errors.has_elevator = 'Elevator field must be yes or no';
    }

    // Validate area_for_control (should be positive number if provided)
    if (building.area_for_control != null) {
      if (isNaN(Number(building.area_for_control)) || Number(building.area_for_control) < 0) {
        errors.area_for_control = 'Area for control must be a positive number';
      }
    }

    // Validate shared_area (should be positive number if provided)
    if (building.shared_area != null) {
      if (isNaN(Number(building.shared_area)) || Number(building.shared_area) < 0) {
        errors.shared_area = 'Shared area must be a positive number';
      }
    }

    // Validate area_for_control matches total_building_area if both exist
    if (building.area_for_control != null && building.total_building_area != null) {
      const controlArea = Number(building.area_for_control);
      const totalArea = Number(building.total_building_area);

      if (!isNaN(controlArea) && !isNaN(totalArea) && controlArea !== totalArea) {
        errors.area_for_control = 'שטח לבקרה חייב להיות שווה לשטח הכולל';
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
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
