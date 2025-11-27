import { api, ValidationRule } from './api';
import { supabase } from './supabase';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  matchedAssetTypeRecord?: string; // Information about which asset type record matched
}

export interface CrossTableValidationContext {
  entityType: string;
  entityData: any;
  joinFieldValue: any;
}

// Global in-memory store for validation rules
let inMemoryRules: ValidationRule[] = [];
let rulesLoaded = false;

// Global in-memory store for validation data
let inMemoryBuildings: any[] = [];
let inMemoryAssetTypes: any[] = [];
let inMemoryAllAssets: any[] = [];
let dataLoaded = false;

/**
 * Set validation rules in memory (called by ValidationContext on app startup)
 */
export function setValidationRules(rules: ValidationRule[]): void {
  inMemoryRules = rules;
  rulesLoaded = true;
  console.log(`[validation] Loaded ${rules.length} validation rules into memory`);
}

/**
 * Set validation data in memory (called by ValidationContext on app startup)
 */
export function setValidationData(data: { buildings: any[]; assetTypes: any[]; assets?: any[] }): void {
  inMemoryBuildings = data.buildings;
  inMemoryAssetTypes = data.assetTypes;
  if (data.assets) {
    inMemoryAllAssets = data.assets;
  }
  dataLoaded = true;
  console.log(`[validation] Loaded ${data.buildings.length} buildings, ${data.assetTypes.length} asset types, and ${inMemoryAllAssets.length} assets into memory`);
}

/**
 * Set all assets in memory (for uniqueness validation)
 */
export function setAllAssets(assets: any[]): void {
  inMemoryAllAssets = assets;
  console.log(`[validation] Loaded ${assets.length} assets into memory for uniqueness validation`);
}

/**
 * Get all assets from memory (synchronous)
 */
export function getAllAssets(): any[] {
  if (!dataLoaded) {
    console.warn('[validation] Assets not yet loaded, returning empty array');
    return [];
  }
  return inMemoryAllAssets;
}

/**
 * Get assets by asset_id from memory (synchronous)
 */
export function getAssetsByAssetId(assetId: string | number): any[] {
  const assets = getAllAssets();
  const assetIdNum = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
  return assets.filter(a => {
    const aId = typeof a.asset_id === 'string' ? parseInt(a.asset_id, 10) : a.asset_id;
    return aId === assetIdNum;
  });
}

/**
 * Get building number for an asset_id from memory (synchronous)
 * Returns the building_number if asset exists, null otherwise
 * An asset_id should only belong to one building
 */
export function getBuildingNumberForAssetId(assetId: string | number): number | null {
  const assets = getAllAssets();
  const assetIdNum = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
  
  // Find the asset - there should only be one per asset_id
  const matchingAsset = assets.find(a => {
    const aId = typeof a.asset_id === 'string' ? parseInt(a.asset_id, 10) : a.asset_id;
    return aId === assetIdNum;
  });
  
  if (!matchingAsset) {
    return null;
  }
  
  const buildingNum = typeof matchingAsset.building_number === 'string' 
    ? parseInt(matchingAsset.building_number, 10) 
    : matchingAsset.building_number;
  
  return buildingNum;
}

/**
 * Get validation rules from memory (synchronous)
 */
export function getValidationRules(): ValidationRule[] {
  if (!rulesLoaded) {
    console.warn('[validation] Validation rules not yet loaded, returning empty array');
    return [];
  }
  return inMemoryRules;
}

/**
 * Get buildings from memory (synchronous)
 */
export function getBuildings(): any[] {
  if (!dataLoaded) {
    console.warn('[validation] Buildings not yet loaded, returning empty array');
    return [];
  }
  return inMemoryBuildings;
}

/**
 * Get asset types from memory (synchronous)
 */
export function getAssetTypes(): any[] {
  if (!dataLoaded) {
    console.warn('[validation] Asset types not yet loaded, returning empty array');
    return [];
  }
  return inMemoryAssetTypes;
}

/**
 * Get building by building number from memory (synchronous)
 */
export function getBuildingByNumber(buildingNumber: number | string | null | undefined): any | undefined {
  if (buildingNumber == null) return undefined;
  const buildings = getBuildings();
  // Compare as both number and string to handle type mismatches
  const buildingNumberNum = typeof buildingNumber === 'string' ? parseInt(buildingNumber, 10) : buildingNumber;
  return buildings.find(b => {
    const bNum = typeof b.building_number === 'string' ? parseInt(b.building_number, 10) : b.building_number;
    return bNum === buildingNumberNum;
  });
}

/**
 * Get asset types by name from memory (synchronous)
 */
export function getAssetTypesByName(name: string): any[] {
  const assetTypes = getAssetTypes();
  return assetTypes.filter(at => at.name === name && at.active === 'כן');
}

/**
 * Check if validation rules are loaded
 */
export function areValidationRulesLoaded(): boolean {
  return rulesLoaded;
}

/**
 * Check if validation data is loaded
 */
export function isValidationDataLoaded(): boolean {
  return dataLoaded;
}

