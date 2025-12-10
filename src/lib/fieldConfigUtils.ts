import { FieldConfiguration, api } from './api';

// Cache for field configurations
let fieldConfigCache: Map<string, FieldConfiguration> | null = null;
let fieldConfigCachePromise: Promise<Map<string, FieldConfiguration>> | null = null;

/**
 * Load all field configurations from the database and cache them
 */
export async function loadFieldConfigurations(): Promise<Map<string, FieldConfiguration>> {
  // Return cached promise if already loading
  if (fieldConfigCachePromise) {
    return fieldConfigCachePromise;
  }

  // Return cache if already loaded
  if (fieldConfigCache) {
    return Promise.resolve(fieldConfigCache);
  }

  // Load configurations
  fieldConfigCachePromise = (async () => {
    try {
      const configs = await api.fieldConfigurations.getAll();
      const configMap = new Map<string, FieldConfiguration>();
      
      for (const config of configs) {
        configMap.set(config.field_name, config);
      }
      
      fieldConfigCache = configMap;
      return configMap;
    } catch (error) {
      console.error('Error loading field configurations:', error);
      // Return empty map on error
      fieldConfigCache = new Map();
      return fieldConfigCache;
    } finally {
      fieldConfigCachePromise = null;
    }
  })();

  return fieldConfigCachePromise;
}

/**
 * Get field configuration for a specific field
 */
export async function getFieldConfig(fieldName: string): Promise<FieldConfiguration | null> {
  const configs = await loadFieldConfigurations();
  return configs.get(fieldName) || null;
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
  
  return {
    ...colDef,
    width: width,
    minWidth: width,
    maxWidth: width,
    resizable: false, // Disable manual resizing
    cellStyle: {
      ...colDef.cellStyle,
      paddingLeft: `${fieldConfig.padding}px`,
      paddingRight: `${fieldConfig.padding}px`,
    },
  };
}

/**
 * Clear the field configuration cache (useful after updates)
 */
export function clearFieldConfigCache(): void {
  fieldConfigCache = null;
  fieldConfigCachePromise = null;
}

