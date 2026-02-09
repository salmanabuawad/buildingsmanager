import { FieldConfiguration, api } from './api';

// Cache for field configurations - key format: "grid_name:field_name"
let fieldConfigCache: Map<string, FieldConfiguration> | null = null;
let fieldConfigCachePromise: Promise<Map<string, FieldConfiguration>> | null = null;
let isCacheLoaded = false;

/**
 * Create a composite key from grid_name and field_name
 */
function createConfigKey(gridName: string, fieldName: string): string {
  return `${gridName}:${fieldName}`;
}

/**
 * Load all field configurations from the database and cache them in memory
 * This should be called at app startup to persist configs in memory
 * @param gridName Optional grid name to filter configurations (but still loads all to cache)
 */
export async function loadFieldConfigurations(gridName?: string): Promise<Map<string, FieldConfiguration>> {
  // If cache is already loaded, return filtered results from cache
  if (isCacheLoaded && fieldConfigCache) {
    if (!gridName) {
      return Promise.resolve(fieldConfigCache);
    }
    
    // Filter from cache by grid_name
    const filtered = new Map<string, FieldConfiguration>();
    fieldConfigCache.forEach((config, key) => {
      if (config.grid_name === gridName) {
        filtered.set(key, config);
        // Also set by field_name for backward compatibility
        filtered.set(config.field_name, config);
      }
    });
    return filtered;
  }

  // Return cached promise if already loading
  if (fieldConfigCachePromise) {
    const allConfigs = await fieldConfigCachePromise;
    if (gridName) {
      // Filter from loaded configs
      const filtered = new Map<string, FieldConfiguration>();
      allConfigs.forEach((config, key) => {
        if (config.grid_name === gridName) {
          filtered.set(key, config);
          filtered.set(config.field_name, config);
        }
      });
      return filtered;
    }
    return allConfigs;
  }

  // Load all configurations from database
  fieldConfigCachePromise = (async () => {
    try {
      // Always load all configurations (no filter) to populate cache
      const configs = await api.fieldConfigurations.getAll();
      const configMap = new Map<string, FieldConfiguration>();
      
      for (const config of configs) {
        const key = createConfigKey(config.grid_name, config.field_name);
        configMap.set(key, config);
        // Also set by field_name only for backward compatibility
        configMap.set(config.field_name, config);
      }
      
      // Store in cache and mark as loaded
      fieldConfigCache = configMap;
      isCacheLoaded = true;
      
      
      // If gridName was requested, filter from cache
      if (gridName) {
        const filtered = new Map<string, FieldConfiguration>();
        configMap.forEach((config, key) => {
          if (config.grid_name === gridName) {
            filtered.set(key, config);
            filtered.set(config.field_name, config);
          }
        });
        return filtered;
      }
      
      return configMap;
    } catch (error) {
      console.error('Error loading field configurations:', error);
      // Return empty map on error
      const emptyMap = new Map();
      fieldConfigCache = emptyMap;
      isCacheLoaded = true; // Mark as loaded even if empty to prevent retries
      return emptyMap;
    } finally {
      fieldConfigCachePromise = null;
    }
  })();

  return fieldConfigCachePromise;
}

/**
 * Get field configuration for a specific field
 * @param gridName Grid name (required)
 * @param fieldName Field name (required)
 */
export async function getFieldConfig(gridName: string, fieldName: string): Promise<FieldConfiguration | null> {
  const configs = await loadFieldConfigurations(gridName);
  const key = createConfigKey(gridName, fieldName);
  return configs.get(key) || null;
}

/**
 * Calculate pixel width from character count
 * Uses average character width of 8px for Hebrew/Arabic characters
 * @param chars Number of characters
 * @param padding Additional padding in pixels
 */
export function calculateWidthFromChars(chars: number, padding: number = 8): number {
  // Average character width for Hebrew/Arabic text is approximately 8-10px
  // Using 8px as base, plus padding on both sides
  return (chars * 8) + (padding * 2);
}

/**
 * Apply field configuration to a column definition
 */
export function applyFieldConfigToColumn(
  colDef: any,
  fieldConfig: FieldConfiguration | null
): any {
  if (!fieldConfig) {
    return colDef;
  }

  const width = calculateWidthFromChars(fieldConfig.width_chars, fieldConfig.padding);
  
  const result: any = {
    ...colDef,
    width: width,
    minWidth: width,
    maxWidth: width,
    resizable: false, // Disable manual resizing
    // Use hebrew_name from field config if available, otherwise keep existing headerName
    headerName: fieldConfig.hebrew_name || colDef.headerName,
    cellStyle: {
      ...colDef.cellStyle,
      textAlign: 'right', // Ensure all columns are right-aligned
      paddingLeft: `${fieldConfig.padding}px`,
      paddingRight: `${fieldConfig.padding}px`,
    },
  };

  // Apply pinning if configured
  // Note: Pinned columns will maintain their position in column_order
  // The order is controlled by column_order, not by pinning
  if (fieldConfig.pinned && fieldConfig.pin_side) {
    result.pinned = fieldConfig.pin_side;
    // Lock pinning but NOT position - position comes from column_order
    result.lockPinned = true;
    result.lockPosition = false; // Allow order to be controlled by column_order
  } else {
    // Explicitly set to null if not pinned (to override any existing pin)
    result.pinned = null;
    result.lockPosition = false;
  }

  // Apply visibility
  if (fieldConfig.visible === false) {
    result.hide = true;
  }

  return result;
}

/**
 * Clear the field configuration cache (useful after updates)
 * This will force a reload on the next access
 */
export function clearFieldConfigCache(): void {
  fieldConfigCache = null;
  fieldConfigCachePromise = null;
  isCacheLoaded = false;
}

/**
 * Check if field configurations are loaded in memory
 */
export function isFieldConfigCacheLoaded(): boolean {
  return isCacheLoaded && fieldConfigCache !== null;
}

/**
 * Get the current cache (synchronous access to already-loaded cache)
 * Returns null if cache is not loaded yet
 */
export function getFieldConfigCache(): Map<string, FieldConfiguration> | null {
  return fieldConfigCache;
}

/**
 * Get all field configurations from memory (synchronous, same pattern as getAssetTypes)
 * Returns empty array if cache is not loaded yet
 */
export function getFieldConfigurations(): FieldConfiguration[] {
  if (!isCacheLoaded || !fieldConfigCache) {
    console.warn('[fieldConfigUtils] Field configurations not yet loaded, returning empty array');
    return [];
  }
  
  // Convert Map to array, avoiding duplicates
  const allConfigs: FieldConfiguration[] = [];
  const seen = new Set<string>();
  
  fieldConfigCache.forEach((config) => {
    // Only add each config once (avoid duplicates from composite key and field_name key)
    const uniqueKey = `${config.grid_name}:${config.field_name}`;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      allConfigs.push(config);
    }
  });
  
  return allConfigs;
}

