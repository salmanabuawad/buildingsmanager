import { api, ValidationRule, AssetType, Building } from './api';
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
 * Refresh asset types in memory (called after create/update/delete operations)
 * Queries database directly to avoid circular dependency with api.assetTypes.getAll()
 */
export async function refreshAssetTypesCache(): Promise<void> {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('asset_types')
      .select('*')
      .order('name');

    if (error) {
      console.error('[validation] Failed to refresh asset types cache:', error);
      return;
    }

    // Map asset_type to id if the column was renamed
    const mappedData = (data || []).map((item: any) => {
      if (item.asset_type !== undefined && item.id === undefined) {
        return { ...item, id: item.asset_type };
      }
      return item;
    });

    inMemoryAssetTypes = mappedData;
    console.log(`[validation] Refreshed ${mappedData.length} asset types in memory`);
  } catch (err) {
    console.error('[validation] Failed to refresh asset types cache:', err);
  }
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
 * If data is not yet loaded, returns empty array (validation should use cachedData parameter instead)
 */
export function getAssetTypes(): any[] {
  if (!dataLoaded) {
    // Don't log warning - this is expected during initial load
    // Validation functions should use cachedData parameter to provide asset types
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

// Memoization cache for getValidTaxRegionsForAssetType
// Key: assetTypeName, Value: tax regions array
const taxRegionsCache = new Map<string, number[]>();
// Track if we're using cached data to determine cache key
const taxRegionsCacheWithData = new Map<string, number[]>();

/**
 * Get valid tax regions for an asset type from the asset_types table
 * Returns an array of tax region numbers where the asset type exists and is active
 * Results are memoized to avoid repeated calculations
 */
function getValidTaxRegionsForAssetType(
  assetTypeName: string,
  cachedData?: { assetTypes?: any[] }
): number[] {
  // Create cache key based on asset type name and whether we have cached data
  const cacheKey = cachedData?.assetTypes 
    ? `cached:${assetTypeName}` 
    : `memory:${assetTypeName}`;
  
  // Check cache first
  const cache = cachedData?.assetTypes ? taxRegionsCacheWithData : taxRegionsCache;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }
  
  let assetTypes: any[];
  
  if (cachedData?.assetTypes && Array.isArray(cachedData.assetTypes)) {
    // Filter from cached data - it may contain all asset types, so filter by name
    const allMatchingByName = cachedData.assetTypes.filter(
      at => String(at.name) === String(assetTypeName)
    );
    
    // Then filter by active status
    assetTypes = allMatchingByName.filter(at => at.active === 'כן');
    
    // Only log warnings for actual issues (not every call)
    if (assetTypes.length === 0 && allMatchingByName.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[getValidTaxRegionsForAssetType] Asset type ${assetTypeName} exists but is not active. Active values:`, 
          allMatchingByName.map(at => ({ name: at.name, active: at.active, tax_region: at.tax_region }))
        );
      }
    } else if (allMatchingByName.length === 0) {
      // Check if asset type exists with different name format
      const similarNames = cachedData.assetTypes.filter(at => 
        String(at.name).includes(String(assetTypeName)) || String(assetTypeName).includes(String(at.name))
      );
      if (similarNames.length > 0 && process.env.NODE_ENV === 'development') {
        console.warn(`[getValidTaxRegionsForAssetType] No exact match for ${assetTypeName}, but found similar names:`, 
          similarNames.map(at => ({ name: at.name, active: at.active }))
        );
      } else if (process.env.NODE_ENV === 'development') {
        console.warn(`[getValidTaxRegionsForAssetType] Asset type ${assetTypeName} not found in cached data. Total asset types in cache: ${cachedData.assetTypes.length}`);
      }
    }
  } else {
    // Use in-memory data which is already filtered by name
    assetTypes = getAssetTypesByName(assetTypeName);
  }
  
  // Extract unique tax regions
  const taxRegions = new Set<number>();
  for (const at of assetTypes) {
    if (at.tax_region != null) {
      const taxRegionNum = Number(at.tax_region);
      taxRegions.add(taxRegionNum);
    }
  }
  
  const result = Array.from(taxRegions);
  
  // Cache the result
  cache.set(cacheKey, result);
  
  return result;
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
  cachedData?: { assetTypes?: any[]; building?: any; asset?: any }
): Promise<ValidationResult> {
  try {
    // PRIORITY ORDER for tax region validation:
    // 1. asset.tax_region (from asset table - highest priority)
    // 2. taxRegion parameter (from tab/context)
    // NOTE: We do NOT use building.tax_region for tax region validation - only asset.tax_region
    // Building info is still needed for other validations (building_number checks, etc.)
    let taxRegionsToUse: string[] | null = null;
    
    // Priority 1: Use asset.tax_region if available
    if (cachedData?.asset?.tax_region != null) {
      const assetTaxRegion = cachedData.asset.tax_region;
      taxRegionsToUse = [String(assetTaxRegion)];
      if (process.env.NODE_ENV === 'development') {
        console.log('[validateAssetTypeForBuildingTaxRegion] Using asset.tax_region from asset table:', {
          assetTaxRegion: assetTaxRegion,
          buildingNumber: buildingNumber,
          assetTypeName: assetTypeName,
          source: 'asset.tax_region'
        });
      }
    }
    // Priority 2: Use taxRegion parameter from tab if asset.tax_region is not available
    else if (taxRegion && taxRegion.trim() !== '') {
      const tabTaxRegion = taxRegion.trim();
      taxRegionsToUse = [tabTaxRegion];
      if (process.env.NODE_ENV === 'development') {
        console.log('[validateAssetTypeForBuildingTaxRegion] Using taxRegion from tab parameter:', {
          tabTaxRegion: tabTaxRegion,
          buildingNumber: buildingNumber,
          assetTypeName: assetTypeName,
          source: 'taxRegion parameter'
        });
      }
    }
    
    // If no tax region is available from asset or parameter, skip tax region validation
    // (but still validate that asset type exists)
    if (taxRegionsToUse === null) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[validateAssetTypeForBuildingTaxRegion] No tax region available for validation, skipping tax region check:', {
          buildingNumber: buildingNumber,
          assetTypeName: assetTypeName
        });
      }
      // Still validate that the asset type exists, but skip tax region validation
      taxRegionsToUse = [];
    }
    
    // Rename for consistency with rest of function
    const buildingTaxRegions = taxRegionsToUse;
    
    // Validate asset type tax region based on the asset_types table
    // IMPORTANT: When taxRegion is provided, validate according to that tax region ONLY
    // This completely ignores the building's tax_region when taxRegion is provided
    // Get valid tax regions for this asset type from the asset_types table
    const validTaxRegions = getValidTaxRegionsForAssetType(assetTypeName, cachedData);
    
    // If the asset type has valid tax regions defined in the asset_types table, validate against them
    if (validTaxRegions.length > 0) {
      // Check if any of the building's tax regions are in the valid tax regions list
      const buildingTaxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
      const hasValidTaxRegion = buildingTaxRegionNumbers.some(tr => validTaxRegions.includes(tr));
      
      console.log(`[validateAssetTypeForBuildingTaxRegion] Asset type ${assetTypeName}, building tax regions: ${JSON.stringify(buildingTaxRegions)}, valid tax regions: ${JSON.stringify(validTaxRegions)}, hasValidTaxRegion: ${hasValidTaxRegion}`);
      
      // Only error if the asset type exists in the database but not for this tax region
      if (!hasValidTaxRegion) {
        // Building's tax region is not in the valid list, but asset type exists for other tax regions
        const validRegionsStr = validTaxRegions.join(', ');
        return { valid: false, error: `סוג נכס ${assetTypeName} תקף רק באזורי מס: ${validRegionsStr}` };
      }
    } else {
      // If validTaxRegions is empty, it means the asset type doesn't exist in the database at all
      // We'll let the later validation catch this
      console.warn(`[validateAssetTypeForBuildingTaxRegion] Asset type ${assetTypeName} has no valid tax regions in database - will check if it exists at all later`);
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

      // Apply tax region filtering - ALWAYS check against asset_types table
      // Check if asset type has specific valid tax regions from asset_types table
      const validTaxRegionsForFiltering = getValidTaxRegionsForAssetType(assetTypeName, cachedData);
      
      // If asset type doesn't exist in asset_types table, it's invalid
      if (validTaxRegionsForFiltering.length === 0) {
        return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים בטבלת סוגי הנכסים` };
      }
      
      // Filter to only include tax regions that are valid for this asset type (from asset_types table)
      matchingAssetTypes = matchingAssetTypes.filter(at => 
        at.tax_region != null && validTaxRegionsForFiltering.includes(Number(at.tax_region))
      );

      if (matchingAssetTypes.length === 0) {
        // Check if building's tax region matches any valid tax region from asset_types table
        const buildingTaxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        const hasValidTaxRegion = buildingTaxRegionNumbers.some(tr => validTaxRegionsForFiltering.includes(tr));
        
        if (!hasValidTaxRegion) {
          // Asset type exists in asset_types table but not for this tax region
          const validRegionsStr = validTaxRegionsForFiltering.join(', ');
          return { valid: false, error: `סוג נכס ${assetTypeName} תקף רק באזורי מס: ${validRegionsStr}` };
        }
        // This shouldn't happen, but if it does, asset type doesn't exist
        return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים` };
      }
    } else {
      // Use in-memory asset types
      const inMemoryAssetTypes = getAssetTypesByName(assetTypeName);
      let matchingAssetTypes = inMemoryAssetTypes;

      // Apply tax region filtering - ALWAYS check against asset_types table
      // Check if asset type has specific valid tax regions from asset_types table
      const validTaxRegionsForFiltering = getValidTaxRegionsForAssetType(assetTypeName, cachedData);
      
      // If asset type doesn't exist in asset_types table, it's invalid
      if (validTaxRegionsForFiltering.length === 0) {
        return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים בטבלת סוגי הנכסים` };
      }
      
      // Filter to only include tax regions that are valid for this asset type (from asset_types table)
      matchingAssetTypes = matchingAssetTypes.filter(at => 
        at.tax_region != null && validTaxRegionsForFiltering.includes(Number(at.tax_region))
      );

      if (matchingAssetTypes.length === 0) {
        // Check if building's tax region matches any valid tax region from asset_types table
        const buildingTaxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        const hasValidTaxRegion = buildingTaxRegionNumbers.some(tr => validTaxRegionsForFiltering.includes(tr));
        
        if (!hasValidTaxRegion) {
          // Asset type exists in asset_types table but not for this tax region
          const validRegionsStr = validTaxRegionsForFiltering.join(', ');
          return { valid: false, error: `סוג נכס ${assetTypeName} תקף רק באזורי מס: ${validRegionsStr}` };
        }
        // This shouldn't happen, but if it does, asset type doesn't exist
        return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים` };
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
  cachedData?: { assetTypes?: any[]; building?: any; asset?: any },
  isSubAsset?: boolean
): Promise<ValidationResult> {
  try {
    // ============================================
    // VALIDATION ORDER (as per requirements):
    // ============================================
    // STEP 1: Start with TAX REGION - filter asset_types by tax_region FIRST
    // STEP 2: Then match asset attributes and building attributes:
    //         - מעלית (elevator)
    //         - בית פרטי (single_double_family)
    //         - דירת גג (penthouse)
    //         - בית משותף (condo)
    //         - טוריים (townhouses)
    //         - שטח מ (min_size)
    //         - שטח עד (max_size)
    // ============================================
    
    // PRIORITY ORDER for tax region validation:
    // 1. assetData.tax_region (from asset table - highest priority)
    // 2. taxRegion parameter (from tab/context)
    // NOTE: We do NOT use building.tax_region - validation is against asset.tax_region only
    // Building info is still needed for other validations (building_number, size validation, etc.)
    // Support for comma-separated tax regions (e.g., "10,40") - will validate against all
    let taxRegionsToCheck: string[] = [];
    
    // Priority 1: Use assetData.tax_region if available
    if (assetData?.tax_region != null) {
      const assetTaxRegion = String(assetData.tax_region);
      // Split if comma-separated
      taxRegionsToCheck = assetTaxRegion.split(',').map(r => r.trim()).filter(r => r);
      if (process.env.NODE_ENV === 'development') {
        console.log('[validateAssetTypeComplete] Using asset.tax_region from assetData:', {
          assetTaxRegion: assetTaxRegion,
          taxRegionsToCheck: taxRegionsToCheck,
          buildingNumber: buildingNumber,
          assetTypeName: assetTypeName,
          source: 'assetData.tax_region'
        });
      }
    }
    // Priority 2: Use taxRegion parameter if asset.tax_region is not available
    if (taxRegionsToCheck.length === 0 && taxRegion && taxRegion.trim() !== '') {
      // Split if comma-separated
      taxRegionsToCheck = taxRegion.split(',').map(r => r.trim()).filter(r => r);
      if (process.env.NODE_ENV === 'development') {
        console.log('[validateAssetTypeComplete] Using taxRegion from parameter:', {
          taxRegion: taxRegion,
          taxRegionsToCheck: taxRegionsToCheck,
          buildingNumber: buildingNumber,
          assetTypeName: assetTypeName,
          source: 'taxRegion parameter'
        });
      }
    }
    
    // If we have multiple tax regions to check, validate against each one
    // The asset is valid if it's valid for at least one of the tax regions
    if (taxRegionsToCheck.length > 1) {
      // Multiple tax regions - check if asset type is valid for at least one
      const validTaxRegions = getValidTaxRegionsForAssetType(assetTypeName, cachedData);
      if (validTaxRegions.length > 0) {
        const taxRegionNumbers = taxRegionsToCheck.map(r => parseInt(r)).filter(n => !isNaN(n));
        const hasValidTaxRegion = taxRegionNumbers.some(tr => validTaxRegions.includes(tr));
        if (!hasValidTaxRegion) {
          const validRegionsStr = validTaxRegions.join(', ');
          return { valid: false, error: `סוג נכס ${assetTypeName} תקף רק באזורי מס: ${validRegionsStr}` };
        }
        // Continue with validation below - we'll use the first valid tax region
      }
    }
    
    // Always validate against asset_types table - same validation for all components
    if (taxRegionsToCheck.length > 0) {
      // IMPORTANT: Now using asset.tax_region (if available), then taxRegion parameter
      // NOTE: We do NOT use building.tax_region - validation is against asset.tax_region only
      // For multiple tax regions, check if asset type is valid for at least one
      // Direct validation: check if asset type exists for the tax region(s)
      // Use cached assetTypes if provided to avoid database query
      
      // Get valid tax regions for this asset type from the asset_types table
      const validTaxRegions = getValidTaxRegionsForAssetType(assetTypeName, cachedData);
      if (validTaxRegions.length > 0) {
        // Check if any of the tax regions in the list is valid
        const taxRegionNumbers = taxRegionsToCheck.map(r => parseInt(r)).filter(n => !isNaN(n));
        const hasValidTaxRegion = taxRegionNumbers.some(tr => validTaxRegions.includes(tr));
        if (!hasValidTaxRegion) {
          // None of the tax regions are valid
          const validRegionsStr = validTaxRegions.join(', ');
          return { valid: false, error: `סוג נכס ${assetTypeName} תקף רק באזורי מס: ${validRegionsStr}` };
        }
        // At least one tax region is valid - continue with validation
      }
      
      // Use cached asset types if available, otherwise query database
      if (cachedData?.assetTypes && Array.isArray(cachedData.assetTypes)) {
        let matchingAssetTypes = cachedData.assetTypes.filter(at => 
          at.name === assetTypeName && at.active === 'כן'
        );

        // Check if asset type has specific valid tax regions from asset_types table
        const validTaxRegionsForType = getValidTaxRegionsForAssetType(assetTypeName, cachedData);
        
        // If asset type doesn't exist in asset_types table, it's invalid
        if (validTaxRegionsForType.length === 0) {
          return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים בטבלת סוגי הנכסים` };
        }
        
        // Check if any of the provided tax regions is valid for this asset type
        const taxRegionNumbers = taxRegionsToCheck.map(r => parseInt(r)).filter(n => !isNaN(n));
        const hasValidTaxRegion = taxRegionNumbers.some(tr => validTaxRegionsForType.includes(tr));
        if (!hasValidTaxRegion) {
          const validRegionsStr = validTaxRegionsForType.join(', ');
          return { valid: false, error: `סוג נכס ${assetTypeName} תקף רק באזורי מס: ${validRegionsStr}` };
        }
        
        // Filter to only include tax regions that are valid for this asset type
        matchingAssetTypes = matchingAssetTypes.filter(at => 
          at.tax_region != null && validTaxRegionsForType.includes(Number(at.tax_region))
        );

        if (matchingAssetTypes.length === 0) {
          // Asset type doesn't exist at all
          return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים` };
        }
      } else {
        // Use in-memory asset types
        const inMemoryAssetTypes = getAssetTypesByName(assetTypeName);
        let matchingAssetTypes = inMemoryAssetTypes;
        
        // Apply tax region filtering - ALWAYS check against asset_types table
        // Check if asset type has specific valid tax regions from asset_types table
        const validTaxRegionsForType = getValidTaxRegionsForAssetType(assetTypeName, cachedData);
        
        // If asset type doesn't exist in asset_types table, it's invalid
        if (validTaxRegionsForType.length === 0) {
          return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים בטבלת סוגי הנכסים` };
        }
        
        // Check if any of the provided tax regions is valid for this asset type
        const taxRegionNumbers = taxRegionsToCheck.map(r => parseInt(r)).filter(n => !isNaN(n));
        const hasValidTaxRegion = taxRegionNumbers.some(tr => validTaxRegionsForType.includes(tr));
        if (!hasValidTaxRegion) {
          const validRegionsStr = validTaxRegionsForType.join(', ');
          return { valid: false, error: `סוג נכס ${assetTypeName} תקף רק באזורי מס: ${validRegionsStr}` };
        }
        
        // Filter to only include tax regions that are valid for this asset type
        matchingAssetTypes = matchingAssetTypes.filter(at => 
          at.tax_region != null && validTaxRegionsForType.includes(Number(at.tax_region))
        );
        
        if (matchingAssetTypes.length === 0) {
          // Asset type doesn't exist at all
          return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים` };
        }
      }
      
      // IMPORTANT: When taxRegion is provided, we've already validated the asset type exists for that tax region
      // Now we need to fetch the building for size validation, but we'll use the provided taxRegion, NOT building.tax_region
      // Continue to size validation below, but ensure we use the provided taxRegion
    } else {
      // No taxRegion provided - use the original validation that checks asset.tax_region first, then building tax_region
      // Make sure assetData is included in cachedData so validation can use asset.tax_region
      const cachedDataWithAsset = assetData ? { ...cachedData, asset: assetData } : cachedData;
      const taxRegionValidation = await validateAssetTypeForBuildingTaxRegion(buildingNumber, assetTypeName, taxRegion, cachedDataWithAsset);
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
      
      // Apply tax region filtering if taxRegionsToCheck is available
      if (taxRegionsToCheck.length > 0) {
        const validTaxRegionsForType = getValidTaxRegionsForAssetType(assetTypeName, cachedData);
        if (validTaxRegionsForType.length > 0) {
          const taxRegionNumbers = taxRegionsToCheck.map(r => parseInt(r)).filter(n => !isNaN(n));
          assetTypes = assetTypes.filter(at => 
            at.tax_region != null && taxRegionNumbers.includes(Number(at.tax_region))
          );
        }
      }

      // Determine tax regions to filter by
      // Support comma-separated tax regions
      let buildingTaxRegions: string[];
      if (taxRegionsToCheck.length > 0) {
        // Use the tax regions we determined above (from asset or parameter)
        buildingTaxRegions = taxRegionsToCheck;
      } else if (taxRegion && taxRegion.trim() !== '') {
        buildingTaxRegions = taxRegion.split(',').map(r => r.trim()).filter(r => r);
      } else {
        buildingTaxRegions = building.tax_region != null
          ? String(building.tax_region).split(',').map(r => r.trim())
          : [];
      }

      // Apply tax region filtering - ALWAYS check against asset_types table
      // Check if asset type has specific valid tax regions from asset_types table
      const validTaxRegionsForType = getValidTaxRegionsForAssetType(assetTypeName, cachedData);
      
      // If asset type doesn't exist in asset_types table, it's invalid
      if (validTaxRegionsForType.length === 0) {
        return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים בטבלת סוגי הנכסים` };
      }
      
      // Filter to only include tax regions that are valid for this asset type (from asset_types table)
      assetTypes = assetTypes.filter(at => 
        at.tax_region != null && validTaxRegionsForType.includes(Number(at.tax_region))
      );
      
      // Check if building's tax region matches any valid tax region from asset_types table
      if (buildingTaxRegions.length > 0) {
        const buildingTaxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        const hasValidTaxRegion = buildingTaxRegionNumbers.some(tr => validTaxRegionsForType.includes(tr));
        
        if (!hasValidTaxRegion) {
          const validRegionsStr = validTaxRegionsForType.join(', ');
          return { valid: false, error: `סוג נכס ${assetTypeName} תקף רק באזורי מס: ${validRegionsStr}` };
        }
      }

      if (assetTypes.length === 0) {
        return { valid: false, error: 'שגיאה באימות סוג הנכס' };
      }
    } else {
      // Use in-memory asset types
      assetTypes = getAssetTypesByName(assetTypeName);

      // Determine tax regions to filter by
      // Support comma-separated tax regions - use taxRegionsToCheck if available
      let buildingTaxRegions: string[];
      if (taxRegionsToCheck.length > 0) {
        // Use the tax regions we determined above (from asset or parameter)
        buildingTaxRegions = taxRegionsToCheck;
      } else if (taxRegion && taxRegion.trim() !== '') {
        buildingTaxRegions = taxRegion.split(',').map(r => r.trim()).filter(r => r);
      } else {
        buildingTaxRegions = building.tax_region != null
          ? String(building.tax_region).split(',').map(r => r.trim())
          : [];
      }

      // Apply tax region filtering to in-memory asset types - ALWAYS check against asset_types table
      // Check if asset type has specific valid tax regions from asset_types table
      const validTaxRegionsForType = getValidTaxRegionsForAssetType(assetTypeName, cachedData);
      
      // If asset type doesn't exist in asset_types table, it's invalid
      if (validTaxRegionsForType.length === 0) {
        return { valid: false, error: `סוג הנכס "${assetTypeName}" לא קיים בטבלת סוגי הנכסים` };
      }
      
      // Filter to only include tax regions that are valid for this asset type (from asset_types table)
      assetTypes = assetTypes.filter(at => 
        at.tax_region != null && validTaxRegionsForType.includes(Number(at.tax_region))
      );
      
      // Check if building's tax region matches any valid tax region from asset_types table
      if (buildingTaxRegions.length > 0) {
        const buildingTaxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        const hasValidTaxRegion = buildingTaxRegionNumbers.some(tr => validTaxRegionsForType.includes(tr));
        
        if (!hasValidTaxRegion) {
          const validRegionsStr = validTaxRegionsForType.join(', ');
          return { valid: false, error: `סוג נכס ${assetTypeName} תקף רק באזורי מס: ${validRegionsStr}` };
        }
      }

      if (assetTypes.length === 0) {
        return { valid: false, error: 'שגיאה באימות סוג הנכס' };
      }
    }

    // Further filter asset types based on required tax region
    // Priority: assetData.tax_region > taxRegion parameter > building tax_region
    // Use taxRegionsToCheck which already handles comma-separated values
    let requiredTaxRegionsForMatching: number[] = [];
    
    // Priority 1: Use taxRegionsToCheck (already processed from assetData.tax_region or taxRegion parameter)
    if (taxRegionsToCheck.length > 0) {
      requiredTaxRegionsForMatching = taxRegionsToCheck.map(r => parseInt(r, 10)).filter(n => !isNaN(n));
    }
    // Priority 2: Use building tax_region as fallback (for multi-tax region buildings)
    else if (building.tax_region) {
      requiredTaxRegionsForMatching = String(building.tax_region)
        .split(',')
        .map(r => parseInt(r.trim(), 10))
        .filter(r => !isNaN(r));
    }

    // Filter asset types to only include those that match the required tax region
    if (requiredTaxRegionsForMatching.length > 0) {
      assetTypes = assetTypes.filter(at => {
        if (at.tax_region == null) return false;
        const assetTypeTaxRegion = typeof at.tax_region === 'string'
          ? parseInt(at.tax_region, 10)
          : at.tax_region;
        return !isNaN(assetTypeTaxRegion) && requiredTaxRegionsForMatching.includes(assetTypeTaxRegion);
      });
      
      // If no asset types match after filtering, return error
      if (assetTypes.length === 0) {
        const requiredRegionsStr = requiredTaxRegionsForMatching.join(', ');
        return { valid: false, error: `סוג נכס ${assetTypeName} לא קיים באזורי מס: ${requiredRegionsStr}` };
      }
    }

    // ============================================
    // STEP: Check if asset type is not_accountable (only for main assets)
    // ============================================
    // If the main asset type has not_accountable = true, skip all remaining validations
    // This check happens AFTER we've verified the asset type exists and is valid for the tax region
    if (!isSubAsset && assetTypes.length > 0) {
      const hasNotAccountable = assetTypes.some(at => at.not_accountable === true);
      if (hasNotAccountable) {
        // Asset type exists, is valid for tax region, and is not_accountable
        // Skip all remaining validations (size, building attributes, etc.)
        return { valid: true };
      }
    }

    // Helper function to check if a single asset type entry matches all requirements
    // MATCHING ORDER (as per requirements):
    // 1. Start with tax region - filter asset_types by tax_region first
    // 2. Then match asset attributes and building attributes:
    //    - מעלית (elevator)
    //    - בית פרטי (single_double_family)
    //    - דירת גג (penthouse)
    //    - בית משותף (condo)
    //    - טוריים (townhouses)
    //    - שטח מ (min_size)
    //    - שטח עד (max_size)
    const checkAssetTypeEntry = (assetType: any): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];

      // ============================================
      // STEP 1: TAX REGION MATCHING (FIRST PRIORITY)
      // ============================================
      // Start with tax region - this is the first filter against asset_types table
      // Priority: assetData.tax_region > taxRegion parameter > building tax_region
      // Use taxRegionsToCheck which already handles comma-separated values
      let requiredTaxRegions: number[] = [];
      
      // Priority 1: Use taxRegionsToCheck (already processed from assetData.tax_region or taxRegion parameter)
      if (taxRegionsToCheck.length > 0) {
        requiredTaxRegions = taxRegionsToCheck.map(r => parseInt(r, 10)).filter(n => !isNaN(n));
      }
      // Priority 2: Use building tax_region as fallback
      else if (building.tax_region) {
        requiredTaxRegions = String(building.tax_region)
          .split(',')
          .map(r => parseInt(r.trim(), 10))
          .filter(r => !isNaN(r));
      }

      // Validate that asset type's tax_region matches the required tax regions
      // This is the FIRST check - if tax region doesn't match, the record is invalid
      if (requiredTaxRegions.length > 0 && assetType.tax_region != null) {
        const assetTypeTaxRegion = typeof assetType.tax_region === 'string'
          ? parseInt(assetType.tax_region, 10)
          : assetType.tax_region;
        
        if (!isNaN(assetTypeTaxRegion) && !requiredTaxRegions.includes(assetTypeTaxRegion)) {
          // If we're in a specific tab or have asset tax_region, it must match exactly
          if (assetData?.tax_region != null || (taxRegion && taxRegion.trim() !== '')) {
            errors.push(`אזור מיסים של סוג הנכס (${assetTypeTaxRegion}) אינו תואם לאזור מיסים הנדרש (${requiredTaxRegions.join(', ')})`);
          } else {
            // If using building tax regions, it must be one of them
            errors.push(`אזור מיסים של סוג הנכס (${assetTypeTaxRegion}) אינו אחד מאזורי מס המבנה (${requiredTaxRegions.join(', ')})`);
          }
        }
      }

      // ============================================
      // STEP 2: ASSET SIZE VALIDATION (שטח מ / שטח עד)
      // ============================================
      // Match asset size against min_size and max_size from asset_types table
      // Validate size if it exists (even if 0) AND if min_size or max_size are defined in asset_types
      if (assetSize != null) {
        const minSize = assetType.min_size != null ? Number(assetType.min_size) : null;
        const maxSize = assetType.max_size != null ? Number(assetType.max_size) : null;
        const numericAssetSize = Number(assetSize);

        // Only validate if at least one of min_size or max_size is defined
        if (minSize != null || maxSize != null) {
          const sizeLabel = isSubAsset ? 'גודל נכס משנה' : 'גודל הנכס';
          if (minSize != null && numericAssetSize < minSize) {
            errors.push(`${sizeLabel} (${numericAssetSize}) קטן מהמינימום המותר (${minSize})`);
          }

          if (maxSize != null && numericAssetSize > maxSize) {
            errors.push(`${sizeLabel} (${numericAssetSize}) גדול מהמקסימום המותר (${maxSize})`);
          }
        }
      }

      // ============================================
      // STEP 3: ASSET ATTRIBUTE MATCHING (דירת גג)
      // ============================================
      // Match asset attribute: penthouse (דירת גג)
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

      // ============================================
      // STEP 4: BUILDING ATTRIBUTE MATCHING
      // ============================================
      // Match building attributes against asset_types table:
      // - מעלית (elevator)
      // - בית פרטי (single_double_family)
      // - בית משותף (condo)
      // - טוריים (townhouses)
      // NOTE: Building-level validations only apply to main assets, not sub-assets
      // If assetData is not provided, it means we're validating a sub-asset, so skip building-level checks
      if (assetData != null) {
        // Step 4a: Match elevator (מעלית)
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

        // Step 4b: Match single_double_family (בית פרטי)
        if (assetType.single_double_family != null && assetType.single_double_family.trim() !== '') {
          const requiredValue = assetType.single_double_family.toLowerCase();
          const buildingValue = building.single_double_family ? building.single_double_family.toLowerCase() : '';

          if (requiredValue === 'כן' || requiredValue === 'yes') {
            if (buildingValue !== 'כן' && buildingValue !== 'yes') {
              errors.push('דורש משפחה יחידה/דו משפחתי, אבל המבנה לא מסומן ככזה');
            }
          }
        }

        // Step 4c: Match condo (בית משותף)
        if (assetType.condo != null && assetType.condo.trim() !== '') {
          const requiredValue = assetType.condo.toLowerCase();
          const buildingValue = building.condo ? building.condo.toLowerCase() : '';

          if (requiredValue === 'כן' || requiredValue === 'yes') {
            if (buildingValue !== 'כן' && buildingValue !== 'yes') {
              errors.push('דורש בית משותף, אבל המבנה לא מסומן ככזה');
            }
          }
        }

        // Step 4d: Match townhouses (טוריים)
        if (assetType.townhouses != null && assetType.townhouses.trim() !== '') {
          const requiredValue = assetType.townhouses.toLowerCase();
          const buildingValue = building.townhouses ? building.townhouses.toLowerCase() : '';

          if (requiredValue === 'כן' || requiredValue === 'yes') {
            if (buildingValue !== 'כן' && buildingValue !== 'yes') {
              errors.push('דורש טוריים, אבל המבנה לא מסומן ככזה');
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

export async function validateAssetTypeRequiresSize(
  mainAssetType: string | undefined,
  assetSize: number | undefined,
  subAssetTypes: (string | undefined)[],
  subAssetSizes: (number | undefined)[]
): Promise<ValidationResult> {
  // Validate that if asset type exists, corresponding size must exist
  
  // Check main asset type
  if (mainAssetType && mainAssetType.trim() !== '') {
    if (assetSize == null || assetSize === 0) {
      return {
        valid: false,
        error: 'שטח נכס ראשי נדרש כאשר סוג נכס ראשי מוזן'
      };
    }
  }

  // Check sub asset types
  for (let i = 0; i < subAssetTypes.length; i++) {
    const hasType = subAssetTypes[i] && subAssetTypes[i]!.trim() !== '';
    const hasSize = subAssetSizes[i] != null && subAssetSizes[i] !== 0;

    if (hasType && !hasSize) {
      return {
        valid: false,
        error: `שטח נכס משנה ${i + 1} נדרש כאשר סוג נכס משנה ${i + 1} מוזן`
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

/**
 * HARDCODED RULE: Subtypes cannot have holes (must be sequential)
 * This is one of the ONLY hardcoded rules allowed:
 * 1. Only 199 and 299 can be main types (and have subtypes)
 * 2. 199 and 299 cannot be subtypes
 * 3. 199 and 299 require at least 2 subtypes
 * 4. Subtypes have no holes (must be consecutive, no gaps)
 * 
 * Sub-assets must be filled in order: you cannot have subtype 2 if subtype 1 is blank
 * No other hardcoded validations are allowed - all other validations must use the asset_types table
 */
export async function validateSubAssetOrder(
  subAssetTypes: (string | undefined)[]
): Promise<ValidationResult> {
  // HARDCODED RULE: Sub-assets must be filled sequentially without gaps
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

/**
 * HARDCODED RULE: Only asset types 199 and 299 can have sub-assets
 * This is one of the ONLY hardcoded rules allowed:
 * 1. Only 199 and 299 can be main types (and have subtypes)
 * 2. 199 and 299 cannot be subtypes
 * 3. 199 and 299 require at least 2 subtypes
 * 4. Subtypes have no holes (must be consecutive, no gaps)
 * 
 * All other validations must use the asset_types table (no hardcoded tax region 40 or other validations)
 */
export async function validateOnlyComplexTypesCanHaveSubAssets(
  mainAssetType: string | undefined,
  subAssetTypes: (string | undefined)[]
): Promise<ValidationResult> {
  const validSubAssets = subAssetTypes.filter(type => type && type.trim() !== '');

  // If there are no sub assets, validation passes
  if (validSubAssets.length === 0) {
    return { valid: true };
  }

  // HARDCODED RULE: Only 199 and 299 can have sub-assets
  if (!mainAssetType || (mainAssetType !== '199' && mainAssetType !== '299')) {
    return {
      valid: false,
      error: 'רק סוגי נכס 199 ו-299 יכולים לכלול נכסי משנה. נכסי משנה לא מותרים עבור סוגי נכס אחרים'
    };
  }

  return { valid: true };
}

/**
 * HARDCODED RULE: Asset types 199 and 299 require at least 2 subtypes
 * This is one of the ONLY hardcoded rules allowed:
 * 1. Only 199 and 299 can be main types (and have subtypes)
 * 2. 199 and 299 cannot be subtypes
 * 3. 199 and 299 require at least 2 subtypes
 * 4. Subtypes have no holes (must be consecutive, no gaps)
 * 
 * All other validations must use the asset_types table
 */
export async function validateComplexTypesMustHaveSubAssets(
  mainAssetType: string | undefined,
  subAssetTypes: (string | undefined)[]
): Promise<ValidationResult> {
  if (!mainAssetType || (mainAssetType !== '199' && mainAssetType !== '299')) {
    return { valid: true };
  }

  const validSubAssets = subAssetTypes.filter(type => type && type.trim() !== '');

  // HARDCODED RULE: 199 and 299 must have at least 2 sub-assets
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

  // HARDCODED RULE: Sub-assets cannot be 199 or 299 (complex types cannot be sub types)
  // This is part of the ONLY hardcoded rules:
  // 1. Only 199 and 299 can be main types (and have subtypes)
  // 2. 199 and 299 cannot be subtypes
  // 3. 199 and 299 require at least 2 subtypes
  // 4. Subtypes have no holes (must be consecutive)
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
  // The building may have multiple tax regions (e.g., "10,40"), but we ONLY use the tab's tax regions
  // Support comma-separated tax regions in taxRegion parameter (e.g., "10,40")
  // Only fetch building data if taxRegion is NOT provided (for fallback)
  let buildingTaxRegions: string[];
  
  // Check if taxRegion is provided and not empty (handle both undefined and empty string)
  if (taxRegion && taxRegion.trim() !== '') {
    // CRITICAL: Use ONLY the provided taxRegion - IGNORE building tax_region completely
    // Support comma-separated tax regions (e.g., "10,40")
    // This ensures that even if building has "10,40", we only use the tab's tax regions
    buildingTaxRegions = taxRegion.split(',').map(r => r.trim()).filter(r => r);
    console.log('[validateSubAssetsFor199Or299] TAB TAX REGION PROVIDED - Using tab tax regions, IGNORING building tax_region:', {
      tabTaxRegion: taxRegion,
      taxRegionsToCheck: buildingTaxRegions,
      buildingNumber: buildingNumber,
      mainAssetType: mainAssetType,
      willUse: 'TAB TAX REGIONS ONLY',
      buildingTaxRegionWillBeIgnored: true
    });
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
  // ALWAYS check against asset_types table first - ignore building.tax_region when taxRegion is provided
  if (validSubAssets.length > 0) {
    // Cache valid tax regions for each asset type to avoid redundant calls
    const validTaxRegionsCache = new Map<string, number[]>();
    const getCachedValidTaxRegions = (subAssetType: string): number[] => {
      if (!validTaxRegionsCache.has(subAssetType)) {
        validTaxRegionsCache.set(subAssetType, getValidTaxRegionsForAssetType(subAssetType, cachedData));
      }
      return validTaxRegionsCache.get(subAssetType)!;
    };

    if (cachedData?.assetTypes && Array.isArray(cachedData.assetTypes)) {
      // Filter from cache
      let matchingAssetTypes = cachedData.assetTypes.filter(at => 
        validSubAssets.includes(at.name) && at.active === 'כן'
      );

      // ALWAYS check against asset_types table - use tab's taxRegion, ignore building.tax_region
      for (const subAssetType of validSubAssets) {
        const validTaxRegionsForSubType = getCachedValidTaxRegions(subAssetType);
        
        // If asset type doesn't exist in asset_types table, it's invalid
        if (validTaxRegionsForSubType.length === 0) {
          return { valid: false, error: `סוג נכס משנה "${subAssetType}" לא קיים בטבלת סוגי הנכסים` };
        }
        
        // Check if the tab's tax region (or building's if no tab tax region) is valid for this asset type
        if (buildingTaxRegions.length > 0) {
          const taxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
          const hasValidTaxRegion = taxRegionNumbers.some(tr => validTaxRegionsForSubType.includes(tr));
          
          if (!hasValidTaxRegion) {
            const validRegionsStr = validTaxRegionsForSubType.join(', ');
            return { valid: false, error: `סוג נכס משנה ${subAssetType} תקף רק באזורי מס: ${validRegionsStr}` };
          }
        }
      }

      // Filter by tax region - use tab's taxRegion, ignore building.tax_region
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
          // Get valid tax regions for better error message (use cached result)
          const validTaxRegionsForSubType = getCachedValidTaxRegions(subAssetType);
          if (validTaxRegionsForSubType.length > 0) {
            const validRegionsStr = validTaxRegionsForSubType.join(', ');
            return { valid: false, error: `סוג נכס משנה ${subAssetType} תקף רק באזורי מס: ${validRegionsStr}` };
          }
          return { valid: false, error: `סוג נכס משנה "${subAssetType}" לא קיים` };
        }
      }
    } else {
      // Use in-memory asset types
      const allAssetTypes = getAssetTypes();
      let matchingAssetTypes = allAssetTypes.filter(at => 
        validSubAssets.includes(at.name) && at.active === 'כן'
      );

      // ALWAYS check against asset_types table - use tab's taxRegion, ignore building.tax_region
      for (const subAssetType of validSubAssets) {
        const validTaxRegionsForSubType = getCachedValidTaxRegions(subAssetType);
        
        // If asset type doesn't exist in asset_types table, it's invalid
        if (validTaxRegionsForSubType.length === 0) {
          return { valid: false, error: `סוג נכס משנה "${subAssetType}" לא קיים בטבלת סוגי הנכסים` };
        }
        
        // Check if the tab's tax region (or building's if no tab tax region) is valid for this asset type
        if (buildingTaxRegions.length > 0) {
          const taxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
          const hasValidTaxRegion = taxRegionNumbers.some(tr => validTaxRegionsForSubType.includes(tr));
          
          if (!hasValidTaxRegion) {
            const validRegionsStr = validTaxRegionsForSubType.join(', ');
            return { valid: false, error: `סוג נכס משנה ${subAssetType} תקף רק באזורי מס: ${validRegionsStr}` };
          }
        }
      }

      // Filter by tax region - use tab's taxRegion, ignore building.tax_region
      if (buildingTaxRegions.length > 0) {
        const taxRegionNumbers = buildingTaxRegions.map(r => parseInt(r));
        matchingAssetTypes = matchingAssetTypes.filter(at => 
          at.tax_region != null && taxRegionNumbers.includes(Number(at.tax_region))
        );
      }

      const foundAssetTypes = new Set(matchingAssetTypes.map(at => at.name));

      for (const subAssetType of validSubAssets) {
        if (!foundAssetTypes.has(subAssetType)) {
          // Get valid tax regions for better error message (use cached result)
          const validTaxRegionsForSubType = getCachedValidTaxRegions(subAssetType);
          if (validTaxRegionsForSubType.length > 0) {
            const validRegionsStr = validTaxRegionsForSubType.join(', ');
            return { valid: false, error: `סוג נכס משנה ${subAssetType} תקף רק באזורי מס: ${validRegionsStr}` };
          }
          return { valid: false, error: `סוג נכס משנה "${subAssetType}" לא קיים` };
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
    
    // Convert to string if it's a number
    const taxRegionStr = typeof taxRegion === 'number' ? taxRegion.toString() : taxRegion;
    const trimmedValue = taxRegionStr.trim();

    // Get all tax regions from asset_types table
    const assetTypes = getAssetTypes();
    const taxRegionsInAssetTypes = new Set(assetTypes.map(at => at.tax_region).filter(tr => tr != null));
    
    // If no asset types loaded, skip validation
    if (taxRegionsInAssetTypes.size === 0) {
      return { valid: true };
    }
    
    // Check if it's a comma-separated value
    if (trimmedValue.includes(',')) {
      const components = trimmedValue.split(',').map(v => v.trim());
      
      // Validate each component exists in asset_types
      for (const component of components) {
        const taxRegionNum = parseInt(component);
        if (isNaN(taxRegionNum) || !taxRegionsInAssetTypes.has(taxRegionNum)) {
          return {
            valid: false,
            error: `אזור מס ${component} לא קיים בסוגי הנכסים`
          };
        }
      }

      return { valid: true };
    }

    // For single values, validate against asset_types table
    const taxRegionNum = parseInt(trimmedValue);
    if (isNaN(taxRegionNum) || !taxRegionsInAssetTypes.has(taxRegionNum)) {
      return {
        valid: false,
        error: `אזור מס ${trimmedValue} לא קיים בסוגי הנכסים`
      };
    }

    return { valid: true };
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
          // Asset exists in the same building - this is OK (update scenario)
          // Don't return error, allow it to proceed
          return { valid: true };
        }
      } else {
        // Building number not provided, but asset exists - this is OK if we're updating
        // Only error if we're creating new and building number is missing
        if (!currentAssetId) {
          return { valid: false, error: `מזהה נכס ${assetId} כבר קיים במערכת. יש לציין מספר מבנה.` };
        }
        return { valid: true };
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
    cachedData?: { assetTypes?: any[]; building?: any; asset?: any }
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
    cachedData?: { assetTypes?: any[]; building?: any; asset?: any }
  ): Promise<ValidationResult> => {
    if (!mainAssetType || !buildingNumber) {
      return { valid: true };
    }
    // Include assetData in cachedData so validation can use asset.tax_region
    const cachedDataWithAsset = assetData ? { ...cachedData, asset: assetData } : cachedData;
    return await validateAssetTypeComplete(buildingNumber, mainAssetType, assetSize || 0, assetData, taxRegion, cachedDataWithAsset);
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

    // HARDCODED RULE: Sub-assets cannot be 199 or 299 (complex types cannot be sub types)
    // This is part of the ONLY hardcoded rule: only 199/299 can be main types (and have sub-assets)
    // All other validations must use the asset_types table
    if (subAssetType === '199' || subAssetType === '299') {
      return {
        valid: false,
        error: 'סוג משנה לא יכול להיות סוג מורכב (199, 299). נכסי משנה חייבים להיות סוגי נכס פשוטים'
      };
    }

    // CRITICAL: Pass taxRegion from tab - this ensures building.tax_region is COMPLETELY IGNORED
    // When taxRegion is provided, validateAssetTypeComplete will use ONLY the tab's tax region
    // and will NOT use building.tax_region at all, even if the building has multiple tax regions
    // Pass main asset data for penthouse validation - sub-assets should check the main asset's penthouse value
    // IMPORTANT: Pass subAssetSize as-is (not || 0) so that undefined/null sizes are properly handled
    // The validation will check size constraints from asset_types table if size is provided
    // Pass isSubAsset=true so error messages say "גודל נכס משנה" instead of "גודל הנכס"
    const sizeToValidate = subAssetSize != null ? subAssetSize : 0;
    return await validateAssetTypeComplete(buildingNumber, subAssetType, sizeToValidate, mainAssetData, taxRegion, cachedData, true);
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

  validateAssetTypeRequiresSize: async (
    mainAssetType: string | undefined,
    assetSize: number | undefined,
    subAssetTypes: (string | undefined)[],
    subAssetSizes: (number | undefined)[]
  ): Promise<ValidationResult> => {
    return await validateAssetTypeRequiresSize(mainAssetType, assetSize, subAssetTypes, subAssetSizes);
  },

  validateSubAssetSizeMatchesMain: async (
    mainAssetSize: number | undefined,
    subAssetTypes: (string | undefined)[],
    subAssetSizes: (number | undefined)[],
    mainAssetType?: string | undefined
  ): Promise<ValidationResult> => {
    return await validateSubAssetSizeMatchesMain(mainAssetSize, subAssetTypes, subAssetSizes, mainAssetType);
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
    const trimmedValue = taxRegionStr.trim();

    // Get all tax regions from asset_types table
    const assetTypes = getAssetTypes();
    const taxRegionsInAssetTypes = new Set(assetTypes.map(at => at.tax_region).filter(tr => tr != null));
    
    // If no asset types loaded, skip validation
    if (taxRegionsInAssetTypes.size === 0) {
      return { valid: true };
    }
    
    // Check if it's a comma-separated value
    if (trimmedValue.includes(',')) {
      const components = trimmedValue.split(',').map(v => v.trim());
      
      // Validate each component exists in asset_types
      if (!skipAssetTypeCheck) {
        for (const component of components) {
          const taxRegionNum = parseInt(component);
          if (isNaN(taxRegionNum) || !taxRegionsInAssetTypes.has(taxRegionNum)) {
            return {
              valid: false,
              error: `אזור מס ${component} לא קיים בסוגי הנכסים`
            };
          }
        }
      }

      return { valid: true };
    }

    // For single values, validate against asset_types table
    if (!skipAssetTypeCheck) {
      const taxRegionNum = parseInt(trimmedValue);
      if (isNaN(taxRegionNum) || !taxRegionsInAssetTypes.has(taxRegionNum)) {
        return {
          valid: false,
          error: `אזור מס ${trimmedValue} לא קיים בסוגי הנכסים`
        };
      }
    }

    return { valid: true };
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

  validateTaxRegionsByBusinessType: async (buildingNumber: number, buildingTaxRegion?: string | number): Promise<ValidationResult> => {
    try {
      // First, validate the building's tax_region field directly if provided
      if (buildingTaxRegion != null) {
        const taxRegionStr = typeof buildingTaxRegion === 'number' ? buildingTaxRegion.toString() : buildingTaxRegion;
        const trimmedValue = taxRegionStr.trim();
        
        // Check if it's a comma-separated value
        if (trimmedValue.includes(',')) {
          const components = trimmedValue.split(',').map(v => v.trim()).map(v => parseInt(v)).filter(v => !isNaN(v));
          
          if (components.length > 1) {
            // Get all asset types to check business_residence for each tax region
            const assetTypes = await api.assetTypes.getAll();
            
            // Map tax regions to their business_residence types
            const taxRegionToBusinessType = new Map<number, string>();
            for (const at of assetTypes) {
              if (at.tax_region != null && at.business_residence) {
                taxRegionToBusinessType.set(at.tax_region, at.business_residence);
              }
            }
            
            // Group tax regions by business type
            const businessTypeRegions = new Map<string, number[]>();
            for (const taxRegion of components) {
              const businessType = taxRegionToBusinessType.get(taxRegion);
              if (businessType) {
                if (!businessTypeRegions.has(businessType)) {
                  businessTypeRegions.set(businessType, []);
                }
                businessTypeRegions.get(businessType)!.push(taxRegion);
              }
            }
            
            // Check that each business type has at most one tax region
            const errors: string[] = [];
            
            const businessRegions = businessTypeRegions.get('עסקים');
            if (businessRegions && businessRegions.length > 1) {
              const regions = businessRegions.sort((a, b) => a - b).join(', ');
              errors.push(`אזורי המס ${regions} הם כולם עבור עסקים. ניתן לאזור מס אחד בלבד עבור עסקים`);
            }
            
            const privateRegions = businessTypeRegions.get('מגורים');
            if (privateRegions && privateRegions.length > 1) {
              const regions = privateRegions.sort((a, b) => a - b).join(', ');
              errors.push(`אזורי המס ${regions} הם כולם עבור מגורים. ניתן לאזור מס אחד בלבד עבור מגורים`);
            }
            
            if (errors.length > 0) {
              return {
                valid: false,
                error: errors.join('; ')
              };
            }
          }
        }
      }

      // Also validate based on actual assets in the building
      const assets = await api.assets.getAll(buildingNumber);
      
      if (!assets || assets.length === 0) {
        return { valid: true };
      }

      // Get all asset types
      const assetTypes = await api.assetTypes.getAll();
      
      // Map to find asset types by name
      const assetTypeMap = new Map<string, AssetType>();
      for (const at of assetTypes) {
        assetTypeMap.set(String(at.name), at);
      }

      // Collect tax regions by business_residence type
      const taxRegionsByType = new Map<string, Set<number>>();
      taxRegionsByType.set('עסקים', new Set<number>());
      taxRegionsByType.set('מגורים', new Set<number>());

      // Process each asset (skip non-accountable assets)
      for (const asset of assets) {
        // Skip assets where main_asset_type has not_accountable = true
        if (asset.main_asset_type) {
          const mainAssetType = assetTypeMap.get(String(asset.main_asset_type));
          if (mainAssetType && mainAssetType.not_accountable === true) {
            // Skip this asset entirely - don't process main or sub asset types
            continue;
          }
        }

        // Process main asset type
        if (asset.main_asset_type) {
          const assetType = assetTypeMap.get(String(asset.main_asset_type));
          if (assetType && assetType.business_residence && assetType.tax_region != null) {
            const businessType = assetType.business_residence;
            if (taxRegionsByType.has(businessType)) {
              taxRegionsByType.get(businessType)!.add(assetType.tax_region);
            }
          }
        }

        // Process sub asset types
        for (let i = 1; i <= 6; i++) {
          const subTypeName = asset[`sub_asset_type_${i}` as keyof typeof asset] as string | undefined;
          if (subTypeName) {
            const assetType = assetTypeMap.get(String(subTypeName));
            if (assetType && assetType.business_residence && assetType.tax_region != null) {
              const businessType = assetType.business_residence;
              if (taxRegionsByType.has(businessType)) {
                taxRegionsByType.get(businessType)!.add(assetType.tax_region);
              }
            }
          }
        }
      }

      // Check that each type has at most one tax region
      const errors: string[] = [];
      
      const businessTaxRegions = taxRegionsByType.get('עסקים');
      if (businessTaxRegions && businessTaxRegions.size > 1) {
        const regions = Array.from(businessTaxRegions).sort((a, b) => a - b).join(', ');
        errors.push(`בבניין זה יש יותר מאזור מס אחד עבור עסקים: ${regions}`);
      }

      const privateTaxRegions = taxRegionsByType.get('מגורים');
      if (privateTaxRegions && privateTaxRegions.size > 1) {
        const regions = Array.from(privateTaxRegions).sort((a, b) => a - b).join(', ');
        errors.push(`בבניין זה יש יותר מאזור מס אחד עבור מגורים: ${regions}`);
      }

      if (errors.length > 0) {
        return {
          valid: false,
          error: errors.join('; ')
        };
      }

      return { valid: true };
    } catch (error) {
      console.error('Error validating tax regions by business type:', error);
      return {
        valid: false,
        error: 'שגיאה בבדיקת אזורי מס לפי סוג עסקים/מגורים'
      };
    }
  },

  validateAssetAreaDistribution: async (buildingNumber: number): Promise<ValidationResult> => {
    try {
      // Get building data - catch error if building doesn't exist
      let building: Building;
      try {
        building = await api.buildings.getOne(buildingNumber);
      } catch (error: any) {
        // If building doesn't exist, return valid (nothing to validate)
        if (error?.message === 'Building not found') {
          return { valid: true };
        }
        // Re-throw other errors
        throw error;
      }

      // Get all assets for the building
      const assets = await api.assets.getAll(buildingNumber);
      if (!assets || assets.length === 0) {
        // No assets means distribution is valid (empty building)
        return { valid: true };
      }

      // Get asset types to check for not_accountable
      const assetTypes = await api.assetTypes.getAll();
      const assetTypeMap = new Map<string, any>();
      for (const at of assetTypes) {
        assetTypeMap.set(String(at.name), at);
      }

      // Calculate total asset area (excluding not_accountable assets)
      const totalAssetArea = assets.reduce((sum, asset) => {
        // Skip assets where main_asset_type has not_accountable = true
        if (asset.main_asset_type) {
          const assetType = assetTypeMap.get(String(asset.main_asset_type));
          if (assetType && assetType.not_accountable === true) {
            return sum;
          }
        }
        return sum + (asset.asset_size || 0);
      }, 0);

      // Compare with building's total_building_area or area_for_control
      const expectedArea = building.area_for_control ?? building.total_building_area;
      
      if (expectedArea != null) {
        const expectedAreaNum = Number(expectedArea);
        if (!isNaN(expectedAreaNum) && Math.abs(totalAssetArea - expectedAreaNum) > 0.01) {
          return {
            valid: false,
            error: `סכום שטחי הנכסים (${totalAssetArea.toLocaleString('he-IL')}) אינו תואם לשטח הכולל של המבנה (${expectedAreaNum.toLocaleString('he-IL')})`
          };
        }
      }

      return { valid: true };
    } catch (error) {
      console.error('Error validating asset area distribution:', error);
      return {
        valid: false,
        error: 'שגיאה בבדיקת פיזור שטחי הנכסים'
      };
    }
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

    // Validate tax regions by business type (עסקים/מגורים)
    if (building.building_number != null) {
      const taxRegionsByTypeResult = await buildingValidators.validateTaxRegionsByBusinessType(building.building_number, building.tax_region);
      if (!taxRegionsByTypeResult.valid) {
        errors.tax_region = taxRegionsByTypeResult.error || 'Invalid tax regions by business type';
      }

      // Validate that all assets in the building have properly distributed areas
      const areaDistributionResult = await buildingValidators.validateAssetAreaDistribution(building.building_number);
      if (!areaDistributionResult.valid) {
        errors.assets_area_distribution = areaDistributionResult.error || 'Invalid asset area distribution';
      }
    }

    // Validate area_for_control (should be positive number if provided)
    if (building.area_for_control != null) {
      if (isNaN(Number(building.area_for_control)) || Number(building.area_for_control) < 0) {
        errors.area_for_control = 'Area for control must be a positive number';
      }
    }

    // Validate residence_shared_area (should be positive number if provided)
    if (building.residence_shared_area != null) {
      if (isNaN(Number(building.residence_shared_area)) || Number(building.residence_shared_area) < 0) {
        errors.residence_shared_area = 'Residence shared area must be a positive number';
      }
    }
    
    // Validate business_shared_area (should be positive number if provided)
    if (building.business_shared_area != null) {
      if (isNaN(Number(building.business_shared_area)) || Number(building.business_shared_area) < 0) {
        errors.business_shared_area = 'Business shared area must be a positive number';
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
