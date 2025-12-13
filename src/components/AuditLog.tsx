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
      // Limit to 1000 most recent entries for performance
      const logs = await api.auditLog.getAll({ limit: 1000 });
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
  // Only parse JSON when needed (lazy parsing for better performance)
  const masterData = useMemo(() => {
    // Limit parsing to first 100 rows for column detection to avoid performance issues
    const sampleSize = Math.min(100, auditLogs.length);
    const sampleLogs = auditLogs.slice(0, sampleSize);
    
    // Collect all possible keys from sample
    const allPossibleKeys = new Set<string>();
    sampleLogs.forEach(log => {
      const parsed = parseAuditData(log.after_data);
      const flattened = flattenData(parsed);
      flattened.forEach(row => {
        Object.keys(row).forEach(key => {
          if (key !== '_type') {
            allPossibleKeys.add(key);
          }
        });
      });
    });
    
    // Limit to most common 50 fields to avoid too many columns
    const commonKeys = Array.from(allPossibleKeys).slice(0, 50);
    
    // Now process all logs but only include common fields
    return auditLogs.map(log => {
      const masterRow: any = {
        ...log,
        _has_before_data: !!log.before_data,
        _after_data_parsed: false // Flag to indicate if parsed
      };
      
      // Only parse and flatten if we have common keys to show
      if (commonKeys.length > 0) {
        const parsed = parseAuditData(log.after_data);
        const flattened = flattenData(parsed);
        
        // Only add common fields to avoid too many columns
        flattened.forEach(row => {
          commonKeys.forEach(key => {
            if (row[key] !== undefined && masterRow[key] === undefined) {
              masterRow[key] = row[key];
            }
          });
        });
      }
      
      return masterRow;
    });
  }, [auditLogs, parseAuditData, flattenData]);

  // Extract column keys from masterData once and memoize
  const masterDataColumnKeys = useMemo(() => {
    const allAfterDataKeys = new Set<string>();
    masterData.forEach(row => {
      Object.keys(row).forEach(key => {
        if (!['action_id', 'user_name', 'action_type', 'entity_type', 'entity_id', 'description', 'created_at', 'before_data', 'after_data', '_has_before_data', '_after_data_parsed'].includes(key)) {
          allAfterDataKeys.add(key);
        }
      });
    });
    return Array.from(allAfterDataKeys).sort().slice(0, 50);
  }, [auditLogs.length]); // Only recalculate when number of logs changes

  // Master grid column definitions (showing audit log metadata + after_data fields)
  // Memoize based on column keys to avoid recalculation
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

    // Add columns for after_data fields using pre-computed keys
    const afterDataColumns: ColDef<any>[] = masterDataColumnKeys.map(key => ({
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
  }, [masterDataColumnKeys]); // Only recalculate when column keys change

  // Detail grid column definitions (showing before_data fields)
  // Limit columns to avoid performance issues
  const detailColumnDefs: ColDef<any>[] = useMemo(() => {
    if (detailData.length === 0) return [];
    
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

    // Limit to 50 columns max for performance
    const limitedKeys = Array.from(allKeys).sort().slice(0, 50);

    // Add columns for each unique key
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
  }, [detailData.length]); // Only recalculate when detail data length changes

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
              suppressColumnVirtualisation: true, // Disable column virtualization for better performance with many columns
              alwaysShowHorizontalScroll: true,
              suppressMovableColumns: true,
              suppressColumnMoveAnimation: true,
              rowBuffer: 20, // Increase buffer for smoother scrolling
              debounceVerticalScrollbar: true,
              suppressRowVirtualisation: false, // Keep row virtualization enabled
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
                suppressColumnVirtualisation: true, // Disable column virtualization for better performance
                alwaysShowHorizontalScroll: true,
                suppressMovableColumns: true,
                suppressColumnMoveAnimation: true,
                rowBuffer: 20, // Increase buffer for smoother scrolling
                debounceVerticalScrollbar: true,
                suppressRowVirtualisation: false, // Keep row virtualization enabled
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