// Legacy cache for backward compatibility (deprecated - use getValidationRules instead)
let cachedRules: ValidationRule[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60000;

/**
 * @deprecated Use getValidationRules() instead for synchronous access to in-memory rules
 */
export async function loadValidationRules(forceRefresh = false): Promise<ValidationRule[]> {
  // If rules are already in memory, return them immediately
  if (rulesLoaded && inMemoryRules.length > 0 && !forceRefresh) {
    return inMemoryRules;
  }

  const now = Date.now();

  if (!forceRefresh && cachedRules && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRules;
  }

  try {
    const rules = await api.validationRules.getEnabled();
    cachedRules = rules;
    cacheTimestamp = now;
    // Also update in-memory rules
    setValidationRules(rules);
    return rules;
  } catch (error) {
    console.error('Failed to load validation rules:', error);
    return cachedRules || inMemoryRules || [];
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

export async function applyRule(rule: ValidationRule, value: any, taxRegion?: string, lookupData?: { assetTypes?: any[]; [key: string]: any }): Promise<ValidationResult> {
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

        // Use in-memory data instead of database query
        if (rule.compare_table === 'asset_types') {
          const assetTypes = getAssetTypes();
          let matching = assetTypes.filter(at => {
            const fieldValue = at[rule.compare_field!];
            return fieldValue != null && String(fieldValue) === String(queryValue);
          });

          // Filter by tax_region if provided
          if (taxRegion && taxRegion.trim() !== '') {
            const taxRegionNum = parseInt(taxRegion.trim());
            if (!isNaN(taxRegionNum)) {
              matching = matching.filter(at => at.tax_region === taxRegionNum);
            }
          }

          if (matching.length === 0) {
            return {
              valid: false,
              error: errorMessage || `${fieldName} value "${value}" does not exist in asset types`
            };
          }
          return { valid: true };
        } else if (rule.compare_table === 'buildings') {
          const buildings = getBuildings();
          const matching = buildings.filter(b => {
            const fieldValue = b[rule.compare_field!];
            return fieldValue != null && String(fieldValue) === String(queryValue);
          });

          if (matching.length === 0) {
            return {
              valid: false,
              error: errorMessage || `${fieldName} value "${value}" does not exist in buildings`
            };
          }
          return { valid: true };
        } else if (rule.compare_table === 'assets') {
          // Use in-memory assets for existence check
          const allAssets = getAllAssets();
          const matching = allAssets.filter(a => {
            const fieldValue = a[rule.compare_field!];
            if (fieldValue == null) return false;
            
            // Handle numeric comparison for asset_id
            if (rule.compare_field === 'asset_id') {
              const fieldNum = typeof fieldValue === 'string' ? parseInt(fieldValue, 10) : fieldValue;
              const queryNum = typeof queryValue === 'string' ? parseInt(queryValue, 10) : queryValue;
              return fieldNum === queryNum;
            }
            
            return String(fieldValue) === String(queryValue);
          });

          if (matching.length === 0) {
            return {
              valid: false,
              error: errorMessage || `${fieldName} value "${value}" does not exist in assets`
            };
          }
          return { valid: true };
        } else {
          // For other tables, return valid (can be extended later if needed)
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[validation] Exists in table validation for ${rule.compare_table} not fully implemented with in-memory data`);
          }
          return { valid: true };
        }
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
  assetTypeName: string,
  taxRegion?: string,
  cachedData?: { assetTypes?: any[]; building?: any }
): Promise<ValidationResult> {
  try {
    // CRITICAL: If taxRegion is provided from tab, COMPLETELY IGNORE the building's tax_region
    // The building may have multiple tax regions (e.g., "10,40"), but we ONLY use the tab's single tax region
    // Only fetch building data if taxRegion is NOT provided (for fallback)
    let buildingTaxRegions: string[];
    
    // Check if taxRegion is provided and not empty (handle both undefined and empty string)
    if (taxRegion && taxRegion.trim() !== '') {
      // CRITICAL: Use ONLY the provided taxRegion - IGNORE building tax_region completely
      // This ensures that even if building has "10,40", we only use the tab's tax region (e.g., "10")
      const tabTaxRegion = taxRegion.trim();
      // Set to ONLY the tab's tax region - building.tax_region is completely ignored
      buildingTaxRegions = [tabTaxRegion];
    } else {
      // Use cached building or get from in-memory store
      let building = cachedData?.building;
      
      if (!building) {
        building = getBuildingByNumber(buildingNumber);
        
        if (!building) {
          console.error('Building not found in memory:', buildingNumber);
          return { valid: false, error: `Building ${buildingNumber} not found` };
        }
      }

      if (building.tax_region == null) {
        return { valid: true };
      }

      // Use all tax regions from the building (only when taxRegion is not provided)
      buildingTaxRegions = String(building.tax_region).split(',').map(r => r.trim());
    }
    
    // Validate asset types 199 and 299 based on the passed tax region (from tab)
    // IMPORTANT: When taxRegion is provided, validate according to that tax region ONLY
    // This completely ignores the building's tax_region when taxRegion is provided
    if (assetTypeName === '299') {
      // Asset type 299 is only valid in tax region 40
      // Check against the passed tax region (from tab), not the building's tax_region
      if (!buildingTaxRegions.includes('40')) {
        return { valid: false, error: 'סוג נכס 299 תקף רק במבנים עם אזור מס 40' };
      }
    } else if (assetTypeName === '199') {
      // Asset type 199 is valid in all tax regions EXCEPT 40
      // Check against the passed tax region (from tab), not the building's tax_region
      if (buildingTaxRegions.includes('40')) {
        return { valid: false, error: 'סוג נכס 199 לא תקף במבנים עם אזור מס 40. סוג נכס 199 תקף בכל אזורי המס למעט 40' };
      }
    }

    // Use cached asset types if available, otherwise use in-memory data
    let assetTypes = cachedData?.assetTypes;
    if (!assetTypes || !Array.isArray(assetTypes)) {
      assetTypes = getAssetTypesByName(assetTypeName);
    }
    
    if (assetTypes && Array.isArray(assetTypes)) {
      // Filter asset types
      let matchingAssetTypes = assetTypes.filter(at => 
        at.name === assetTypeName && at.active === 'כן'
      );

      // Apply tax region filtering
      if (assetTypeName === '199') {
        matchingAssetTypes = matchingAssetTypes.filter(at => at.tax_region !== 40);
      } else if (assetTypeName === '299') {
        matchingAssetTypes = matchingAssetTypes.filter(at => at.tax_region === 40);
      } else if (buildingTaxRegions.length > 0) {
        const taxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        matchingAssetTypes = matchingAssetTypes.filter(at => 
          at.tax_region != null && taxRegionNumbers.includes(Number(at.tax_region))
        );
      }

      if (matchingAssetTypes.length === 0) {
        if (assetTypeName === '199') {
          return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים או זמין רק באזור מס 40` };
        } else if (assetTypeName === '299') {
          return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים באזור מס 40` };
        }
        return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים באזור המס של המבנה` };
      }
    } else {
      // Use in-memory asset types
      const inMemoryAssetTypes = getAssetTypesByName(assetTypeName);
      let matchingAssetTypes = inMemoryAssetTypes;

      // Apply tax region filtering
      if (assetTypeName === '199') {
        matchingAssetTypes = matchingAssetTypes.filter(at => at.tax_region !== 40);
      } else if (assetTypeName === '299') {
        matchingAssetTypes = matchingAssetTypes.filter(at => at.tax_region === 40);
      } else if (buildingTaxRegions.length > 0) {
        const taxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        matchingAssetTypes = matchingAssetTypes.filter(at => 
          at.tax_region != null && taxRegionNumbers.includes(Number(at.tax_region))
        );
      }

      if (matchingAssetTypes.length === 0) {
        if (assetTypeName === '199') {
          return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים או זמין רק באזור מס 40` };
        } else if (assetTypeName === '299') {
          return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים באזור מס 40` };
        }
        return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים באזור המס של המבנה` };
      }
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
  assetData?: any,
  taxRegion?: string,
  cachedData?: { assetTypes?: any[]; building?: any }
): Promise<ValidationResult> {
  try {
    // IMPORTANT: If taxRegion is provided from the tab, skip validateAssetTypeForBuildingTaxRegion
    // and directly validate that the asset type exists for the provided tax region
    if (taxRegion && taxRegion.trim() !== '') {
      // Direct validation: check if asset type exists for the provided tax region
      // Use cached assetTypes if provided to avoid database query
      const taxRegionNum = parseInt(taxRegion.trim());
      
      // Handle special cases for asset types 199 and 299 (fast path - no DB query needed)
      if (assetTypeName === '199') {
        // Asset type 199 is valid in all tax regions except 40
        if (taxRegionNum === 40) {
          return { valid: false, error: 'סוג נכס 199 לא תקף במבנים עם אזור מס 40. סוג נכס 199 תקף בכל אזורי המס למעט 40' };
        }
        // For 199, we still need to check it exists (but not in tax region 40)
        // This is a quick check - if taxRegion is not 40, 199 is valid
      } else if (assetTypeName === '299') {
        // Asset type 299 is only valid in tax region 40
        if (taxRegionNum !== 40) {
          return { valid: false, error: 'סוג נכס 299 תקף רק במבנים עם אזור מס 40' };
        }
        // For 299, we need to check it exists in tax region 40
      }
      
      // Use cached asset types if available, otherwise query database
      if (cachedData?.assetTypes && Array.isArray(cachedData.assetTypes)) {
        let matchingAssetTypes = cachedData.assetTypes.filter(at => 
          at.name === assetTypeName && at.active === 'כן'
        );

        if (assetTypeName === '199') {
          matchingAssetTypes = matchingAssetTypes.filter(at => at.tax_region !== 40);
        } else if (assetTypeName === '299') {
          matchingAssetTypes = matchingAssetTypes.filter(at => at.tax_region === 40);
        } else {
          matchingAssetTypes = matchingAssetTypes.filter(at => at.tax_region === taxRegionNum);
        }

        if (matchingAssetTypes.length === 0) {
          if (assetTypeName === '199') {
            return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים או זמין רק באזור מס 40` };
          } else if (assetTypeName === '299') {
            return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים באזור מס 40` };
          }
          return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים באזור מס ${taxRegionNum}` };
        }
      } else {
        // Use in-memory asset types
        const inMemoryAssetTypes = getAssetTypesByName(assetTypeName);
        let matchingAssetTypes = inMemoryAssetTypes;
        
        // Apply tax region filtering
        if (assetTypeName === '199') {
          matchingAssetTypes = matchingAssetTypes.filter(at => at.tax_region !== 40);
        } else if (assetTypeName === '299') {
          matchingAssetTypes = matchingAssetTypes.filter(at => at.tax_region === 40);
        } else {
          matchingAssetTypes = matchingAssetTypes.filter(at => at.tax_region === taxRegionNum);
        }
        
        if (matchingAssetTypes.length === 0) {
          if (assetTypeName === '199') {
            return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים או זמין רק באזור מס 40` };
          } else if (assetTypeName === '299') {
            return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים באזור מס 40` };
          }
          return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים באזור מס ${taxRegionNum}` };
        }
      }
      
      // IMPORTANT: When taxRegion is provided, we've already validated the asset type exists for that tax region
      // Now we need to fetch the building for size validation, but we'll use the provided taxRegion, NOT building.tax_region
      // Continue to size validation below, but ensure we use the provided taxRegion
    } else {
      // No taxRegion provided - use the original validation that checks building tax_region
      const taxRegionValidation = await validateAssetTypeForBuildingTaxRegion(buildingNumber, assetTypeName, taxRegion, cachedData);
      if (!taxRegionValidation.valid) {
        return taxRegionValidation;
      }
    }

    // Use cached building if available, otherwise fetch from database
    let building = cachedData?.building;
    
    if (!building) {
      building = getBuildingByNumber(buildingNumber);
      
      if (!building) {
        console.error('Building not found in memory:', buildingNumber);
        return { valid: false, error: `Building ${buildingNumber} not found` };
      }
    }

    // Use cached asset types if available, otherwise use in-memory data
    let assetTypes: any[];
    
    if (cachedData?.assetTypes && Array.isArray(cachedData.assetTypes)) {
      // Filter from cache
      assetTypes = cachedData.assetTypes.filter(at => 
        at.name === assetTypeName && at.active === 'כן'
      );

      // Determine tax regions to filter by
      let buildingTaxRegions: string[];
      if (taxRegion && taxRegion.trim() !== '') {
        buildingTaxRegions = [taxRegion.trim()];
      } else {
        buildingTaxRegions = building.tax_region != null
          ? String(building.tax_region).split(',').map(r => r.trim())
          : [];
      }

      // Apply tax region filtering
      if (assetTypeName === '199') {
        assetTypes = assetTypes.filter(at => at.tax_region !== 40);
      } else if (assetTypeName === '299') {
        assetTypes = assetTypes.filter(at => at.tax_region === 40);
      } else if (buildingTaxRegions.length > 0) {
        const taxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        assetTypes = assetTypes.filter(at => 
          at.tax_region != null && taxRegionNumbers.includes(Number(at.tax_region))
        );
      }

      if (assetTypes.length === 0) {
        return { valid: false, error: 'שגיאה באימות סוג הנכס' };
      }
    } else {
      // Use in-memory asset types
      assetTypes = getAssetTypesByName(assetTypeName);

      let buildingTaxRegions: string[];
      if (taxRegion && taxRegion.trim() !== '') {
        buildingTaxRegions = [taxRegion.trim()];
      } else {
        buildingTaxRegions = building.tax_region != null
          ? String(building.tax_region).split(',').map(r => r.trim())
          : [];
      }

      // Apply tax region filtering to in-memory asset types
      if (assetTypeName === '199') {
        assetTypes = assetTypes.filter(at => at.tax_region !== 40);
      } else if (assetTypeName === '299') {
        assetTypes = assetTypes.filter(at => at.tax_region === 40);
      } else if (buildingTaxRegions.length > 0) {
        const taxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        assetTypes = assetTypes.filter(at => 
          at.tax_region != null && taxRegionNumbers.includes(Number(at.tax_region))
        );
      }

      if (assetTypes.length === 0) {
        return { valid: false, error: 'שגיאה באימות סוג הנכס' };
      }
    }

    // Helper function to check if a single asset type entry matches all requirements
    const checkAssetTypeEntry = (assetType: any): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];

      // Step 2: Check asset area is within range (min_size/max_size from asset_types table)
      if (assetSize != null && assetSize > 0) {
        const minSize = assetType.min_size != null ? Number(assetType.min_size) : null;
        const maxSize = assetType.max_size != null ? Number(assetType.max_size) : null;
        const numericAssetSize = Number(assetSize);

        if (minSize != null && numericAssetSize < minSize) {
          errors.push(`גודל הנכס (${numericAssetSize}) קטן מהמינימום המותר (${minSize})`);
        }

        if (maxSize != null && numericAssetSize > maxSize) {
          errors.push(`גודל הנכס (${numericAssetSize}) גדול מהמקסימום המותר (${maxSize})`);
        }
      }

      // Step 3: Check penthouse requirement
      // NOTE: Penthouse validation only applies to main assets, not sub-assets
      // If assetData is not provided, it means we're validating a sub-asset, so skip penthouse check
      if (assetData != null && assetType.penthouse != null && assetType.penthouse.trim() !== '') {
        const requiredValue = String(assetType.penthouse).trim();
        const assetPenthouse = assetData?.penthouse;
        
        // Normalize asset penthouse value to a boolean-like check
        // Handle various formats: 'כן', 'yes', true, 'true', null, undefined, empty string
        let isAssetPenthouse = false;
        if (assetPenthouse != null && assetPenthouse !== '') {
          if (typeof assetPenthouse === 'boolean') {
            isAssetPenthouse = assetPenthouse;
          } else {
            const strValue = String(assetPenthouse).trim();
            // Check for Hebrew 'כן' or English 'yes'/'true' (case-insensitive)
            isAssetPenthouse = strValue === 'כן' || 
                              strValue.toLowerCase() === 'yes' || 
                              strValue.toLowerCase() === 'true';
          }
        }
        
        // Normalize required value
        const requiredIsYes = requiredValue === 'כן' || requiredValue.toLowerCase() === 'yes';
        const requiredIsNo = requiredValue === 'לא' || requiredValue.toLowerCase() === 'no';

        if (requiredIsYes) {
          // Asset type requires penthouse
          if (!isAssetPenthouse) {
            errors.push('דורש דירת גג, אבל הנכס לא מסומן כדירת גג');
          }
        } else if (requiredIsNo) {
          // Asset type does NOT allow penthouse
          if (isAssetPenthouse) {
            errors.push('לא תקף לדירת גג, אבל הנכס מסומן כדירת גג');
          }
        }
      }

      // Step 4: Check building boolean values (elevator, single_double_family, condo, townhouses, etc.)
      // NOTE: Building-level validations only apply to main assets, not sub-assets
      // If assetData is not provided, it means we're validating a sub-asset, so skip building-level checks
      if (assetData != null) {
        // Step 4a: Check elevator requirement
        if (assetType.elevator != null && assetType.elevator.trim() !== '') {
          const requiredValue = assetType.elevator.toLowerCase();
          const buildingValue = building.elevator ? building.elevator.toLowerCase() : '';

          if (requiredValue === 'כן' || requiredValue === 'yes') {
            if (buildingValue !== 'כן' && buildingValue !== 'yes') {
              errors.push('דורש מעלית, אבל במבנה אין מעלית');
            }
          } else if (requiredValue === 'לא' || requiredValue === 'no') {
            if (buildingValue === 'כן' || buildingValue === 'yes') {
              errors.push('מיועד למבנים ללא מעלית, אבל במבנה יש מעלית');
            }
          }
        }

        // Step 4b: Validate single_double_family
        if (assetType.single_double_family != null && assetType.single_double_family.trim() !== '') {
          const requiredValue = assetType.single_double_family.toLowerCase();
          const buildingValue = building.single_double_family ? building.single_double_family.toLowerCase() : '';

          if (requiredValue === 'כן' || requiredValue === 'yes') {
            if (buildingValue !== 'כן' && buildingValue !== 'yes') {
              errors.push('דורש משפחה יחידה/דו משפחתי, אבל המבנה לא מסומן ככזה');
            }
          }
        }

        // Step 4c: Validate condo
        if (assetType.condo != null && assetType.condo.trim() !== '') {
          const requiredValue = assetType.condo.toLowerCase();
          const buildingValue = building.condo ? building.condo.toLowerCase() : '';

          if (requiredValue === 'כן' || requiredValue === 'yes') {
            if (buildingValue !== 'כן' && buildingValue !== 'yes') {
              errors.push('דורש דירת גן, אבל המבנה לא מסומן ככזה');
            }
          }
        }

        // Step 4d: Validate townhouses
        if (assetType.townhouses != null && assetType.townhouses.trim() !== '') {
          const requiredValue = assetType.townhouses.toLowerCase();
          const buildingValue = building.townhouses ? building.townhouses.toLowerCase() : '';

          if (requiredValue === 'כן' || requiredValue === 'yes') {
            if (buildingValue !== 'כן' && buildingValue !== 'yes') {
              errors.push('דורש טוריים, אבל המבנה לא מסומן ככזה');
            }
          }
        }

        // Step 4e: Validate basement (if exists in asset_types)
        if (assetType.basement != null && assetType.basement.trim() !== '') {
          const requiredValue = assetType.basement.toLowerCase();
          const buildingValue = building.basement ? building.basement.toLowerCase() : '';

          if (requiredValue === 'כן' || requiredValue === 'yes') {
            if (buildingValue !== 'כן' && buildingValue !== 'yes') {
              errors.push('דורש מרתף, אבל המבנה לא מסומן ככזה');
            }
          }
        }
      }

      return { valid: errors.length === 0, errors };
    };

    // Check all asset type entries - if ANY entry is valid, return valid
    const allErrors: string[] = [];
    for (const assetType of assetTypes) {
      const result = checkAssetTypeEntry(assetType);
      if (result.valid) {
        // Found a matching entry, asset type is valid
        // Return information about which asset type record matched
        // Build comprehensive matched record info with ALL asset type fields (including empty ones)
        const fields: string[] = [];
        fields.push(`סוג נכס=${assetType.name || assetTypeName || 'לא מוגדר'}`);
        fields.push(`תיאור=${assetType.description || 'לא מוגדר'}`);
        fields.push(`אזור מיסים=${assetType.tax_region != null ? assetType.tax_region : 'לא מוגדר'}`);
        fields.push(`מעלית=${assetType.elevator || 'לא מוגדר'}`);
        fields.push(`בית פרטי חד/דו משפחתי=${assetType.single_double_family || 'לא מוגדר'}`);
        fields.push(`דירת גג=${assetType.penthouse || 'לא מוגדר'}`);
        fields.push(`בית משותף=${assetType.condo || 'לא מוגדר'}`);
        fields.push(`טוריים=${assetType.townhouses || 'לא מוגדר'}`);
        fields.push(`מרתף=${assetType.basement || assetType.shelter || 'לא מוגדר'}`);
        fields.push(`מינימום=${assetType.min_size != null ? assetType.min_size : 'לא מוגדר'}`);
        fields.push(`מקסימום=${assetType.max_size != null ? assetType.max_size : 'לא מוגדר'}`);
        
        const matchedRecordInfo = `תואם לרישום מסוג נכס: ${fields.join(', ')}`;
        return { valid: true, matchedAssetTypeRecord: matchedRecordInfo };
      }
      // Collect errors from this entry (we'll use them if all entries fail)
      allErrors.push(...result.errors);
    }

    // All entries failed validation - return error with unique error messages
    const uniqueErrors = Array.from(new Set(allErrors));
    return {
      valid: false,
      error: `סוג הנכס "${assetTypeName}" לא תקין: ${uniqueErrors.join('; ')}`
    };
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
  subAssetSizes: (number | undefined)[],
  taxRegion?: string,
  cachedData?: { assetTypes?: any[]; building?: any }
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

  // CRITICAL: If taxRegion is provided from tab, COMPLETELY IGNORE the building's tax_region
  // The building may have multiple tax regions (e.g., "10,40"), but we ONLY use the tab's single tax region
  // Only fetch building data if taxRegion is NOT provided (for fallback)
  let buildingTaxRegions: string[];
  
  // Check if taxRegion is provided and not empty (handle both undefined and empty string)
  if (taxRegion && taxRegion.trim() !== '') {
    // CRITICAL: Use ONLY the provided taxRegion - IGNORE building tax_region completely
    // This ensures that even if building has "10,40", we only use the tab's tax region (e.g., "10")
    const tabTaxRegion = taxRegion.trim();
    console.log('[validateSubAssetsFor199Or299] TAB TAX REGION PROVIDED - Using ONLY tab tax region, IGNORING building tax_region:', {
      tabTaxRegion: tabTaxRegion,
      buildingNumber: buildingNumber,
      mainAssetType: mainAssetType,
      willUse: 'TAB TAX REGION ONLY',
      buildingTaxRegionWillBeIgnored: true
    });
    // Set to ONLY the tab's tax region - building.tax_region is completely ignored
    buildingTaxRegions = [tabTaxRegion];
  } else {
    // Fallback: if no taxRegion provided, use cached building or fetch building and use its tax_region
    let building = cachedData?.building;
    
      if (!building) {
        building = getBuildingByNumber(buildingNumber);
        
        if (!building) {
          return { valid: false, error: `Building ${buildingNumber} not found` };
        }
      }

    if (building.tax_region == null) {
      return { valid: true };
    }

    // Use all tax regions from the building (only when taxRegion is not provided)
    buildingTaxRegions = String(building.tax_region).split(',').map(r => r.trim());
  }

  // Use cached asset types if available, otherwise query database
  if (validSubAssets.length > 0) {
    if (cachedData?.assetTypes && Array.isArray(cachedData.assetTypes)) {
      // Filter from cache
      let matchingAssetTypes = cachedData.assetTypes.filter(at => 
        validSubAssets.includes(at.name) && at.active === 'כן'
      );

      // Filter by tax region if provided
      if (buildingTaxRegions.length > 0) {
        const taxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        matchingAssetTypes = matchingAssetTypes.filter(at => 
          at.tax_region != null && taxRegionNumbers.includes(Number(at.tax_region))
        );
      }

      // Create a set of found asset types for quick lookup
      const foundAssetTypes = new Set(matchingAssetTypes.map(at => at.name));

      // Check each sub-asset type against the cache results
      for (const subAssetType of validSubAssets) {
        if (!foundAssetTypes.has(subAssetType)) {
          return { valid: false, error: `סוג נכס משנה "${subAssetType}" לא קיים באזור המס של המבנה` };
        }
      }
    } else {
      // Use in-memory asset types
      const allAssetTypes = getAssetTypes();
      let matchingAssetTypes = allAssetTypes.filter(at => 
        validSubAssets.includes(at.name) && at.active === 'כן'
      );

      // Filter by tax region if provided
      if (buildingTaxRegions.length > 0) {
        const taxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        matchingAssetTypes = matchingAssetTypes.filter(at => 
          at.tax_region != null && taxRegionNumbers.includes(Number(at.tax_region))
        );
      }

      const foundAssetTypes = new Set(matchingAssetTypes.map(at => at.name));

      for (const subAssetType of validSubAssets) {
        if (!foundAssetTypes.has(subAssetType)) {
          return { valid: false, error: `סוג נכס משנה "${subAssetType}" לא קיים באזור המס של המבנה` };
        }
      }
    }
  }

  return { valid: true };
}

export async function validateField(
  entityType: string,
  fieldName: string,
  value: any,
  validationRulesOrTaxRegion?: ValidationRule[] | string,
  taxRegionOrLookupData?: string | { assetTypes?: any[]; [key: string]: any },
  lookupData?: { assetTypes?: any[]; [key: string]: any }
): Promise<ValidationResult[]> {
  // Handle backward compatibility: check if first optional param is ValidationRule[] or string
  let validationRules: ValidationRule[];
  let taxRegion: string | undefined;
  let lookup: { assetTypes?: any[]; [key: string]: any } | undefined;
  
  if (Array.isArray(validationRulesOrTaxRegion)) {
    // New signature: validationRules provided as 4th param
    validationRules = validationRulesOrTaxRegion;
    taxRegion = typeof taxRegionOrLookupData === 'string' ? taxRegionOrLookupData : undefined;
    lookup = typeof taxRegionOrLookupData === 'object' ? taxRegionOrLookupData : lookupData;
  } else {
    // Old signature: taxRegion (or nothing) provided as 4th param, use in-memory validation rules
    validationRules = getValidationRules();
    // If validationRulesOrTaxRegion is a string, it's taxRegion; otherwise undefined
    taxRegion = typeof validationRulesOrTaxRegion === 'string' ? validationRulesOrTaxRegion : undefined;
    // If taxRegionOrLookupData is an object, it's lookupData; otherwise undefined
    lookup = typeof taxRegionOrLookupData === 'object' ? taxRegionOrLookupData : lookupData;
  }
  
  // Safety check: ensure validationRules is always an array
  if (!Array.isArray(validationRules)) {
    console.error('[validateField] validationRules is not an array, using empty array:', validationRules);
    validationRules = [];
  }
  
  const fieldRules = validationRules.filter(
    r => r.entity_type === entityType && r.field_name === fieldName && r.enabled && r.rule_type !== 'cross_table_comparison'
  );

  if (process.env.NODE_ENV === 'development') {
    console.log(`validateField(${entityType}, ${fieldName}, ${value}, taxRegion: ${taxRegion}) - Found ${fieldRules.length} rules`, fieldRules.map(r => r.rule_type));
  }

  if (value == null || value === '') {
    const requiredRule = fieldRules.find(r => r.rule_type === 'required');
    if (requiredRule) {
      const result = await applyRule(requiredRule, value, taxRegion, lookup);
      if (!result.valid) {
        return [result];
      }
    }
    return [{ valid: true }];
  }

  const results: ValidationResult[] = [];
  for (const rule of fieldRules) {
    const result = await applyRule(rule, value, taxRegion, lookup);
    results.push(result);
  }

  return results;
}

export async function validateEntity(
  entityType: string,
  entityData: Record<string, any>
): Promise<Record<string, ValidationResult[]>> {
  const rules = getValidationRules();
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

  validateBuildingExists: async (buildingNumber: number | string | null, validationRules?: any[], cachedData?: any): Promise<ValidationResult> => {
    if (!buildingNumber && buildingNumber !== 0) {
      return { valid: false, error: 'מספר מבנה נדרש' };
    }

    // Use in-memory buildings if available
    const building = getBuildingByNumber(buildingNumber);
    if (!building) {
      // If not found in memory, try querying the database as a fallback
      try {
        const { supabase } = await import('./supabase');
        const buildingNumberNum = typeof buildingNumber === 'string' ? parseInt(buildingNumber, 10) : buildingNumber;
        const { data, error } = await supabase
          .from('buildings')
          .select('building_number')
          .eq('building_number', buildingNumberNum)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.error('Error checking building existence:', error);
          // If we can't check, return valid to avoid blocking
          return { valid: true };
        }
        
        if (!data) {
          return { valid: false, error: `מבנה ${buildingNumber} לא קיים במערכת` };
        }
        
        return { valid: true };
      } catch (err) {
        console.error('Error in validateBuildingExists:', err);
        // If we can't check, return valid to avoid blocking
        return { valid: true };
      }
    }

    return { valid: true };
  },

  validateAssetIdUnique: async (assetId: string | number | null | undefined, currentAssetId?: number, validationRules?: any[], cachedData?: any, buildingNumber?: number | null): Promise<ValidationResult> => {
    if (!assetId) {
      return { valid: false, error: 'מזהה נכס נדרש' };
    }

    // Use in-memory assets for uniqueness check (must be loaded before validation)
    const allAssets = getAllAssets();
    
    if (allAssets.length === 0) {
      // Assets not loaded into memory - this should not happen if validation is called correctly
      console.warn('[validateAssetIdUnique] Assets not loaded into memory. Skipping uniqueness check.');
      return { valid: true };
    }

    // Get the building number this asset_id currently belongs to (from memory)
    const existingBuildingNum = getBuildingNumberForAssetId(assetId);
    const buildingNumberNum = buildingNumber != null ? (typeof buildingNumber === 'string' ? parseInt(buildingNumber, 10) : buildingNumber) : null;
    
    // If asset exists in the system
    if (existingBuildingNum !== null) {
      // Check if we're updating the same asset (exclude it from uniqueness check)
      if (currentAssetId) {
        const existingAssets = getAssetsByAssetId(assetId);
        const isSameAsset = existingAssets.some(a => {
          const aDbId = typeof a.id === 'string' ? parseInt(a.id, 10) : a.id;
          return aDbId === currentAssetId;
        });
        
        if (isSameAsset) {
          // Same asset being updated - check if building number is being changed
          if (buildingNumberNum != null && existingBuildingNum !== buildingNumberNum) {
            return { valid: false, error: `נכס ${assetId} כבר קיים במבנה ${existingBuildingNum}. לא ניתן לשנות את מספר המבנה של נכס קיים.` };
          }
          // Same asset, same building - OK for updates
          return { valid: true };
        }
      }
      
      // Asset exists in system - check if it's in a different building
      if (buildingNumberNum != null) {
        if (existingBuildingNum !== buildingNumberNum) {
          // Asset exists in a different building - not allowed
          return { valid: false, error: `מזהה נכס ${assetId} כבר קיים במבנה ${existingBuildingNum}. נכס יכול להיות קשור למבנה אחד בלבד.` };
        } else {
          // Asset exists in the same building - for new imports, this is a duplicate
          if (!currentAssetId) {
            return { valid: false, error: `מזהה נכס ${assetId} כבר קיים במבנה ${buildingNumberNum}` };
          }
        }
      } else {
        // Building number not provided, but asset exists
        return { valid: false, error: `מזהה נכס ${assetId} כבר קיים במערכת` };
      }
    }

    // Asset doesn't exist in system - unique
    return { valid: true };
  },

  validateAssetIdNotInOtherBuilding: async (assetId: string | number | null | undefined, buildingNumber: number | null | undefined, currentAssetId?: number): Promise<ValidationResult> => {
    // Skip validation if asset_id or building_number is missing
    if (!assetId || !buildingNumber) {
      return { valid: true };
    }

    // Use in-memory assets for cross-building check (must be loaded before validation)
    const allAssets = getAllAssets();
    
    if (allAssets.length === 0) {
      // Assets not loaded into memory - this should not happen if validation is called correctly
      console.warn('[validateAssetIdNotInOtherBuilding] Assets not loaded into memory. Skipping cross-building check.');
      return { valid: true };
    }

    // Get the building number this asset_id currently belongs to (from memory)
    const existingBuildingNum = getBuildingNumberForAssetId(assetId);
    const buildingNumberNum = typeof buildingNumber === 'string' ? parseInt(buildingNumber, 10) : buildingNumber;
    
    // If asset doesn't exist, it's OK
    if (existingBuildingNum === null) {
      return { valid: true };
    }
    
    // Asset exists - check if it's in a different building
    if (existingBuildingNum !== buildingNumberNum) {
      // If updating an existing asset, check if we're trying to change its building
      if (currentAssetId !== undefined) {
        const existingAssets = getAssetsByAssetId(assetId);
        const isSameAsset = existingAssets.some(a => {
          const aDbId = typeof a.id === 'string' ? parseInt(a.id, 10) : a.id;
          return aDbId === currentAssetId;
        });
        
        if (isSameAsset) {
          // Same asset, but trying to change building - not allowed
          return {
            valid: false,
            error: `נכס ${assetId} כבר קיים במבנה ${existingBuildingNum}. לא ניתן לשנות את מספר המבנה של נכס קיים.`
          };
        }
      }
      
      // Asset exists in a different building - not allowed
      return {
        valid: false,
        error: `נכס ${assetId} כבר קיים במבנה ${existingBuildingNum}. נכס יכול להיות קשור למבנה אחד בלבד.`
      };
    }
    
    // Asset exists in the same building - OK
    return { valid: true };
  },

  validatePayerId: async (payerId: string | null | undefined, validationRules?: ValidationRule[], lookupData?: { assetTypes?: any[]; [key: string]: any }): Promise<ValidationResult> => {
    // payer_id is optional, so skip validation if empty/null
    if (!payerId || payerId === '' || payerId === null || payerId === undefined) {
      return { valid: true };
    }
    const results = await validateField('asset', 'payer_id', payerId, validationRules, undefined, lookupData);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validateSize: async (size: number, fieldName: string): Promise<ValidationResult> => {
    const results = await validateField('asset', fieldName, size);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validateAssetType: async (assetType: string | undefined, fieldName: string, taxRegion?: string, validationRules?: ValidationRule[], lookupData?: { assetTypes?: any[]; [key: string]: any }): Promise<ValidationResult> => {
    if (!assetType) {
      return { valid: true };
    }
    if (process.env.NODE_ENV === 'development') {
      console.log('[assetValidators.validateAssetType] Validating asset type with taxRegion:', taxRegion, {
        assetType,
        fieldName
      });
    }
    // Pass validation rules and lookup data to avoid database queries
    const results = await validateField('asset', fieldName, assetType, validationRules, taxRegion, lookupData);
    const firstError = results.find(r => !r.valid);
    return firstError || { valid: true };
  },

  validateMainAssetTypeForBuilding: async (
    buildingNumber: number | null,
    mainAssetType: string | undefined,
    taxRegion?: string,
    cachedData?: { assetTypes?: any[]; building?: any }
  ): Promise<ValidationResult> => {
    if (!mainAssetType || !buildingNumber) {
      return { valid: true };
    }
    return await validateAssetTypeForBuildingTaxRegion(buildingNumber, mainAssetType, taxRegion, cachedData);
  },

  validateMainAssetTypeComplete: async (
    buildingNumber: number | null,
    mainAssetType: string | undefined,
    assetSize: number | undefined,
    assetData?: any,
    taxRegion?: string,
    cachedData?: { assetTypes?: any[]; building?: any }
  ): Promise<ValidationResult> => {
    if (!mainAssetType || !buildingNumber) {
      return { valid: true };
    }
    return await validateAssetTypeComplete(buildingNumber, mainAssetType, assetSize || 0, assetData, taxRegion, cachedData);
  },

  validateSubAssetTypeComplete: async (
    buildingNumber: number | null,
    subAssetType: string | undefined,
    subAssetSize: number | undefined,
    taxRegion?: string,
    cachedData?: { assetTypes?: any[]; building?: any },
    mainAssetData?: any // Main asset data - used for penthouse validation (sub-assets check main asset's penthouse)
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

    // Pass main asset data for penthouse validation - sub-assets should check the main asset's penthouse value
    return await validateAssetTypeComplete(buildingNumber, subAssetType, subAssetSize || 0, mainAssetData, taxRegion, cachedData);
  },

  validateSubAssetsFor199Or299: async (
    buildingNumber: number | null,
    mainAssetType: string | undefined,
    mainAssetSize: number | undefined,
    subAssetTypes: (string | undefined)[],
    subAssetSizes: (number | undefined)[],
    taxRegion?: string,
    cachedData?: { assetTypes?: any[]; building?: any }
  ): Promise<ValidationResult> => {
    return await validateSubAssetsFor199Or299(buildingNumber, mainAssetType, mainAssetSize, subAssetTypes, subAssetSizes, taxRegion, cachedData);
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
        const assetTypes = getAssetTypes();
        const taxRegionsInAssetTypes = new Set(assetTypes.map(at => at.tax_region).filter(tr => tr != null));
        
        for (const component of components) {
          const taxRegionNum = parseInt(component);
          if (!taxRegionsInAssetTypes.has(taxRegionNum)) {
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

    const assetTypes = getAssetTypes();
    const taxRegionsInAssetTypes = new Set(assetTypes.map(at => at.tax_region).filter(tr => tr != null));
    
    for (const component of components) {
      const taxRegionNum = parseInt(component);
      if (!taxRegionsInAssetTypes.has(taxRegionNum)) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[checkTaxRegionInvalid] Tax region component', component, 'is INVALID');
        }
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
    // Use in-memory data for cross-table validation
    let data: any = null;
    
    if (rule.compare_table === 'asset_types') {
      const assetTypes = getAssetTypes();
      data = assetTypes.find(at => at[rule.join_field!] === context.joinFieldValue);
    } else if (rule.compare_table === 'buildings') {
      const buildings = getBuildings();
      data = buildings.find(b => b[rule.join_field!] === context.joinFieldValue);
    } else {
      // For other tables, return valid (can be extended later if needed)
      console.warn(`[validation] Cross-table validation for ${rule.compare_table} not fully implemented with in-memory data`);
      return { valid: true };
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
  const rules = getValidationRules();
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
