import { useEffect, useState, useMemo } from 'react';
import { ColDef } from 'ag-grid-community';
import { loadFieldConfigurations, applyFieldConfigToColumn, getFieldConfigCache, isFieldConfigCacheLoaded } from './fieldConfigUtils';
import { FieldConfiguration } from './api';

/**
 * Hook to apply field configurations to column definitions
 * Uses in-memory cache if available, otherwise loads from database
 * @param columnDefs Column definitions to configure
 * @param gridName Optional grid name to filter configurations for this specific grid
 */
export function useFieldConfig<T = any>(columnDefs: ColDef<T>[], gridName?: string): ColDef<T>[] {
  // Initialize from cache immediately if available (synchronous)
  const getInitialConfigs = (): Map<string, FieldConfiguration> => {
    if (isFieldConfigCacheLoaded()) {
      const cache = getFieldConfigCache();
      if (cache) {
        if (gridName) {
          // Filter from cache by grid_name
          const filtered = new Map<string, FieldConfiguration>();
          cache.forEach((config) => {
            if (config.grid_name === gridName) {
              const key = `${gridName}:${config.field_name}`;
              filtered.set(key, config);
              // Also set by field_name for backward compatibility
              filtered.set(config.field_name, config);
            }
          });
          return filtered;
        }
        return cache;
      }
    }
    return new Map();
  };

  const [fieldConfigs, setFieldConfigs] = useState<Map<string, FieldConfiguration>>(getInitialConfigs);
  const [loading, setLoading] = useState(!isFieldConfigCacheLoaded());

  // Load field configurations on mount or when gridName changes
  useEffect(() => {
    // If cache is already loaded, use it immediately
    if (isFieldConfigCacheLoaded()) {
      const cache = getFieldConfigCache();
      if (cache) {
        if (gridName) {
          // Filter from cache by grid_name
          const filtered = new Map<string, FieldConfiguration>();
          cache.forEach((config) => {
            if (config.grid_name === gridName) {
              const key = `${gridName}:${config.field_name}`;
              filtered.set(key, config);
              filtered.set(config.field_name, config);
            }
          });
          setFieldConfigs(filtered);
        } else {
          setFieldConfigs(cache);
        }
        setLoading(false);
        return;
      }
    }
    
    // Cache not loaded yet, load from database (will populate cache)
    async function loadConfigs() {
      try {
        const configs = await loadFieldConfigurations(gridName);
        setFieldConfigs(configs);
      } catch (error) {
        console.error('Error loading field configurations:', error);
      } finally {
        setLoading(false);
      }
    }
    loadConfigs();
  }, [gridName]);

  // Apply field configurations to column definitions and sort by column_order
  // Only include columns that are visible (visible !== false)
  const configuredColumnDefs = useMemo(() => {
    if (loading) {
      return columnDefs;
    }

    // Map columns with their configurations
    const columnsWithConfig = columnDefs.map(colDef => {
      // Get field name from colDef (field or colId)
      const fieldName = colDef.field || colDef.colId;
      if (!fieldName) {
        return { colDef, order: Infinity, visible: true };
      }

      // Get field configuration - try composite key first if gridName is provided
      let fieldConfig: FieldConfiguration | undefined;
      if (gridName) {
        const compositeKey = `${gridName}:${fieldName}`;
        fieldConfig = fieldConfigs.get(compositeKey);
      }
      
      // Fallback to field_name only (for backward compatibility)
      if (!fieldConfig) {
        fieldConfig = fieldConfigs.get(fieldName);
      }

      if (!fieldConfig) {
        // No configuration found, return original with resizable disabled
        return {
          colDef: {
            ...colDef,
            resizable: false,
          },
          order: Infinity,
          visible: true // Default to visible if no config
        };
      }

      // Apply field configuration
      return {
        colDef: applyFieldConfigToColumn(colDef, fieldConfig),
        order: fieldConfig.column_order ?? Infinity,
        visible: fieldConfig.visible !== false // Default to true if undefined
      };
    });

    // Filter out columns that are not visible (visible === false)
    const visibleColumns = columnsWithConfig.filter(item => item.visible);

    // Sort by column_order from field configuration ONLY
    // This ensures pinned columns maintain their position in the order
    visibleColumns.sort((a, b) => {
      if (a.order !== Infinity && b.order !== Infinity) {
        return a.order - b.order;
      }
      if (a.order !== Infinity) return -1;
      if (b.order !== Infinity) return 1;
      return 0; // Keep original order for items without column_order
    });

    // Map to column definitions - order is preserved from sorting above
    // Pinned columns will maintain their position in this order
    const sortedColumnDefs = visibleColumns.map(item => {
      const colDef = item.colDef;
      // Ensure pinned columns don't override the order
      // The order is already set by the sort above
      if (colDef.pinned) {
        // Keep the pinned property but ensure order is maintained
        return {
          ...colDef,
          // Don't set lockPosition - we want order to be controlled by column_order
          // lockPinned is already set in applyFieldConfigToColumn
        };
      }
      return colDef;
    });

    return sortedColumnDefs;
  }, [columnDefs, fieldConfigs, loading, gridName]);

  return configuredColumnDefs;
}

/**
 * Hook to reload field configurations (useful after updates)
 */
export function useReloadFieldConfig() {
  const [reloadKey, setReloadKey] = useState(0);

  const reload = async () => {
    const { clearFieldConfigCache } = await import('./fieldConfigUtils');
    clearFieldConfigCache();
    setReloadKey(prev => prev + 1);
  };

  return { reload, reloadKey };
}

