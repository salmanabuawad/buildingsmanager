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

  positiveNumber: (value: number, fieldName: string): ValidationResult => {
    if (value < 0) {
      return { valid: false, error: `${fieldName} must be a positive number` };
    }
    return { valid: true };
  },

  email: (value: string, fieldName: string): ValidationResult => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return validators.pattern(value, emailPattern, fieldName, `${fieldName} must be a valid email address`);
  },
};

export const assetTypeValidators = {
  validateName: (name: string): ValidationResult => {
    let result = validators.required(name, 'Type name');
    if (!result.valid) return result;

    result = validators.exactLength(name.trim(), 3, 'Type name');
    if (!result.valid) return result;

    result = validators.digitsOnly(name, 'Type name');
    if (!result.valid) return result;

    return { valid: true };
  },

  validateNameWithRules: async (name: string): Promise<ValidationResult> => {
    const rules = await loadValidationRules();

    const requiredRule = rules.find(r => r.rule_key === 'asset_type_name_required' && r.enabled);
    if (requiredRule) {
      const result = validators.required(name, requiredRule.field_name);
      if (!result.valid) {
        return { valid: false, error: requiredRule.error_message || result.error };
      }
    }

    const lengthRule = rules.find(r => r.rule_key === 'asset_type_name_length' && r.enabled);
    if (lengthRule && lengthRule.value_numeric) {
      const result = validators.exactLength(name.trim(), lengthRule.value_numeric, lengthRule.field_name);
      if (!result.valid) {
        return { valid: false, error: lengthRule.error_message || result.error };
      }
    }

    const patternRule = rules.find(r => r.rule_key === 'asset_type_name_pattern' && r.enabled);
    if (patternRule && patternRule.value_text) {
      const pattern = new RegExp(patternRule.value_text);
      const result = validators.pattern(name, pattern, patternRule.field_name);
      if (!result.valid) {
        return { valid: false, error: patternRule.error_message || result.error };
      }
    }

    return { valid: true };
  },

  validateDescription: (description: string): ValidationResult => {
    return { valid: true };
  },

  validateTaxRegion: (taxRegion: string | number): ValidationResult => {
    if (!taxRegion && taxRegion !== 0) {
      return { valid: true };
    }
    return validators.numeric(taxRegion, 'Tax region');
  },
};

export const assetValidators = {
  validateAssetId: (assetId: string): ValidationResult => {
    return validators.required(assetId, 'Asset ID');
  },

  validateBuildingNumber: (buildingNumber: number | null): ValidationResult => {
    if (buildingNumber === null || buildingNumber === undefined) {
      return { valid: false, error: 'Building number is required' };
    }
    return validators.numeric(buildingNumber, 'Building number');
  },

  validatePayerId: (payerId: string): ValidationResult => {
    return { valid: true };
  },

  validateSize: (size: number, fieldName: string): ValidationResult => {
    const result = validators.numeric(size, fieldName);
    if (!result.valid) return result;

    return validators.positiveNumber(size, fieldName);
  },
};

export function validateAll(validations: ValidationResult[]): ValidationResult {
  for (const validation of validations) {
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
};

export const patterns = {
  threeDigits: /^\d{3}$/,
  digitsOnly: /^\d+$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  numeric: /^-?\d*\.?\d+$/,
};

export const measurementValidators = {
  validateDate: (date: string): ValidationResult => {
    return validators.required(date, 'Measurement date');
  },

  validateArea: (area: number, fieldName: string): ValidationResult => {
    const result = validators.numeric(area, fieldName);
    if (!result.valid) return result;

    return validators.positiveNumber(area, fieldName);
  },
};

export const buildingValidators = {
  validateBuildingNumber: (buildingNumber: number): ValidationResult => {
    const result = validators.numeric(buildingNumber, 'Building number');
    if (!result.valid) return result;

    return validators.positiveNumber(buildingNumber, 'Building number');
  },

  validateTaxRegion: (taxRegion: string | number | undefined): ValidationResult => {
    if (!taxRegion && taxRegion !== 0) {
      return { valid: true };
    }
    return validators.numeric(taxRegion, 'Tax region');
  },

  checkAreaMismatch: (totalAreaForControl: number | null, totalBuildingArea: number): boolean => {
    if (totalAreaForControl == null) return false;
    return totalAreaForControl !== totalBuildingArea;
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
