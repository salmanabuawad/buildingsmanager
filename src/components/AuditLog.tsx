import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { AuditLog as AuditLogType, api } from '../lib/api';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { useGridPreferences } from '../lib/useGridPreferences';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';
import { RefreshCw, Loader2 } from 'lucide-react';

interface ParsedAuditData {
  asset?: any;
  building?: any;
}

export function AuditLog() {
  const [auditLogs, setAuditLogs] = useState<AuditLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<AuditLogType | null>(null);
  
  const masterGridRef = useRef<AgGridReact<AuditLogType>>(null);
  const detailGridRef = useRef<AgGridReact<any>>(null);

  const masterGridPreferences = useGridPreferences(
    masterGridRef,
    'audit-log-master',
    'default'
  );

  const detailGridPreferences = useGridPreferences(
    detailGridRef,
    'audit-log-detail',
    'default'
  );

  // Load audit logs
  useEffect(() => {
    loadAuditLogs();
  }, []);

  async function loadAuditLogs() {
    try {
      setLoading(true);
      setError(null);
      const logs = await api.auditLog.getAll();
      setAuditLogs(logs || []);
    } catch (err) {
      console.error('Error loading audit logs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }

  // Parse JSON data from before_data or after_data
  const parseAuditData = useCallback((jsonData: any): ParsedAuditData | null => {
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
  }, []);

  // Flatten nested JSON data for grid display
  const flattenData = useCallback((data: ParsedAuditData | null): any[] => {
    if (!data) return [];
    
    const rows: any[] = [];
    
    // Add asset data if present
    if (data.asset) {
      rows.push({
        _type: 'asset',
        ...data.asset
      });
    }
    
    // Add building data if present
    if (data.building) {
      rows.push({
        _type: 'building',
        ...data.building
      });
    }
    
    return rows;
  }, []);

  // Get detail data (before_data) for selected row
  const detailData = useMemo(() => {
    if (!selectedRow || !selectedRow.before_data) return [];
    const parsed = parseAuditData(selectedRow.before_data);
    return flattenData(parsed);
  }, [selectedRow, parseAuditData, flattenData]);

  // Get master data - show audit log entries with after_data flattened into columns
  const masterData = useMemo(() => {
    return auditLogs.map(log => {
      const parsed = parseAuditData(log.after_data);
      const flattened = flattenData(parsed);
      
      // Merge audit log metadata with flattened after_data
      const masterRow: any = {
        ...log,
        _has_before_data: !!log.before_data
      };
      
      // Add flattened after_data fields to master row
      if (flattened.length > 0) {
        // Merge all flattened rows into one object (taking first non-null value for each key)
        flattened.forEach(row => {
          Object.keys(row).forEach(key => {
            if (key !== '_type' && masterRow[key] === undefined) {
              masterRow[key] = row[key];
            }
          });
        });
        // Add a field to indicate which types are present
        masterRow._data_types = flattened.map(r => r._type).join(', ');
      }
      
      return masterRow;
    });
  }, [auditLogs, parseAuditData, flattenData]);

  // Master grid column definitions (showing audit log metadata + after_data fields)
  const masterColumnDefs: ColDef<any>[] = useMemo(() => {
    // Base columns for audit log metadata
    const baseColumns: ColDef<any>[] = [
      {
        field: 'action_id',
        headerName: 'מזהה פעולה',
        width: 120,
        pinned: 'left',
        lockPosition: true,
        sortable: true,
        filter: true,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      },
      {
        field: 'created_at',
        headerName: 'תאריך',
        width: 180,
        sortable: true,
        filter: true,
        valueFormatter: (params: any) => {
          if (!params.value) return '';
          const date = new Date(params.value);
          return date.toLocaleString('he-IL');
        },
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      },
      {
        field: 'user_name',
        headerName: 'משתמש',
        width: 150,
        sortable: true,
        filter: true,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      },
      {
        field: 'action_type',
        headerName: 'סוג פעולה',
        width: 150,
        sortable: true,
        filter: true,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      },
      {
        field: 'entity_type',
        headerName: 'סוג ישות',
        width: 120,
        sortable: true,
        filter: true,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      },
      {
        field: 'entity_id',
        headerName: 'מזהה ישות',
        width: 120,
        sortable: true,
        filter: true,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      },
      {
        field: 'description',
        headerName: 'תיאור',
        width: 200,
        sortable: true,
        filter: true,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      },
      {
        field: '_has_before_data',
        headerName: 'יש נתונים לפני',
        width: 120,
        sortable: true,
        filter: true,
        cellRenderer: (params: any) => {
          return params.value ? 'כן' : 'לא';
        },
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      }
    ];

    // Get all unique keys from after_data across all rows
    const allAfterDataKeys = new Set<string>();
    masterData.forEach(row => {
      Object.keys(row).forEach(key => {
        // Skip audit log metadata fields and internal fields
        if (!['action_id', 'user_name', 'action_type', 'entity_type', 'entity_id', 'description', 'created_at', 'before_data', 'after_data', '_has_before_data', '_parsed_after_data', '_data_types'].includes(key)) {
          allAfterDataKeys.add(key);
        }
      });
    });

    // Add columns for after_data fields
    const afterDataColumns: ColDef<any>[] = Array.from(allAfterDataKeys).sort().map(key => ({
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
    }));

    return [...baseColumns, ...afterDataColumns];
  }, [masterData]);

  // Detail grid column definitions (showing before_data fields)
  const detailColumnDefs: ColDef<any>[] = useMemo(() => {
    // Get all unique keys from detail data
    const allKeys = new Set<string>();
    detailData.forEach(row => {
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

    // Add columns for each unique key
    Array.from(allKeys).sort().forEach(key => {
      columns.push({
        field: key,
        headerName: key,
        width: 150,
        sortable: true,
        filter: true,
        valueFormatter: (params) => {
          if (params.value === null || params.value === undefined) return '';
          if (typeof params.value === 'object') return JSON.stringify(params.value);
          return String(params.value);
        },
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' }
      });
    });

    return columns;
  }, [detailData]);

  const onMasterRowSelected = useCallback((event: any) => {
    if (event.node.isSelected()) {
      setSelectedRow(event.data);
    } else {
      setSelectedRow(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">טוען יומן ביקורת...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">שגיאה: {error}</p>
          <button
            onClick={loadAuditLogs}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col p-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">יומן ביקורת</h1>
        <button
          onClick={loadAuditLogs}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          רענן
        </button>
      </div>

      {/* Master Grid - After Update Data */}
      <div className="flex-1 flex flex-col">
        <h2 className="text-lg font-semibold text-slate-700 mb-2">נתונים אחרי עדכון</h2>
        <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100 flex-1" style={{ minHeight: '300px' }}>
          <AgGridReact<AuditLogType>
            ref={masterGridRef}
            rowData={masterData}
            columnDefs={masterColumnDefs}
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
            rowSelection="single"
            onRowClicked={onMasterRowSelected}
            getRowId={(params) => String(params.data.action_id)}
            gridOptions={{
              suppressColumnVirtualisation: false,
              alwaysShowHorizontalScroll: true,
              suppressMovableColumns: true,
              suppressColumnMoveAnimation: true,
              rowBuffer: 10,
              debounceVerticalScrollbar: true,
            }}
            suppressHorizontalScroll={false}
            onGridReady={async (params) => {
              await masterGridPreferences.loadColumnState(params.api);
              setTimeout(() => {
                detectAndApplyTextOverflow(params.api);
              }, 200);
            }}
            onFirstDataRendered={async (params) => {
              setTimeout(() => {
                detectAndApplyTextOverflow(params.api);
                setupTextOverflowObserver(params.api);
              }, 200);
            }}
            onColumnResized={(params) => {
              masterGridPreferences.handleColumnResized();
              setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
            }}
            onColumnMoved={masterGridPreferences.handleColumnMoved}
          />
        </div>
      </div>

      {/* Detail Grid - Before Update Data */}
      {selectedRow && selectedRow.before_data && (
        <div className="flex-1 flex flex-col">
          <h2 className="text-lg font-semibold text-slate-700 mb-2">נתונים לפני עדכון</h2>
          <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100 flex-1" style={{ minHeight: '300px' }}>
            <AgGridReact<any>
              ref={detailGridRef}
              rowData={detailData}
              columnDefs={detailColumnDefs}
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
              getRowId={(params) => `${params.data._type}-${params.rowIndex}`}
              gridOptions={{
                suppressColumnVirtualisation: false,
                alwaysShowHorizontalScroll: true,
                suppressMovableColumns: true,
                suppressColumnMoveAnimation: true,
                rowBuffer: 10,
                debounceVerticalScrollbar: true,
              }}
              suppressHorizontalScroll={false}
              onGridReady={async (params) => {
                await detailGridPreferences.loadColumnState(params.api);
                setTimeout(() => {
                  detectAndApplyTextOverflow(params.api);
                }, 200);
              }}
              onFirstDataRendered={async (params) => {
                setTimeout(() => {
                  detectAndApplyTextOverflow(params.api);
                  setupTextOverflowObserver(params.api);
                }, 200);
              }}
              onColumnResized={(params) => {
                detailGridPreferences.handleColumnResized();
                setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
              }}
              onColumnMoved={detailGridPreferences.handleColumnMoved}
            />
          </div>
        </div>
      )}

      {selectedRow && !selectedRow.before_data && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-600 text-center">לא קיימים נתונים לפני עדכון עבור רשומה זו</p>
        </div>
      )}
    </div>
  );
}

