import { FieldConfiguration } from './api';
import { supabase } from './supabase';

// Cache for field configurations - key format: "grid_name:field_name"
let fieldConfigCache: Map<string, FieldConfiguration> | null = null;
let fieldConfigCachePromise: Promise<Map<string, FieldConfiguration>> | null = null;
let isCacheLoaded = false;

function createConfigKey(gridName: string, fieldName: string): string {
  return `${gridName}:${fieldName}`;
}

/**
 * Load all field configurations from the database and cache them in memory.
 * Uses Supabase client directly to fetch from field_configurations table.
 */
export async function loadFieldConfigurations(gridName?: string): Promise<Map<string, FieldConfiguration>> {
  if (isCacheLoaded && fieldConfigCache) {
    if (!gridName) return Promise.resolve(fieldConfigCache);
    const filtered = new Map<string, FieldConfiguration>();
    fieldConfigCache.forEach((config, key) => {
      if (config.grid_name === gridName) {
        filtered.set(key, config);
        filtered.set(config.field_name, config);
      }
    });
    return filtered;
  }

  if (fieldConfigCachePromise) {
    const allConfigs = await fieldConfigCachePromise;
    if (gridName) {
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

  fieldConfigCachePromise = (async () => {
    try {
      let query = supabase
        .from('field_configurations')
        .select('*')
        .order('grid_name')
        .order('column_order', { ascending: true, nullsFirst: false })
        .order('field_name')
        .limit(5000);

      if (gridName) {
        query = query.eq('grid_name', gridName);
      }

      const { data, error } = await query;

      if (error) throw error;
      const configs = (data || []) as FieldConfiguration[];
      if (process.env.NODE_ENV === 'development' && configs.length > 0) {
        console.log('[fieldConfigUtils] Loaded', configs.length, 'field configs from DB, sample:', configs[0]?.grid_name, configs[0]?.field_name, configs[0]?.hebrew_name);
      }
      const configMap = new Map<string, FieldConfiguration>();
      for (const config of configs) {
        const key = createConfigKey(config.grid_name, config.field_name);
        configMap.set(key, config);
        configMap.set(config.field_name, config);
      }
      fieldConfigCache = configMap;
      isCacheLoaded = true;
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
      console.error('[fieldConfigUtils] Error loading field configurations:', error);
      const emptyMap = new Map<string, FieldConfiguration>();
      fieldConfigCache = emptyMap;
      // Don't cache 403 - allow retry after login
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('403')) isCacheLoaded = true;
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
 * @param options.fontSizeMultiplier Scale factor for font size (small=0.85, normal=1, large=1.55). Base is 1.65.
 */
export function applyFieldConfigToColumn(
  colDef: any,
  fieldConfig: FieldConfiguration | null,
  options?: { isLargeFont?: boolean; fontSizeMultiplier?: number }
): any {
  if (!fieldConfig) {
    return colDef;
  }

  const baseWidth = calculateWidthFromChars(fieldConfig.width_chars, fieldConfig.padding);
  const fontSizeMult = options?.fontSizeMultiplier ?? (options?.isLargeFont ? 1.55 : 1);
  const multiplier = 1.65 * fontSizeMult;
  const width = Math.round(baseWidth * multiplier);
  
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


