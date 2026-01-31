import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Building as BuildingIcon, AlertCircle, Loader2, Download, RefreshCw, MessageSquare } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatDateToDDMMYYYY } from '../lib/dateUtils';
import { numericValueParser, numericValueParserInt } from '../lib/numberUtils';
import { useGridPreferences } from '../lib/useGridPreferences';
import { useFieldConfig } from '../lib/useFieldConfig';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { useUserRole } from '../contexts/UserRoleContext';
import { Toast } from './Toast';

interface MeasuredNotExportedAssetsProps {
  onSelectAsset: (assetId: string, assetIdentifier: string, buildingNumber: number, taxRegion?: string) => void;
}

export const MeasuredNotExportedAssets = ({ onSelectAsset }: MeasuredNotExportedAssetsProps) => {
  const { t } = useTranslation();
  const { isReadOnly } = useUserRole();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [buildings, setBuildings] = useState<Map<number, Building>>(new Map());
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
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

  // Helper function to get area_description_for_tab from tax region number
  const getAreaDescriptionForTaxRegion = useCallback((taxRegionNum: string | number | null | undefined): string => {
    if (!taxRegionNum || !assetTypes || assetTypes.length === 0) {
      return String(taxRegionNum || '');
    }
    
    const taxRegion = typeof taxRegionNum === 'string' ? parseInt(taxRegionNum.trim(), 10) : taxRegionNum;
    if (isNaN(taxRegion)) {
      return String(taxRegionNum);
    }
    
    // Find first asset type with matching tax_region that has area_description_for_tab
    const matchingAssetType = assetTypes.find(at =>
      at.tax_region === taxRegion && at.area_description_for_tab
    );
    
    return matchingAssetType?.area_description_for_tab || String(taxRegion);
  }, [assetTypes]);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch assets that are measured but not exported
      const measuredAssets = await api.assets.getMeasuredNotExported();
      
      // Fetch asset types
      const assetTypesData = await api.assetTypes.getAll();

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
      setAssetTypes(assetTypesData);
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

  // Column definitions - comprehensive set matching AssetsList, all read-only
  const columnDefs = useMemo<ColDef<Asset>[]>(() => {
    const defs: ColDef<Asset>[] = [
    {
      field: 'building_number',
      headerName: 'מספר מבנה',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'asset_id',
      headerName: t('assetId') || 'מזהה נכס',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => {
        const asset = params.data as Asset;
        if (asset) {
          return {
            textAlign: 'right',
            color: '#059669',
            fontWeight: '600',
            textDecoration: 'underline',
            textDecorationColor: '#10b981',
            textUnderlineOffset: '2px',
            cursor: 'default'
          };
        }
        return { textAlign: 'right' };
      },
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return '';
        const value = params.value != null ? String(params.value) : '';
        
        return (
          <span 
            style={{
              color: '#059669',
              fontWeight: '600',
              textDecoration: 'underline',
              textDecorationColor: '#10b981',
              textUnderlineOffset: '2px',
              cursor: 'default',
              transition: 'all 0.2s ease'
            }}
            className="hover:text-emerald-700 hover:decoration-emerald-600"
            title={t('viewDetails') || 'לחץ לצפייה בפרטים'}
          >
            {value}
          </span>
        );
      },
      onCellClicked: (params: any) => {
        const asset = params.data as Asset;
        if (asset) {
          const assetId = String(asset.asset_id);
          onSelectAsset(
            assetId,
            assetId,
            asset.building_number,
            asset.tax_region ? String(asset.tax_region) : undefined
          );
        }
      }
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate') || 'תאריך מדידה',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value),
      cellStyle: { textAlign: 'right', backgroundColor: '#ecfdf5', fontWeight: '700', color: '#065f46', opacity: 0.8 }
    },
    {
      field: 'payer_id',
      headerName: t('payerId') || 'ת.ז. משלם',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'tax_region',
      headerName: 'אזור מס',
      headerTooltip: 'אזור מס',
      editable: false,
      type: 'numericColumn',
      tooltipValueGetter: (params) => {
        if (params.value == null) return '';
        return getAreaDescriptionForTaxRegion(params.value);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      cellRenderer: (params: any) => {
        if (!params || !params.data) return null;
        const isChecked = params.value === true || params.value === 'כן';
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              disabled
              className="w-4 h-4 text-blue-600 rounded"
            />
          </div>
        );
      }
    },
    {
      field: 'floor',
      headerName: 'קומה',
      editable: false,
      type: 'numericColumn',
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'discount_type',
      headerName: 'סוג הנחה',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'discount_date_from',
      headerName: 'תאריך הנחה מ',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'discount_date_to',
      headerName: 'תאריך הנחה עד',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'comment',
      headerName: 'הערה',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const hasValue = params.value && params.value.trim() !== '';
        return (
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: hasValue ? 'flex-end' : 'center', 
              gap: '4px', 
              direction: 'rtl', 
              width: '100%', 
              paddingRight: hasValue ? '4px' : '0', 
              cursor: 'default', 
              height: '100%' 
            }}
          >
            {hasValue && <span style={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{params.value}</span>}
            <MessageSquare size={16} style={{ color: hasValue ? '#2563eb' : '#94a3b8', flexShrink: 0 }} />
          </div>
        );
      },
      cellStyle: { textAlign: 'right' },
      tooltipValueGetter: (params) => params.value || ''
    },
    {
      field: 'main_asset_type',
      ...processColumnHeader(t('mainAssetType') || 'סוג נכס ראשי'),
      editable: false,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize') || 'גודל נכס',
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1') || 'תת סוג נכס 1',
      editable: false,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1') || 'גודל תת נכס 1',
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2') || 'תת סוג נכס 2',
      editable: false,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2') || 'גודל תת נכס 2',
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3') || 'תת סוג נכס 3',
      editable: false,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3') || 'גודל תת נכס 3',
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4') || 'תת סוג נכס 4',
      editable: false,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4') || 'גודל תת נכס 4',
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5') || 'תת סוג נכס 5',
      editable: false,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5') || 'גודל תת נכס 5',
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6') || 'תת סוג נכס 6',
      editable: false,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6') || 'גודל תת נכס 6',
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'business_distribution_area',
      headerName: 'גודל שטח משותף',
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'business_total_area',
      headerName: 'סה"כ שטח עסקים',
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'residence_distribution_area',
      headerName: 'גודל שטח משותף מגורים',
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'extra_field',
      headerName: '',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'extra_field_1',
      headerName: '',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'extra_field_2',
      headerName: '',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    }
    ];
    
    // Process all headers to add icons for long headers
    return defs.map(colDef => {
      if (colDef.headerName && typeof colDef.headerName === 'string') {
        const processed = processColumnHeader(colDef.headerName);
        return { ...colDef, ...processed };
      }
      return colDef;
    });
  }, [t, assetTypes, getAreaDescriptionForTaxRegion, onSelectAsset]);
  
  // Apply field configurations to column definitions
  const configuredColumnDefs = useFieldConfig(columnDefs, 'measured-not-exported-assets');

  // Export to Excel
  const handleExportToExcel = useCallback(async () => {
    try {
      if (!assets || assets.length === 0) {
        setToast({ message: 'אין נכסים לייצוא', type: 'info' });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      // Get all column headers from configured columns
      const headers = configuredColumnDefs
        .filter(col => col.headerName && col.headerName !== '')
        .map(col => col.headerName as string)
        .reverse(); // Reverse for RTL

      // Get all field names in the same order
      const fields = configuredColumnDefs
        .filter(col => col.field && col.headerName && col.headerName !== '')
        .map(col => col.field as string)
        .reverse();

      const rows = assets.map(asset => {
        return fields.map(field => {
          const value = (asset as any)[field];
          const colDef = configuredColumnDefs.find(col => col.field === field);
          
          // Format based on column type
          if (colDef?.type === 'numericColumn') {
            if (value == null || value === '' || value === 0) return '';
            const num = typeof value === 'number' ? value : parseFloat(value);
            return isNaN(num) || num === 0 ? '' : num.toFixed(2);
          }
          
          if (field === 'measurement_date' || field === 'discount_date_from' || field === 'discount_date_to') {
            return value ? formatDateToDDMMYYYY(value) : '';
          }
          
          if (field === 'penthouse') {
            return value === true || value === 'כן' ? 'כן' : 'לא';
          }
          
          return value != null ? String(value) : '';
        });
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
            columnDefs={configuredColumnDefs}
            defaultColDef={{
              resizable: true,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              wrapText: true,
              autoHeight: false,
              sortable: true,
              filter: true,
              editable: false,
              cellStyle: { textAlign: 'right' },
              headerClass: 'ag-right-aligned-header',
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
