import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { BarChart3, Calendar, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { formatDateToDDMMYYYY, parseDateFromDDMMYYYY } from '../lib/dateUtils';

interface YearlyData {
  year: number;
  totalAssets: number;
  totalBuildings: number;
  uniqueMeasurementDates: number;
  totalArea: number;
  exportedCount: number;
  notExportedCount: number;
}

interface MeasurementProgressData {
  yearly: YearlyData[];
  total: {
    totalAssets: number;
    totalBuildings: number;
    uniqueMeasurementDates: number;
    totalArea: number;
    exportedCount: number;
    notExportedCount: number;
  };
}

interface MeasurementProgressDashboardProps {
  onOpenBuildingsList?: () => void;
  onOpenMeasuredNotExportedAssets?: () => void;
}

export const MeasurementProgressDashboard = ({ onOpenBuildingsList, onOpenMeasuredNotExportedAssets }: MeasurementProgressDashboardProps = {}) => {
  const [data, setData] = useState<MeasurementProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Set default dates (current year) and fetch data
  useEffect(() => {
    const today = new Date();
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const yearEnd = new Date(today.getFullYear(), 11, 31);
    
    const startDateStr = `${String(yearStart.getDate()).padStart(2, '0')}/${String(yearStart.getMonth() + 1).padStart(2, '0')}/${yearStart.getFullYear()}`;
    const endDateStr = `${String(yearEnd.getDate()).padStart(2, '0')}/${String(yearEnd.getMonth() + 1).padStart(2, '0')}/${yearEnd.getFullYear()}`;
    
    setStartDate(startDateStr);
    setEndDate(endDateStr);
    
    // Fetch data after setting dates
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        const progressData = await api.assets.getMeasurementProgress(
          startDateStr,
          endDateStr
        );

        setData(progressData);
      } catch (err: any) {
        console.error('Error fetching measurement progress:', err);
        setError(err.message || 'שגיאה בטעינת נתוני התקדמות');
      } finally {
        setLoading(false);
      }
    };
    
    fetchInitialData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const progressData = await api.assets.getMeasurementProgress(
        startDate || undefined,
        endDate || undefined
      );

      setData(progressData);
    } catch (err: any) {
      console.error('Error fetching measurement progress:', err);
      setError(err.message || 'שגיאה בטעינת נתוני התקדמות');
    } finally {
      setLoading(false);
    }
  };

  // Refetch "לא נשלחו לעירייה" after reset exported to automation
  useEffect(() => {
    const handleResetExportSuccess = () => {
      fetchData();
    };
    window.addEventListener('resetExportToAutomationSuccess', handleResetExportSuccess);
    return () => window.removeEventListener('resetExportToAutomationSuccess', handleResetExportSuccess);
  }, [startDate, endDate]);

  // Column definitions for yearly data
  const columnDefs = useMemo<ColDef<YearlyData>[]>(() => [
    {
      field: 'year',
      headerName: 'שנה',
      width: 100,
      cellStyle: { textAlign: 'right', fontSize: '16px' },
      headerClass: 'buildings-list-header',
      headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal' }
    },
    {
      field: 'totalBuildings',
      headerName: 'מספר מבנים',
      width: 120,
      type: 'numericColumn',
      valueFormatter: (params: any) => {
        return params.value != null ? Number(params.value).toLocaleString('he-IL') : '0';
      },
      cellStyle: { textAlign: 'right', fontSize: '16px' },
      headerClass: 'buildings-list-header',
      headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal' }
    },
    {
      field: 'totalAssets',
      headerName: 'מספר נכסים',
      width: 120,
      type: 'numericColumn',
      valueFormatter: (params: any) => {
        return params.value != null ? Number(params.value).toLocaleString('he-IL') : '0';
      },
      cellStyle: { textAlign: 'right', fontSize: '16px' },
      headerClass: 'buildings-list-header',
      headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal' }
    },
    {
      field: 'uniqueMeasurementDates',
      headerName: 'מספר תאריכי מדידה',
      width: 150,
      type: 'numericColumn',
      valueFormatter: (params: any) => {
        return params.value != null ? Number(params.value).toLocaleString('he-IL') : '0';
      },
      cellStyle: { textAlign: 'right', fontSize: '16px' },
      headerClass: 'buildings-list-header',
      headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal' }
    },
    {
      field: 'totalArea',
      headerName: 'סה"כ שטח (מ"ר)',
      width: 150,
      type: 'numericColumn',
      valueFormatter: (params: any) => {
        if (params.value == null) return '0';
        return Number(params.value).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      },
      cellStyle: { textAlign: 'right', fontSize: '16px' },
      headerClass: 'buildings-list-header',
      headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal' }
    },
    {
      field: 'exportedCount',
      headerName: 'נשלחו לעירייה',
      width: 130,
      type: 'numericColumn',
      valueFormatter: (params: any) => {
        return params.value != null ? Number(params.value).toLocaleString('he-IL') : '0';
      },
      cellStyle: { textAlign: 'right', fontSize: '16px' },
      headerClass: 'buildings-list-header',
      headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal' }
    },
    {
      field: 'notExportedCount',
      headerName: 'לא נשלחו לעירייה',
      width: 120,
      type: 'numericColumn',
      valueFormatter: (params: any) => {
        return params.value != null ? Number(params.value).toLocaleString('he-IL') : '0';
      },
      cellStyle: { textAlign: 'right', fontSize: '16px' },
      headerClass: 'buildings-list-header',
      headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal' }
    }
  ], []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-theme-tab-active" />
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
          className="px-4 py-2 bg-theme-tab-active text-white rounded-lg hover:bg-theme-tab-active-hover"
        >
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="page-header rounded-t-lg px-2 py-1 flex items-center justify-between min-h-0">
        <div className="flex items-center gap-1.5">
          <div className="page-header-icon shrink-0 p-0">
            <BarChart3 className="w-3.5 h-3.5" />
          </div>
          <h2 className="page-header-title text-sm font-bold">התקדמות פעילות מדידות</h2>
        </div>
        <button
          onClick={fetchData}
          className="btn btn-action btn-secondary !py-1 !px-2 !min-h-0 text-sm"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          <span>רענן</span>
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="px-3 py-2 border-b border-theme-card-border bg-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-theme-tab-active shrink-0" />
            <label className="text-xs font-medium text-slate-700">מתאריך:</label>
            <input
              type="text"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  fetchData();
                }
              }}
              placeholder="DD/MM/YYYY"
              className="px-2 py-1.5 text-sm border border-purple-300 rounded-md focus:ring-2 focus:ring-theme-action-accent focus:border-theme-action-accent w-28"
              dir="rtl"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-700">עד תאריך:</label>
            <input
              type="text"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  fetchData();
                }
              }}
              placeholder="DD/MM/YYYY"
              className="px-2 py-1.5 text-sm border border-purple-300 rounded-md focus:ring-2 focus:ring-theme-action-accent focus:border-theme-action-accent w-28"
              dir="rtl"
            />
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 text-sm bg-theme-tab-active text-white rounded-lg hover:bg-theme-tab-active-hover transition-colors"
          >
            חפש
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="p-3 border-b border-theme-card-border bg-gradient-to-r from-theme-highlight/30 to-theme-highlight/50">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div 
              className={`bg-white rounded-lg p-3 shadow-sm border border-theme-card-border ${onOpenBuildingsList ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
              onClick={onOpenBuildingsList}
              title={onOpenBuildingsList ? 'לחץ לפתיחת רשימת מבנים' : ''}
            >
              <p className="text-xs text-slate-600 mb-1">סה"כ מבנים</p>
              <p className="text-xl font-bold text-theme-tab-active">
                {data.total.totalBuildings.toLocaleString('he-IL')}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm border border-theme-card-border">
              <p className="text-xs text-slate-600 mb-1">סה"כ נכסים</p>
              <p className="text-xl font-bold text-theme-action-accent">
                {data.total.totalAssets.toLocaleString('he-IL')}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm border border-theme-card-border">
              <p className="text-xs text-slate-600 mb-1">תאריכי מדידה</p>
              <p className="text-xl font-bold text-blue-700">
                {data.total.uniqueMeasurementDates.toLocaleString('he-IL')}
              </p>
            </div>
            <div className="bg-white rounded p-2 shadow-sm border border-theme-card-border">
              <p className="text-[10px] text-slate-600 mb-0.5">סה"כ שטח (מ"ר)</p>
              <p className="text-lg font-bold text-green-700">
                {data.total.totalArea.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm border border-theme-card-border">
              <p className="text-xs text-slate-600 mb-1">נשלחו לעירייה</p>
              <p className="text-xl font-bold text-theme-tab-active">
                {data.total.exportedCount.toLocaleString('he-IL')}
              </p>
            </div>
            <div 
              className={`bg-white rounded-lg p-3 shadow-sm border border-theme-card-border ${onOpenMeasuredNotExportedAssets ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
              onClick={onOpenMeasuredNotExportedAssets}
              title={onOpenMeasuredNotExportedAssets ? 'לחץ לפתיחת נכסים שנמדדו ולא נשלחו' : ''}
            >
              <p className="text-xs text-slate-600 mb-1">לא נשלחו לעירייה</p>
              <p className="text-xl font-bold text-orange-700">
                {data.total.notExportedCount.toLocaleString('he-IL')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Yearly Data Grid */}
      {data && (
        <div className="flex-1 p-4">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">פירוט שנתי</h3>
          <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden border border-slate-200 w-full">
            <div className="ag-theme-alpine buildings-list-grid" style={{ height: 'calc(100vh - 600px)', minHeight: '300px', width: '100%', minWidth: '100%', overflowX: 'auto' }}>
              <AgGridReact
                rowData={data.yearly}
                columnDefs={columnDefs}
                defaultColDef={{
                  resizable: false,
                  wrapHeaderText: true,
                  autoHeaderHeight: true,
                  wrapText: true,
                  autoHeight: false,
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
                animateRows={false}
                localeText={{
                  noRowsToShow: 'אין נתונים להצגה',
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
        </div>
      )}
    </div>
  );
};
