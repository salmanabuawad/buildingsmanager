import { useMemo } from 'react';
import { ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { Asset, AuditLog } from '../lib/api';
import { Loader2 } from 'lucide-react';
import { formatNumberToTwoDecimals } from '../lib/numberUtils';

interface DetailRowParams extends ICellRendererParams {
  expandedRows: Set<string>;
  auditDataCache: Map<number, {
    auditLog: AuditLog | null;
    loading: boolean;
    error: string | null;
    beforeAssets: Asset[];
    afterAssets: Asset[];
    relatedAssets: Asset[];
  }>;
  assetColumnDefs: any[];
  beforeAssetGridRef: React.RefObject<AgGridReact<Asset>>;
  beforeAssetGridPreferences: any;
  currentTabAssetId?: number;
  onSelectAsset?: (assetDbId: string | number, assetId: string, buildingNumber: number, taxRegion?: string) => void;
}

export function DetailRowRenderer(params: DetailRowParams) {
  const data = (params as any).data;
  
  if (!data || data._isDetailRow !== true) {
    return null;
  }

  const actionId = data._actionId;
  const auditData = params.auditDataCache.get(actionId);

  if (!auditData) {
    return (
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 text-teal-600 animate-spin" />
          <span className="mr-2 text-slate-700">טוען פרטי ביקורת...</span>
        </div>
      </div>
    );
  }

  if (auditData.loading) {
    return (
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 text-teal-600 animate-spin" />
          <span className="mr-2 text-slate-700">טוען פרטי ביקורת...</span>
        </div>
      </div>
    );
  }

  if (auditData.error) {
    return (
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">שגיאה: {auditData.error}</p>
        </div>
      </div>
    );
  }

  const { auditLog, beforeAssets, afterAssets, relatedAssets } = auditData;

  if (!auditLog) {
    return null;
  }

  // Helper function to check if two values are different
  const valuesAreDifferent = (val1: any, val2: any): boolean => {
    // Handle null/undefined
    if (val1 === null || val1 === undefined) val1 = '';
    if (val2 === null || val2 === undefined) val2 = '';
    
    // Convert to strings for comparison (handles numbers, strings, etc.)
    return String(val1) !== String(val2);
  };

  // Create a map of changed fields for each asset_id (comparing before vs after)
  const changedFieldsMap = useMemo(() => {
    const map = new Map<number, Set<string>>();
    
    // Create maps of before and after assets by asset_id
    const beforeMap = new Map<number, Asset>();
    const afterMap = new Map<number, Asset>();
    
    beforeAssets.forEach(asset => {
      if (asset.asset_id != null) {
        beforeMap.set(asset.asset_id, asset);
      }
    });
    
    afterAssets.forEach(asset => {
      if (asset.asset_id != null) {
        afterMap.set(asset.asset_id, asset);
      }
    });
    
    // Compare before and after for each asset_id
    const allAssetIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    
    allAssetIds.forEach(id => {
      const beforeAsset = beforeMap.get(id);
      const afterAsset = afterMap.get(id);
      
      if (beforeAsset && afterAsset) {
        const changedFields = new Set<string>();
        
        // Compare all fields (excluding metadata fields)
        const fieldsToCompare = Object.keys(beforeAsset).filter(key => 
          !key.startsWith('_') && 
          key !== 'created_at' && 
          key !== 'updated_at' && 
          key !== 'history_created_at' &&
          key !== 'id' &&
          key !== 'action_id'
        );
        
        fieldsToCompare.forEach(field => {
          const beforeValue = (beforeAsset as any)[field];
          const afterValue = (afterAsset as any)[field];
          
          if (valuesAreDifferent(beforeValue, afterValue)) {
            changedFields.add(field);
          }
        });
        
        if (changedFields.size > 0) {
          map.set(id, changedFields);
        }
      }
    });
    
    return map;
  }, [beforeAssets, afterAssets]);

  // Combine all assets into one array with source indicators, sorted by asset_id
  const allDetailAssets = useMemo(() => {
    const combined: any[] = [];
    const actionType = auditLog?.action_type || 'manual_update';
    
    // Add before assets
    beforeAssets.forEach(asset => {
      combined.push({
        ...asset,
        _source: 'before',
        _changeSource: actionType,
        _changedFields: changedFieldsMap.get(asset.asset_id || 0) || new Set<string>()
      });
    });
    
    // Add after assets
    afterAssets.forEach(asset => {
      combined.push({
        ...asset,
        _source: 'after',
        _changeSource: actionType,
        _changedFields: changedFieldsMap.get(asset.asset_id || 0) || new Set<string>()
      });
    });
    
    // Add related assets
    relatedAssets.forEach(asset => {
      combined.push({
        ...asset,
        _source: 'related',
        _changeSource: actionType,
        _changedFields: new Set<string>() // Related assets don't have changes to highlight
      });
    });
    
    // Sort by asset_id, then by source (before comes before after)
    combined.sort((a, b) => {
      const idA = a.asset_id || 0;
      const idB = b.asset_id || 0;
      if (idA !== idB) {
        return idA - idB;
      }
      // If same asset_id, sort by source: before comes before after
      const sourceOrder: { [key: string]: number } = { 'before': 1, 'after': 2, 'related': 3 };
      const orderA = sourceOrder[a._source] || 99;
      const orderB = sourceOrder[b._source] || 99;
      return orderA - orderB;
    });
    
    return combined;
  }, [beforeAssets, afterAssets, relatedAssets, auditLog?.action_type, changedFieldsMap]);

  // Create unified column defs with clickable asset_id and source columns
  const unifiedColumnDefs = useMemo(() => {
    const cols: any[] = [
      {
        field: '_source',
        headerName: 'מקור',
        width: 100,
        pinned: 'left',
        lockPosition: true,
        sortable: true,
        filter: true,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' },
        cellRenderer: (cellParams: any) => {
          const source = cellParams.value;
          if (source === 'before') return 'לפני';
          if (source === 'after') return 'אחרי';
          if (source === 'related') return 'מושפע';
          return source;
        }
      }
    ];
    
    // Define allowed fields: asset_id, asset types, and sizes only
    // Order: asset_id, then subtypes in reverse order (6 to 1), then main type + size (reversed for distribution/transfer tabs)
    const allowedFields = [
      'asset_id',
      'sub_asset_size_6',
      'sub_asset_type_6',
      'sub_asset_size_5',
      'sub_asset_type_5',
      'sub_asset_size_4',
      'sub_asset_type_4',
      'sub_asset_size_3',
      'sub_asset_type_3',
      'sub_asset_size_2',
      'sub_asset_type_2',
      'sub_asset_size_1',
      'sub_asset_type_1',
      'asset_size',
      'main_asset_type'
    ];
    
    // Create a map of column definitions for quick lookup
    const colMap = new Map(params.assetColumnDefs.map((col: any) => [col.field, col]));
    
    // Add asset columns in the specified order (subtypes first, then main type)
    allowedFields.forEach((fieldName) => {
      const col = colMap.get(fieldName);
      if (!col) return;
      if (col.field === 'asset_id') {
        cols.push({
          ...col,
          pinned: 'left',
          cellRenderer: (cellParams: any) => {
            const assetId = cellParams.value;
            const asset = cellParams.data as any;
            const source = asset._source;
            
            // For "after" rows, check if there's a corresponding "before" row with the same asset_id
            // If yes, don't show the asset_id (it should appear only in the "before" row to create a span effect)
            if (source === 'after') {
              // Check if there's a before asset with the same asset_id
              const hasBeforeRow = beforeAssets.some(a => a.asset_id === assetId);
              if (hasBeforeRow) {
                // Return empty cell to create visual span effect
                return '';
              }
            }
            
            // For "before" rows or "after" rows without a matching "before" row, show asset_id
            // For detail records (from distribution/transfer), make all asset IDs clickable
            // For other records, make clickable only if different from current tab's asset ID
            const isDetailRecord = asset._isDetailRecord === true;
            const isDifferentFromTab = params.currentTabAssetId && assetId !== params.currentTabAssetId;
            const shouldBeClickable = isDetailRecord || isDifferentFromTab;
            
            if (params.onSelectAsset && assetId && asset?.building_number && shouldBeClickable) {
              return (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    params.onSelectAsset!(
                      assetId,
                      String(assetId),
                      asset.building_number,
                      asset.tax_region ? String(asset.tax_region) : undefined
                    );
                  }}
                  className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors font-semibold"
                  title="לחץ כדי לפתוח את הנכס"
                >
                  {assetId}
                </button>
              );
            }
            return assetId;
          }
        });
      } else {
        // Add cellStyle function to check if field changed, and valueFormatter for numeric fields
        const originalCellStyle = col.cellStyle;
        const originalValueFormatter = col.valueFormatter;
        const isNumericField = col.field && (
          col.field.includes('size') || 
          col.field.includes('area') || 
          col.field === 'overload_ratio' ||
          col.field === 'floor'
        );
        
        cols.push({
          ...col,
          valueFormatter: isNumericField ? (cellParams: any) => {
            // Use custom formatter for numeric fields, hide 0.00
            const formatted = formatNumberToTwoDecimals(cellParams.value);
            // Return empty string if value is 0.00 or empty
            return formatted === '0.00' || formatted === '' ? '' : formatted;
          } : originalValueFormatter,
          cellStyle: (cellParams: any) => {
            const baseStyle = typeof originalCellStyle === 'function' 
              ? originalCellStyle(cellParams) 
              : (originalCellStyle || { textAlign: 'right' });
            
            const asset = cellParams.data as any;
            const field = col.field;
            const changedFields = asset._changedFields as Set<string> | undefined;
            
            // Apply bold and italic if this field changed for before/after assets
            if (changedFields && changedFields.has(field) && (asset._source === 'before' || asset._source === 'after')) {
              return {
                ...baseStyle,
                fontWeight: 'bold',
                fontStyle: 'italic'
              };
            }
            
            return baseStyle;
          }
        });
      }
    });
    
    return cols;
  }, [params.assetColumnDefs, params.onSelectAsset, beforeAssets]);

  return (
    <div className="p-4 bg-gray-50 border-t border-gray-200" style={{ width: '100%' }}>
      {/* Unified Assets Grid */}
      {allDetailAssets.length > 0 && (
        <div className="flex flex-col" dir="rtl">
          <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '200px', width: '100%', overflowX: 'auto', direction: 'rtl' }}>
            <AgGridReact<Asset>
              ref={params.beforeAssetGridRef}
              rowData={allDetailAssets}
              columnDefs={unifiedColumnDefs}
              defaultColDef={{
                resizable: true,
                wrapHeaderText: true,
                autoHeaderHeight: true,
                wrapText: true,
                autoHeight: false,
                sortable: true,
                filter: true,
                headerClass: 'ag-right-aligned-header',
                headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
                cellStyle: { textAlign: 'right' },
                minWidth: 40
              }}
              getRowId={(gridParams: any) => {
                const source = gridParams.data._source || 'unknown';
                const isLatest = gridParams.data.is_latest ? 'latest' : 'history';
                return `${source}-${gridParams.data.asset_id}-${gridParams.data.measurement_date || ''}-${isLatest}`;
              }}
              gridOptions={{
                suppressColumnVirtualisation: false,
                alwaysShowHorizontalScroll: true,
                suppressMovableColumns: true,
                suppressColumnMoveAnimation: true,
                rowBuffer: 5,
                debounceVerticalScrollbar: true,
                suppressRowClickSelection: false,
                enableCellTextSelection: false,
              }}
              suppressHorizontalScroll={false}
              onGridReady={async (gridParams: any) => {
                await params.beforeAssetGridPreferences.loadColumnState(gridParams.api);
                // Set default sort by asset_id
                gridParams.api.applyColumnState({
                  state: [{ colId: 'asset_id', sort: 'asc' }],
                  defaultState: { sort: null }
                });
                // Scroll to the right side (end) for distribution/transfer tabs (reversed order)
                setTimeout(() => {
                  const displayedColumns = gridParams.api.getDisplayedColumns();
                  const lastColumn = displayedColumns[displayedColumns.length - 1];
                  if (lastColumn) {
                    gridParams.api.ensureColumnVisible(lastColumn, 'middle');
                  }
                }, 100);
              }}
              onFirstDataRendered={async (_gridParams: any) => {}}
              onColumnResized={(_gridParams: any) => {
                params.beforeAssetGridPreferences.handleColumnResized();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

