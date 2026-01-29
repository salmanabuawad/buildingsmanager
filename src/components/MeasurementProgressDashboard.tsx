import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
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
          <BarChart3 className="h-6 w-6 text-purple-600" />
          <h2 className="text-xl font-bold text-slate-800">התקדמות פעילות מדידות</h2>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-purple-300 rounded-lg hover:bg-purple-50 text-purple-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          רענן
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="p-4 border-b border-purple-200 bg-white">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-purple-600" />
            <label className="text-sm font-medium text-slate-700">מתאריך:</label>
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
              className="px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              dir="rtl"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">עד תאריך:</label>
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
              className="px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              dir="rtl"
            />
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            חפש
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="p-4 border-b border-purple-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div 
              className={`bg-white rounded-lg p-4 shadow-sm border border-purple-100 ${onOpenBuildingsList ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
              onClick={onOpenBuildingsList}
              title={onOpenBuildingsList ? 'לחץ לפתיחת רשימת מבנים' : ''}
            >
              <p className="text-sm text-slate-600 mb-1">סה"כ מבנים</p>
              <p className="text-2xl font-bold text-purple-700">
                {data.total.totalBuildings.toLocaleString('he-IL')}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-100">
              <p className="text-sm text-slate-600 mb-1">סה"כ נכסים</p>
              <p className="text-2xl font-bold text-indigo-700">
                {data.total.totalAssets.toLocaleString('he-IL')}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-100">
              <p className="text-sm text-slate-600 mb-1">תאריכי מדידה</p>
              <p className="text-2xl font-bold text-blue-700">
                {data.total.uniqueMeasurementDates.toLocaleString('he-IL')}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-100">
              <p className="text-sm text-slate-600 mb-1">סה"כ שטח (מ"ר)</p>
              <p className="text-2xl font-bold text-green-700">
                {data.total.totalArea.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-100">
              <p className="text-sm text-slate-600 mb-1">נשלחו לעירייה</p>
              <p className="text-2xl font-bold text-teal-700">
                {data.total.exportedCount.toLocaleString('he-IL')}
              </p>
            </div>
            <div 
              className={`bg-white rounded-lg p-4 shadow-sm border border-purple-100 ${onOpenMeasuredNotExportedAssets ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
              onClick={onOpenMeasuredNotExportedAssets}
              title={onOpenMeasuredNotExportedAssets ? 'לחץ לפתיחת נכסים שנמדדו ולא נשלחו' : ''}
            >
              <p className="text-sm text-slate-600 mb-1">לא נשלחו לעירייה</p>
              <p className="text-2xl font-bold text-orange-700">
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
                animateRows={true}
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
