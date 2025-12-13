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
  afterAssetGridRef: React.RefObject<AgGridReact<Asset>>;
  relatedAssetsGridRef: React.RefObject<AgGridReact<Asset>>;
  beforeAssetGridPreferences: any;
  afterAssetGridPreferences: any;
  relatedAssetsGridPreferences: any;
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

  // Create asset column defs with clickable asset_id
  const assetColumnDefsWithClickableId = useMemo(() => {
    return params.assetColumnDefs.map((col: any) => {
      if (col.field === 'asset_id') {
        return {
          ...col,
          cellRenderer: (cellParams: any) => {
            const assetId = cellParams.value;
            const asset = cellParams.data as Asset;
            if (params.onSelectAsset && assetId && asset?.building_number) {
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
        };
      }
      return col;
    });
  }, [params.assetColumnDefs, params.onSelectAsset]);

  return (
    <div className="p-4 bg-gray-50 border-t border-gray-200" style={{ width: '100%' }}>
      <div className="space-y-4">
        {/* Audit Log Info */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <h4 className="text-md font-semibold text-slate-800 mb-3">פרטי ביקורת - פעולה #{actionId}</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-semibold">תאריך: </span>
              {new Date(auditLog.created_at).toLocaleString('he-IL')}
            </div>
            <div>
              <span className="font-semibold">משתמש: </span>
              {auditLog.user_name}
            </div>
            <div>
              <span className="font-semibold">סוג פעולה: </span>
              {auditLog.action_type}
            </div>
            <div>
              <span className="font-semibold">סוג ישות: </span>
              {auditLog.entity_type}
            </div>
            {auditLog.description && (
              <div className="col-span-2">
                <span className="font-semibold">תיאור: </span>
                {auditLog.description}
              </div>
            )}
          </div>
        </div>

        {/* Before Update Data */}
        {beforeAssets.length > 0 && (
          <div className="flex flex-col space-y-3">
            <h5 className="text-sm font-semibold text-slate-700">נתונים לפני עדכון</h5>
            
            <div className="flex flex-col">
              <h6 className="text-xs font-medium text-slate-600 mb-1">נכסים ({beforeAssets.length})</h6>
              <div className="ag-theme-alpine rounded border border-blue-100" style={{ height: '200px' }}>
                <AgGridReact<Asset>
                  ref={params.beforeAssetGridRef}
                  rowData={beforeAssets}
                  columnDefs={assetColumnDefsWithClickableId}
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
                  }}
                  onFirstDataRendered={async (_gridParams: any) => {}}
                  onColumnResized={(_gridParams: any) => {
                    params.beforeAssetGridPreferences.handleColumnResized();
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* After Update Data */}
        {afterAssets.length > 0 && (
          <div className="flex flex-col space-y-3">
            <h5 className="text-sm font-semibold text-slate-700">נתונים אחרי עדכון</h5>
            
            <div className="flex flex-col">
              <h6 className="text-xs font-medium text-slate-600 mb-1">נכסים ({afterAssets.length})</h6>
              <div className="ag-theme-alpine rounded border border-blue-100" style={{ height: '200px' }}>
                <AgGridReact<Asset>
                  ref={params.afterAssetGridRef}
                  rowData={afterAssets}
                  columnDefs={assetColumnDefsWithClickableId}
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
                    await params.afterAssetGridPreferences.loadColumnState(gridParams.api);
                  }}
                  onFirstDataRendered={async (_gridParams: any) => {}}
                  onColumnResized={(_gridParams: any) => {
                    params.afterAssetGridPreferences.handleColumnResized();
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Related Assets */}
        {relatedAssets.length > 0 && (
          <div className="flex flex-col">
            <h5 className="text-sm font-semibold text-slate-700 mb-2">
              נכסים מושפעים ({relatedAssets.length})
            </h5>
            <div className="ag-theme-alpine rounded border border-blue-100" style={{ height: '250px' }}>
              <AgGridReact<Asset>
                ref={params.relatedAssetsGridRef}
                rowData={relatedAssets}
                columnDefs={assetColumnDefsWithClickableId}
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
                  const isLatest = gridParams.data.is_latest ? 'latest' : 'history';
                  return `${gridParams.data.asset_id}-${gridParams.data.measurement_date || ''}-${isLatest}`;
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
                  await params.relatedAssetsGridPreferences.loadColumnState(gridParams.api);
                }}
                onFirstDataRendered={async (_gridParams: any) => {}}
                onColumnResized={(_gridParams: any) => {
                  params.relatedAssetsGridPreferences.handleColumnResized();
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

