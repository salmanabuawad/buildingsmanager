import { useEffect, useState, useMemo } from 'react';
import { ColumnDef } from '../components/table/types';
import { loadFieldConfigurations, calculateWidthFromChars, getFieldConfigCache, isFieldConfigCacheLoaded } from './fieldConfigUtils';
import { FieldConfiguration } from './api';

export function useTableFieldConfig<T = any>(
  columnDefs: ColumnDef<T>[],
  gridName?: string
): ColumnDef<T>[] {
  const getInitialConfigs = (): Map<string, FieldConfiguration> => {
    if (isFieldConfigCacheLoaded()) {
      const cache = getFieldConfigCache();
      if (cache) {
        if (gridName) {
          const filtered = new Map<string, FieldConfiguration>();
          cache.forEach((config) => {
            if (config.grid_name === gridName) {
              const key = `${gridName}:${config.field_name}`;
              filtered.set(key, config);
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

  useEffect(() => {
    if (isFieldConfigCacheLoaded()) {
      const cache = getFieldConfigCache();
      if (cache) {
        if (gridName) {
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

  return useMemo(() => {
    if (loading) return columnDefs;

    const columnsWithConfig = columnDefs.map(colDef => {
      const fieldName = colDef.field || colDef.id;
      if (!fieldName) {
        return { colDef, order: Infinity, visible: true };
      }

      let fieldConfig: FieldConfiguration | undefined;
      if (gridName) {
        fieldConfig = fieldConfigs.get(`${gridName}:${fieldName}`);
      }
      if (!fieldConfig) {
        fieldConfig = fieldConfigs.get(fieldName);
      }

      if (!fieldConfig) {
        return { colDef, order: Infinity, visible: true };
      }

      const width = calculateWidthFromChars(fieldConfig.width_chars, fieldConfig.padding);
      const configured: ColumnDef<T> = {
        ...colDef,
        width,
        minWidth: width,
      };

      if (fieldConfig.pinned && fieldConfig.pin_side) {
        configured.pinned = fieldConfig.pin_side as 'left' | 'right';
      }

      if (fieldConfig.visible === false) {
        configured.hidden = true;
      }

      return {
        colDef: configured,
        order: fieldConfig.column_order ?? Infinity,
        visible: fieldConfig.visible !== false,
      };
    });

    const visible = columnsWithConfig.filter(item => item.visible);
    visible.sort((a, b) => {
      if (a.order !== Infinity && b.order !== Infinity) return a.order - b.order;
      if (a.order !== Infinity) return -1;
      if (b.order !== Infinity) return 1;
      return 0;
    });

    return visible.map(item => item.colDef);
  }, [columnDefs, fieldConfigs, loading, gridName]);
}
