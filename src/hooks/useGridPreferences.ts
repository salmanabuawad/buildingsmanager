import { useCallback, useRef, useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { api } from '../lib/api';

const USER_ID = 'default'; // In a real app, this would come from auth

export function useGridPreferences(
  gridRef: React.RefObject<AgGridReact<any>>,
  preferenceKey: string
) {
  const savePreferencesTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [columnStateLoaded, setColumnStateLoaded] = useState(false);

  // Load saved column state
  const loadColumnState = useCallback(async () => {
    try {
      console.log(`[${preferenceKey}] Loading column state...`);
      const preference = await api.userPreferences.get(USER_ID, preferenceKey);
      if (preference && preference.preference_value && gridRef.current?.api) {
        const savedState = preference.preference_value;
        
        // Handle both old format (just array) and new format (object with columnState and sortModel)
        let columnState: any[];
        let sortModel: any[] | null = null;
        
        if (Array.isArray(savedState)) {
          // Old format: just column state array
          columnState = savedState;
        } else if (savedState.columnState) {
          // New format: object with columnState and sortModel
          columnState = savedState.columnState;
          sortModel = savedState.sortModel || null;
        } else {
          console.warn(`[${preferenceKey}] Unexpected saved state format:`, savedState);
          return false;
        }
        
        // Log column state for debugging (including sort info)
        const columnInfo = Array.isArray(columnState)
          ? columnState.map((col: any, index: number) => ({ 
              colId: col.colId, 
              width: col.width, 
              hide: col.hide,
              sort: col.sort,
              sortIndex: col.sortIndex,
              savedPosition: index
            }))
          : [];
        console.log(`[${preferenceKey}] Found saved column state (widths, order, visibility, sorting):`, columnInfo);
        if (sortModel) {
          console.log(`[${preferenceKey}] Found saved sort model:`, sortModel);
        }
        
        // Ensure actions column (if exists) is first and pinned left
        // Filter out actions column from the state, we'll apply it separately
        const actionsColumn = columnState.find((col: any) => 
          col.colId === 'actions' || 
          (col.headerName && typeof col.headerName === 'string' && col.headerName.toLowerCase().includes('action'))
        );
        const otherColumns = columnState.filter((col: any) => 
          col.colId !== 'actions' && 
          (!col.headerName || typeof col.headerName !== 'string' || !col.headerName.toLowerCase().includes('action'))
        );
        
        // Apply all columns with order, but ensure actions is first and locked
        const orderedColumns = actionsColumn 
          ? [{
              ...actionsColumn,
              colId: 'actions',
              pinned: 'left',
              lockPosition: true,
              lockPinned: true,
              suppressMovable: true,
              suppressSizeToFit: true,
              suppressMenu: true
            }, ...otherColumns]
          : otherColumns;
        
        gridRef.current.api.applyColumnState({
          state: orderedColumns,
          applyOrder: true  // This ensures column positions are restored
        });
        
        // Also apply sort model if available (for redundancy and explicit control)
        if (sortModel && sortModel.length > 0) {
          try {
            if (typeof gridRef.current.api.setSortModel === 'function') {
              gridRef.current.api.setSortModel(sortModel);
              console.log(`[${preferenceKey}] Sort model applied`);
            }
          } catch (e) {
            // setSortModel might not be available, that's okay - sort info is in columnState
            console.log(`[${preferenceKey}] setSortModel not available, using sort info from columnState`);
          }
        }
        
        console.log(`[${preferenceKey}] Column state applied (widths, positions, and sorting restored)`);
        setColumnStateLoaded(true);
        return true;
      } else {
        console.log(`[${preferenceKey}] No saved column state found`);
      }
    } catch (err: any) {
      const errorMessage = err?.message || err?.toString() || 'Unknown error';
      const errorCode = err?.code || 'N/A';
      console.error(`[${preferenceKey}] Failed to load column state:`, {
        error: errorMessage,
        code: errorCode,
        fullError: err
      });
      // If it's a table not found error, show a helpful message
      if (errorCode === '42P01' || errorMessage.includes('does not exist')) {
        console.warn(`[${preferenceKey}] user_preferences table does not exist. Please run the migration: create_user_preferences_table.sql`);
      }
    }
    // Mark as loaded even if no state was found, so we can save new preferences
    setColumnStateLoaded(true);
    return false;
  }, [gridRef, preferenceKey]);

  // Save column state with debounce (includes widths, order, visibility, and sorting)
  const saveColumnState = useCallback(() => {
    if (!gridRef.current?.api) return;

    // Clear existing timeout
    if (savePreferencesTimeoutRef.current) {
      clearTimeout(savePreferencesTimeoutRef.current);
    }

    // Debounce save by 500ms
    savePreferencesTimeoutRef.current = setTimeout(async () => {
      try {
        if (!gridRef.current?.api) return;
        
        // getColumnState() returns columns in their current order with all properties
        // The array order itself represents the column position/order
        // It also includes sort information (sort, sortIndex) for each column
        const columnState = gridRef.current.api.getColumnState();
        
        // Try to get sort model, but handle if method doesn't exist
        let sortModel: any[] | null = null;
        try {
          if (typeof gridRef.current.api.getSortModel === 'function') {
            sortModel = gridRef.current.api.getSortModel();
          }
        } catch (e) {
          // getSortModel might not be available, that's okay - sort info is in columnState
          console.log(`[${preferenceKey}] getSortModel not available, using sort info from columnState`);
        }
        
        if (columnState && columnState.length > 0) {
          // Log column state for debugging (including sort info)
          const columnInfo = columnState.map((col: any) => ({ 
            colId: col.colId, 
            width: col.width, 
            hide: col.hide,
            sort: col.sort,
            sortIndex: col.sortIndex,
            position: columnState.indexOf(col)
          }));
          console.log(`[${preferenceKey}] Saving column state (widths, order, visibility, sorting):`, columnInfo);
          if (sortModel) {
            console.log(`[${preferenceKey}] Sort model:`, sortModel);
          }
          
          // Save both column state (includes sort) and sort model for redundancy
          const stateToSave = {
            columnState: columnState,
            sortModel: sortModel || null
          };
          
          await api.userPreferences.set(USER_ID, preferenceKey, stateToSave);
          console.log(`[${preferenceKey}] Column state saved successfully (including positions and sorting)`);
        }
      } catch (err) {
        console.error(`[${preferenceKey}] Failed to save column state:`, err);
      }
    }, 500);
  }, [gridRef, preferenceKey]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (savePreferencesTimeoutRef.current) {
        clearTimeout(savePreferencesTimeoutRef.current);
      }
    };
  }, []);

  return {
    loadColumnState,
    saveColumnState,
    columnStateLoaded
  };
}

