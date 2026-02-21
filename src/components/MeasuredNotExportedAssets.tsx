import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
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
import { supabase } from '../lib/supabase';
import { getAssetTypes } from '../lib/validation';
import { createExcelBlob } from '../lib/excelExport';
import { createAndDownloadZip } from '../lib/zipExport';
import { AssetValidationHandler } from '../lib/assetValidationHandler';

// Validation tooltip icon component that uses fixed positioning to avoid overflow clipping
const ValidationTooltipIcon = ({ message }: { message: string }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const iconRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + rect.height / 2,
        right: window.innerWidth - rect.left
      });
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <>
      <div 
        ref={iconRef}
        className="w-4 h-4 flex items-center justify-center flex-shrink-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <AlertCircle className="h-4 w-4 text-red-600" />
      </div>
      {isHovered && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            right: `${position.right}px`,
            transform: 'translateY(-50%)',
            zIndex: 10000,
            pointerEvents: 'none'
          }}
          className="bg-red-50 border-2 border-red-300 rounded-lg shadow-lg p-3 max-w-md"
        >
          <div className="text-sm text-red-800 whitespace-pre-line">{message}</div>
        </div>,
        document.body
      )}
    </>
  );
};

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
  const [exportToAutomationCount, setExportToAutomationCount] = useState<number>(0);
  const [validationErrors, setValidationErrors] = useState<Map<string, string[]>>(new Map());
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

  // Helper function to generate comprehensive tooltip for asset types
  const getAssetTypeTooltip = useCallback((assetTypeName: string | null | undefined): string => {
    if (!assetTypeName) return '';
    const assetType = assetTypes?.find(at => at.name === assetTypeName);
    if (!assetType) return String(assetTypeName);

    const parts = [];

    // Description
    if (assetType.description) {
      parts.push(assetType.description);
    }

    // Business/Residence percentages
    if (assetType.business !== null || assetType.residence !== null) {
      const businessPct = assetType.business || 0;
      const residencePct = assetType.residence || 0;
      parts.push(`עסקי: ${businessPct}% • מגורים: ${residencePct}%`);
    }

    // Size range
    if (assetType.min_size || assetType.max_size) {
      const minSize = assetType.min_size || 0;
      const maxSize = assetType.max_size || '∞';
      parts.push(`טווח שטח: ${minSize} - ${maxSize}`);
    }

    // Flags
    const flags = [];
    if (assetType.non_accountable_for_total_area) flags.push('לא נספר בשטח מבנה');
    if (assetType.non_accountable_for_distribution) flags.push('לא נכלל בפיזור');
    if (assetType.not_accountable_for_statistics) flags.push('לא נכלל בסטטיסטיקה');
    if (assetType.use_shared_area) flags.push('משמש לפיזור שטח משותף');

    if (flags.length > 0) {
      parts.push(flags.join(' • '));
    }

    return parts.join('\n');
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

      // Validate all assets after loading
      await validateAllAssets(measuredAssets, buildingsMap, assetTypesData);
    } catch (err: any) {
      console.error('Error fetching measured not exported assets:', err);
      setError(err.message || 'שגיאה בטעינת הנכסים');
    } finally {
      setLoading(false);
    }
  }, []);

  // Validate all assets and store errors
  const validateAllAssets = useCallback(async (
    assetsToValidate: Asset[],
    buildingsMap: Map<number, Building>,
    assetTypesData: AssetType[]
  ) => {
    if (assetsToValidate.length === 0) {
      setValidationErrors(new Map());
      return;
    }

    const errorsMap = new Map<string, string[]>();

    // Group assets by building number for validation
    const assetsByBuilding = new Map<number, Asset[]>();
    for (const asset of assetsToValidate) {
      const buildingNumber = asset.building_number;
      if (!assetsByBuilding.has(buildingNumber)) {
        assetsByBuilding.set(buildingNumber, []);
      }
      assetsByBuilding.get(buildingNumber)!.push(asset);
    }

    // Validate assets for each building
    for (const [buildingNumber, buildingAssets] of assetsByBuilding.entries()) {
      const building = buildingsMap.get(buildingNumber);
      if (!building) continue;

      const cachedData = {
        assetTypes: assetTypesData,
        building: building
      };

      try {
        const batchResult = await AssetValidationHandler.validateBuildingAssets(
          buildingAssets,
          buildingNumber,
          {
            mode: 'building',
            validateOnlyLatest: false,
            cachedData: cachedData
          }
        );

        // Store errors for each asset
        for (const result of batchResult.results) {
          if (!result.valid && result.errors && result.errors.length > 0) {
            const assetId = typeof result.assetId === 'string' 
              ? result.assetId 
              : String(result.assetId);
            errorsMap.set(assetId, result.errors);
          }
        }
      } catch (err) {
        console.error(`Error validating assets for building ${buildingNumber}:`, err);
      }
    }

    setValidationErrors(errorsMap);
  }, []);

  // Fetch export to automation count
  const fetchExportToAutomationCount = useCallback(async () => {
    try {
      const result = await api.assets.getExportToAutomationCount();
      if (result.success) {
        setExportToAutomationCount(result.count);
      }
    } catch (err) {
      console.error('Error fetching export to automation count:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchExportToAutomationCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // Listen for exportToAutomationSuccess event to refresh count
  useEffect(() => {
    const handleExportSuccess = () => {
      fetchExportToAutomationCount();
    };
    
    window.addEventListener('exportToAutomationSuccess', handleExportSuccess);
    return () => {
      window.removeEventListener('exportToAutomationSuccess', handleExportSuccess);
    };
  }, [fetchExportToAutomationCount]);

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
      colId: 'actions',
      headerName: 'פעולות',
      editable: false,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return null;
        const assetId = String(asset.asset_id);
        const errors = validationErrors.get(assetId);
        const hasErrors = errors && errors.length > 0;
        const errorMessage = hasErrors ? errors.join('\n') : '';

        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {hasErrors && (
              <ValidationTooltipIcon message={errorMessage} />
            )}
          </div>
        );
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
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
      field: 'apartment_number',
      headerName: 'מספר דירה',
      editable: false,
    },
    {
      field: 'apartment_floor',
      headerName: 'קומת דירה',
      editable: false,
    },
    {
      field: 'storage_number',
      headerName: 'מספר מחסן',
      editable: false,
    },
    {
      field: 'storage_floor',
      headerName: 'קומת מחסן',
      editable: false,
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
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
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
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
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
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
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
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
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
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
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
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
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
      tooltipValueGetter: (params) => getAssetTypeTooltip(params.value),
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
  }, [t, assetTypes, getAreaDescriptionForTaxRegion, getAssetTypeTooltip, onSelectAsset, validationErrors]);
  
  // Apply field configurations to column definitions
  const configuredColumnDefs = useFieldConfig(columnDefs, 'measured-not-exported-assets');

  // Sort assets to show invalid ones first
  const sortedAssets = useMemo(() => {
    if (!assets || assets.length === 0) return assets;
    
    return [...assets].sort((a, b) => {
      const aId = String(a.asset_id);
      const bId = String(b.asset_id);
      const aHasErrors = validationErrors.has(aId);
      const bHasErrors = validationErrors.has(bId);
      
      // Invalid assets first
      if (aHasErrors && !bHasErrors) return -1;
      if (!aHasErrors && bHasErrors) return 1;
      
      // If both have errors or both don't, maintain original order (by building_number, then asset_id)
      if (a.building_number !== b.building_number) {
        return a.building_number - b.building_number;
      }
      return String(a.asset_id).localeCompare(String(b.asset_id));
    });
  }, [assets, validationErrors]);

  // Get row style
  const getRowStyle = useCallback((params: any) => {
    if (!params?.data) return null;
    return null;
  }, []);

  // Export assets to automation system
  const handleExportToAutomation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // STEP 1: Get assets that will be exported (measured but not exported)
      const assetsToExport = await api.assets.getMeasuredNotExported();
      
      if (assetsToExport.length === 0) {
        setToast({ message: 'אין נכסים לשליחה - כל הנכסים כבר נשלחו לעירייה', type: 'info' });
        setTimeout(() => setToast(null), 5000);
        setLoading(false);
        setExportToAutomationCount(0);
        return;
      }

      // STEP 2: Validate all assets before export (parallel by building for speed)
      setToast({ message: 'מאמת נכסים לפני שליחה...', type: 'info' });

      // Group assets by building number for validation
      const assetsByBuilding = new Map<number, Asset[]>();
      for (const asset of assetsToExport) {
        const buildingNumber = asset.building_number;
        if (!assetsByBuilding.has(buildingNumber)) {
          assetsByBuilding.set(buildingNumber, []);
        }
        assetsByBuilding.get(buildingNumber)!.push(asset);
      }

      const buildingEntries = Array.from(assetsByBuilding.entries());
      const typesForValidation = assetTypes.length > 0 ? assetTypes : await api.assetTypes.getAll();

      // Pre-fetch missing buildings in parallel
      const missingBuildingNumbers = buildingEntries
        .map(([bn]) => bn)
        .filter(bn => !buildings.get(bn));
      const fetchedBuildings = await Promise.all(
        missingBuildingNumbers.map(bn => api.buildings.getOne(bn))
      );
      const buildingsMap = new Map(buildings);
      missingBuildingNumbers.forEach((bn, i) => buildingsMap.set(bn, fetchedBuildings[i]));

      const allValidationResults: Array<{ assetId: string; buildingNumber: number; errors: string[] }> = [];
      const VALIDATION_CONCURRENCY = 5;

      for (let i = 0; i < buildingEntries.length; i += VALIDATION_CONCURRENCY) {
        const chunk = buildingEntries.slice(i, i + VALIDATION_CONCURRENCY);
        const batchResults = await Promise.all(
          chunk.map(([buildingNumber, buildingAssets]) => {
            const building = buildingsMap.get(buildingNumber)!;
            return AssetValidationHandler.validateBuildingAssets(buildingAssets, buildingNumber, {
              mode: 'building',
              validateOnlyLatest: false,
              cachedData: { assetTypes: typesForValidation, building },
              onProgress: (progress) => {
                setToast({
                  message: `מאמת נכסים... ${progress.current}/${progress.total} - ${progress.currentAsset}`,
                  type: 'info'
                });
              }
            });
          })
        );
        for (let j = 0; j < chunk.length; j++) {
          const [buildingNumber] = chunk[j];
          const batchResult = batchResults[j];
          for (const result of batchResult.results) {
            if (!result.valid && result.errors && result.errors.length > 0) {
              allValidationResults.push({
                assetId: typeof result.assetId === 'string' ? result.assetId : String(result.assetId),
                buildingNumber,
                errors: result.errors
              });
            }
          }
        }
      }

      // STEP 3: Check if validation passed
      if (allValidationResults.length > 0) {
        const invalidCount = allValidationResults.length;
        const errorMessages = allValidationResults
          .slice(0, 5) // Show first 5 errors
          .map(r => `נכס ${r.assetId} (מבנה ${r.buildingNumber}): ${r.errors.join(', ')}`)
          .join('\n');
        
        const moreErrors = invalidCount > 5 ? `\nועוד ${invalidCount - 5} נכסים עם שגיאות...` : '';
        
        setToast({ 
          message: `לא ניתן לשלוח נכסים - נמצאו ${invalidCount} נכסים עם שגיאות אימות:\n${errorMessages}${moreErrors}\n\nיש לתקן את השגיאות לפני שליחה.`, 
          type: 'error' 
        });
        setTimeout(() => setToast(null), 15000);
        setLoading(false);
        return;
      }

      // STEP 4: All assets passed validation - proceed with export
      setToast({ message: 'כל הנכסים עברו אימות בהצלחה. מתחיל שליחה...', type: 'success' });
      
      // Call API to export assets and mark them as exported
      const result = await api.assets.exportToAutomation();

      if (!result.success) {
        setToast({ message: result.error || 'שגיאה בשליחת נכסים לעירייה', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        setLoading(false);
        return;
      }

      if (result.count === 0) {
        setToast({ message: 'אין נכסים לשליחה - כל הנכסים כבר נשלחו לעירייה', type: 'info' });
        setTimeout(() => setToast(null), 5000);
        setLoading(false);
        setExportToAutomationCount(0);
        return;
      }

      // Fetch the exported assets to export them to Excel
      // Use RPC function to avoid type mismatch issues with .in() operator
      // Ensure assetIds are numbers (not strings) for the RPC call
      const numericAssetIdsForQuery = result.assetIds
        .map(id => {
          if (typeof id === 'string') {
            const parsed = parseInt(id, 10);
            return isNaN(parsed) ? null : parsed;
          }
          return typeof id === 'number' ? id : Number(id);
        })
        .filter((id): id is number => id !== null && !isNaN(id) && id > 0);

      if (numericAssetIdsForQuery.length === 0) {
        setToast({ message: 'לא נמצאו נכסים לייצוא', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        return;
      }

      // Fetch assets in batches to avoid timeouts with large exports
      let exportedAssets: any[];
      try {
        exportedAssets = await api.assets.getAssetsByIdsBatched(numericAssetIdsForQuery);
      } catch (fetchError: any) {
        console.error('Error fetching exported assets:', fetchError);
        console.error('Supabase request failed', {
          message: fetchError?.message,
          details: fetchError?.details,
          hint: fetchError?.hint,
          code: fetchError?.code,
          assetIds: numericAssetIdsForQuery
        });
        setToast({ message: 'הנכסים סומנו כייצאו אך לא ניתן היה לייצא אותם לקובץ Excel', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        setLoading(false);
        return;
      }

      if (!exportedAssets || exportedAssets.length === 0) {
        setToast({ message: `סומנו ${result.count} נכסים כייצאו בהצלחה`, type: 'success' });
        setTimeout(() => setToast(null), 5000);
        setLoading(false);
        setExportToAutomationCount(0);
        return;
      }

      // Define headers for asset export - matching export_automatiom_sample.xlsx format
      const headers = [
        'זיהוי משלם',
        'זיהוי נכס',
        'תחילת שינוי',
        'סוף שינוי',
        'סוג נכס',
        'גודל נכס',
        'נכס משנה 1',
        'גודל נכס משנה 1',
        'נכס משנה 2',
        'גודל נכס משנה 2',
        'נכס משנה 3',
        'גודל נכס משנה 3',
        'נכס משנה 4',
        'גודל נכס משנה 4',
        'נכס משנה 5',
        'גודל נכס משנה 5',
        'נכס משנה 6',
        'גודל נכס משנה 6',
        'מנה',
        'מקום גביה',
        'מספר פקודה',
        'שנת כספים',
        'תאריך גביה',
        'יום ערך'
      ];

      // Get asset types to determine business/residence type
      const assetTypesData = getAssetTypes();
      
      // Helper function to calculate export asset size (asset_size + business_distribution_area for business assets)
      const getExportAssetSize = (asset: any): number | string => {
        const assetSize = asset.asset_size || 0;
        
        // Check if this is a business asset
        if (asset.main_asset_type && assetTypesData.length > 0) {
          const assetTypeName = String(asset.main_asset_type).trim();
          
          // Try string lookup first
          let assetType = assetTypesData.find((at: any) => {
            const atName = String(at.name || '').trim();
            return atName === assetTypeName;
          });
          
          // If not found, try numeric comparison
          if (!assetType) {
            const assetTypeNum = parseInt(assetTypeName, 10);
            if (!isNaN(assetTypeNum)) {
              assetType = assetTypesData.find((at: any) => {
                const atName = String(at.name || '').trim();
                const atNameNum = parseInt(atName, 10);
                return !isNaN(atNameNum) && atNameNum === assetTypeNum;
              });
            }
          }
          
          // If it's a business asset, add business_distribution_area to asset_size
          if (assetType?.business_residence === 'עסקים') {
            const areaFromDistribution = asset.business_distribution_area || 0;
            return assetSize + areaFromDistribution;
          }
        }
        
        // For non-business assets, return asset_size as is
        return assetSize || '';
      };

      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');

      // Group assets by tax region BEFORE creating Excel files
      const assetsByTaxRegionForExcel = new Map<string, any[]>();
      exportedAssets.forEach(asset => {
        const taxRegion = asset.tax_region ? String(asset.tax_region).trim() : 'unknown';
        if (!assetsByTaxRegionForExcel.has(taxRegion)) {
          assetsByTaxRegionForExcel.set(taxRegion, []);
        }
        assetsByTaxRegionForExcel.get(taxRegion)!.push(asset);
      });

      // Get all files for exported assets
      // Ensure assetIds are numbers (not strings)
      const numericAssetIdsForFiles = result.assetIds.map(id => typeof id === 'string' ? parseInt(id, 10) : id).filter(id => !isNaN(id));
      const filesByAsset = await api.assets.files.getAllBulk(numericAssetIdsForFiles);
      
      // Create a map of asset_id to asset data for lookup
      // Ensure asset_id is converted to number for consistent key matching
      const assetMap = new Map<number, any>();
      exportedAssets.forEach(asset => {
        const assetId = typeof asset.asset_id === 'string' ? parseInt(asset.asset_id, 10) : Number(asset.asset_id);
        if (!isNaN(assetId) && assetId > 0) {
          assetMap.set(assetId, asset);
        }
      });
      
      // Prepare files array for ZIP
      const zipFiles: Array<{ filename: string; data: Blob }> = [];

      // Group assets by tax region for folder organization (for files)
      const assetsByTaxRegion = new Map<string, Array<{ assetId: number; asset: any; files: any[] }>>();
      
      // Build file list and organize by tax region
      for (const [assetId, files] of filesByAsset.entries()) {
        if (!files || files.length === 0) continue;
        
        const asset = assetMap.get(assetId);
        if (!asset) continue;
        
        const taxRegion = asset?.tax_region ? String(asset.tax_region).trim() : 'unknown';
        
        // Initialize tax region group if needed
        if (!assetsByTaxRegion.has(taxRegion)) {
          assetsByTaxRegion.set(taxRegion, []);
        }
        
        assetsByTaxRegion.get(taxRegion)!.push({
          assetId,
          asset,
          files
        });
      }
      
      // Process each tax region: create Excel file and download files
      // Iterate over all tax regions that have assets (not just those with files)
      for (const [taxRegion, regionAssetsForExcel] of assetsByTaxRegionForExcel.entries()) {
        // Get files for this tax region (if any)
        const regionAssets = assetsByTaxRegion.get(taxRegion) || [];
        
        // Convert assets to rows for this tax region
        const rows = regionAssetsForExcel.map(asset => [
          asset.payer_id || '',                                    // זיהוי משלם
          asset.asset_id != null ? String(asset.asset_id) : '',   // זיהוי נכס (convert to string)
          formatDateToDDMMYYYY(asset.discount_date_from) || '',  // תחילת שינוי
          formatDateToDDMMYYYY(asset.discount_date_to) || '',    // סוף שינוי
          asset.main_asset_type || '',                             // סוג נכס
          getExportAssetSize(asset),                               // גודל נכס (asset_size + business_distribution_area for business)
          asset.sub_asset_type_1 || '',                            // נכס משנה 1
          asset.sub_asset_size_1 || '',                            // גודל נכס משנה 1
          asset.sub_asset_type_2 || '',                            // נכס משנה 2
          asset.sub_asset_size_2 || '',                            // גודל נכס משנה 2
          asset.sub_asset_type_3 || '',                            // נכס משנה 3
          asset.sub_asset_size_3 || '',                            // גודל נכס משנה 3
          asset.sub_asset_type_4 || '',                            // נכס משנה 4
          asset.sub_asset_size_4 || '',                            // גודל נכס משנה 4
          asset.sub_asset_type_5 || '',                            // נכס משנה 5
          asset.sub_asset_size_5 || '',                            // גודל נכס משנה 5
          asset.sub_asset_type_6 || '',                            // סוג נכס משני 6
          asset.sub_asset_size_6 || '',                            // גודל נכסי משני 6
          '',                                                      // מנה (empty in sample)
          '',                                                      // מקום גביה (empty in sample)
          '',                                                      // מספר פקודה (empty in sample)
          '',                                                      // שנת כספים (empty in sample)
          '',                                                      // תאריך גביה (empty in sample)
          ''                                                       // יום ערך (empty in sample)
        ]);

        // Create data array with headers and rows for this tax region
        const data = [headers, ...rows];

        // Create Excel file for this tax region
        const excelFilename = `שליחת_נתונים_${taxRegion}_${dateStr}.xlsx`;
        const regionExcelBlob = createExcelBlob({
          filename: excelFilename,
          sheetName: 'נכסים',
          data,
          columnWidths: [
            { wch: 15 }, // זיהוי משלם
            { wch: 15 }, // זיהוי נכס
            { wch: 20 }, // תחילת שינוי
            { wch: 20 }, // סוף שינוי
            { wch: 12 }, // סוג נכס
            { wch: 12 }, // גודל נכס
            { wch: 15 }, // נכס משנה 1
            { wch: 15 }, // גודל נכס משנה 1
            { wch: 15 }, // נכס משנה 2
            { wch: 15 }, // גודל נכס משנה 2
            { wch: 15 }, // נכס משנה 3
            { wch: 15 }, // גודל נכס משנה 3
            { wch: 15 }, // נכס משנה 4
            { wch: 15 }, // גודל נכס משנה 4
            { wch: 15 }, // נכס משנה 5
            { wch: 15 }, // גודל נכס משנה 5
            { wch: 15 }, // נכס משנה 6
            { wch: 15 }, // גודל נכס משנה 6
            { wch: 10 }, // מנה
            { wch: 12 }, // מקום גביה
            { wch: 12 }, // מספר פקודה
            { wch: 12 }, // שנת כספים
            { wch: 15 }, // תאריך גביה
            { wch: 15 }  // יום ערך
          ]
        });
        
        // Add Excel file to ZIP in tax region folder
        zipFiles.push({
          filename: `${taxRegion}/${excelFilename}`,
          data: regionExcelBlob
        });
        
        // Prepare file list data for this tax region
        const fileListData: any[][] = [
          ['מזהה נכס', 'מזהה משלם', 'שם קובץ']
        ];
        
        // Download and add files for this tax region
        for (const { assetId, asset, files } of regionAssets) {
          const payerId = asset?.payer_id || '';
          
          for (const file of files) {
            // Extract file name from URL if file_name is not available
            let fileName = file.file_name;
            if (!fileName && file.file_url) {
              const urlParts = file.file_url.split('/');
              fileName = urlParts[urlParts.length - 1].split('?')[0];
            }
            
            // Add row to file list Excel: asset_id, payer_id, file_name
            fileListData.push([
              assetId,
              payerId,
              fileName || ''
            ]);
            
            // Download file from storage and add to ZIP
            try {
              // Extract file path from URL
              const urlParts = file.file_url.split('/');
              const urlFileName = urlParts[urlParts.length - 1].split('?')[0];
              
              // Try to extract path from URL (format: .../structure-drawings/{assetId}/{filename})
              let filePath = '';
              const structureDrawingsIndex = file.file_url.indexOf('structure-drawings/');
              if (structureDrawingsIndex !== -1) {
                filePath = file.file_url.substring(structureDrawingsIndex + 'structure-drawings/'.length).split('?')[0];
              } else {
                // Fallback: construct path from assetId and filename
                filePath = `${assetId}/${urlFileName}`;
              }
              
              // Download file from storage
              const { data: fileData, error: downloadError } = await supabase.storage
                .from('structure-drawings')
                .download(filePath);
              
              if (downloadError || !fileData) {
                // Check for bucket not found error
                if (downloadError?.message?.includes('Bucket not found') || downloadError?.statusCode === '404') {
                  console.error(
                    'Storage bucket "structure-drawings" not found. ' +
                    'Please create the bucket in Supabase Dashboard: Storage → New bucket → Name: "structure-drawings". ' +
                    'See CREATE_STORAGE_BUCKETS.md for detailed instructions.'
                  );
                  // Show error to user
                  setToast({ message: 'Storage bucket "structure-drawings" not found. Please create it in Supabase Dashboard. See CREATE_STORAGE_BUCKETS.md for instructions.', type: 'error' });
                  setTimeout(() => setToast(null), 10000);
                  continue;
                }
                console.warn(`Error downloading file for asset ${assetId}:`, downloadError);
                continue;
              }
              
              // Add file to ZIP in tax region folder: {tax_region}/{assetId}_{filename}
              const zipFilePath = `${taxRegion}/${assetId}_${fileName || urlFileName}`;
              zipFiles.push({
                filename: zipFilePath,
                data: fileData
              });
            } catch (err) {
              console.warn(`Error processing file for asset ${assetId}:`, err);
            }
          }
        }
        
        // Create file list Excel for this tax region
        if (fileListData.length > 1) {
          const fileListFilename = `רשימת_קבצים_${taxRegion}_${dateStr}.xlsx`;
          const fileListExcelBlob = createExcelBlob({
            filename: fileListFilename,
            sheetName: 'רשימת קבצים',
            data: fileListData,
            columnWidths: [
              { wch: 15 }, // מזהה נכס
              { wch: 15 }, // מזהה משלם
              { wch: 30 }  // שם קובץ
            ]
          });
          
          // Add file list Excel to ZIP in tax region folder
          zipFiles.push({
            filename: `${taxRegion}/${fileListFilename}`,
            data: fileListExcelBlob
          });
        }
      }
      
      // Create ZIP file as Blob
      const zipFilename = `שליחת_נתונים_${dateStr}.zip`;
      const { createZipBlob } = await import('../lib/zipExport');
      const zipBlob = await createZipBlob(zipFiles);
      
      const exportDate = new Date();
      const day = String(exportDate.getDate()).padStart(2, '0');
      const month = String(exportDate.getMonth() + 1).padStart(2, '0');
      const year = exportDate.getFullYear();
      const exportDateStr = `${day}/${month}/${year}`;
      
      const { emailService } = await import('../lib/emailService');
      setToast({ message: 'שולח אימייל למפעילים...', type: 'info' });
      
      const byOperator = new Map<number, typeof assetsToExport>();
      for (const a of assetsToExport) {
        const id = a.operator_id;
        if (id != null) {
          if (!byOperator.has(id)) byOperator.set(id, []);
          byOperator.get(id)!.push(a);
        }
      }
      const operatorsList = await api.operators.getAll();
      const operatorZipItems: Array<{ operator: { id: number; name: string; email: string }; zipBlob: Blob; zipFilename: string }> = [];
      for (const [operatorId, operatorAssets] of byOperator) {
        const operator = operatorsList.find(o => o.id === operatorId);
        if (!operator?.email || !operator.email.includes('@')) continue;
        const opRows = operatorAssets.map(asset => [
          asset.payer_id || '', asset.asset_id != null ? String(asset.asset_id) : '',
          formatDateToDDMMYYYY(asset.discount_date_from) || '', formatDateToDDMMYYYY(asset.discount_date_to) || '',
          asset.main_asset_type || '', getExportAssetSize(asset),
          asset.sub_asset_type_1 || '', asset.sub_asset_size_1 || '', asset.sub_asset_type_2 || '', asset.sub_asset_size_2 || '',
          asset.sub_asset_type_3 || '', asset.sub_asset_size_3 || '', asset.sub_asset_type_4 || '', asset.sub_asset_size_4 || '',
          asset.sub_asset_type_5 || '', asset.sub_asset_size_5 || '', asset.sub_asset_type_6 || '', asset.sub_asset_size_6 || '',
          '', '', '', '', '', ''
        ]);
        const opData = [headers, ...opRows];
        const opExcelBlob = createExcelBlob({
          filename: `נכסים_מפעיל_${operatorId}_${dateStr}.xlsx`,
          sheetName: 'נכסים',
          data: opData,
          columnWidths: [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }]
        });
        // Operator email: only the assets list (no file list, no structure drawings)
        const opZipEntries: Array<{ filename: string; data: Blob }> = [
          { filename: `נכסים_מפעיל_${operatorId}_${dateStr}.xlsx`, data: opExcelBlob }
        ];
        const opZipBlob = await createZipBlob(opZipEntries);
        operatorZipItems.push({
          operator: { id: operator.id, name: operator.name, email: operator.email },
          zipBlob: opZipBlob,
          zipFilename: `שליחת_נתונים_מפעיל_${operator.name}_${dateStr}.zip`,
          assetCount: operatorAssets.length,
        });
      }
      const managersList = await api.managers.getAll();
      const managerZipItems: Array<{ operator: { id: number; name: string; email: string }; zipBlob: Blob; zipFilename: string }> = [];
      for (const manager of managersList) {
        if (!manager.email || !manager.email.includes('@')) continue;
        const regionStrs = (manager.tax_regions || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const regionSet = new Set(regionStrs.map((s: string) => { const n = parseInt(s, 10); return isNaN(n) ? null : n; }).filter((n: number | null): n is number => n !== null));
        const managerAssets = assetsToExport.filter((a: any) => {
          const tr = a.tax_region != null ? (typeof a.tax_region === 'string' ? parseInt(a.tax_region, 10) : a.tax_region) : null;
          return tr != null && regionSet.has(tr);
        });
        if (managerAssets.length === 0) continue;
        const mgrRows = managerAssets.map((asset: any) => [
          asset.payer_id || '', asset.asset_id != null ? String(asset.asset_id) : '',
          formatDateToDDMMYYYY(asset.discount_date_from) || '', formatDateToDDMMYYYY(asset.discount_date_to) || '',
          asset.main_asset_type || '', getExportAssetSize(asset),
          asset.sub_asset_type_1 || '', asset.sub_asset_size_1 || '', asset.sub_asset_type_2 || '', asset.sub_asset_size_2 || '',
          asset.sub_asset_type_3 || '', asset.sub_asset_size_3 || '', asset.sub_asset_type_4 || '', asset.sub_asset_size_4 || '',
          asset.sub_asset_type_5 || '', asset.sub_asset_size_5 || '', asset.sub_asset_type_6 || '', asset.sub_asset_size_6 || '',
          '', '', '', '', '', ''
        ]);
        const mgrData = [headers, ...mgrRows];
        const mgrExcelBlob = createExcelBlob({
          filename: `נכסים_מנהל_${manager.id}_${dateStr}.xlsx`,
          sheetName: 'נכסים',
          data: mgrData,
          columnWidths: [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }]
        });
        const mgrZipBlob = await createZipBlob([{ filename: `נכסים_מנהל_${manager.id}_${dateStr}.xlsx`, data: mgrExcelBlob }]);
        managerZipItems.push({
          operator: { id: manager.id, name: manager.name, email: manager.email },
          zipBlob: mgrZipBlob,
          zipFilename: `שליחת_נתונים_מנהל_${manager.name}_${dateStr}.zip`,
          assetCount: managerAssets.length,
        });
      }
      let successMessage = `נשלחו ${result.count} נכסים לעירייה בהצלחה.`;
      let opSent = 0;
      let mgrSent = 0;
      let lastError: string | undefined;
      if (operatorZipItems.length > 0) {
        const opResult = await emailService.sendZipByOperators(operatorZipItems, undefined, undefined, 'operator');
        opSent = opResult.sentCount ?? 0;
        if (opResult.error) lastError = opResult.error;
      }
      if (managerZipItems.length > 0) {
        setToast({ message: 'שולח אימייל למנהלים...', type: 'info' });
        const mgrResult = await emailService.sendZipByOperators(managerZipItems, undefined, undefined, 'manager');
        mgrSent = mgrResult.sentCount ?? 0;
        if (mgrResult.error) lastError = mgrResult.error;
      }
      if (opSent > 0 || mgrSent > 0) {
        const parts = [];
        if (opSent > 0) parts.push(`נשלח אימייל ל-${opSent} מפעילים`);
        if (mgrSent > 0) parts.push(`ל-${mgrSent} מנהלים`);
        if (parts.length) successMessage += ' ' + parts.join(' ו-');
        successMessage += '.';
        setToast({ message: successMessage, type: 'success' });
      } else if (lastError && (operatorZipItems.length > 0 || managerZipItems.length > 0)) {
        const { createAndDownloadZip } = await import('../lib/zipExport');
        await createAndDownloadZip(zipFilename, zipFiles);
        setToast({ message: `נשלחו ${result.count} נכסים לעירייה. שליחת אימייל נכשלה: ${lastError}. הקובץ הורד.`, type: 'error' });
      } else if (operatorZipItems.length === 0 && managerZipItems.length === 0) {
        const hasOperatorsWithAssets = byOperator.size > 0;
        if (hasOperatorsWithAssets) {
          successMessage += ' לא נשלח אימייל — למפעילים אין כתובת אימייל. יש למלא דוא"ל במסך מפעילים.';
        } else {
          successMessage += ' לא נשלח אימייל — יש להקצות מפעיל לנכסים ולמלא כתובת אימייל במסך מפעילים.';
        }
        setToast({ message: successMessage, type: 'success' });
      } else {
        successMessage += ' לא נשלח אימייל. אם ציפית לשליחה — בדוק הגדרות אימייל בהגדרות המערכת וכתובות במסך מפעילים/מנהלים.';
        setToast({ message: successMessage, type: 'info' });
      }
      setTimeout(() => setToast(null), 8000);
      // Refresh the count after export
      await fetchExportToAutomationCount();
      // Refresh the assets list
      await fetchData();
      // Notify App to update "איפוס שליחת נתונים מתאריך" span (cache was set by api.assets.exportToAutomation)
      window.dispatchEvent(new CustomEvent('exportToAutomationSuccess'));
    } catch (error: any) {
      console.error('Error exporting to automation:', error);
      setToast({ message: error.message || 'שגיאה בשליחת נכסים לעירייה', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setLoading(false);
    }
  }, [fetchExportToAutomationCount, fetchData, buildings, assetTypes]);

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
          <button
            type="button"
            onClick={handleExportToAutomation}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            שליחת נתונים לעירייה{exportToAutomationCount > 0 ? ` (${exportToAutomationCount})` : ''}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden border border-slate-200 w-full">
        <div className="ag-theme-alpine buildings-list-grid" style={{ height: '60vh', width: '100%', minWidth: '100%', overflowX: 'auto' }}>
          <AgGridReact
            ref={gridRef}
            rowData={sortedAssets}
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
            getRowStyle={getRowStyle}
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
          rowSelection={{
            mode: 'singleRow',
            enableClickSelection: true,
            checkboxes: false,
            hideDisabledCheckboxes: true
          }}
          animateRows={false}
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
