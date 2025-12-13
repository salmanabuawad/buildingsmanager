import { useMemo } from 'react';
import { ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { Asset, AuditLog } from '../lib/api';
import { Loader2 } from 'lucide-react';

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

  // Combine all assets into one array with source indicators, sorted by asset_id
  const allDetailAssets = useMemo(() => {
    const combined: any[] = [];
    const actionType = auditLog?.action_type || 'manual_update';
    
    // Add before assets
    beforeAssets.forEach(asset => {
      combined.push({
        ...asset,
        _source: 'before',
        _changeSource: actionType
      });
    });
    
    // Add after assets
    afterAssets.forEach(asset => {
      combined.push({
        ...asset,
        _source: 'after',
        _changeSource: actionType
      });
    });
    
    // Add related assets
    relatedAssets.forEach(asset => {
      combined.push({
        ...asset,
        _source: 'related',
        _changeSource: actionType
      });
    });
    
    // Sort by asset_id
    combined.sort((a, b) => {
      const idA = a.asset_id || 0;
      const idB = b.asset_id || 0;
      return idA - idB;
    });
    
    return combined;
  }, [beforeAssets, afterAssets, relatedAssets, auditLog?.action_type]);

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
      },
      {
        field: '_changeSource',
        headerName: 'סוג שינוי',
        width: 150,
        pinned: 'left',
        lockPosition: true,
        sortable: true,
        filter: true,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' },
        cellRenderer: (cellParams: any) => {
          const changeSource = cellParams.value;
          if (changeSource === 'manual_update') return 'עדכון ידני';
          if (changeSource === 'import_file') return 'ייבוא קובץ';
          if (changeSource === 'transfer_area') return 'העברת שטח';
          if (changeSource === 'distribute_shared') return 'חלוקת שטח משותף';
          return changeSource;
        }
      }
    ];
    
    // Add asset columns with clickable asset_id
    params.assetColumnDefs.forEach((col: any) => {
      if (col.field === 'asset_id') {
        cols.push({
          ...col,
          pinned: 'left',
          cellRenderer: (cellParams: any) => {
            const assetId = cellParams.value;
            const asset = cellParams.data as Asset;
            // Only make clickable if different from current tab's asset_id
            const isDifferentAsset = params.currentTabAssetId != null && assetId !== params.currentTabAssetId;
            if (params.onSelectAsset && assetId && asset?.building_number && isDifferentAsset) {
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
        cols.push(col);
      }
    });
    
    return cols;
  }, [params.assetColumnDefs, params.onSelectAsset]);

  return (
    <div className="p-4 bg-gray-50 border-t border-gray-200" style={{ width: '100%' }}>
      {/* Unified Assets Grid */}
      {allDetailAssets.length > 0 && (
        <div className="flex flex-col">
          <div className="ag-theme-alpine rounded border border-blue-100" style={{ height: '200px' }}>
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
                cellStyle: { textAlign: 'right' },
                minWidth: 100
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
                enableCellTextSelection: false,
              }}
              onGridReady={async (gridParams: any) => {
                await params.beforeAssetGridPreferences.loadColumnState(gridParams.api);
                // Set default sort by asset_id
                gridParams.api.applyColumnState({
                  state: [{ colId: 'asset_id', sort: 'asc' }],
                  defaultState: { sort: null }
                });
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

