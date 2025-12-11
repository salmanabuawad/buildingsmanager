import { FieldConfiguration, api } from './api';

// Cache for field configurations - key format: "grid_name:field_name"
let fieldConfigCache: Map<string, FieldConfiguration> | null = null;
let fieldConfigCachePromise: Promise<Map<string, FieldConfiguration>> | null = null;

/**
 * Create a composite key from grid_name and field_name
 */
function createConfigKey(gridName: string, fieldName: string): string {
  return `${gridName}:${fieldName}`;
}

/**
 * Load all field configurations from the database and cache them
 * @param gridName Optional grid name to filter configurations
 */
export async function loadFieldConfigurations(gridName?: string): Promise<Map<string, FieldConfiguration>> {
  // Return cached promise if already loading
  if (fieldConfigCachePromise) {
    return fieldConfigCachePromise;
  }

  // Return cache if already loaded (only if no grid filter)
  if (fieldConfigCache && !gridName) {
    return Promise.resolve(fieldConfigCache);
  }

  // Load configurations
  fieldConfigCachePromise = (async () => {
    try {
      const configs = await api.fieldConfigurations.getAll(gridName);
      const configMap = new Map<string, FieldConfiguration>();
      
      for (const config of configs) {
        const key = createConfigKey(config.grid_name, config.field_name);
        configMap.set(key, config);
        // Also set by field_name only for backward compatibility
        configMap.set(config.field_name, config);
      }
      
      if (!gridName) {
        fieldConfigCache = configMap;
      }
      return configMap;
    } catch (error) {
      console.error('Error loading field configurations:', error);
      // Return empty map on error
      const emptyMap = new Map();
      if (!gridName) {
        fieldConfigCache = emptyMap;
      }
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
    cellStyle: {
      ...colDef.cellStyle,
      paddingLeft: `${fieldConfig.padding}px`,
      paddingRight: `${fieldConfig.padding}px`,
    },
  };

  // Apply pinning if configured
  if (fieldConfig.pinned && fieldConfig.pin_side) {
    result.pinned = fieldConfig.pin_side;
    // If pinning is set via field config, also lock it
    result.lockPinned = true;
  } else {
    // Explicitly set to null if not pinned (to override any existing pin)
    result.pinned = null;
  }

  // Apply visibility
  if (fieldConfig.visible === false) {
    result.hide = true;
  }

  return result;
}

/**
 * Clear the field configuration cache (useful after updates)
 */
export function clearFieldConfigCache(): void {
  fieldConfigCache = null;
  fieldConfigCachePromise = null;
}

