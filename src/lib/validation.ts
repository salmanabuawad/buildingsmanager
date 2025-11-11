export interface ValidationResult {
  valid: boolean;
  error?: string;
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
