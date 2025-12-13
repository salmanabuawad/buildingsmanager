import { useEffect, useState, useMemo, useRef } from 'react';
import { AuditLog, Asset, api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { X, Loader2 } from 'lucide-react';
import { useGridPreferences } from '../lib/useGridPreferences';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';

interface ParsedAuditData {
  asset?: any;
  building?: any;
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
  
  const beforeGridRef = useRef<AgGridReact<any>>(null);
  const afterGridRef = useRef<AgGridReact<any>>(null);
  const assetsGridRef = useRef<AgGridReact<Asset>>(null);

  const beforeGridPreferences = useGridPreferences(beforeGridRef, 'audit-details-before', 'default');
  const afterGridPreferences = useGridPreferences(afterGridRef, 'audit-details-after', 'default');
  const assetsGridPreferences = useGridPreferences(assetsGridRef, 'audit-details-assets', 'default');

  // Load audit log and related assets when actionId changes
  useEffect(() => {
    if (isOpen && actionId) {
      loadAuditDetails();
    } else {
      setAuditLog(null);
      setRelatedAssets([]);
    }
  }, [isOpen, actionId]);

  async function loadAuditDetails() {
    if (!actionId) return;
    
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
      console.error('Error loading audit details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audit details');
    } finally {
      setLoading(false);
    }
  }

  // Parse JSON data
  const parseAuditData = (jsonData: any): ParsedAuditData | null => {
    if (!jsonData) return null;
    
    try {
      if (typeof jsonData === 'string') {
        return JSON.parse(jsonData);
      }
      return jsonData as ParsedAuditData;
    } catch (err) {
      console.error('Error parsing audit data:', err);
      return null;
    }
  };

  // Flatten nested JSON data for grid display
  const flattenData = (data: ParsedAuditData | null): any[] => {
    if (!data) return [];
    
    const rows: any[] = [];
    
    if (data.asset) {
      rows.push({
        _type: 'asset',
        ...data.asset
      });
    }
    
    if (data.building) {
      rows.push({
        _type: 'building',
        ...data.building
      });
    }
    
    return rows;
  };

  // Get before and after data
  const beforeData = useMemo(() => {
    if (!auditLog?.before_data) return [];
    const parsed = parseAuditData(auditLog.before_data);
    return flattenData(parsed);
  }, [auditLog]);

  const afterData = useMemo(() => {
    if (!auditLog?.after_data) return [];
    const parsed = parseAuditData(auditLog.after_data);
    return flattenData(parsed);
  }, [auditLog]);

  // Column definitions for before/after grids
  const createColumnDefs = (data: any[]): ColDef<any>[] => {
    const allKeys = new Set<string>();
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== '_type') allKeys.add(key);
      });
    });

    const columns: ColDef<any>[] = [
      {
        field: '_type',
        headerName: 'סוג',
        width: 100,
        pinned: 'left',
        lockPosition: true,
        sortable: true,
        filter: true,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      }
    ];

    // Limit to 50 columns for performance
    const limitedKeys = Array.from(allKeys).sort().slice(0, 50);

    limitedKeys.forEach(key => {
      columns.push({
        field: key,
        headerName: key,
        width: 150,
        sortable: true,
        filter: true,
        valueFormatter: (params: any) => {
          if (params.value === null || params.value === undefined) return '';
          if (typeof params.value === 'object') return JSON.stringify(params.value);
          return String(params.value);
        },
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      });
    });

    return columns;
  };

  const beforeColumnDefs = useMemo(() => createColumnDefs(beforeData), [beforeData.length]);
  const afterColumnDefs = useMemo(() => createColumnDefs(afterData), [afterData.length]);

  // Assets grid column definitions
  const assetsColumnDefs: ColDef<Asset>[] = useMemo(() => [
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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
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

              {/* Before Data Grid */}
              {beforeData.length > 0 && (
                <div className="flex flex-col">
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">נתונים לפני עדכון</h3>
                  <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '300px' }}>
                    <AgGridReact<any>
                      ref={beforeGridRef}
                      rowData={beforeData}
                      columnDefs={beforeColumnDefs}
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
                        suppressColumnVirtualisation: true,
                        alwaysShowHorizontalScroll: true,
                        suppressMovableColumns: true,
                        suppressColumnMoveAnimation: true,
                        rowBuffer: 20,
                        debounceVerticalScrollbar: true,
                      }}
                      onGridReady={async (params) => {
                        await beforeGridPreferences.loadColumnState(params.api);
                        setTimeout(() => detectAndApplyTextOverflow(params.api), 200);
                      }}
                      onFirstDataRendered={async (params) => {
                        setTimeout(() => {
                          detectAndApplyTextOverflow(params.api);
                          setupTextOverflowObserver(params.api);
                        }, 200);
                      }}
                      onColumnResized={(params) => {
                        beforeGridPreferences.handleColumnResized();
                        setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* After Data Grid */}
              {afterData.length > 0 && (
                <div className="flex flex-col">
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">נתונים אחרי עדכון</h3>
                  <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '300px' }}>
                    <AgGridReact<any>
                      ref={afterGridRef}
                      rowData={afterData}
                      columnDefs={afterColumnDefs}
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
                        suppressColumnVirtualisation: true,
                        alwaysShowHorizontalScroll: true,
                        suppressMovableColumns: true,
                        suppressColumnMoveAnimation: true,
                        rowBuffer: 20,
                        debounceVerticalScrollbar: true,
                      }}
                      onGridReady={async (params) => {
                        await afterGridPreferences.loadColumnState(params.api);
                        setTimeout(() => detectAndApplyTextOverflow(params.api), 200);
                      }}
                      onFirstDataRendered={async (params) => {
                        setTimeout(() => {
                          detectAndApplyTextOverflow(params.api);
                          setupTextOverflowObserver(params.api);
                        }, 200);
                      }}
                      onColumnResized={(params) => {
                        afterGridPreferences.handleColumnResized();
                        setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
                      }}
                    />
                  </div>
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
                      ref={assetsGridRef}
                      rowData={relatedAssets}
                      columnDefs={assetsColumnDefs}
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
                      getRowId={(params) => {
                        const isLatest = params.data.is_latest ? 'latest' : 'history';
                        return `${params.data.asset_id}-${params.data.measurement_date || ''}-${isLatest}`;
                      }}
                      gridOptions={{
                        suppressColumnVirtualisation: true,
                        alwaysShowHorizontalScroll: true,
                        suppressMovableColumns: true,
                        suppressColumnMoveAnimation: true,
                        rowBuffer: 20,
                        debounceVerticalScrollbar: true,
                      }}
                      onGridReady={async (params) => {
                        await assetsGridPreferences.loadColumnState(params.api);
                        setTimeout(() => detectAndApplyTextOverflow(params.api), 200);
                      }}
                      onFirstDataRendered={async (params) => {
                        setTimeout(() => {
                          detectAndApplyTextOverflow(params.api);
                          setupTextOverflowObserver(params.api);
                        }, 200);
                      }}
                      onColumnResized={(params) => {
                        assetsGridPreferences.handleColumnResized();
                        setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
                      }}
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

