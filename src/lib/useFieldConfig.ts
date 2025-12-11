import { useEffect, useState, useMemo } from 'react';
import { ColDef } from 'ag-grid-community';
import { loadFieldConfigurations, applyFieldConfigToColumn } from './fieldConfigUtils';
import { FieldConfiguration } from './api';

/**
 * Hook to apply field configurations to column definitions
 * Loads field configurations and applies them to columns based on field name
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

  // Apply field configurations to column definitions
  const configuredColumnDefs = useMemo(() => {
    if (loading) {
      return columnDefs;
    }

    return columnDefs.map(colDef => {
      // Get field name from colDef (field or colId)
      const fieldName = colDef.field || colDef.colId;
      if (!fieldName) {
        return colDef;
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
          ...colDef,
          resizable: false,
        };
      }

      // Apply field configuration
      return applyFieldConfigToColumn(colDef, fieldConfig);
    });
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

