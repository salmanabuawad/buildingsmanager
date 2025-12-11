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
  const [fieldConfigs, setFieldConfigs] = useState<Map<string, FieldConfiguration>>(new Map());
  const [loading, setLoading] = useState(true);

  // Load field configurations on mount or when gridName changes
  useEffect(() => {
    async function loadConfigs() {
      try {
        // Check if cache is already loaded
        if (isFieldConfigCacheLoaded()) {
          const cache = getFieldConfigCache();
          if (cache) {
            if (gridName) {
              // Filter from cache by grid_name
              const filtered = new Map<string, FieldConfiguration>();
              cache.forEach((config, key) => {
                if (config.grid_name === gridName) {
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
  const configuredColumnDefs = useMemo(() => {
    if (loading) {
      return columnDefs;
    }

    // Map columns with their configurations
    const columnsWithConfig = columnDefs.map(colDef => {
      // Get field name from colDef (field or colId)
      const fieldName = colDef.field || colDef.colId;
      if (!fieldName) {
        return { colDef, order: Infinity };
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
          order: Infinity
        };
      }

      // Apply field configuration
      return {
        colDef: applyFieldConfigToColumn(colDef, fieldConfig),
        order: fieldConfig.column_order ?? Infinity
      };
    });

    // Sort by column_order, then by original order for items without order
    columnsWithConfig.sort((a, b) => {
      if (a.order !== Infinity && b.order !== Infinity) {
        return a.order - b.order;
      }
      if (a.order !== Infinity) return -1;
      if (b.order !== Infinity) return 1;
      return 0; // Keep original order for items without column_order
    });

    return columnsWithConfig.map(item => item.colDef);
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

