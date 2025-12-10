import React, { useEffect, useCallback, useRef } from 'react';
import { GridApi } from 'ag-grid-community';
import { api } from './api';
import { gridRegistry } from './gridRegistry';

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
  const justSavedRef = useRef(false);

  // Load saved column state function
  const loadColumnState = useCallback(async (gridApi?: GridApi) => {
    const agGridApi = gridApi || gridRef?.current?.api;
    if (!agGridApi || hasLoadedRef.current) return;
    
    // Don't reload if we just saved (to prevent restoring old state after manual save)
    if (justSavedRef.current) {
      justSavedRef.current = false;
      return;
    }

    try {
      isRestoringRef.current = true;
      hasLoadedRef.current = true;
      const savedState = await api.userPreferences.get(userId, preferenceKey);
      
      if (savedState && Array.isArray(savedState) && savedState.length > 0) {
        // Apply saved column state
        agGridApi.applyColumnState({
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
  const saveColumnState = useCallback(async (force: boolean = false) => {
    const gridApi = gridRef?.current?.api;
    if (!gridApi) return;
    
    // If force is true (manual save), bypass the isRestoringRef check
    if (!force && isRestoringRef.current) return;

    try {
      // Get current column state BEFORE any operations
      // This ensures we capture the current visual order
      const columnState = gridApi.getColumnState();
      
      // Only save if we have column state
      if (columnState && columnState.length > 0) {
        // Clean up the state - only save relevant properties
        // IMPORTANT: Preserve the order by using the array as-is
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

        // Set flag to prevent reload after save
        justSavedRef.current = true;
        
        await api.userPreferences.set(userId, preferenceKey, cleanedState);
        
        // Clear the flag after a delay to allow normal reloads later
        setTimeout(() => {
          justSavedRef.current = false;
        }, 1000);
      }
    } catch (error) {
      console.error(`[useGridPreferences] Error saving preferences for ${gridName}:`, error);
      justSavedRef.current = false;
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

  // Register save function in global registry
  useEffect(() => {
    gridRegistry.register(preferenceKey, saveColumnState);
    
    return () => {
      gridRegistry.unregister(preferenceKey);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [preferenceKey, saveColumnState]);

  return {
    handleColumnResized,
    handleColumnMoved,
    saveColumnState,
    loadColumnState,
    gridApi: gridRef?.current?.api || null,
  };
}

