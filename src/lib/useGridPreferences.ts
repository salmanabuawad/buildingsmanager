import React, { useEffect, useCallback, useRef } from 'react';
import { GridApi } from 'ag-grid-community';
import { api } from './api';

export interface GridColumnState {
  colId: string;
  width?: number;
  hide?: boolean;
  pinned?: string | null;
  sort?: string | null;
  sortIndex?: number | null;
  aggFunc?: string | null;
  rowGroup?: boolean;
  rowGroupIndex?: number | null;
  pivot?: boolean;
  pivotIndex?: number | null;
  flex?: number | null;
}

/**
 * Hook to persist and restore AG Grid column state (order and width)
 * @param gridRef - AG Grid React ref
 * @param gridName - Unique identifier for this grid (e.g., 'assets-list', 'buildings-list')
 * @param userId - User ID (defaults to 'default')
 */
export function useGridPreferences<T = any>(
  gridRef: React.RefObject<{ api?: GridApi }> | null,
  gridName: string,
  userId: string = 'default'
) {
  const preferenceKey = `grid-${gridName}`;
  const isRestoringRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = useRef(false);

  // Load saved column state function
  const loadColumnState = useCallback(async (gridApi?: GridApi) => {
    const api = gridApi || gridRef?.current?.api;
    if (!api || hasLoadedRef.current) return;

    try {
      isRestoringRef.current = true;
      hasLoadedRef.current = true;
      const savedState = await api.userPreferences.get(userId, preferenceKey);
      
      if (savedState && Array.isArray(savedState) && savedState.length > 0) {
        // Apply saved column state
        api.applyColumnState({
          state: savedState,
          applyOrder: true,
          defaultState: { sort: null }
        });
      }
    } catch (error) {
      console.error(`[useGridPreferences] Error loading preferences for ${gridName}:`, error);
    } finally {
      // Allow saving after a short delay to prevent saving during restore
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 500);
    }
  }, [gridRef, preferenceKey, userId, gridName]);

  // Load saved column state when grid API becomes available
  useEffect(() => {
    const gridApi = gridRef?.current?.api;
    if (!gridApi) return;

    // Small delay to ensure grid is fully initialized
    const timeoutId = setTimeout(() => {
      loadColumnState(gridApi);
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [gridRef?.current?.api, preferenceKey, userId, gridName, loadColumnState]);

  // Reset hasLoadedRef when gridName changes (for dynamic grids like assets-list with different building numbers)
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [gridName]);

  // Save column state when it changes
  const saveColumnState = useCallback(async () => {
    const gridApi = gridRef?.current?.api;
    if (!gridApi || isRestoringRef.current) return;

    try {
      const columnState = gridApi.getColumnState();
      
      // Only save if we have column state
      if (columnState && columnState.length > 0) {
        // Clean up the state - only save relevant properties
        const cleanedState: GridColumnState[] = columnState.map(col => ({
          colId: col.colId,
          width: col.width,
          hide: col.hide,
          pinned: col.pinned,
          sort: col.sort,
          sortIndex: col.sortIndex,
          aggFunc: col.aggFunc,
          rowGroup: col.rowGroup,
          rowGroupIndex: col.rowGroupIndex,
          pivot: col.pivot,
          pivotIndex: col.pivotIndex,
          flex: col.flex,
        }));

        await api.userPreferences.set(userId, preferenceKey, cleanedState);
      }
    } catch (error) {
      console.error(`[useGridPreferences] Error saving preferences for ${gridName}:`, error);
    }
  }, [gridRef, preferenceKey, userId, gridName]);

  // Debounced save function
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveColumnState();
    }, 500); // Wait 500ms after last change before saving
  }, [saveColumnState]);

  // Handle column resized
  const handleColumnResized = useCallback(() => {
    debouncedSave();
  }, [debouncedSave]);

  // Handle column moved (order changed)
  const handleColumnMoved = useCallback(() => {
    debouncedSave();
  }, [debouncedSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    handleColumnResized,
    handleColumnMoved,
    saveColumnState,
    loadColumnState,
    gridApi: gridRef?.current?.api || null,
  };
}

