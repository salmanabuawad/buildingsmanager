import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Asset, Building, api } from '../lib/api';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Building as BuildingIcon, AlertCircle, Loader2, Download, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatDateToDDMMYYYY } from '../lib/dateUtils';
import { useGridPreferences } from '../lib/useGridPreferences';
import { useUserRole } from '../contexts/UserRoleContext';
import { Toast } from './Toast';

interface MeasuredNotExportedAssetsProps {
  onSelectAsset: (assetId: string, assetIdentifier: string, buildingNumber: number, taxRegion?: string) => void;
}

export const MeasuredNotExportedAssets = ({ onSelectAsset }: MeasuredNotExportedAssetsProps) => {
  const { isReadOnly } = useUserRole();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [buildings, setBuildings] = useState<Map<number, Building>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const gridRef = useRef<AgGridReact<Asset>>(null);

  // Grid preferences hook for saving/loading column state
  const gridPreferences = useGridPreferences(
    gridRef,
    'measured-not-exported-assets',
    'default'
  );

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch assets that are measured but not exported
      const measuredAssets = await api.assets.getMeasuredNotExported();

      // Get unique building numbers
      const buildingNumbers = new Set(measuredAssets.map(a => a.building_number));
      
      // Fetch buildings data
      const buildingsMap = new Map<number, Building>();
      for (const buildingNumber of buildingNumbers) {
        try {
          const building = await api.buildings.getOne(buildingNumber);
          buildingsMap.set(buildingNumber, building);
        } catch (err) {
          console.warn(`Failed to fetch building ${buildingNumber}:`, err);
        }
      }

      setAssets(measuredAssets);
      setBuildings(buildingsMap);
    } catch (err: any) {
      console.error('Error fetching measured not exported assets:', err);
      setError(err.message || 'שגיאה בטעינת הנכסים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch "נכסים שנמדדו ולא נשלחו לעירייה" after reset exported to automation
  useEffect(() => {
    const handleResetExportSuccess = () => {
      fetchData();
    };
    window.addEventListener('resetExportToAutomationSuccess', handleResetExportSuccess);
    return () => window.removeEventListener('resetExportToAutomationSuccess', handleResetExportSuccess);
  }, [fetchData]);

  // Column definitions
  const columnDefs = useMemo<ColDef<Asset>[]>(() => [
    {
      field: 'payer_id',
      headerName: 'ת.ז. משלם',
      width: 120
    },
    {
      field: 'tax_region',
      headerName: 'אזור מיסים',
      width: 120
    },
    {
      field: 'measurement_date',
      headerName: 'תאריך מדידה',
      width: 120,
      cellRenderer: (params: any) => {
        return params.value ? formatDateToDDMMYYYY(params.value) : '';
      }
    },
    {
      field: 'asset_size',
      headerName: 'שטח (מ"ר)',
      width: 120,
      type: 'numericColumn',
      valueFormatter: (params: any) => {
        if (params.value == null) return '';
        return Number(params.value).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    },
    {
      field: 'main_asset_type',
      headerName: 'סוג נכס',
      width: 150
    },
    {
      field: 'asset_id',
      headerName: 'מזהה נכס',
      width: 120
    },
    {
      field: 'building_number',
      headerName: 'מספר מבנה',
      width: 120
    }
  ], [buildings]);

  // Export to Excel
  const handleExportToExcel = useCallback(async () => {
    try {
      if (!assets || assets.length === 0) {
        setToast({ message: 'אין נכסים לייצוא', type: 'info' });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      const headers = [
        'מספר מבנה',
        'מזהה נכס',
        'סוג נכס',
        'שטח (מ"ר)',
        'תאריך מדידה',
        'אזור מיסים',
        'ת.ז. משלם'
      ];

      const rows = assets.map(asset => {
        return [
          asset.building_number || '',
          asset.asset_id || '',
          asset.main_asset_type || '',
          asset.asset_size != null ? Number(asset.asset_size).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
          asset.measurement_date ? formatDateToDDMMYYYY(asset.measurement_date) : '',
          asset.tax_region || '',
          asset.payer_id || ''
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'נכסים שנמדדו ולא נשלחו');

      const fileName = `נכסים_שנמדדו_ולא_נשלחו_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setToast({ message: 'הייצוא הושלם בהצלחה', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      console.error('Error exporting to Excel:', err);
      setToast({ message: err.message || 'שגיאה בייצוא', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  }, [assets, buildings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <BuildingIcon className="h-6 w-6 text-purple-600" />
          <h2 className="text-xl font-bold text-slate-800">נכסים שנמדדו ולא נשלחו לעירייה</h2>
          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
            {assets.length} נכסים
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-purple-300 rounded-lg hover:bg-purple-50 text-purple-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            רענן
          </button>
          <button
            onClick={handleExportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            ייצא ל-Excel
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden border border-slate-200 w-full">
        <div className="ag-theme-alpine buildings-list-grid" style={{ height: '60vh', width: '100%', minWidth: '100%', overflowX: 'auto' }}>
          <AgGridReact
            ref={gridRef}
            rowData={assets}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: false,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              wrapText: true,
              autoHeight: false,
              sortable: true,
              filter: true,
              cellStyle: { textAlign: 'right', fontSize: '16px' },
              headerClass: 'buildings-list-header',
              headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
              minWidth: 40
            }}
            gridOptions={{
              suppressColumnVirtualisation: true,
              alwaysShowHorizontalScroll: true,
              suppressMovableColumns: true,
              suppressColumnMoveAnimation: true,
            }}
            suppressHorizontalScroll={false}
            enableRtl={true}
            domLayout="normal"
            suppressMenuHide={true}
            enableRangeSelection={false}
          onGridReady={async (params) => {
            await gridPreferences.loadColumnState(params.api);
          }}
          onFirstDataRendered={async (params) => {
            await gridPreferences.saveColumnState(params.api);
          }}
          onColumnMoved={async (params) => {
            if (gridRef.current?.api) {
              await gridPreferences.saveColumnState(gridRef.current.api);
            }
          }}
          onColumnResized={async (params) => {
            if (gridRef.current?.api) {
              await gridPreferences.saveColumnState(gridRef.current.api);
            }
          }}
          onRowClicked={(event) => {
            if (event.data) {
              const asset = event.data as Asset;
              onSelectAsset(
                String(asset.asset_id),
                String(asset.asset_id),
                asset.building_number,
                asset.tax_region ? String(asset.tax_region) : undefined
              );
            }
          }}
          rowSelection="single"
          suppressRowClickSelection={false}
          animateRows={true}
          localeText={{
            noRowsToShow: 'אין נכסים להצגה',
            loadingOoo: 'טוען...',
            page: 'עמוד',
            more: 'עוד',
            to: 'עד',
            of: 'מתוך',
            next: 'הבא',
            last: 'אחרון',
            first: 'ראשון',
            previous: 'הקודם',
            loadingError: 'שגיאה בטעינה',
            filterOoo: 'סנן...',
            applyFilter: 'החל',
            resetFilter: 'איפוס',
            clearFilter: 'נקה',
            equals: 'שווה',
            notEqual: 'לא שווה',
            lessThan: 'קטן מ',
            greaterThan: 'גדול מ',
            lessThanOrEqual: 'קטן או שווה',
            greaterThanOrEqual: 'גדול או שווה',
            inRange: 'בטווח',
            contains: 'מכיל',
            notContains: 'לא מכיל',
            startsWith: 'מתחיל ב',
            endsWith: 'מסתיים ב',
            andCondition: 'וגם',
            orCondition: 'או'
          }}
          />
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};
