import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { AuditLog, Asset, Building, api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { X, Loader2 } from 'lucide-react';
import { useGridPreferences } from '../lib/useGridPreferences';
import { getAssetTypes } from '../lib/validation';

interface ParsedAuditData {
  asset?: any;
  building?: any;
  assets?: any[]; // Array of assets (for building audits)
}

interface AuditDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionId: number | null;
}

export function AuditDetailsModal({ isOpen, onClose, actionId }: AuditDetailsModalProps) {
  const [auditLog, setAuditLog] = useState<AuditLog | null>(null);
  const [relatedAssets, setRelatedAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Separate refs for building and asset grids
  const beforeBuildingGridRef = useRef<AgGridReact<Building>>(null);
  const beforeAssetGridRef = useRef<AgGridReact<Asset>>(null);
  const afterBuildingGridRef = useRef<AgGridReact<Building>>(null);
  const afterAssetGridRef = useRef<AgGridReact<Asset>>(null);
  const relatedAssetsGridRef = useRef<AgGridReact<Asset>>(null);

  const beforeBuildingGridPreferences = useGridPreferences(beforeBuildingGridRef, 'audit-details-before-building', 'default');
  const beforeAssetGridPreferences = useGridPreferences(beforeAssetGridRef, 'audit-details-before-asset', 'default');
  const afterBuildingGridPreferences = useGridPreferences(afterBuildingGridRef, 'audit-details-after-building', 'default');
  const afterAssetGridPreferences = useGridPreferences(afterAssetGridRef, 'audit-details-after-asset', 'default');
  const relatedAssetsGridPreferences = useGridPreferences(relatedAssetsGridRef, 'audit-details-related-assets', 'default');

  // Load audit log and related assets - memoized to prevent infinite loops
  const loadAuditDetails = useCallback(async () => {
    if (!actionId) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Load audit log entry
      const audit = await api.auditLog.getOne(actionId);
      setAuditLog(audit);
      
      // Load all assets with the same action_id
      const { data, error: assetsError } = await supabase
        .from('assets')
        .select('*')
        .eq('action_id', actionId);
      
      if (assetsError) throw assetsError;
      
      // Also check assets_history
      const { data: historyData, error: historyError } = await supabase
        .from('assets_history')
        .select('*')
        .eq('action_id', actionId);
      
      if (historyError) throw historyError;
      
      // Combine and set related assets
      const allAssets = [
        ...(data || []).map((a: any) => ({ ...a, is_latest: true })),
        ...(historyData || []).map((a: any) => ({ ...a, is_latest: false }))
      ];
      
      setRelatedAssets(allAssets);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[AuditDetailsModal] Error loading audit details:', err);
      }
      setError(err instanceof Error ? err.message : 'Failed to load audit details');
    } finally {
      setLoading(false);
    }
  }, [actionId]);

  // Load audit log and related assets when actionId changes
  // Don't include loadAuditDetails in dependencies to prevent infinite loops
  useEffect(() => {
    if (isOpen && actionId) {
      loadAuditDetails();
    } else {
      // Clear state when modal closes
      setAuditLog(null);
      setRelatedAssets([]);
      setError(null);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, actionId]);

  // Parse JSON data
  const parseAuditData = (jsonData: any): ParsedAuditData | null => {
    if (!jsonData) return null;
    
    try {
      if (typeof jsonData === 'string') {
        return JSON.parse(jsonData);
      }
      return jsonData as ParsedAuditData;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error parsing audit data:', err);
      }
      return null;
    }
  };

  // Extract building records from parsed data
  const extractBuildings = (data: ParsedAuditData | null): Building[] => {
    if (!data) return [];
    
    const buildings: Building[] = [];
    
    if (data.building) {
      // Handle both single building object and array
      if (Array.isArray(data.building)) {
        buildings.push(...data.building);
      } else {
        buildings.push(data.building);
      }
    }
    
    return buildings;
  };

  // Extract asset records from parsed data
  const extractAssets = (data: ParsedAuditData | null): Asset[] => {
    if (!data) return [];
    
    const assets: Asset[] = [];
    
    // Handle assets array (for building audits)
    if (data.assets && Array.isArray(data.assets)) {
      assets.push(...data.assets);
    }
    
    // Handle single asset (for asset audits)
    if (data.asset) {
      if (Array.isArray(data.asset)) {
        assets.push(...data.asset);
      } else {
        assets.push(data.asset);
      }
    }
    
    return assets;
  };

  // Get before and after data separated by type
  const beforeBuildings = useMemo(() => {
    if (!auditLog?.before_data) return [];
    const parsed = parseAuditData(auditLog.before_data);
    return extractBuildings(parsed);
  }, [auditLog]);

  const beforeAssets = useMemo(() => {
    if (!auditLog?.before_data) return [];
    const parsed = parseAuditData(auditLog.before_data);
    return extractAssets(parsed);
  }, [auditLog]);

  const afterBuildings = useMemo(() => {
    if (!auditLog?.after_data) return [];
    const parsed = parseAuditData(auditLog.after_data);
    return extractBuildings(parsed);
  }, [auditLog]);

  const afterAssets = useMemo(() => {
    if (!auditLog?.after_data) return [];
    const parsed = parseAuditData(auditLog.after_data);
    return extractAssets(parsed);
  }, [auditLog]);

  // Building column definitions
  const buildingColumnDefs: ColDef<Building>[] = useMemo(() => [
    {
      field: 'building_number',
      headerName: 'מספר בניין',
      width: 120,
      pinned: 'left',
      lockPosition: true,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'tax_region',
      headerName: 'אזור מס',
      headerTooltip: 'אזור מס',
      tooltipValueGetter: (params: any) => {
        if (params.value == null) return '';
        const cachedAssetTypes = getAssetTypes();
        if (cachedAssetTypes && cachedAssetTypes.length > 0) {
          const taxRegion = typeof params.value === 'string' ? parseInt(params.value.trim(), 10) : params.value;
          if (!isNaN(taxRegion)) {
            const matchingAssetType = cachedAssetTypes.find((at: any) =>
              at && at.tax_region === taxRegion && at.area_description_for_tab
            );
            if (matchingAssetType?.area_description_for_tab) {
              return matchingAssetType.area_description_for_tab;
            }
          }
        }
        return String(params.value);
      },
      width: 100,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'total_building_area',
      headerName: 'סה"כ שטח',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'residence_shared_area',
      headerName: 'שטח משותף מגורים',
      width: 150,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'business_shared_area',
      headerName: 'שטח משותף עסקים',
      width: 150,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'area_for_control',
      headerName: 'שטח לבקרה',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'overload_ratio',
      headerName: 'אחוז העמסה',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'building_address',
      headerName: 'כתובת',
      width: 150,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'gosh',
      headerName: 'גוש',
      width: 100,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'helka',
      headerName: 'חלקה',
      width: 100,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'building_number_in_street',
      headerName: 'מספר בניין ברחוב',
      width: 150,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    }
  ], []);

  // Asset column definitions
  const assetColumnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      field: 'asset_id',
      headerName: 'מזהה נכס',
      width: 120,
      pinned: 'left',
      lockPosition: true,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'building_number',
      headerName: 'מספר בניין',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'payer_id',
      headerName: 'מזהה משלם',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'measurement_date',
      headerName: 'תאריך מדידה',
      width: 150,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'main_asset_type',
      headerName: 'סוג נכס ראשי',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'asset_size',
      headerName: 'גודל נכס',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'tax_region',
      headerName: 'אזור מס',
      headerTooltip: 'אזור מס',
      tooltipValueGetter: (params: any) => {
        if (params.value == null) return '';
        const cachedAssetTypes = getAssetTypes();
        if (cachedAssetTypes && cachedAssetTypes.length > 0) {
          const taxRegion = typeof params.value === 'string' ? parseInt(params.value.trim(), 10) : params.value;
          if (!isNaN(taxRegion)) {
            const matchingAssetType = cachedAssetTypes.find((at: any) =>
              at && at.tax_region === taxRegion && at.area_description_for_tab
            );
            if (matchingAssetType?.area_description_for_tab) {
              return matchingAssetType.area_description_for_tab;
            }
          }
        }
        return String(params.value);
      },
      width: 100,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'apartment_number',
      headerName: 'מספר דירה',
      width: 100,
      sortable: true,
    },
    {
      field: 'apartment_floor',
      headerName: 'קומת דירה',
      width: 100,
      sortable: true,
    },
    {
      field: 'storage_number',
      headerName: 'מספר מחסן',
      width: 100,
      sortable: true,
    },
    {
      field: 'storage_floor',
      headerName: 'קומת מחסן',
      width: 100,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    }
  ], []);

  // Related assets grid column definitions (for assets with same action_id)
  const relatedAssetsColumnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      field: 'asset_id',
      headerName: 'מזהה נכס',
      width: 120,
      pinned: 'left',
      lockPosition: true,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'is_latest',
      headerName: 'סטטוס',
      width: 100,
      sortable: true,
      filter: true,
      cellRenderer: (params: any) => {
        return params.value ? 'נוכחי' : 'היסטוריה';
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'measurement_date',
      headerName: 'תאריך מדידה',
      width: 150,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'building_number',
      headerName: 'מספר בניין',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'main_asset_type',
      headerName: 'סוג נכס ראשי',
      width: 150,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'asset_size',
      headerName: 'גודל נכס',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    }
  ], []);

  // Don't render anything if modal is not open - prevents unnecessary renders
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        // Only close if clicking the backdrop, not the modal content
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        // Close on Escape key
        if (e.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-7xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-slate-800">
            פרטי ביקורת - פעולה #{actionId}
          </h2>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
          >
            <X className="h-4 w-4" />
            סגור
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
              <span className="mr-2 text-slate-700">טוען...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">שגיאה: {error}</p>
            </div>
          )}

          {!loading && !error && auditLog && (
            <>
              {/* Audit Log Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-4">
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
              {(beforeBuildings.length > 0 || beforeAssets.length > 0) && (
                <div className="flex flex-col space-y-4">
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">נתונים לפני עדכון</h3>
                  
                  {/* Before Buildings Grid */}
                  {beforeBuildings.length > 0 && (
                    <div className="flex flex-col">
                      <h4 className="text-md font-medium text-slate-600 mb-2">בניינים ({beforeBuildings.length})</h4>
                      <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '250px' }}>
                        <AgGridReact<Building>
                          ref={beforeBuildingGridRef}
                          rowData={beforeBuildings}
                          columnDefs={buildingColumnDefs}
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
                          onGridReady={async (params: any) => {
                            await beforeBuildingGridPreferences.loadColumnState(params.api);
                          }}
                          onFirstDataRendered={async (_params: any) => {}}
                          onColumnResized={(_params: any) => {
                            beforeBuildingGridPreferences.handleColumnResized();
                          }}
                          singleClickEdit={true}
                          stopEditingWhenCellsLoseFocus={true}
                          animateRows={false}
                        />
                      </div>
                    </div>
                  )}

                  {/* Before Assets Grid */}
                  {beforeAssets.length > 0 && (
                    <div className="flex flex-col">
                      <h4 className="text-md font-medium text-slate-600 mb-2">נכסים ({beforeAssets.length})</h4>
                      <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '250px' }}>
                        <AgGridReact<Asset>
                          ref={beforeAssetGridRef}
                          rowData={beforeAssets}
                          columnDefs={assetColumnDefs}
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
                          onGridReady={async (params: any) => {
                            await beforeAssetGridPreferences.loadColumnState(params.api);
                          }}
                          onFirstDataRendered={async (_params: any) => {}}
                          onColumnResized={(_params: any) => {
                            beforeAssetGridPreferences.handleColumnResized();
                          }}
                          singleClickEdit={true}
                          stopEditingWhenCellsLoseFocus={true}
                          animateRows={false}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* After Update Data */}
              {(afterBuildings.length > 0 || afterAssets.length > 0) && (
                <div className="flex flex-col space-y-4">
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">נתונים אחרי עדכון</h3>
                  
                  {/* After Buildings Grid */}
                  {afterBuildings.length > 0 && (
                    <div className="flex flex-col">
                      <h4 className="text-md font-medium text-slate-600 mb-2">בניינים ({afterBuildings.length})</h4>
                      <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '250px' }}>
                        <AgGridReact<Building>
                          ref={afterBuildingGridRef}
                          rowData={afterBuildings}
                          columnDefs={buildingColumnDefs}
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
                          onGridReady={async (params: any) => {
                            await afterBuildingGridPreferences.loadColumnState(params.api);
                          }}
                          onFirstDataRendered={async (_params: any) => {}}
                          onColumnResized={(_params: any) => {
                            afterBuildingGridPreferences.handleColumnResized();
                          }}
                          singleClickEdit={true}
                          stopEditingWhenCellsLoseFocus={true}
                          animateRows={false}
                        />
                      </div>
                    </div>
                  )}

                  {/* After Assets Grid */}
                  {afterAssets.length > 0 && (
                    <div className="flex flex-col">
                      <h4 className="text-md font-medium text-slate-600 mb-2">נכסים ({afterAssets.length})</h4>
                      <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '250px' }}>
                        <AgGridReact<Asset>
                          ref={afterAssetGridRef}
                          rowData={afterAssets}
                          columnDefs={assetColumnDefs}
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
                          onGridReady={async (params: any) => {
                            await afterAssetGridPreferences.loadColumnState(params.api);
                          }}
                          onFirstDataRendered={async (_params: any) => {}}
                          onColumnResized={(_params: any) => {
                            afterAssetGridPreferences.handleColumnResized();
                          }}
                          animateRows={false}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Related Assets Grid */}
              {relatedAssets.length > 0 && (
                <div className="flex flex-col">
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">
                    נכסים מושפעים ({relatedAssets.length})
                  </h3>
                  <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '300px' }}>
                    <AgGridReact<Asset>
                      ref={relatedAssetsGridRef}
                      rowData={relatedAssets}
                      columnDefs={relatedAssetsColumnDefs}
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
                      getRowId={(params: any) => {
                        const isLatest = params.data.is_latest ? 'latest' : 'history';
                        return `${params.data.asset_id}-${params.data.measurement_date || ''}-${isLatest}`;
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
                      onGridReady={async (params: any) => {
                        await relatedAssetsGridPreferences.loadColumnState(params.api);
                      }}
                      onFirstDataRendered={async (_params: any) => {}}
                      onColumnResized={(_params: any) => {
                        relatedAssetsGridPreferences.handleColumnResized();
                      }}
                      singleClickEdit={true}
                      stopEditingWhenCellsLoseFocus={true}
                      animateRows={false}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

