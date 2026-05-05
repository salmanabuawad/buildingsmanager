import { useEffect, useState, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, AddressList, Operator, api } from '../lib/api';
import { Home, Loader2, Save, X, AlertCircle, Upload, Eye, CheckCircle2, Copy, FileText, Square, Download, ChevronRight, ChevronDown, History, MessageSquare } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Toast } from './Toast';
import { FileViewer } from './FileViewer';
import { AssetFilesModal, AssetFilesModalRef } from './AssetFilesModal';
import { compressFile } from '../lib/fileCompression';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellClassParams } from 'ag-grid-community';
import { assetValidators, validateAll, inputValidators, isComplexAssetType, getAssetTypes } from '../lib/validation';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { ValidationResultModal, SingleAssetValidationResult, ValidationProgress } from './ValidationResultModal';
import { RowEditModal } from './RowEditModal';
import { AuditLog, Building as BuildingType } from '../lib/api';
import { usePreferences } from '../contexts/PreferencesContext';
import { useValidationRules } from '../contexts/ValidationContext';
import { formatDateToDDMMYYYY, formatDateTimeToDDMMYYYYHHMM } from '../lib/dateUtils';
import { formatNumberToTwoDecimals, numericValueParserInt } from '../lib/numberUtils';
import { useGridPreferences } from '../lib/useGridPreferences';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { useFieldConfig } from '../lib/useFieldConfig';
import { exportToExcel, createExcelBlob } from '../lib/excelExport';
import { getAssetFileBlobForZip } from '../lib/apiClient';
import { useUIConfig } from '../contexts/UIConfigContext';

interface AssetDetailsProps {
  assetId?: number;
  buildingNumber?: number;
  taxRegion?: string;
  onDataUpdate?: () => void;
  onAssetCreated?: (assetDbId: number, assetIdentifier: string) => void;
}

export interface AssetDetailsRef {
  hasUnsavedChanges: () => boolean;
  refresh: () => Promise<void>;
}

export const AssetDetails = forwardRef<AssetDetailsRef, AssetDetailsProps>(({ assetId, buildingNumber, taxRegion, onDataUpdate, onAssetCreated }, ref) => {
  const { t } = useTranslation();
  const { preferences, setEditMode } = usePreferences();
  const { validationRules } = useValidationRules(); // Get validation rules from context
  const { shouldValidateOnBlur, shouldValidateBeforeSave } = useUIConfig();
  const editMode = preferences.editMode;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [allMeasurements, setAllMeasurements] = useState<Asset[]>([]);
  const [originalMeasurements, setOriginalMeasurements] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [buildingAddress, setBuildingAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [dirtyAssets, setDirtyAssets] = useState<Map<number, Partial<Asset>>>(new Map());
  const [validationErrors, setValidationErrors] = useState<Map<number, Map<string, string>>>(new Map());
  const validationErrorsRef = useRef<Map<number, Map<string, string>>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedDrawingUrl, setSelectedDrawingUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [validationResults, setValidationResults] = useState<SingleAssetValidationResult | null>(null);
  const [validationProgress, setValidationProgress] = useState<ValidationProgress | null>(null);
  const [measurementDateModalOpen, setMeasurementDateModalOpen] = useState(false);
  const [measurementDateModalClosing, setMeasurementDateModalClosing] = useState(false);
  const [validationErrorModalOpen, setValidationErrorModalOpen] = useState(false);
  const [validationErrorModalClosing, setValidationErrorModalClosing] = useState(false);
  const [newMeasurementDate, setNewMeasurementDate] = useState<string>('');
  const [fileViewerClosing, setFileViewerClosing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ assetId: number; progress: number; fileName: string; currentIndex: number; total: number } | null>(null);
  const [uploadingAssetId, setUploadingAssetId] = useState<number | null>(null);

  const [isRowEditModalOpen, setIsRowEditModalOpen] = useState(false);
  const [selectedRowForEdit, setSelectedRowForEdit] = useState<Asset | null>(null);
  const [assetFilesModalOpen, setAssetFilesModalOpen] = useState(false);
  const [selectedAssetIdForFiles, setSelectedAssetIdForFiles] = useState<number | null>(null);
  const [selectedMeasurementDateForFiles, setSelectedMeasurementDateForFiles] = useState<string | null | undefined>(undefined);
  const assetFilesModalRef = useRef<AssetFilesModalRef>(null);
  const [assetsWithFiles, setAssetsWithFiles] = useState<Set<string>>(new Set()); // Track which measurements have files — key: `${asset_id}|${measurement_date}`
  const [operators, setOperators] = useState<Operator[]>([]);
  
  // Refs for audit detail grid (unified grid for all assets)
  const gridRef = useRef<AgGridReact<Asset>>(null);
  const historyGridRef = useRef<AgGridReact<Asset>>(null);
  const validationTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Grid preferences hook for saving/loading column state
  const gridPreferences = useGridPreferences(
    gridRef,
    `asset-details-${assetId || buildingNumber || 'new'}`,
    'default'
  );
  
  // History grid preferences hook for saving/loading column state
  const historyGridPreferences = useGridPreferences(
    historyGridRef,
    `asset-details-history-${assetId || buildingNumber || 'new'}`,
    'default'
  );
  
  // Save tax region in a variable for validation handler
  // This ensures the validation handler uses the tax region from the tab, not the building's tax regions
  const validationTaxRegion = useMemo(() => {
    const result = taxRegion && taxRegion.trim() !== '' ? taxRegion.trim() : undefined;
    // Return taxRegion if it exists and is not empty, otherwise undefined
    return result;
  }, [taxRegion, buildingNumber]);

  // Determine if this is a business or residence tab based on tax region and asset types
  // This is used to pass the correct context to backend saves
  const isBusinessContext = useMemo(() => {
    if (!taxRegion || !assetTypes || assetTypes.length === 0) return undefined;
    
    // Parse tax region (could be single number or comma-separated)
    const taxRegionNumbers = taxRegion.split(',').map(tr => parseInt(tr.trim())).filter(tr => !isNaN(tr));
    
    if (taxRegionNumbers.length === 0) return undefined;
    
    // Check if all asset types with these tax regions are "מגורים" (residence)
    const assetTypesForTaxRegions = assetTypes.filter(at => 
      at.tax_region != null && taxRegionNumbers.includes(at.tax_region)
    );
    
    if (assetTypesForTaxRegions.length === 0) return undefined;
    
    // Check if all asset types are "מגורים" (residence)
    const allAreResidence = assetTypesForTaxRegions.every(at => 
      at.business_residence === 'מגורים'
    );
    
    // If all are residence, return false (not business context)
    // Otherwise, return true (business context)
    return !allAreResidence;
  }, [taxRegion, assetTypes]);

  // Find the latest measurement (from assets table, is_latest=true)
  const latestMeasurement = useMemo(() => {
    return allMeasurements.find(m => m.is_latest === true) || null;
  }, [allMeasurements]);

  // Pin the first row (latest measurement) at the top
  const pinnedTopRowData = useMemo(() => {
    return latestMeasurement ? [latestMeasurement] : [];
  }, [latestMeasurement]);

  // Get history rows (all except the latest) - memoized for performance
  const historyRows = useMemo(() => {
    return allMeasurements.filter(m => m.is_latest !== true);
  }, [allMeasurements]);

  // All history records from assets_history - show all previous states/measurements
  const regularHistoryRows = useMemo(() => {
    // Return all history rows (no grouping or filtering needed)
    return historyRows;
  }, [historyRows]);


  // Prepare history rows - just return all history rows (no detail rows needed)
  const historyRowsWithDetails = useMemo(() => {
    return regularHistoryRows;
  }, [regularHistoryRows]);

  // Always use asset.tax_region as the source of truth
  // This ensures consistency between what's shown and what's stored in the asset record
  // The tab's tax region should match the asset's tax_region (assets are filtered by tax_region)
  const displayTaxRegion = useMemo(() => {
    // Use asset.tax_region directly from the asset (this is the source of truth)
    if (asset?.tax_region != null) {
      return String(asset.tax_region);
    }
    // Fallback to tab taxRegion if asset doesn't have tax_region set yet
    if (taxRegion && taxRegion.trim() !== '') {
      return taxRegion.trim();
    }
    return null;
  }, [asset?.tax_region, taxRegion]);

  // Helper function to check if an asset type is non_accountable_for_total_area
  const isAssetTypeNotAccountable = useCallback((assetTypeName: string | null | undefined): boolean => {
    if (!assetTypeName || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Find asset type by name
    const assetType = assetTypes.find(at => at.name === assetTypeName);
    return assetType?.non_accountable_for_total_area === true;
  }, [assetTypes]);

  // Helper function to check if an asset is not_accountable
  const isAssetNotAccountable = useCallback((asset: Asset | null): boolean => {
    if (!asset || !asset.main_asset_type) {
      return false;
    }
    return isAssetTypeNotAccountable(asset.main_asset_type);
  }, [isAssetTypeNotAccountable]);

  // Helper function to check if a field should be editable.
  // Grid is always editable for the latest measurement row (regardless of modal/inline preference).
  // For non-accountable-for-total-area assets (e.g. complex types like 199),
  // only main_asset_type and asset_size are locked — main_asset_type because
  // switching it invalidates the sub-types, and asset_size because it is
  // derived from the sub_asset_size_* sum. All other fields (payer_id,
  // apartment_*, storage_*, sub_asset_type_*, sub_asset_size_*, comment, …)
  // stay editable. Mirrors the AssetsList behavior (commit 7e7b59b4).
  const isFieldEditable = useCallback((params: any, fieldName: string): boolean => {
    if (!params || !params.data) return false;
    const asset = params.data as Asset;
    const baseEditable = asset.is_latest === true;

    if (isAssetNotAccountable(asset)) {
      if (fieldName === 'main_asset_type' || fieldName === 'asset_size') {
        return false;
      }
    }

    return baseEditable;
  }, [isAssetNotAccountable]);

  // Get area description for tab based on main asset type
  const areaDescriptionForTab = useMemo(() => {
    if (!asset?.main_asset_type || !assetTypes || assetTypes.length === 0) {
      return null;
    }
    
    // Find the asset type that matches the main_asset_type
    const matchingAssetType = assetTypes.find(at => 
      at.name === asset.main_asset_type
    );
    
    return matchingAssetType?.area_description_for_tab || null;
  }, [asset?.main_asset_type, assetTypes]);

  const getRowStyle = useCallback((params: any) => {
    // Use asset_id as key since only latest measurement is editable
    const assetId = params.data?.asset_id;
    if (!assetId) return undefined;
    const assetIdNum = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
    if (isNaN(assetIdNum)) return undefined;

    const asset = params.data as Asset;
    const isLatest = asset.is_latest === true;

    const baseStyle: any = {
      opacity: isLatest ? 1 : 0.7,
      fontSize: isLatest ? '1.2em' : undefined,
      fontWeight: isLatest ? '600' : undefined,
      fontStyle: isLatest ? 'normal' : 'italic'
    };

    if (!isLatest) {
      baseStyle.background = '#f9fafb';
      baseStyle.borderLeft = '3px solid #d1d5db';
    }

    return baseStyle;
  }, [validationErrors]);

  // Row style for history grid - no validation checks
  const getHistoryRowStyle = useCallback((params: any) => {
    const asset = params.data as Asset;
    const isLatest = asset.is_latest === true;

    const baseStyle: any = {
      opacity: isLatest ? 1 : 0.7,
      fontSize: isLatest ? '1.2em' : undefined,
      fontWeight: isLatest ? '600' : undefined,
      fontStyle: isLatest ? 'normal' : 'italic'
    };

    if (!isLatest) {
      baseStyle.background = '#f9fafb';
      baseStyle.borderLeft = '3px solid #d1d5db';
    }

    return baseStyle;
  }, []);

  // Helper function to validate discount dates
  const validateDiscountDates = useCallback((asset: Asset): string[] => {
    const errors: string[] = [];
    
    // If discount_type is provided, dates must be provided
    if (asset.discount_type && asset.discount_type.trim() !== '') {
      if (!asset.discount_date_from || asset.discount_date_from.trim() === '') {
        errors.push('כאשר יש קוד הנחה, תאריך הנחה מ הוא חובה');
      }
      if (!asset.discount_date_to || asset.discount_date_to.trim() === '') {
        errors.push('כאשר יש קוד הנחה, תאריך הנחה עד הוא חובה');
      }
      
      // If both dates are provided, validate that date_to > date_from
      if (asset.discount_date_from && asset.discount_date_from.trim() !== '' &&
          asset.discount_date_to && asset.discount_date_to.trim() !== '') {
        const dateFormatPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const fromMatch = asset.discount_date_from.trim().match(dateFormatPattern);
        const toMatch = asset.discount_date_to.trim().match(dateFormatPattern);
        
        if (fromMatch && toMatch) {
          const fromDay = parseInt(fromMatch[1], 10);
          const fromMonth = parseInt(fromMatch[2], 10);
          const fromYear = parseInt(fromMatch[3], 10);
          const toDay = parseInt(toMatch[1], 10);
          const toMonth = parseInt(toMatch[2], 10);
          const toYear = parseInt(toMatch[3], 10);
          
          const fromDate = new Date(fromYear, fromMonth - 1, fromDay);
          const toDate = new Date(toYear, toMonth - 1, toDay);
          
          if (toDate <= fromDate) {
            errors.push('תאריך הנחה עד חייב להיות גדול מתאריך הנחה מ');
          }
        }
      }
    }
    
    return errors;
  }, []);

  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef, node } = event;
      const field = colDef.field;
      // Use asset_id as key since only latest measurement is editable
      const assetId = data.asset_id;
      
      // History record — update assets_history directly
      if (data.is_latest !== true) {
        const historyCreatedAt = data.history_created_at || data.created_at;
        if (!historyCreatedAt || !assetId) {
          event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
          return;
        }
        try {
          const { error: patchErr } = await api.data.patch(
            'assets_history',
            { asset_id: assetId, history_created_at: historyCreatedAt },
            { [field]: event.newValue }
          );
          if (patchErr) throw new Error(patchErr.message);
        } catch (err) {
          console.error('[AssetDetails] Failed to save history record edit:', err);
          event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
        }
        return;
      }
      
      const newValue = event.newValue;

      // Create updated asset with new value
      let updatedAsset = { ...data, [field]: newValue };

      // Handle main_asset_type changes - validate non_accountable flags
      if (field === 'main_asset_type' && newValue) {
        const newAssetTypeName = String(newValue).trim();
        const newAssetType = assetTypes?.find(at => {
          const atNameStr = String(at.name).trim();
          return atNameStr === newAssetTypeName;
        });
        
        // If asset type not found, try numeric comparison
        const newAssetTypeFinal = newAssetType || assetTypes?.find(at => {
          const atNameNum = parseInt(String(at.name).trim(), 10);
          const newTypeNum = parseInt(newAssetTypeName, 10);
          return !isNaN(atNameNum) && !isNaN(newTypeNum) && atNameNum === newTypeNum;
        });

        if (newAssetTypeFinal) {
          // Validate tax region compatibility - check if asset type exists for asset's tax region
          const assetTaxRegion = data.tax_region != null ? String(data.tax_region) : (taxRegion || null);
          if (assetTaxRegion && assetTypes) {
            const assetTaxRegionNum = parseInt(assetTaxRegion, 10);
            if (!isNaN(assetTaxRegionNum)) {
              // Check if there's an asset type with the same name that matches the asset's tax region
              const matchingAssetTypeForTaxRegion = assetTypes.find(at => {
                const atNameStr = String(at.name).trim();
                const atTaxRegionNum = at.tax_region != null 
                  ? (typeof at.tax_region === 'string' ? parseInt(at.tax_region, 10) : at.tax_region)
                  : null;
                return atNameStr === newAssetTypeName && 
                       atTaxRegionNum != null && 
                       !isNaN(atTaxRegionNum) && 
                       atTaxRegionNum === assetTaxRegionNum &&
                       (at.active === true);
              });
              
              if (!matchingAssetTypeForTaxRegion) {
                // Asset type doesn't exist for this tax region - find valid tax regions
                const validTaxRegions = new Set<number>();
                assetTypes.forEach(at => {
                  const atNameStr = String(at.name).trim();
                  const atTaxRegionNum = at.tax_region != null 
                    ? (typeof at.tax_region === 'string' ? parseInt(at.tax_region, 10) : at.tax_region)
                    : null;
                  if (atNameStr === newAssetTypeName && atTaxRegionNum != null && !isNaN(atTaxRegionNum) && (at.active === true)) {
                    validTaxRegions.add(atTaxRegionNum);
                  }
                });
                
                const validRegionsStr = Array.from(validTaxRegions).sort((a, b) => a - b).join(', ');
                const errorMsg = validRegionsStr 
                  ? `סוג נכס ${newAssetTypeName} תקף רק באזורי מס: ${validRegionsStr}, אך הנכס הוא באזור מס ${assetTaxRegionNum}`
                  : `סוג נכס ${newAssetTypeName} לא תקף לאזור מס ${assetTaxRegionNum}`;
                
                setError(errorMsg);
                setTimeout(() => setError(null), 5000);
                setValidationErrors(prev => {
                  const newMap = new Map(prev);
                  const errorMap = new Map<string, string>();
                  errorMap.set('main_asset_type', errorMsg);
                  newMap.set(assetId, errorMap);
                  return newMap;
                });
                event.api.refreshCells({ rowNodes: [node], force: true });
                // Revert the change by resetting the cell value
                node.setDataValue(field, data[field]);
                return;
              }
            }
          }

          // If new asset type has non_accountable_for_distribution = true and asset has business_distribution_area > 0, set it to 0
          if (newAssetTypeFinal.non_accountable_for_distribution === true) {
            const currentAreaFromDistribution = updatedAsset.business_distribution_area || 0;
            if (currentAreaFromDistribution > 0) {
              updatedAsset = { ...updatedAsset, business_distribution_area: 0 };
            }
          }
        }
      }

      // Track the change in dirtyAssets immediately (no debounce)
      setDirtyAssets(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(assetId) || {};
        const changesToStore = { ...existing, [field]: newValue };
        // Also include business_distribution_area change if it was set to 0
        if (updatedAsset.business_distribution_area !== data.business_distribution_area) {
          changesToStore.business_distribution_area = updatedAsset.business_distribution_area;
        }
        newMap.set(assetId, changesToStore);
        return newMap;
      });

      // Clear existing validation timer for this asset
      const existingTimer = validationTimerRef.current.get(String(assetId));
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Quick synchronous validation for format checks only
      if (field === 'measurement_date' && updatedAsset.measurement_date) {
        const dateValidation = inputValidators.validateDateFormat(updatedAsset.measurement_date);
        if (!dateValidation.valid) {
          setError(dateValidation.error || 'Invalid date format');
          setTimeout(() => setError(null), 3000);
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            const errorMap = new Map<string, string>();
            errorMap.set('measurement_date', dateValidation.error || 'Invalid date format');
            newMap.set(assetId, errorMap);
            return newMap;
          });
          // Refresh the actions column to update invalid icon
          event.api.refreshCells({ 
            rowNodes: [node], 
            columns: ['actions'],
            force: true 
          });
          event.api.refreshCells({ rowNodes: [node], force: true });
          return;
        }
      }

      // Quick synchronous validation for discount dates
      const discountFields = ['discount_type', 'discount_date_from', 'discount_date_to'];
      if (discountFields.includes(field)) {
        const discountErrors = validateDiscountDates(updatedAsset);
        if (discountErrors.length > 0) {
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            const errorMap = new Map<string, string>();
            discountErrors.forEach((error, index) => {
              errorMap.set(`discount_error_${index}`, error);
            });
            newMap.set(assetId, errorMap);
            return newMap;
          });
          // Refresh the actions column to update invalid icon
          event.api.refreshCells({ 
            rowNodes: [node], 
            columns: ['actions'],
            force: true 
          });
          event.api.refreshCells({ rowNodes: [node], force: true });
        } else {
          // Clear discount errors if validation passes
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            const existingErrors = newMap.get(assetId);
            if (existingErrors) {
              const filteredErrors = new Map<string, string>();
              existingErrors.forEach((value, key) => {
                if (!key.startsWith('discount_error_')) {
                  filteredErrors.set(key, value);
                }
              });
              if (filteredErrors.size > 0) {
                newMap.set(assetId, filteredErrors);
              } else {
                newMap.delete(assetId);
              }
            }
            return newMap;
          });
          // Refresh the actions column to update invalid icon if all errors cleared
          event.api.refreshCells({ 
            rowNodes: [node], 
            columns: ['actions'],
            force: true 
          });
          event.api.refreshCells({ rowNodes: [node], force: true });
        }
      }

      // When "מתי להריץ אימות" is "אונליין", run debounced validation on cell change
      if (shouldValidateOnBlur) {
        const timer = setTimeout(async () => {
          try {
            const cachedData = {
              assetTypes: assetTypes || [],
              building: building
            };
            const result = await AssetValidationHandler.validateSingleAsset(updatedAsset, {
              taxRegion: validationTaxRegion,
              cachedData: cachedData
            });
            const discountErrors = validateDiscountDates(updatedAsset);
            const allErrors = [...(result.errors || []), ...discountErrors];
            const actualValid = result.valid && allErrors.length === 0;

            if (actualValid) {
              setValidationErrors(prev => {
                const newMap = new Map(prev);
                newMap.delete(assetId);
                return newMap;
              });
              event.api.refreshCells({ rowNodes: [node], columns: ['actions', 'structure_drawing_url'], force: true });
              event.api.refreshCells({ rowNodes: [node], force: true });
            } else if (allErrors.length > 0) {
              setValidationErrors(prev => {
                const newMap = new Map(prev);
                const errorMap = new Map<string, string>();
                allErrors.forEach((error, index) => errorMap.set(`error_${index}`, error));
                newMap.set(assetId, errorMap);
                return newMap;
              });
              event.api.refreshCells({ rowNodes: [node], columns: ['actions', 'structure_drawing_url'], force: true });
              event.api.refreshCells({ rowNodes: [node], force: true });
            }
          } catch (error) {
            console.error('Error in debounced validation:', error);
          } finally {
            validationTimerRef.current.delete(String(assetId));
          }
        }, 500);
        validationTimerRef.current.set(String(assetId), timer);
      } else {
        validationTimerRef.current.delete(String(assetId));
        setValidationErrors(prev => {
          const newMap = new Map(prev);
          newMap.delete(assetId);
          return newMap;
        });
      }

    } catch (error) {
      console.error('Error tracking change:', error);
      setError('Failed to track change');
      setTimeout(() => setError(null), 3000);
    }
  }, [validationTaxRegion, assetTypes, building, validateDiscountDates, shouldValidateOnBlur]);

  const onCellEditingStopped = useCallback((event: any) => {
    const { data, column, colDef } = event;
    const field = colDef?.field ?? column?.getColDef?.()?.field;
    if (!data?.asset_id || !field || data.is_latest !== true) return;
    const assetId = data.asset_id;
    let newValue = event.newValue ?? event.node?.data?.[field];
    if (newValue === '' || newValue === null || newValue === undefined) {
      const isNumericField = colDef?.type === 'numericColumn' ||
        field === 'asset_size' || field?.startsWith('sub_asset_size_') ||
        field === 'tax_region';
      newValue = isNumericField ? 0 : null;
    }
    setDirtyAssets(prev => {
      const next = new Map(prev);
      const existing = next.get(assetId) || {};
      next.set(assetId, { ...existing, [field]: newValue });
      return next;
    });
  }, []);

  const hasChanges = dirtyAssets.size > 0;

  // Expose hasUnsavedChanges via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => hasChanges,
    refresh: async () => {
      await fetchData();
    }
  }), [hasChanges]);

  // Track last click to prevent double-click interference
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  // Handler for saving changes from modal
  const handleSaveFromModal = useCallback(async (changes: Partial<Asset>) => {
    if (!selectedRowForEdit) return;

    const assetId = selectedRowForEdit.asset_id;
    
    try {
      // Update allMeasurements state with changes
      setAllMeasurements(prev => {
        return prev.map(asset => {
          if (asset.asset_id === assetId) {
            const updatedAsset = { ...asset, ...changes };
            return updatedAsset;
          }
          return asset;
        });
      });

      // Track changes in dirtyAssets (for saving later)
      setDirtyAssets(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(assetId) || {};
        newMap.set(assetId, { ...existing, ...changes });
        return newMap;
      });

      // Clear validation errors for this asset (will be re-validated if needed)
      setValidationErrors(prev => {
        const newMap = new Map(prev);
        newMap.delete(assetId);
        return newMap;
      });

      // Revalidate the asset after changes from modal
      const updatedAsset = { ...selectedRowForEdit, ...changes };
      
      // Also update asset state if it's the latest measurement
      if (selectedRowForEdit.is_latest) {
        setAsset(prev => {
          if (prev && prev.asset_id === assetId) {
            return { ...prev, ...changes };
          }
          return prev;
        });
      }
      
      // Debug logging for tax region validation
      if (process.env.NODE_ENV === 'development') {
      }

      // Use the same validation as AssetsList - AssetValidationHandler.validateSingleAsset
      // This ensures consistent validation behavior across all components
      const validationResult = await AssetValidationHandler.validateSingleAsset(updatedAsset, {
        taxRegion: validationTaxRegion, // Use validationTaxRegion from tab - same as AssetsList
        cachedData: { assetTypes, building }
      });
      
      // Check validation result
      if (!validationResult.valid) {
        const errorMsg = validationResult.errors && validationResult.errors.length > 0 
          ? validationResult.errors.join('; ')
          : 'Validation failed';
        
        setValidationErrors(prev => {
          const newMap = new Map(prev);
          const errorMap = new Map<string, string>();
          if (validationResult.errors && validationResult.errors.length > 0) {
            validationResult.errors.forEach((error, index) => {
              errorMap.set(`error_${index}`, error);
            });
          }
          newMap.set(assetId, errorMap);
          return newMap;
        });
        
        setToast({ message: errorMsg, type: 'error' });
        return;
      }
      
      // Validation passed - clear errors
      setValidationErrors(prev => {
        const newMap = new Map(prev);
        newMap.delete(assetId);
        return newMap;
      });
      
      // Also check for numeric format errors
      const numericRegex = /^[0-9]+$/;
      const hasInvalidPayerId = updatedAsset.payer_id && updatedAsset.payer_id !== '' && !numericRegex.test(updatedAsset.payer_id);
      const hasInvalidAssetId = updatedAsset.asset_id && updatedAsset.asset_id !== '' && !numericRegex.test(updatedAsset.asset_id);

      if (hasInvalidPayerId || hasInvalidAssetId) {
        const errorMap = new Map<string, string>();
        
        if (hasInvalidPayerId) {
          errorMap.set('payer_id', 'Invalid payer ID - must be numeric');
        }
        if (hasInvalidAssetId) {
          errorMap.set('asset_id', 'Invalid asset ID - must be numeric');
        }

        setValidationErrors(prev => {
          const newMap = new Map(prev);
          newMap.set(assetId, errorMap);
          return newMap;
        });
        
        // Update grid row even if validation failed (to show the changes)
        setTimeout(() => {
          const latestGridApiError = gridRef.current?.api;
          const historyGridApiError = historyGridRef.current?.api;
          
          const updateGridRowOnError = (gridApi: any) => {
            if (!gridApi) return;
            
            gridApi.forEachNode((node: any) => {
              if (node.data && node.data.asset_id === assetId) {
                // Update the entire node data with the merged updated asset
                const mergedData = { ...node.data, ...updatedAsset };
                
                // Use applyTransaction for proper update
                gridApi.applyTransaction({
                  update: [mergedData]
                });
                
                // Also manually update the node
                node.setData(mergedData);
                
                // Also update each changed field individually
                Object.keys(changes).forEach(key => {
                  const value = (updatedAsset as any)[key];
                  if (node.setDataValue) {
                    node.setDataValue(key, value);
                  }
                });
                
                // Refresh to show errors and updated data
                gridApi.refreshCells({ rowNodes: [node], force: true });
                gridApi.refreshCells({ 
                  rowNodes: [node], 
                  columns: ['structure_drawing_url'],
                  force: true 
                });
              }
            });
          };

          if (latestGridApiError) updateGridRowOnError(latestGridApiError);
          if (historyGridApiError) updateGridRowOnError(historyGridApiError);
        }, 50);
      }

      // Update the row in both grids (latest and history) after validation
      // Use setTimeout to ensure state updates are processed first
      setTimeout(() => {
        const latestGridApi = gridRef.current?.api;
        const historyGridApi = historyGridRef.current?.api;
        
        const updateGridRow = (gridApi: any) => {
          if (!gridApi) return;
          
          // Use AG-Grid's transaction API for proper row updates
          gridApi.forEachNode((node: any) => {
            if (node.data && node.data.asset_id === assetId) {
              // Update the entire node data with the merged updated asset
              const mergedData = { ...node.data, ...updatedAsset };
              
              // Use applyTransaction for proper update
              gridApi.applyTransaction({
                update: [mergedData]
              });
              
              // Also manually update the node to ensure immediate visual update
              node.setData(mergedData);
              
              // Update each changed field individually to trigger cell value changed events
              Object.keys(changes).forEach(key => {
                const value = (updatedAsset as any)[key];
                if (node.setDataValue) {
                  node.setDataValue(key, value);
                }
              });
              
              // Force a complete refresh of the row
              gridApi.refreshCells({ 
                rowNodes: [node], 
                force: true 
              });
              
              // Explicitly refresh the structure_drawing column (where invalid icon is shown)
              gridApi.refreshCells({ 
                rowNodes: [node], 
                columns: ['structure_drawing_url'],
                force: true 
              });
            }
          });
        };

        if (latestGridApi) updateGridRow(latestGridApi);
        if (historyGridApi) updateGridRow(historyGridApi);
      }, 50); // Slightly longer timeout to ensure state is fully updated

      setIsRowEditModalOpen(false);
      setSelectedRowForEdit(null);
      setToast({ message: 'שינויים עודכנו בהצלחה', type: 'success' });
    } catch (err) {
      console.error('Error saving from modal:', err);
      setToast({ 
        message: err instanceof Error ? err.message : 'שגיאה בשמירה', 
        type: 'error' 
      });
    }
  }, [selectedRowForEdit, validationTaxRegion, assetTypes, building]);

  async function handleSaveChanges() {
    if (validationErrors.size > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[AssetDetails] Validation errors prevent saving:', Array.from(validationErrors.entries()));
      }
      setValidationErrorModalOpen(true);
      return;
    }

    if (!latestMeasurement) {
      const errorMsg = 'לא נמצא נכס לשמירה';
      setToast({ message: errorMsg, type: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      // Prepare asset data with all current values (including changes from dirtyAssets)
      // This must be done first so we validate the actual current state
      const currentAssetData = { ...latestMeasurement, ...(dirtyAssets.get(latestMeasurement.asset_id) || {}) };
      
      // Handle new asset (asset_id === 0 or empty)
      if (!latestMeasurement.asset_id || latestMeasurement.asset_id === 0 || !assetId) {
        // Validate required fields for new asset (using merged data)
        if (!currentAssetData.asset_id || String(currentAssetData.asset_id).trim() === '') {
          const errorMsg = 'קוד נכס נדרש';
          setError(errorMsg);
          setToast({ message: errorMsg, type: 'error' });
          setIsSaving(false);
          return;
        }

        if (!currentAssetData.main_asset_type || String(currentAssetData.main_asset_type).trim() === '') {
          const errorMsg = 'סוג נכס ראשי נדרש';
          setError(errorMsg);
          setToast({ message: errorMsg, type: 'error' });
          setIsSaving(false);
          return;
        }
        
        // Debug logging for tax region validation
        if (process.env.NODE_ENV === 'development') {
        }
        
        // Skip validation for asset type 990
        const isAssetType990 = currentAssetData.main_asset_type && 
          (String(currentAssetData.main_asset_type).trim() === '990' || 
           parseInt(String(currentAssetData.main_asset_type).trim(), 10) === 990);
        
        if (isAssetType990) {
          if (process.env.NODE_ENV === 'development') {
          }
          // Skip validation - proceed directly to save
        } else {
          // Validate the asset before saving
          const shouldValidateSubAssets = isComplexAssetType(currentAssetData.main_asset_type);
          const validations = [
          inputValidators.validateDateFormat(currentAssetData.measurement_date),
          assetValidators.validateBuildingNumber(currentAssetData.building_number),
          assetValidators.validateAssetId(currentAssetData.asset_id),
          assetValidators.validateAssetIdNotInOtherBuilding(currentAssetData.asset_id, currentAssetData.building_number, undefined),
          assetValidators.validatePayerId(currentAssetData.payer_id),
          assetValidators.validateAssetType(currentAssetData.main_asset_type, 'main_asset_type', validationTaxRegion),
          // Use validationTaxRegion from tab for validation - same as AssetsList
          assetValidators.validateMainAssetTypeComplete(currentAssetData.building_number, currentAssetData.main_asset_type, currentAssetData.asset_size, currentAssetData, validationTaxRegion, { assetTypes, building }),
          assetValidators.validateOnlyComplexTypesCanHaveSubAssets(currentAssetData.main_asset_type, [
            currentAssetData.sub_asset_type_1,
            currentAssetData.sub_asset_type_2,
            currentAssetData.sub_asset_type_3,
            currentAssetData.sub_asset_type_4,
            currentAssetData.sub_asset_type_5,
            currentAssetData.sub_asset_type_6
          ]),
          assetValidators.validateComplexTypesMustHaveSubAssets(currentAssetData.main_asset_type, [
            currentAssetData.sub_asset_type_1,
            currentAssetData.sub_asset_type_2,
            currentAssetData.sub_asset_type_3,
            currentAssetData.sub_asset_type_4,
            currentAssetData.sub_asset_type_5,
            currentAssetData.sub_asset_type_6
          ]),
          assetValidators.validateParkingUnitsForParkingType(currentAssetData, assetTypes || [])
        ];

        if (shouldValidateSubAssets) {
          validations.push(
            assetValidators.validateMinimumSubAssets([
              currentAssetData.sub_asset_type_1,
              currentAssetData.sub_asset_type_2,
              currentAssetData.sub_asset_type_3,
              currentAssetData.sub_asset_type_4,
              currentAssetData.sub_asset_type_5,
              currentAssetData.sub_asset_type_6
            ])
          );
        }

        validations.push(
          assetValidators.validateSubAssetSizeMatchesMain(
            currentAssetData.asset_size,
            [
              currentAssetData.sub_asset_type_1,
              currentAssetData.sub_asset_type_2,
              currentAssetData.sub_asset_type_3,
              currentAssetData.sub_asset_type_4,
              currentAssetData.sub_asset_type_5,
              currentAssetData.sub_asset_type_6
            ],
            [
              currentAssetData.sub_asset_size_1,
              currentAssetData.sub_asset_size_2,
              currentAssetData.sub_asset_size_3,
              currentAssetData.sub_asset_size_4,
              currentAssetData.sub_asset_size_5,
              currentAssetData.sub_asset_size_6
            ],
            currentAssetData.main_asset_type
          ),
          assetValidators.validateSubAssetsFor199Or299(
            currentAssetData.building_number,
            currentAssetData.main_asset_type,
            currentAssetData.asset_size,
            [
              currentAssetData.sub_asset_type_1,
              currentAssetData.sub_asset_type_2,
              currentAssetData.sub_asset_type_3,
              currentAssetData.sub_asset_type_4,
              currentAssetData.sub_asset_type_5,
              currentAssetData.sub_asset_type_6
            ],
            [
              currentAssetData.sub_asset_size_1,
              currentAssetData.sub_asset_size_2,
              currentAssetData.sub_asset_size_3,
              currentAssetData.sub_asset_size_4,
              currentAssetData.sub_asset_size_5,
              currentAssetData.sub_asset_size_6
            ],
            validationTaxRegion, // Use validationTaxRegion from tab - same as AssetsList
            { assetTypes, building }
          )
        );

        if (currentAssetData.sub_asset_type_1) {
          validations.push(assetValidators.validateSubAssetTypeComplete(currentAssetData.building_number, currentAssetData.sub_asset_type_1, currentAssetData.sub_asset_size_1, validationTaxRegion, { assetTypes, building }, currentAssetData));
        }
        if (currentAssetData.sub_asset_type_2) {
          validations.push(assetValidators.validateSubAssetTypeComplete(currentAssetData.building_number, currentAssetData.sub_asset_type_2, currentAssetData.sub_asset_size_2, validationTaxRegion, { assetTypes, building }, currentAssetData));
        }
        if (currentAssetData.sub_asset_type_3) {
          validations.push(assetValidators.validateSubAssetTypeComplete(currentAssetData.building_number, currentAssetData.sub_asset_type_3, currentAssetData.sub_asset_size_3, validationTaxRegion, { assetTypes, building }, currentAssetData));
        }
        if (currentAssetData.sub_asset_type_4) {
          validations.push(assetValidators.validateSubAssetTypeComplete(currentAssetData.building_number, currentAssetData.sub_asset_type_4, currentAssetData.sub_asset_size_4, validationTaxRegion, { assetTypes, building }, currentAssetData));
        }
        if (currentAssetData.sub_asset_type_5) {
          validations.push(assetValidators.validateSubAssetTypeComplete(currentAssetData.building_number, currentAssetData.sub_asset_type_5, currentAssetData.sub_asset_size_5, validationTaxRegion, { assetTypes, building }, currentAssetData));
        }
        if (currentAssetData.sub_asset_type_6) {
          validations.push(assetValidators.validateSubAssetTypeComplete(currentAssetData.building_number, currentAssetData.sub_asset_type_6, currentAssetData.sub_asset_size_6, validationTaxRegion, { assetTypes, building }, currentAssetData));
        }

        const validation = await validateAll(validations);
        
        // Also check for numeric format errors
        const numericRegex = /^[0-9]+$/;
        const hasInvalidPayerId = currentAssetData.payer_id && currentAssetData.payer_id !== '' && !numericRegex.test(currentAssetData.payer_id);
        const hasInvalidAssetId = currentAssetData.asset_id && currentAssetData.asset_id !== '' && !numericRegex.test(currentAssetData.asset_id);

        if (!validation.valid || hasInvalidPayerId || hasInvalidAssetId) {
          const errorMap = new Map<string, string>();
          if (!validation.valid) {
            errorMap.set('general', validation.error || 'Unknown validation error');
          }
          if (hasInvalidPayerId) {
            errorMap.set('payer_id', 'Invalid payer ID - must be numeric');
          }
          if (hasInvalidAssetId) {
            errorMap.set('asset_id', 'Invalid asset ID - must be numeric');
          }

          const errorMsg = validation.error || (hasInvalidPayerId ? 'תעודת זהות תשלום חייבת להיות מספרית' : hasInvalidAssetId ? 'קוד נכס חייב להיות מספרי' : 'שגיאת אימות');
          if (process.env.NODE_ENV === 'development') {
            console.error('[AssetDetails] Validation failed for new asset:', errorMsg, errorMap);
          }
          
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            newMap.set(latestMeasurement.id, errorMap);
            return newMap;
          });
          
          setError(errorMsg);
          setToast({ message: errorMsg, type: 'error' });
          setIsSaving(false);
          return;
        }
        }

        // Set tax_region from tab data or from current asset data (runs for both 990 and non-990)
        // Calculate tax_region safely to avoid NaN
        let taxRegionValue: number | undefined = undefined;
        if (validationTaxRegion) {
          const parsed = parseInt(validationTaxRegion, 10);
          taxRegionValue = isNaN(parsed) ? undefined : parsed;
        } else if (currentAssetData.tax_region != null) {
          taxRegionValue = typeof currentAssetData.tax_region === 'number' 
            ? currentAssetData.tax_region 
            : (isNaN(parseInt(String(currentAssetData.tax_region), 10)) ? undefined : parseInt(String(currentAssetData.tax_region), 10));
        }
        
        // Use sanitizeAssetInput to properly handle all data type conversions
        const { sanitizeAssetInput } = await import('../lib/api');
        const assetData = sanitizeAssetInput({
          building_number: currentAssetData.building_number,
          payer_id: currentAssetData.payer_id || null,
          asset_id: currentAssetData.asset_id,
          measurement_date: currentAssetData.measurement_date,
          operator_id: currentAssetData.operator_id ?? null,
          main_asset_type: currentAssetData.main_asset_type || undefined,
          asset_size: currentAssetData.asset_size || 0,
          tax_region: taxRegionValue,
          sub_asset_type_1: currentAssetData.sub_asset_type_1 || undefined,
          sub_asset_size_1: currentAssetData.sub_asset_size_1 || 0,
          sub_asset_type_2: currentAssetData.sub_asset_type_2 || undefined,
          sub_asset_size_2: currentAssetData.sub_asset_size_2 || 0,
          sub_asset_type_3: currentAssetData.sub_asset_type_3 || undefined,
          sub_asset_size_3: currentAssetData.sub_asset_size_3 || 0,
          sub_asset_type_4: currentAssetData.sub_asset_type_4 || undefined,
          sub_asset_size_4: currentAssetData.sub_asset_size_4 || 0,
          sub_asset_type_5: currentAssetData.sub_asset_type_5 || undefined,
          sub_asset_size_5: currentAssetData.sub_asset_size_5 || 0,
          sub_asset_type_6: currentAssetData.sub_asset_type_6 || undefined,
          sub_asset_size_6: currentAssetData.sub_asset_size_6 || 0,
          penthouse: currentAssetData.penthouse || undefined,
          apartment_number: currentAssetData.apartment_number || undefined,
          apartment_floor: currentAssetData.apartment_floor || undefined,
          storage_number: currentAssetData.storage_number || undefined,
          storage_floor: currentAssetData.storage_floor || undefined,
          discount_type: currentAssetData.discount_type || undefined,
          discount_date_from: currentAssetData.discount_date_from || undefined,
          discount_date_to: currentAssetData.discount_date_to || undefined,
          comment: currentAssetData.comment || undefined
        });

        const result = await api.assets.saveBulkTransactional([assetData], 'manual_update', undefined, undefined, undefined, isBusinessContext);

        if (!result.success) {
          throw new Error(result.error || 'Failed to save asset');
        }

        const newAssetId = result.affected_asset_ids?.[0];

        // Refresh building data to update distribution flags after asset creation
        // Asset creation might affect distribution flags (e.g., if asset type requires distribution)
        if (currentAssetData.building_number) {
          try {
            const updatedBuilding = await api.buildings.getOne(currentAssetData.building_number);
            setBuilding(updatedBuilding);
          } catch (err) {
            console.warn('[AssetDetails] Error refreshing building data after asset creation:', err);
            // Don't fail the save operation if building refresh fails
          }
        }

        setToast({ message: t('updatedSuccessfully'), type: 'success' });

        // Notify parent to update the tab with the new asset ID
        if (onAssetCreated && newAssetId) {
          onAssetCreated(newAssetId, String(newAssetId));
        }

        // Clear dirty assets and validation errors
        setDirtyAssets(new Map());
        setValidationErrors(new Map());
        setError(null);

        // Refresh data to load the newly created asset with the new asset ID
        if (onDataUpdate) onDataUpdate();
        await fetchData(newAssetId);
        return;
      }

      // Handle existing asset updates
      if (dirtyAssets.size === 0) {
        setToast({ message: 'No changes to save', type: 'info' });
        return;
      }

      const assetsToUpdate: any[] = [];
      for (const [dbId, changes] of dirtyAssets.entries()) {
        // Find the asset by asset_id (prefer latest row for edits)
        const asset = allMeasurements.find(a => a.asset_id === dbId && a.is_latest === true)
          || allMeasurements.find(a => a.asset_id === dbId);
        if (!asset) {
          console.error(`[AssetDetails] Could not find asset with asset_id ${dbId}`);
          continue;
        }

        if ('measurement_date' in changes) {
          if (!changes.measurement_date || changes.measurement_date === '01/01/1900') {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            changes.measurement_date = `${day}/${month}/${year}`;
          }
        }

        let merged = { ...asset, ...changes };

        // Normalize main_asset_type to canonical asset_types.name (match Assets List) so DB receives exact match
        if (changes.main_asset_type !== undefined && assetTypes?.length && merged.main_asset_type) {
          const raw = String(merged.main_asset_type).trim();
          const found = assetTypes.find((at: any) => String(at.name).trim() === raw)
            || assetTypes.find((at: any) => !isNaN(parseInt(String(at.name), 10)) && parseInt(String(at.name), 10) === parseInt(raw, 10));
          if (found) merged = { ...merged, main_asset_type: String(found.name).trim() };
        }

        // Explicit tax_region from tab when available (match Assets List)
        if (validationTaxRegion && validationTaxRegion.trim() !== '' && !validationTaxRegion.includes(',')) {
          const tr = parseInt(validationTaxRegion.trim(), 10);
          if (!isNaN(tr)) merged = { ...merged, tax_region: tr };
        }

        assetsToUpdate.push(merged);
      }

      const result = await api.assets.saveBulkTransactional(assetsToUpdate, 'manual_update', undefined, undefined, undefined, isBusinessContext);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save assets');
      }

      // Check if distribution flags might have changed due to asset updates
      // Distribution flags can change when:
      // 1. Asset type changes (main_asset_type) - triggers database trigger
      // 2. Asset size changes (asset_size) - for business assets
      let shouldRefreshBuildingFlags = false;
      for (const [dbId, changes] of dirtyAssets.entries()) {
        // Asset type change might affect flags
        if (changes.main_asset_type !== undefined) {
          shouldRefreshBuildingFlags = true;
          break;
        }
        // Asset size change might affect flags (for business assets)
        if (changes.asset_size !== undefined) {
          shouldRefreshBuildingFlags = true;
          break;
        }
      }
      
      // Refresh building data if distribution flags might have changed
      if (shouldRefreshBuildingFlags && asset && asset.building_number) {
        try {
          const updatedBuilding = await api.buildings.getOne(asset.building_number);
          setBuilding(updatedBuilding);
        } catch (err) {
          console.warn('[AssetDetails] Error refreshing building data after asset update:', err);
          // Don't fail the save operation if building refresh fails
        }
      }

      setToast({ message: t('updatedSuccessfully'), type: 'success' });
      setDirtyAssets(new Map());
      setValidationErrors(new Map());
      setError(null);
      
      // Refresh data from server - only fetch what changed (asset history)
      // Use asset_id instead of id, since id might have changed if asset was recreated
      if (asset && asset.asset_id) {
        try {
          setLoading(true);
          
          // Only fetch asset history (assetTypes and building likely unchanged)
          let allAssetMeasurements: Asset[] = [];
          try {
            allAssetMeasurements = await api.assets.getAssetWithHistory(asset.asset_id, asset.building_number);
            
            if (process.env.NODE_ENV === 'development') {
            }
          } catch (historyErr) {
            if (process.env.NODE_ENV === 'development') {
              console.error('[AssetDetails] Error fetching asset history after save:', historyErr);
            }
            // Try to get just the latest asset by asset_id
            const assetsByAssetId = await api.assets.getAllByAssetId(String(asset.asset_id), asset.building_number);
            if (assetsByAssetId && assetsByAssetId.length > 0) {
              const masterRecord = { ...assetsByAssetId[0], is_latest: true };
              allAssetMeasurements = [masterRecord];
            }
          }
          
          // Update asset state with the latest measurement
          if (allAssetMeasurements.length > 0) {
            const latestMeasurement = allAssetMeasurements.find(m => m.is_latest === true) || allAssetMeasurements[0];
            setAsset(latestMeasurement);
          }
          
          setAllMeasurements(allAssetMeasurements);
          setOriginalMeasurements(allAssetMeasurements);
        } catch (fetchErr) {
          const fetchErrorMessage = fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch asset data after save';
          if (process.env.NODE_ENV === 'development') {
            console.error('[AssetDetails] Error fetching data after save:', fetchErr);
          }
          setError(fetchErrorMessage);
          setToast({ message: fetchErrorMessage, type: 'error' });
        } finally {
          setLoading(false);
        }
      } else {
        // Fallback to regular fetchData if asset or asset_id is not available
        await fetchData();
      }
      
      if (onDataUpdate) onDataUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save changes';
      if (process.env.NODE_ENV === 'development') {
        console.error('[AssetDetails] Error saving changes:', err);
        console.error('[AssetDetails] Error details:', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          name: err instanceof Error ? err.name : undefined
        });
      }
      setError(errorMessage);
      setToast({ message: errorMessage, type: 'error' });
      // Don't clear error automatically - let user see it
    } finally {
      setIsSaving(false);
    }
  }

  const handleOpenSaveAsNewMeasurementModal = useCallback(() => {
    if (!latestMeasurement) {
      setToast({ message: 'לא נמצא נכס לשמירה', type: 'error' });
      return;
    }

    if (validationErrors.size > 0) {
      setValidationErrorModalOpen(true);
      return;
    }

    // Set default date to today
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    setNewMeasurementDate(`${day}/${month}/${year}`);
    setMeasurementDateModalOpen(true);
  }, [latestMeasurement, hasChanges, validationErrors.size]);

  async function handleSaveAsNewMeasurement() {
    if (!latestMeasurement) {
      setToast({ message: 'לא נמצא נכס לשמירה', type: 'error' });
      return;
    }

    // Validate date format if provided
    let finalMeasurementDate: string;
    if (newMeasurementDate && newMeasurementDate.trim() !== '') {
      // Validate DD/MM/YYYY format
      const dateFormatPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      const match = newMeasurementDate.trim().match(dateFormatPattern);
      
      if (!match) {
        setToast({ message: 'תאריך לא תקין. נא להזין בפורמט DD/MM/YYYY', type: 'error' });
        return;
      }

      const [, day, month, year] = match;
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);

      // Validate date ranges
      if (monthNum < 1 || monthNum > 12) {
        setToast({ message: 'חודש לא תקין (1-12)', type: 'error' });
        return;
      }

      const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
      if (dayNum < 1 || dayNum > daysInMonth) {
        setToast({ message: `יום לא תקין לחודש ${monthNum} (1-${daysInMonth})`, type: 'error' });
        return;
      }

      if (yearNum < 1900 || yearNum > 2100) {
        setToast({ message: 'שנה לא תקינה (1900-2100)', type: 'error' });
        return;
      }

      // Validate that date is not greater than today
      const inputDate = new Date(yearNum, monthNum - 1, dayNum);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      
      if (inputDate > today) {
        setToast({ message: 'תאריך מדידה לא יכול להיות גדול מתאריך נוכחי', type: 'error' });
        return;
      }

      finalMeasurementDate = newMeasurementDate.trim();
    } else {
      // Use system date if no date provided
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      finalMeasurementDate = `${day}/${month}/${year}`;
    }

    setMeasurementDateModalOpen(false);
    setIsSaving(true);
    try {
      // Get the current measurement with all changes applied
      const currentAsset = latestMeasurement;
      // Use currentAsset.asset_id to get dirty changes (dirtyAssets uses asset_id as key)
      const changes = dirtyAssets.get(currentAsset.asset_id) || {};
      
      // Merge current asset with changes
      const newAssetData = {
        ...currentAsset,
        ...changes,
      };

      // Set new measurement date
      newAssetData.measurement_date = finalMeasurementDate;
      
      // Ensure tax_region is preserved when creating new measurement
      // Use validationTaxRegion from tab if available, otherwise use current asset's tax_region
      if (!newAssetData.tax_region) {
        const taxRegionValue = validationTaxRegion ? parseInt(validationTaxRegion, 10) : (currentAsset.tax_region || undefined);
        newAssetData.tax_region = taxRegionValue;
      }

      // Store the old asset ID and get the full current asset data
      const oldAssetId = currentAsset.asset_id;
      
      // Get the complete current asset data from the database to ensure we copy everything
      // This ensures we have all fields including any that might not be in the current state
      // Use getAllByAssetId instead of getOne to avoid performance warning
      let fullCurrentAssetData: Asset = currentAsset;
      try {
        // Try to get from getAllByAssetId first (preferred method)
        const assetsByAssetId = await api.assets.getAllByAssetId(String(oldAssetId), currentAsset.building_number);
        if (assetsByAssetId && assetsByAssetId.length > 0) {
          // Get the latest one (should be first after sorting)
          fullCurrentAssetData = assetsByAssetId[0];
        }
      } catch (err) {
        // If getAllByAssetId fails, use the current asset data we have
        if (process.env.NODE_ENV === 'development') {
          console.warn('[AssetDetails] Could not fetch full asset data, using current state:', err);
        }
        fullCurrentAssetData = currentAsset;
      }

      // Remove asset_id and created_at to create a new record (asset_id will be assigned by DB)
      // Note: We keep asset_id in newAssetData as it might be used for linking
      delete (newAssetData as any).created_at;
      delete (newAssetData as any).updated_at;
      delete (newAssetData as any).is_latest;
      delete (newAssetData as any).history_created_at;

      const updateDataWithFlag = {
        asset_id: oldAssetId,
        ...newAssetData,
        is_new_measurement: true
      };

      const result = await api.assets.saveBulkTransactional([updateDataWithFlag], 'manual_update', undefined, undefined, undefined, isBusinessContext);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save new measurement');
      }

      // Refresh building data to update distribution flags after saving new measurement
      // New measurement might affect distribution flags if asset type or size changed
      if (currentAsset.building_number) {
        try {
          const updatedBuilding = await api.buildings.getOne(currentAsset.building_number);
          setBuilding(updatedBuilding);
        } catch (err) {
          console.warn('[AssetDetails] Error refreshing building data after save as new measurement:', err);
          // Don't fail the save operation if building refresh fails
        }
      }

      // Pin ALL active (null-date) files to the old measurement date so they belong
      // exclusively to the history record. The new assets-table record will have no files.
      // This runs unconditionally — even if oldMeasurementDate is null we use today's date as fallback.
      const oldMeasurementDate = currentAsset.measurement_date;
      if (oldAssetId) {
        try {
          const numericOldAssetId = typeof oldAssetId === 'string' ? parseInt(oldAssetId, 10) : oldAssetId;
          // Use the old measurement date, or today as a fallback when the old record had no date
          let dateToPin = oldMeasurementDate;
          if (!dateToPin) {
            const _today = new Date();
            const _d = String(_today.getDate()).padStart(2, '0');
            const _m = String(_today.getMonth() + 1).padStart(2, '0');
            const _y = _today.getFullYear();
            dateToPin = `${_d}/${_m}/${_y}`;
          }
          await api.assets.files.claimForMeasurement(numericOldAssetId, dateToPin);
        } catch (err) {
          console.warn('[AssetDetails] Could not pin active files to history record:', err);
          // Non-fatal — files remain unlinked but won't appear in export (export uses NULL filter)
        }
      }

      setToast({ message: 'נשמרה מדידה חדשה בהצלחה', type: 'success' });
      setDirtyAssets(new Map());
      setValidationErrors(new Map());
      setError(null);
      
      // Refresh data from server - only fetch what changed (asset history)
      if (asset && asset.asset_id) {
        try {
          setLoading(true);
          
          // Only fetch asset history (assetTypes and building likely unchanged)
          let allAssetMeasurements: Asset[] = [];
          try {
            allAssetMeasurements = await api.assets.getAssetWithHistory(asset.asset_id, asset.building_number);
            
            if (process.env.NODE_ENV === 'development') {
            }
          } catch (historyErr) {
            if (process.env.NODE_ENV === 'development') {
              console.error('[AssetDetails] Error fetching asset history after save as new:', historyErr);
            }
            const assetsByAssetId = await api.assets.getAllByAssetId(String(asset.asset_id), asset.building_number);
            if (assetsByAssetId && assetsByAssetId.length > 0) {
              const masterRecord = { ...assetsByAssetId[0], is_latest: true };
              allAssetMeasurements = [masterRecord];
            }
          }
          
          // Update asset state with the latest measurement
          if (allAssetMeasurements.length > 0) {
            const latestMeasurement = allAssetMeasurements.find(m => m.is_latest === true) || allAssetMeasurements[0];
            setAsset(latestMeasurement);
          }
          
          setAllMeasurements(allAssetMeasurements);
          setOriginalMeasurements(allAssetMeasurements);

          // Rebuild assetsWithFiles so the file icon reflects the new state.
          // Active record: count any file (uploads from AssetsList stamp the asset's
          // measurement_date onto files, so filtering to NULL would miss them).
          // History record: files pinned to that specific date.
          const filesMap = new Set<string>();
          await Promise.all(
            allAssetMeasurements.map(async (m) => {
              const mId = m.asset_id;
              if (!mId) return;
              try {
                if (m.is_latest) {
                  const files = await api.assets.files.getAll(mId);
                  if (files && files.length > 0) filesMap.add(`${mId}|ACTIVE`);
                } else {
                  const mDate = m.measurement_date ?? null;
                  const files = await api.assets.files.getAll(mId, mDate);
                  if (files && files.length > 0) filesMap.add(`${mId}|${mDate}`);
                }
              } catch { /* ignore */ }
            })
          );
          setAssetsWithFiles(filesMap);
        } catch (fetchErr) {
          const fetchErrorMessage = fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch asset data after save';
          if (process.env.NODE_ENV === 'development') {
            console.error('[AssetDetails] Error fetching data after save as new:', fetchErr);
          }
          setError(fetchErrorMessage);
          setToast({ message: fetchErrorMessage, type: 'error' });
        } finally {
          setLoading(false);
        }
      } else {
        await fetchData();
      }
      
      if (onDataUpdate) onDataUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save as new measurement';
      if (process.env.NODE_ENV === 'development') {
        console.error('[AssetDetails] Error saving as new measurement:', err);
      }
      setError(errorMessage);
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setIsSaving(false);
      setNewMeasurementDate('');
    }
  }

  /** Upload a single file silently — no toast, no modal refresh. Returns compression info string or throws. */
  const uploadSingleFile = useCallback(async (
    assetId: number,
    file: File,
    onProgress: (p: number) => void
  ): Promise<{ sizeReduction: string }> => {
    // Step 1: Compress (skip for PDF)
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    let compressedFile: File;
    let originalSizeKB: string;
    let compressedSizeKB: string;

    onProgress(10);
    if (isPdf) {
      compressedFile = file;
      originalSizeKB = (file.size / 1024).toFixed(2);
      compressedSizeKB = originalSizeKB;
    } else {
      compressedFile = await compressFile(file);
      if (compressedFile.name !== file.name) {
        compressedFile = new File([compressedFile], file.name, { type: compressedFile.type || file.type });
      }
      originalSizeKB = (file.size / 1024).toFixed(2);
      compressedSizeKB = (compressedFile.size / 1024).toFixed(2);
    }
    onProgress(30);

    // Step 2: Build storage path
    const fileExt = file.name.split('.').pop() || 'bin';
    const sanitizedName = `${Date.now()}.${fileExt}`;
    const filePath = `${assetId}/${sanitizedName}`;

    // Step 3: Upload with simulated progress
    const progressInterval = setInterval(() => onProgress(Math.min(90, 40 + 5)), 200);
    onProgress(40);

    const measurementDate: null = null;
    const uploadOptions: { contentType?: string; upsert: boolean; measurementDate?: string | null; originalFileName?: string } = {
      upsert: false,
      measurementDate,
      originalFileName: file.name,
    };
    if (compressedFile.type) uploadOptions.contentType = compressedFile.type;

    const { error: uploadError } = await api.storage
      .from('structure-drawings')
      .upload(filePath, compressedFile, uploadOptions);

    clearInterval(progressInterval);
    if (uploadError) throw uploadError;
    onProgress(100);

    const sizeReduction = compressedSizeKB !== originalSizeKB
      ? ` (${originalSizeKB}KB → ${compressedSizeKB}KB)`
      : '';
    return { sizeReduction };
  }, []);

  /** Upload one or more files for an asset, showing combined progress and a single result toast. */
  const handleFileUpload = useCallback(async (assetId: number, files: File | File[]) => {
    const fileList = Array.isArray(files) ? files : [files];
    if (fileList.length === 0) return;

    setUploadingAssetId(assetId);
    const errors: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setUploadProgress({ assetId, progress: 0, fileName: file.name, currentIndex: i, total: fileList.length });
      try {
        await uploadSingleFile(assetId, file, (p) => {
          setUploadProgress({ assetId, progress: p, fileName: file.name, currentIndex: i, total: fileList.length });
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message
          : typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message)
          : t('failedToUploadDrawing');
        errors.push(`${file.name}: ${msg}`);
      }
    }

    // Mark asset as having files (if at least one succeeded)
    const anySucceeded = errors.length < fileList.length;
    if (anySucceeded) {
      setAssetsWithFiles(prev => new Set(prev).add(`${assetId}|ACTIVE`));
    }

    // Refresh modal once after all uploads
    if (assetFilesModalOpen && selectedAssetIdForFiles === assetId) {
      assetFilesModalRef.current?.refreshFiles();
    }

    setUploadProgress(null);
    setUploadingAssetId(null);

    // Single result toast
    if (errors.length === 0) {
      const msg = fileList.length === 1
        ? t('drawingUploadedSuccessfully')
        : `${fileList.length} קבצים הועלו בהצלחה`;
      setToast({ message: msg, type: 'success' });
    } else if (errors.length === fileList.length) {
      setToast({ message: errors[0], type: 'error' });
    } else {
      setToast({
        message: `${fileList.length - errors.length} מתוך ${fileList.length} קבצים הועלו. שגיאות: ${errors.join(', ')}`,
        type: 'error',
      });
    }
  }, [t, assetFilesModalOpen, selectedAssetIdForFiles, uploadSingleFile]);

  const handleViewDrawing = useCallback((assetId: number, measurementDate?: string | null) => {
    setSelectedAssetIdForFiles(assetId);
    setAssetFilesModalOpen(true);
    // Always set — undefined means "show all files" (active row); a date means "filter to that history snapshot".
    setSelectedMeasurementDateForFiles(measurementDate);
  }, []);

  function handleCancelChanges() {
    // Restore original data using shallow copy (better performance)
    setAllMeasurements(originalMeasurements.map(asset => ({ ...asset })));
    setDirtyAssets(new Map());
    setValidationErrors(new Map());
    validationErrorsRef.current = new Map();
    setError(null);
    setToast(null);
    setValidationResults(null);
    setValidationProgress(null);
    
    // Clear any pending validation timers
    validationTimerRef.current.forEach((timer) => {
      clearTimeout(timer);
    });
    validationTimerRef.current.clear();
    
    // Refresh grids to show original data
    setTimeout(() => {
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
      }
      if (historyGridRef.current?.api) {
        historyGridRef.current.api.refreshCells({ force: true });
      }
    }, 0);
  }

  async function handleValidateLatestRow() {
    if (!latestMeasurement) {
      setToast({ message: 'לא נמצא נכס לאימות', type: 'error' });
      return;
    }

    const latestRow = latestMeasurement;
    if (!latestRow) {
      setToast({ message: 'לא נמצא נכס לאימות', type: 'error' });
      return;
    }

    setIsValidating(true);
    setValidationProgress(null);
    setValidationModalOpen(true);
    try {
      // Debug logging for tax region validation
      if (process.env.NODE_ENV === 'development') {
      }

      // Use unified validation handler - same as building assets list
      const result = await AssetValidationHandler.validateSingleAsset(latestRow, {
        onProgress: (progress) => {
          setValidationProgress({
            current: progress.current,
            total: progress.total,
            currentStep: progress.currentStep || 'בודק...'
          });
        },
        taxRegion: validationTaxRegion, // Use validationTaxRegion from tab - same as AssetsList
        cachedData: { assetTypes, building }
      });

      // Add discount validation errors
      const discountErrors = validateDiscountDates(latestRow);
      const allErrors = [...(result.errors || []), ...discountErrors];

      // Recalculate actualValid from results - same as AssetsList
      // This ensures consistency: an asset is only valid if valid=true AND no errors
      const actualValid = result.valid && allErrors.length === 0;
      
      // Show validation results in modal
      setValidationResults({
        valid: actualValid, // Use recalculated actualValid - same as AssetsList
        errors: allErrors,
        passed: result.passed,
        matchedAssetTypeRecord: result.matchedAssetTypeRecord
      });
      
      // Update validationErrors state to reflect validation results
      // This ensures the invalid icon is updated based on the validation results
      if (latestRow.asset_id) {
        // Use number for consistency with validationErrors Map key type
        const latestRowId = typeof latestRow.asset_id === 'string' ? parseInt(latestRow.asset_id, 10) : latestRow.asset_id;
        if (!isNaN(latestRowId)) {
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            if (actualValid) {
              // Validation passed - clear errors for this asset
              newMap.delete(latestRowId);
            } else if (allErrors.length > 0) {
              // Validation failed - set errors for this asset
              const errorMap = new Map<string, string>();
              allErrors.forEach((error, index) => {
                // Use a generic field name or index if we can't determine the field
                errorMap.set(`error_${index}`, error);
              });
              newMap.set(latestRowId, errorMap);
            }
            return newMap;
          });
        }
        
        // Refresh grid cells after validation to update invalid icon
        // Use setTimeout to ensure state update is processed first
        setTimeout(() => {
          if (gridRef.current?.api) {
            // Find the row node for this asset
            gridRef.current.api.forEachNode((node) => {
              if (node.data && node.data.id === latestRow.id) {
                // Refresh the actions column where the invalid icon is shown
                gridRef.current.api.refreshCells({ 
                  rowNodes: [node], 
                  columns: ['actions'],
                  force: true 
                });
                // Also refresh all cells in the row for styling updates
                gridRef.current.api.refreshCells({ rowNodes: [node], force: true });
              }
            });
          }
        }, 100);
      }
      
      setValidationProgress(null);
    } catch (err) {
      console.error('Validation error:', err);
      setToast({ 
        message: 'שגיאה בביצוע אימות', 
        type: 'error' 
      });
    } finally {
      setIsValidating(false);
    }
  }


  async function handleExportToAutomation() {
    if (!latestMeasurement?.asset_id) {
      setToast({ message: 'לא נמצא נכס לשליחה', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const numericAssetId = typeof latestMeasurement.asset_id === 'string'
      ? parseInt(latestMeasurement.asset_id, 10)
      : latestMeasurement.asset_id;
    if (isNaN(numericAssetId) || numericAssetId <= 0) {
      setToast({ message: 'מזהה נכס לא תקין', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setIsExporting(true);
    document.body.style.cursor = 'wait';
    setToast({ message: 'מתחיל שליחה...', type: 'info' });
    // Yield to React so the spinner state commits before any synchronous work
    await Promise.resolve();

    try {
      // STEP 1: Optional validation before export
      if (shouldValidateBeforeSave) {
        setToast({ message: 'מאמת נכס לפני שליחה...', type: 'info' });
        const cachedData = {
          assetTypes: assetTypes.length > 0 ? assetTypes : await api.assetTypes.getAll(),
          building: building || undefined,
        };
        const batchResult = await AssetValidationHandler.validateBuildingAssets(
          [latestMeasurement],
          latestMeasurement.building_number,
          {
            mode: 'building',
            validateOnlyLatest: false,
            cachedData,
            taxRegion: taxRegion,
          }
        );
        const invalid = batchResult.results.filter(r => !r.valid && r.errors && r.errors.length > 0);
        if (invalid.length > 0) {
          const errorMessages = invalid[0].errors.join(', ');
          setToast({ message: `לא ניתן לשלוח - נכס לא תקין: ${errorMessages}`, type: 'error' });
          setTimeout(() => setToast(null), 10000);
          setIsExporting(false);
          document.body.style.cursor = '';
          return;
        }
      }

      // STEP 2: Build Excel data for this single asset
      const assetTypesData = assetTypes.length > 0 ? assetTypes : getAssetTypes();

      const getExportAssetSize = (a: Asset): number | string => {
        const assetSize = Number((a as any).asset_size) || 0;
        const dist = Number((a as any).business_distribution_area) || 0;
        const sharedParking = Number((a as any).shared_parking_area) || 0;
        const total = assetSize + dist + sharedParking;
        return total > 0 ? total : '';
      };

      const headers = [
        'זיהוי משלם', 'זיהוי נכס', 'תחילת שינוי', 'סוף שינוי', 'סוג נכס', 'גודל נכס',
        'נכס משנה 1', 'גודל נכס משנה 1', 'נכס משנה 2', 'גודל נכס משנה 2',
        'נכס משנה 3', 'גודל נכס משנה 3', 'נכס משנה 4', 'גודל נכס משנה 4',
        'נכס משנה 5', 'גודל נכס משנה 5', 'נכס משנה 6', 'גודל נכס משנה 6',
        'מנה', 'מקום גביה', 'מספר פקודה', 'שנת כספים', 'תאריך גביה', 'יום ערך',
      ];

      // Helper: add business_distribution_area to sub_asset_size_1, and shared_parking_area to the parking subtype size
      const applySharedAreasToExportRow = (asset: any, baseRow: any[]): any[] => {
        const result = [...baseRow];
        // Row layout: [payer_id(0), asset_id(1), date_from(2), date_to(3), main_type(4), size(5),
        //   sub1_type(6), sub1_size(7), sub2_type(8), sub2_size(9), ...sub6_type(16), sub6_size(17), ...]

        // Add business_distribution_area (per-asset distributed share) to sub_asset_size_1 (index 7)
        // Only when sub_asset_type_1 (index 6) is non-empty; if no sub-types exist the value is
        // already included in the main asset size via getExportAssetSize.
        const businessDistributionArea = Number(asset.business_distribution_area) || 0;
        if (businessDistributionArea > 0 && String(result[6] || '').trim()) {
          result[7] = (Number(result[7]) || 0) + businessDistributionArea;
        }

        // Add shared_parking_area to whichever type (main or subtype 1–6) has use_for_parking_shared_area
        const sharedParkingArea = Number(asset.shared_parking_area) || 0;
        if (sharedParkingArea > 0) {
          const findType = (typeName: string) => {
            if (!typeName) return undefined;
            let at = assetTypesData.find((t: any) => String(t.name || '').trim() === typeName);
            if (!at) {
              const n = parseInt(typeName, 10);
              if (!isNaN(n)) at = assetTypesData.find((t: any) => parseInt(String(t.name || ''), 10) === n);
            }
            return at;
          };
          const isParkingType = (typeName: string) => !!(findType(typeName) as any)?.use_for_parking_shared_area;

          const mainTypeName = String(result[4] || '').trim();
          if (mainTypeName && isParkingType(mainTypeName)) {
            // Main type is the parking type — only add to sub_asset_size_1 when sub1 exists.
            // If no sub-types, the value is already in main asset size via getExportAssetSize.
            if (String(result[6] || '').trim()) {
              result[7] = (Number(result[7]) || 0) + sharedParkingArea;
            }
          } else {
            let foundParking = false;
            for (let i = 0; i < 6; i++) {
              const typeIdx = 6 + i * 2;
              const sizeIdx = 7 + i * 2;
              const subtypeName = String(result[typeIdx] || '').trim();
              if (!subtypeName) continue;
              if (isParkingType(subtypeName)) {
                result[sizeIdx] = (Number(result[sizeIdx]) || 0) + sharedParkingArea;
                foundParking = true;
                break;
              }
            }
            // Fallback: if flag not set but asset has number_of_parking_units,
            // add to last non-empty sub-type (parking is always listed last)
            if (!foundParking && Number(asset.number_of_parking_units) > 0) {
              for (let i = 5; i >= 0; i--) {
                const typeIdx = 6 + i * 2;
                const sizeIdx = 7 + i * 2;
                if (String(result[typeIdx] || '').trim()) {
                  result[sizeIdx] = (Number(result[sizeIdx]) || 0) + sharedParkingArea;
                  break;
                }
              }
            }
          }
        }

        return result;
      };

      const a = latestMeasurement as any;
      const baseRow = [
        a.payer_id || '',
        numericAssetId != null ? String(numericAssetId) : '',
        formatDateToDDMMYYYY(a.discount_date_from) || '',
        formatDateToDDMMYYYY(a.discount_date_to) || '',
        a.main_asset_type || '',
        getExportAssetSize(latestMeasurement),
        a.sub_asset_type_1 || '', a.sub_asset_size_1 || '',
        a.sub_asset_type_2 || '', a.sub_asset_size_2 || '',
        a.sub_asset_type_3 || '', a.sub_asset_size_3 || '',
        a.sub_asset_type_4 || '', a.sub_asset_size_4 || '',
        a.sub_asset_type_5 || '', a.sub_asset_size_5 || '',
        a.sub_asset_type_6 || '', a.sub_asset_size_6 || '',
        '', '', '', '', '', '',
      ];
      const row = applySharedAreasToExportRow(a, baseRow);

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const assetTaxRegion = a.tax_region ? String(a.tax_region).trim() : (taxRegion || 'unknown');

      const excelFilename = `שליחת_נתונים_${assetTaxRegion}_${dateStr}.xlsx`;
      const excelBlob = createExcelBlob({
        filename: excelFilename,
        sheetName: 'נכסים',
        data: [headers, row],
        decimalFormatColumnIndices: [5, 7, 9, 11, 13, 15, 17],
        columnWidths: [
          { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
          { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
          { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
          { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 },
        ],
      });

      // STEP 3: Get ACTIVE files only (measurement_date IS NULL).
      // Active files are stored with NULL date — they belong to the current assets-table record.
      // History files have a specific date and are excluded here automatically.
      setToast({ message: 'טוען קבצים...', type: 'info' });
      const assetFiles = await api.assets.files.getAll(numericAssetId, null);

      const zipFiles: Array<{ filename: string; data: Blob }> = [];
      zipFiles.push({ filename: `${assetTaxRegion}/${excelFilename}`, data: excelBlob });

      // STEP 4: Download files and add to ZIP
      const fileListData: any[][] = [['מזהה נכס', 'מזהה משלם', 'שם קובץ']];
      const payerId = a.payer_id || '';

      const extractFilenameFromUrl = (url: string | undefined): string => {
        if (!url) return '';
        const u = url.replace(/\\/g, '/');
        return u.split('/').pop()?.split('?')[0] ?? '';
      };
      const getFilePathForDownload = (file: any): string => {
        const filePath = typeof file?.file_path === 'string' ? file.file_path.trim() : '';
        if (filePath && !filePath.startsWith('http') && !filePath.startsWith('/')) {
          if (!filePath.includes('/')) return `${numericAssetId}/${filePath}`;
          return filePath;
        }
        const url: string | undefined = file?.file_url;
        if (typeof url === 'string' && url.length > 0) {
          const u = url.replace(/\\/g, '/');
          const idxBucket = u.indexOf('structure-drawings/');
          if (idxBucket !== -1) return u.substring(idxBucket + 'structure-drawings/'.length).split('?')[0];
          const filename = extractFilenameFromUrl(url);
          if (filename) return `${numericAssetId}/${filename}`;
        }
        const name = typeof file?.file_name === 'string' ? file.file_name.trim() : '';
        if (name) return `${numericAssetId}/${name}`;
        return `${numericAssetId}/unknown`;
      };

      for (const file of assetFiles) {
        let fileName = file.file_name;
        if (!fileName && file.file_url) fileName = extractFilenameFromUrl(file.file_url);
        fileListData.push([numericAssetId, payerId, fileName || '']);
        try {
          const filePath = getFilePathForDownload(file);
          if (!filePath) continue;
          const result = await getAssetFileBlobForZip(filePath, file.file_url);
          if (result.error || !result.data) continue;
          zipFiles.push({ filename: `${assetTaxRegion}/${numericAssetId}_${fileName || extractFilenameFromUrl(file.file_url)}`, data: result.data });
        } catch (err) {
          console.warn('[AssetDetails] Error processing file for ZIP:', err);
        }
      }

      if (fileListData.length > 1) {
        const fileListFilename = `רשימת_קבצים_${assetTaxRegion}_${dateStr}.xlsx`;
        const fileListBlob = createExcelBlob({
          filename: fileListFilename,
          sheetName: 'רשימת קבצים',
          data: fileListData,
          columnWidths: [{ wch: 15 }, { wch: 15 }, { wch: 30 }],
        });
        zipFiles.push({ filename: `${assetTaxRegion}/${fileListFilename}`, data: fileListBlob });
      }

      // STEP 5: Send emails to operators and managers
      setToast({ message: 'שולח מיילים...', type: 'info' });
      const dateStrHe = now.toLocaleDateString('he-IL');
      const { emailService } = await import('../lib/emailService');
      const [templateOp, templateMgr] = await Promise.all([
        api.systemConfiguration.getEmailTemplate('email_template_operator'),
        api.systemConfiguration.getEmailTemplate('email_template_manager'),
      ]).catch(() => [null, null]);
      const applyTpl = (t: string, name: string, count?: number) =>
        t.replace(/\{\{name\}\}/g, name).replace(/\{\{date\}\}/g, dateStrHe).replace(/\{\{assetCount\}\}/g, count != null ? String(count) : '');

      const operatorsList = await api.operators.getAll();
      const sendItems: Array<{ to: string; subject: string; body: string; attachmentFilename: string; attachmentBlob: Blob }> = [];

      const operatorId = a.operator_id;
      if (operatorId != null) {
        const operator = operatorsList.find((o: any) => o.id === operatorId);
        if (operator?.email?.includes('@')) {
          const subj = templateOp ? applyTpl(templateOp.subject, operator.name, 1) : `שליחת נתונים - ${dateStrHe}`;
          const body = templateOp ? applyTpl(templateOp.body, operator.name, 1) : `שלום ${operator.name},\n\nמצורף קובץ הנתונים.\nתאריך: ${dateStrHe}\n\nבברכה,\nמערכת ניהול נכסים`;
          sendItems.push({ to: operator.email, subject: subj, body, attachmentFilename: `נכסים_מפעיל_${operatorId}_${dateStr}_1נכסים.xlsx`, attachmentBlob: excelBlob });
        }
      }

      const managersList = await api.managers.getAll();
      for (const manager of managersList) {
        if (!manager.email?.includes('@')) continue;
        const regionStrs = (manager.tax_regions || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const regionSet = new Set(regionStrs.map((s: string) => { const n = parseInt(s, 10); return isNaN(n) ? null : n; }).filter((n: number | null): n is number => n !== null));
        const assetTaxRegionNum = a.tax_region != null ? (typeof a.tax_region === 'string' ? parseInt(a.tax_region, 10) : a.tax_region) : null;
        if (assetTaxRegionNum == null || !regionSet.has(assetTaxRegionNum)) continue;
        const subj = templateMgr ? applyTpl(templateMgr.subject, manager.name, 1) : `שליחת נתונים - ${dateStrHe}`;
        const body = templateMgr ? applyTpl(templateMgr.body, manager.name, 1) : `שלום ${manager.name},\n\nמצורף קובץ הנתונים.\nתאריך: ${dateStrHe}\n\nבברכה,\nמערכת ניהול נכסים`;
        sendItems.push({ to: manager.email, subject: subj, body, attachmentFilename: `נכסים_מנהל_${manager.id}_${dateStr}_1נכסים.xlsx`, attachmentBlob: excelBlob });
      }

      let sentCount = 0;
      let emailError: string | undefined;
      if (sendItems.length > 0) {
        const { sentCount: n, lastError } = await emailService.sendExportEmailsWithProgress(
          sendItems,
          { concurrency: 3, onProgress: () => {} }
        );
        sentCount = n;
        emailError = lastError;
      }

      // STEP 6: Download ZIP
      setToast({ message: 'מוריד קובץ ZIP...', type: 'info' });
      const zipFilename = `שליחת_נתונים_${dateStr}.zip`;
      const { createAndDownloadZip } = await import('../lib/zipExport');
      await createAndDownloadZip(zipFilename, zipFiles);

      // STEP 7: Mark as exported (only after successful send)
      await api.assets.markExportedByIds([numericAssetId]);

      // Update local state
      const today = new Date().toISOString().split('T')[0];
      setAllMeasurements(prev =>
        prev.map(m =>
          m.is_latest === true
            ? { ...m, exported_to_automation: true, export_to_automation_at: today }
            : m
        )
      );
      if (asset?.is_latest === true) {
        setAsset(prev => prev ? { ...prev, exported_to_automation: true, export_to_automation_at: today } : prev);
      }
      window.dispatchEvent(new CustomEvent('exportToAutomationSuccess'));

      const failedEmails = sendItems.length - sentCount;
      let successMessage = 'הנכס נשלח לעירייה בהצלחה. הקובץ הורד.';
      if (sentCount > 0) successMessage += ` ${sentCount} מיילים נשלחו.`;
      if (failedEmails > 0) {
        const errDetail = emailError ? `: ${emailError}` : '';
        successMessage += ` ⚠️ ${failedEmails} מיילים נכשלו${errDetail}`;
      }
      setToast({ message: successMessage, type: failedEmails > 0 && sentCount === 0 ? 'error' : 'success' });
      setTimeout(() => setToast(null), failedEmails > 0 ? 12000 : 6000);
    } catch (err: any) {
      setToast({ message: err?.message || 'שגיאה בשליחה לעירייה', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsExporting(false);
      document.body.style.cursor = '';
    }
  }

  // Helper function to get cell style for dirty fields and validation errors
  // Memoize getCellStyle to prevent recreation on every render
  const getCellStyle = useCallback((params: any, fieldName: string) => {
    // Use asset_id (same as getRowStyle and validationErrors) or fallback to id
    const assetId = params.data?.asset_id || params.data?.id;
    if (!assetId) return { textAlign: 'right' };
    
    // Convert to number for consistency with validationErrors Map key type
    const assetIdNum = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
    if (isNaN(assetIdNum)) return { textAlign: 'right' };
    
    const isDirty = dirtyAssets.has(assetIdNum) && dirtyAssets.get(assetIdNum)?.hasOwnProperty(fieldName);
    const isLatest = params.data.is_latest === true;
    
    // Check for validation errors for this asset and field
    // validationErrors uses asset_id (number) as key
    const assetErrors = validationErrors.get(assetIdNum);
    const hasFieldError = assetErrors && assetErrors.has(fieldName);
    // Also check if there are any errors for this asset (even if not field-specific)
    const hasAnyError = assetErrors && assetErrors.size > 0;
    
    // If there's a validation error, apply red styling
    if (hasFieldError || hasAnyError) {
      return {
        backgroundColor: '#fee2e2',
        border: '2px solid #ef4444',
        borderRadius: '4px',
        fontWeight: isDirty ? 'bold' : 'normal',
        textAlign: 'right'
      };
    }
    
    // Normal styling for dirty fields
    return {
      fontWeight: isDirty ? 'bold' : 'normal',
      backgroundColor: isLatest ? undefined : '#f3f4f6',
      color: isLatest ? undefined : '#6b7280',
      cursor: 'default',
      textAlign: 'right'
    };
  }, [dirtyAssets, validationErrors]);


  // Validation tooltip component for AssetDetails
  const ValidationTooltipButton = ({ errors, errorMessage, onToastClick }: { errors: string[], errorMessage: string, onToastClick: () => void }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [position, setPosition] = useState({ top: 0, right: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);

    const handleMouseEnter = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
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

    const tooltipContent = isHovered ? (
      <div
        className="tooltip-container"
        style={{
          top: `${position.top}px`,
          right: `${position.right + 8}px`,
          transform: 'translateY(-50%)'
        }}
      >
        <div className="tooltip-content">
          {errors.map((error, index) => (
            <div key={index} className="tooltip-message-item">
              {error}
            </div>
          ))}
        </div>
      </div>
    ) : null;

    return (
      <>
        <button
          ref={buttonRef}
          onClick={(e) => {
            e.stopPropagation();
            onToastClick();
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="p-1 text-red-600 hover:text-red-700 transition-colors hover:scale-110"
        >
          <AlertCircle className="h-5 w-5" />
        </button>
        {tooltipContent && createPortal(tooltipContent, document.body)}
      </>
    );
  };

  // Memoize the actions cell renderer - shows invalid validation icon
  const actionsCellRenderer = useCallback((params: any) => {
    if (!params.data) return null;
    
    // Use asset_id as key since only latest measurement is editable (same as validationErrors Map key and getRowStyle)
    const assetId = params.data.asset_id;
    if (!assetId) return null;
    
    // Convert to number for consistency with validationErrors Map key type
    const assetIdNum = typeof assetId === 'string' ? parseInt(assetId, 10) : assetId;
    if (isNaN(assetIdNum)) return null;

    // Use validationErrors state directly (dependency ensures it's up to date)
    const errors: string[] = [];
    if (validationErrors.has(assetIdNum)) {
      const fieldErrors = validationErrors.get(assetIdNum);
      if (fieldErrors && fieldErrors.size > 0) {
        fieldErrors.forEach((errorMsg) => {
          errors.push(errorMsg);
        });
      }
    }

    const hasErrors = errors.length > 0;
    const errorMessage = errors.join('\n');

    return (
      <div className="flex items-center justify-center gap-1 h-full">
        {hasErrors && (
          <ValidationTooltipButton
            errors={errors}
            errorMessage={errorMessage}
            onToastClick={() => setToast({ message: errorMessage, type: 'error' })}
          />
        )}
      </div>
    );
  }, [setToast, validationErrors]);

  // Actions cell renderer for history grid - no validation icon
  const historyActionsCellRenderer = useCallback(() => {
    return null;
  }, []);

  // Memoize the structure_drawing_url cell renderer to prevent recreation
  const structureDrawingCellRenderer = useCallback((params: any) => {
    const asset = params.data as Asset;
    if (!asset) return null;
    
    const hasDrawing = !!asset.structure_drawing_url;
    const isLatest = asset.is_latest === true;

    return (
      <div className="flex items-center justify-center gap-1 h-full">
        {isLatest ? (
          <div className="flex flex-col items-center gap-1">
            <label className="flex items-center justify-center p-1 text-theme-tab-active hover:text-theme-tab-active-hover transition-colors hover:scale-110 cursor-pointer" title={t('upload') || 'העלה קובץ'}>
              <Upload className="h-5 w-5" />
              <input
                type="file"
                multiple
                className="hidden"
                accept="image/*,.pdf,.dwg,.docx,.doc,.txt,.xlsx"
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files?.length || !asset.asset_id) return;
                  await handleFileUpload(asset.asset_id, Array.from(files));
                  e.target.value = '';
                }}
                disabled={uploadingAssetId === asset.asset_id}
              />
            </label>
            {uploadingAssetId === asset.id && uploadProgress && (
              <div className="w-24 flex flex-col items-center gap-1">
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-theme-tab-active transition-all duration-300"
                    style={{ width: `${uploadProgress.progress}%` }}
                  />
                </div>
                <div className="text-[10px] text-gray-700 text-center truncate w-full" title={uploadProgress.fileName}>
                  {Math.round(uploadProgress.progress)}%
                </div>
                <div className="text-[8px] text-gray-500 text-center truncate w-full max-w-[80px]" title={uploadProgress.fileName}>
                  {uploadProgress.fileName}
                </div>
              </div>
            )}
          </div>
        ) : null}
        <button
          onClick={(e) => {
            e.stopPropagation();
            // Active records: files are stored with NULL date → use ACTIVE key; history records: use their date
            const measurementKey = asset.is_latest ? `${asset.asset_id}|ACTIVE` : `${asset.asset_id}|${asset.measurement_date ?? null}`;
            if (assetsWithFiles.has(measurementKey)) {
              // Active: pass undefined so the modal shows all files (matches AssetsList behavior).
              // History: pass the specific date so the modal filters to that snapshot.
              handleViewDrawing(asset.asset_id, asset.is_latest ? undefined : (asset.measurement_date ?? null));
            }
          }}
          disabled={!(asset.is_latest ? assetsWithFiles.has(`${asset.asset_id}|ACTIVE`) : assetsWithFiles.has(`${asset.asset_id}|${asset.measurement_date ?? null}`))}
            className={`p-1 transition-colors hover:scale-110 ${
            (asset.is_latest ? assetsWithFiles.has(`${asset.asset_id}|ACTIVE`) : assetsWithFiles.has(`${asset.asset_id}|${asset.measurement_date ?? null}`))
              ? 'text-green-600 hover:text-green-700 cursor-pointer'
              : 'text-gray-300 cursor-not-allowed opacity-50'
          }`}
          title={(asset.is_latest ? assetsWithFiles.has(`${asset.asset_id}|ACTIVE`) : assetsWithFiles.has(`${asset.asset_id}|${asset.measurement_date ?? null}`)) ? (t('viewFiles') || 'צפה בקבצים') : (t('noFiles') || 'אין קבצים')}
          >
            <FileText className="h-5 w-5" />
          </button>
      </div>
    );
  }, [t, uploadingAssetId, uploadProgress, assetFilesModalOpen, selectedAssetIdForFiles, assetsWithFiles, handleFileUpload, handleViewDrawing]);

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

  // Building column definitions for audit details
  const buildingColumnDefs: ColDef<BuildingType>[] = useMemo(() => [
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
      tooltipValueGetter: (params) => {
        if (params.value == null) return '';
        return getAreaDescriptionForTaxRegion(params.value);
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
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'residence_shared_area',
      headerName: 'שטח משותף מגורים',
      width: 150,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'business_shared_area',
      headerName: 'שטח משותף עסקים',
      width: 150,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'area_for_control',
      headerName: 'שטח לבקרה',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'overload_ratio',
      headerName: 'אחוז העמסה',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
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
  ], [getAreaDescriptionForTaxRegion]);

  // Asset column definitions for audit details
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
      field: 'use_nature',
      headerName: 'מהות שימוש',
      width: 180,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueGetter: (params) => {
        const v = params.data?.use_nature;
        if (v != null && v !== '') return v;
        const code = params.data?.main_asset_type;
        if (!code || !assetTypes?.length) return '';
        const at = assetTypes.find(t => String(t.name).trim() === String(code).trim());
        return at?.description ?? '';
      },
    },
    {
      field: 'asset_size',
      headerName: 'גודל נכס',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'tax_region',
      headerName: 'אזור מס',
      headerTooltip: 'אזור מס',
      tooltipValueGetter: (params) => {
        if (params.value == null) return '';
        return getAreaDescriptionForTaxRegion(params.value);
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
      headerName: 'מספר קומה',
      width: 100,
      sortable: true,
      cellClass: 'ltr-number',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const s = String(params.value);
        const trailing = s.match(/^(\d+)-$/);
        return trailing ? '-' + trailing[1] : s;
      }
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
    },
    {
      field: 'sub_asset_type_1',
      headerName: 'סוג נכס משני 1',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_1',
      headerName: 'גודל נכס משני 1',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'sub_asset_type_2',
      headerName: 'סוג נכס משני 2',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_2',
      headerName: 'גודל נכס משני 2',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'sub_asset_type_3',
      headerName: 'סוג נכס משני 3',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_3',
      headerName: 'גודל נכס משני 3',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'sub_asset_type_4',
      headerName: 'סוג נכס משני 4',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_4',
      headerName: 'גודל נכס משני 4',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'sub_asset_type_5',
      headerName: 'סוג נכס משני 5',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_5',
      headerName: 'גודל נכס משני 5',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'sub_asset_type_6',
      headerName: 'סוג נכס משני 6',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_6',
      headerName: 'גודל נכס משני 6',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value)
    },
    {
      field: 'business_distribution_area',
      headerName: 'גודל שטח משותף',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value),
      hide: !isBusinessContext // Hide for residence assets (business_distribution_area is only for business distribution)
    },
    {
      field: 'business_total_area',
      headerName: 'סה"כ שטח עסקים',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      // DB column is unused (always 0). Compute on the fly for business
      // rows: total = asset_size + business_distribution_area.
      valueGetter: (params: any) => {
        const row = params.data;
        if (!row || !isBusinessContext) return '';
        const size = Number(row.asset_size) || 0;
        const dist = Number(row.business_distribution_area) || 0;
        const total = size + dist;
        return total > 0 ? total : '';
      },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value),
      hide: !isBusinessContext // Hide for residence assets (business_total_area is only for business assets)
    }
  ], [getAreaDescriptionForTaxRegion, isBusinessContext]);

  // Check if asset is business (to hide penthouse)
  const isBusinessAsset = useMemo(() => {
    if (!asset?.main_asset_type || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    const assetType = assetTypes.find(at => at.name === asset.main_asset_type);
    return assetType?.business_residence === 'עסקים';
  }, [asset?.main_asset_type, assetTypes]);

  // Helper function to get combined tooltip for asset type fields
  const getAssetTypeTooltip = useCallback((params: any, assetTypes: AssetType[]) => {
    const code = params.value;
    if (!code || !params.data) return '';
    
    const assetTypeFields = [
      { field: 'main_asset_type', label: 'סוג נכס ראשי' },
      { field: 'sub_asset_type_1', label: 'סוג נכס משני 1' },
      { field: 'sub_asset_type_2', label: 'סוג נכס משני 2' },
      { field: 'sub_asset_type_3', label: 'סוג נכס משני 3' },
      { field: 'sub_asset_type_4', label: 'סוג נכס משני 4' },
      { field: 'sub_asset_type_5', label: 'סוג נכס משני 5' },
      { field: 'sub_asset_type_6', label: 'סוג נכס משני 6' }
    ];
    
    // Find all fields with the same asset type code
    const matchingFields = assetTypeFields
      .map(({ field, label }) => {
        const fieldValue = params.data[field];
        if (fieldValue === code) {
          const assetType = assetTypes.find(at => at.name === code);
          return { field, label, description: assetType?.description || code };
        }
        return null;
      })
      .filter((item): item is { field: string; label: string; description: string } => item !== null);
    
    if (matchingFields.length === 0) {
      const assetType = assetTypes.find(at => at.name === code);
      return assetType?.description || code;
    }
    
    if (matchingFields.length === 1) {
      return matchingFields[0].description;
    }
    
    // Combine multiple tooltips with numbers
    return matchingFields
      .map((item, index) => `${index + 1}. ${item.label}: ${item.description}`)
      .join('\n');
  }, []);

  // Optimize columnDefs dependencies - only recreate when necessary
  const columnDefs: ColDef<Asset>[] = useMemo(() => {
    const defs: ColDef<Asset>[] = [
    {
      field: 'asset_id',
      headerName: t('assetId'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      pinned: 'right', // Pinned to the right side
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'asset_id'),
      cellRenderer: (params: any) => {
        // Make asset_id clickable ONLY if it's different from the current tab's asset_id
        if (params.data && params.data.asset_id) {
          const assetId = params.data.asset_id;
          const rowData = params.data as Asset;
          const isDifferentAsset = assetId !== asset?.asset_id;
          
          // Only make clickable if different from current asset (main asset ID should not be clickable)
          if (isDifferentAsset) {
            return (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  // Dispatch custom event that App.tsx can listen to
                  // This opens the asset view directly, just like in asset search grid
                  window.dispatchEvent(new CustomEvent('openAssetView', {
                    detail: { 
                      assetDbId: assetId,
                      assetId: String(assetId),
                      buildingNumber: rowData.building_number,
                      taxRegion: rowData.tax_region ? String(rowData.tax_region) : undefined
                    }
                  }));
                }}
                className="text-theme-tab-active hover:text-theme-tab-active-hover underline decoration-theme-tab-active hover:decoration-theme-tab-active-hover cursor-pointer transition-colors font-semibold"
                title="לחץ כדי לפתוח את הנכס"
              >
                {assetId}
              </button>
            );
          }
        }
        // For the same asset as the current tab (main asset ID), display as normal text (not clickable)
        return params.value;
      },
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'measurement_date'),
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value),
      valueGetter: (params) => params.data.measurement_date,
      valueSetter: (params) => {
        let newValue = params.newValue?.trim() || '';
        
        // If empty, set to default
        if (!newValue) {
          params.data.measurement_date = '01/01/1900';
          return true;
        }
        
        // Validate DD/MM/YYYY format first
        const dateFormatPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = newValue.match(dateFormatPattern);
        
        if (match) {
          const day = parseInt(match[1], 10);
          const month = parseInt(match[2], 10);
          const year = parseInt(match[3], 10);
          
          // Validate month range
          if (month < 1 || month > 12) {
            // Invalid month - keep the value but it will be validated in onCellValueChanged
            params.data.measurement_date = newValue;
            return true;
          }
          
          // Validate day range based on month
          const daysInMonth = new Date(year, month, 0).getDate();
          if (day < 1 || day > daysInMonth) {
            // Invalid day - keep the value but it will be validated in onCellValueChanged
            params.data.measurement_date = newValue;
            return true;
          }
          
          // Validate year range (reasonable range)
          if (year < 1900 || year > 2100) {
            // Invalid year - keep the value but it will be validated in onCellValueChanged
            params.data.measurement_date = newValue;
            return true;
          }
          
          // Create date object to validate it's a real date
          const date = new Date(year, month - 1, day);
          if (!isNaN(date.getTime()) &&
              date.getDate() === day &&
              date.getMonth() === month - 1 &&
              date.getFullYear() === year) {
            // Validate that date is not greater than today
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            if (date > today) {
              // Date is greater than today - keep the value but it will be validated in onCellValueChanged
              params.data.measurement_date = newValue;
              return true;
            }
            params.data.measurement_date = newValue;
            return true;
          }
        }
        
        // If not in DD/MM/YYYY format, try to parse other formats and convert
        try {
          const date = new Date(newValue);
          if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            params.data.measurement_date = `${day}/${month}/${year}`;
            return true;
          }
        } catch (e) {
          // If parsing fails, keep original value - validation will catch it
        }
        
        // If format doesn't match DD/MM/YYYY, keep the value but validation will show error
        params.data.measurement_date = newValue;
        return true;
      },
      cellEditor: 'agTextCellEditor',
      cellEditorParams: {
        maxLength: 10,
        useFormatter: true,
      },
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'payer_id'),
    },
    {
      field: 'tax_region',
      headerName: 'אזור מס',
      headerTooltip: 'אזור מס',
      tooltipValueGetter: (params) => {
        if (params.value == null) return '';
        return getAreaDescriptionForTaxRegion(params.value);
      },
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueParser: (params) => numericValueParserInt(params, 10),
      cellStyle: (params) => getCellStyle(params, 'tax_region'),
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      hide: false, // Always show penthouse checkbox for residence assets
      editable: false,
      cellRenderer: (params: any) => {
        const isChecked = params.value === true;
        const isEditable = params.data.is_latest === true;
        return (
          <div className="flex items-center justify-center h-full">
            {isEditable ? (
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  e.stopPropagation(); // Prevent event bubbling
                  const newValue = e.target.checked ? true : false;
                  
                  // Only allow editing for latest records
                  if (params.data.is_latest !== true) {
                    return;
                  }
                  
                  // Update the data directly in the node (this doesn't trigger onCellValueChanged)
                  params.data.penthouse = newValue;
                  params.node.setDataValue('penthouse', newValue);
                  
                  // Manually track the change in dirtyAssets
                  const assetId = params.data.asset_id;
                  setDirtyAssets(prev => {
                    const newMap = new Map(prev);
                    const existing = newMap.get(assetId) || {};
                    newMap.set(assetId, { ...existing, penthouse: newValue });
                    return newMap;
                  });
                  
                  // Clear any validation errors for this field
                  setValidationErrors(prev => {
                    const newMap = new Map(prev);
                    const fieldErrors = newMap.get(assetId);
                    if (fieldErrors) {
                      fieldErrors.delete('penthouse');
                      if (fieldErrors.size === 0) {
                        newMap.delete(assetId);
                      }
                    }
                    return newMap;
                  });
                  
                  // Refresh only this specific cell
                  if (params.api && params.node) {
                    params.api.refreshCells({ 
                      rowNodes: [params.node], 
                      columns: ['penthouse'], 
                      force: true 
                    });
                  }
                }}
                className="w-4 h-4 text-theme-tab-active rounded focus:ring-2 focus:ring-theme-action-accent cursor-pointer"
              />
            ) : (
              <span className="text-gray-600">{isChecked ? '✓' : ''}</span>
            )}
          </div>
        );
      },
      valueGetter: (params: any) => {
        const value = params.data?.penthouse;
        // Convert to boolean: true if checked, false otherwise
        return value === true;
      },
      valueSetter: (params: any) => {
        // Always set as boolean: true or false
        const newValue = params.newValue;
        params.data.penthouse = newValue === true;
        return true;
      },
      cellStyle: (params) => {
        const baseStyle = getCellStyle(params, 'penthouse');
        return { ...baseStyle, textAlign: 'center' };
      },
      headerClass: 'text-center'
    },
    {
      field: 'apartment_number',
      headerName: 'מספר דירה',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'apartment_number')
    },
    {
      field: 'apartment_floor',
      headerName: 'מספר קומה',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'apartment_floor'),
      cellClass: 'ltr-number',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const s = String(params.value);
        const trailing = s.match(/^(\d+)-$/);
        return trailing ? '-' + trailing[1] : s;
      }
    },
    {
      field: 'storage_number',
      headerName: 'מספר מחסן',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'storage_number')
    },
    {
      field: 'storage_floor',
      headerName: 'קומת מחסן',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'storage_floor')
    },
    {
      field: 'discount_type',
      headerName: 'סוג הנחה',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'discount_type')
    },
    {
      field: 'discount_date_from',
      headerName: 'תאריך הנחה מ',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'discount_date_from'),
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'discount_date_to',
      headerName: 'תאריך הנחה עד',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'discount_date_to'),
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'shared_parking_area',
      headerName: 'שטח חניה משותף',
      width: 120,
      sortable: true,
      filter: true,
      editable: (params) => isBusinessContext && isFieldEditable(params, 'shared_parking_area'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value),
      hide: !isBusinessContext // Only business assets have shared parking area
    },
    {
      field: 'number_of_parking_units',
      headerName: 'מספר יחידות חניה',
      width: 120,
      sortable: true,
      filter: true,
      editable: (params) => isBusinessContext && isFieldEditable(params, 'number_of_parking_units'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => (params.value != null && params.value !== '' ? String(params.value) : ''),
      hide: !isBusinessContext // Only business assets have number of parking units
    },
    {
      field: 'comment',
      headerName: 'הערה',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellEditor: 'agLargeTextCellEditor',
      cellEditorParams: {
        maxLength: 1000,
        rows: 5,
        cols: 50
      },
      cellEditorPopup: true,
      cellEditorPopupPosition: 'over',
      cellRenderer: (params: any) => {
        const hasValue = params.value && params.value.trim() !== '';
        const isEditable = isFieldEditable(params, 'comment');
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
            onClick={(e) => {
              if (!isEditable) {
                e.stopPropagation();
              }
            }}
          >
            {hasValue && <span style={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{params.value}</span>}
            <MessageSquare size={16} style={{ color: hasValue ? '#2563eb' : '#94a3b8', flexShrink: 0 }} />
          </div>
        );
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'comment'),
      tooltipValueGetter: (params) => params.value || ''
    },
    {
      field: 'operator_id',
      headerName: 'פקיד/ה',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'operator_id'),
      valueFormatter: (params: any) => {
        const id = params.value;
        if (id == null) return '';
        const o = operators.find(x => x.id === id);
        return o ? o.name : String(id);
      },
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: () => ({ values: ['', ...operators.map(o => o.name)] }),
      valueParser: (params: any) => {
        const name = params.newValue;
        if (name === '' || name == null) return null;
        const o = operators.find(x => x.name === name);
        return o?.id ?? null;
      }
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'main_asset_type'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'use_nature',
      headerName: 'מהות שימוש',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      valueGetter: (params) => {
        const v = params.data?.use_nature;
        if (v != null && v !== '') return v;
        const code = params.data?.main_asset_type;
        if (!code || !assetTypes?.length) return '';
        const at = assetTypes.find(t => String(t.name).trim() === String(code).trim());
        return at?.description ?? '';
      },
      cellStyle: (params) => getCellStyle(params, 'use_nature'),
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'asset_size'),
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value, false),
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_1'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_1'),
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value, false),
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_2'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_2'),
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value, false),
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_3'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_3'),
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value, false),
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_4'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_4'),
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value, false),
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_5'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_5'),
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value, false),
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_6'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_6'),
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value, false),
    },
    {
      headerName: t('structureDrawing'),
      field: 'structure_drawing_url',
      pinned: 'right', // Pinned to the right side
      sortable: false,
      filter: false,
      editable: false,
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: structureDrawingCellRenderer,
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      colId: 'actions',
      headerName: t('actions') || 'פעולות',
      pinned: 'right', // Pinned to the right side, rightmost
      sortable: false,
      filter: false,
      editable: false,
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: actionsCellRenderer,
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
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
    
    // Process all headers to add icons for long headers (>3 words)
    return defs.map(colDef => {
      if (colDef.headerName && typeof colDef.headerName === 'string') {
        const processed = processColumnHeader(colDef.headerName);
        return { ...colDef, ...processed };
      }
      return colDef;
    });
  }, [t, assetTypes, isFieldEditable, getCellStyle, structureDrawingCellRenderer, actionsCellRenderer, asset, isBusinessAsset, isBusinessContext, operators]);

  // Apply field configurations to column definitions for main grid — uses same config as assets-list
  const [configuredColumnDefs] = useFieldConfig(columnDefs, 'assets-list');

  // Column definitions for history grid — same field config as assets-list, all fields editable
  const historyColumnDefs: ColDef<Asset>[] = useMemo(() => {
    return columnDefs.map(colDef => {
      if (colDef.colId === 'actions') {
        return { ...colDef, cellRenderer: historyActionsCellRenderer };
      }
      // Override editable to always return true for history rows (bypass is_latest check)
      const originalEditable = colDef.editable;
      if (originalEditable === false) return colDef; // keep explicitly-false columns read-only
      return {
        ...colDef,
        editable: (params: any) => {
          if (!params?.data) return false;
          if (typeof originalEditable === 'function') {
            // Re-run original check with is_latest forced true so the logic passes
            return originalEditable({ ...params, data: { ...params.data, is_latest: true } });
          }
          return true;
        },
      };
    });
  }, [columnDefs, historyActionsCellRenderer]);

  // Apply field configurations to history grid — same grid name = same widths/visibility as assets-list
  const [configuredHistoryColumnDefs] = useFieldConfig(historyColumnDefs, 'assets-list');

  useEffect(() => {
    api.operators.getAll().then(setOperators).catch(() => setOperators([]));
  }, []);

  useEffect(() => {
    // Reset state when assetId changes to ensure fresh data is loaded
    if (assetId) {
      setAsset(null);
      setAllMeasurements([]);
      setOriginalMeasurements([]);
      setDirtyAssets(new Map());
      setValidationErrors(new Map());
      validationErrorsRef.current = new Map();
      setSelectedDrawingUrl(null);
      setSelectedFileName(null);
      setToast(null);
      setIsRowEditModalOpen(false);
      setSelectedRowForEdit(null);
    }
    fetchData();
  }, [assetId, buildingNumber, taxRegion]);

  // Fetch building address when building changes
  useEffect(() => {
    async function fetchBuildingAddress() {
      if (building?.address) {
        try {
          const address = await api.addressList.getOne(building.address);
          setBuildingAddress(address.street_description);
        } catch (err) {
          console.error('Error fetching building address:', err);
          setBuildingAddress(null);
        }
      } else if (building?.building_address) {
        // Fallback to old building_address field
        try {
          const address = await api.addressList.getOne(building.building_address);
          setBuildingAddress(address.street_description);
        } catch (err) {
          console.error('Error fetching building address:', err);
          setBuildingAddress(null);
        }
      } else {
        setBuildingAddress(null);
      }
    }
    fetchBuildingAddress();
  }, [building?.address, building?.building_address]);

  // Keep ref in sync with state
  useEffect(() => {
    validationErrorsRef.current = validationErrors;
  }, [validationErrors]);

  // Optimized: Only refresh specific cells when validationErrors change
  // Track previous validation errors to only refresh changed rows
  const prevValidationErrorsRef = useRef<Map<number, Map<string, string>>>(new Map());
  
  useEffect(() => {
    const refreshGrid = () => {
      const currentErrors = validationErrorsRef.current;
      const prevErrors = prevValidationErrorsRef.current;
      
      // Find which asset IDs have changed
      const changedAssetIds = new Set<number>();
      
      // Check for new or modified errors
      currentErrors.forEach((errors, assetId) => {
        const prevAssetErrors = prevErrors.get(assetId);
        if (!prevAssetErrors || prevAssetErrors.size !== errors.size) {
          changedAssetIds.add(assetId);
        } else {
          // Check if error messages changed
          for (const [key, value] of errors.entries()) {
            if (prevAssetErrors.get(key) !== value) {
              changedAssetIds.add(assetId);
              break;
            }
          }
        }
      });
      
      // Check for removed errors
      prevErrors.forEach((_, assetId) => {
        if (!currentErrors.has(assetId)) {
          changedAssetIds.add(assetId);
        }
      });
      
      // Only refresh cells for changed assets
      if (changedAssetIds.size > 0) {
        // Batch refresh all changed nodes at once for better performance
        const refreshCellsForAsset = (gridApi: any) => {
          if (!gridApi) return;
          
          // Collect all nodes that need refreshing
          const nodesToRefresh: any[] = [];
          gridApi.forEachNode((node: any) => {
            if (node.data && changedAssetIds.has(node.data.id)) {
              nodesToRefresh.push(node);
            }
          });
          
          // Batch refresh all changed nodes at once for better performance
          if (nodesToRefresh.length > 0) {
            gridApi.refreshCells({ 
              rowNodes: nodesToRefresh, 
              columns: ['actions', 'structure_drawing_url'],
              force: true 
            });
            // Also refresh all cells for row styling updates
            gridApi.refreshCells({ 
              rowNodes: nodesToRefresh, 
              force: true 
            });
          }
        };
        
        // Use requestAnimationFrame to batch DOM updates
        requestAnimationFrame(() => {
          if (gridRef.current?.api) {
            refreshCellsForAsset(gridRef.current.api);
          }
          if (historyGridRef.current?.api) {
            refreshCellsForAsset(historyGridRef.current.api);
          }
        });
      }
      
      // Update previous errors
      prevValidationErrorsRef.current = new Map(currentErrors);
    };
    
    // Debounce grid refresh to avoid excessive updates and improve performance
    // Increased debounce time to reduce CPU usage
    const timer = setTimeout(refreshGrid, 300);
    return () => clearTimeout(timer);
  }, [validationErrors]);

  async function fetchData(overrideAssetId?: number) {
    try {
      setLoading(true);
      
      // Use override assetId if provided, otherwise use prop
      const currentAssetId = overrideAssetId !== undefined ? overrideAssetId : assetId;
      
      // Handle new asset case (no assetId, but buildingNumber provided)
      if (!currentAssetId && buildingNumber) {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        const dateStr = `${day}/${month}/${year}`;
        
        const newAsset: Asset = {
          building_number: buildingNumber,
          asset_id: '',
          payer_id: '',
          main_asset_type: '',
          asset_size: 0,
          sub_asset_type_1: '',
          sub_asset_size_1: 0,
          sub_asset_type_2: '',
          sub_asset_size_2: 0,
          sub_asset_type_3: '',
          sub_asset_size_3: 0,
          sub_asset_type_4: '',
          sub_asset_size_4: 0,
          sub_asset_type_5: '',
          sub_asset_size_5: 0,
          sub_asset_type_6: '',
          sub_asset_size_6: 0,
          measurement_date: dateStr,
          penthouse: undefined,
          apartment_number: undefined,
          apartment_floor: undefined,
          storage_number: undefined,
          storage_floor: undefined,
          discount_type: undefined,
          discount_date_from: undefined,
          discount_date_to: undefined,
          comment: undefined,
          is_latest: true
        };
        
        setAsset(newAsset);
        setAllMeasurements([newAsset]);
        setOriginalMeasurements([newAsset]);
        
        // Load building and asset types (use cached asset types from validation)
        const { getAssetTypes } = await import('../lib/validation');
        const cachedAssetTypes = getAssetTypes();
        const buildingData = await api.buildings.getOne(buildingNumber);
        setBuilding(buildingData);
        setAssetTypes(cachedAssetTypes.length > 0 ? cachedAssetTypes : await api.assetTypes.getAll());
        
        setLoading(false);
        return;
      }
      
      // Existing asset case - load from database
      if (!currentAssetId) {
        setError('Asset ID is required');
        setLoading(false);
        return;
      }

      // Try to fetch by asset_id (which is the primary key in the assets table)
      // The currentAssetId is the asset_id (primary key), not a separate id field
      let assetData: Asset | null = null;
      
      // Always use currentAssetId (from prop or override) instead of asset state
      // This ensures we fetch the correct asset when assetId prop changes
      if (currentAssetId && buildingNumber) {
        try {
          const assetsByAssetId = await api.assets.getAllByAssetId(String(currentAssetId), buildingNumber);
          if (assetsByAssetId && assetsByAssetId.length > 0) {
            // Get the latest one (first after sorting by measurement_date)
            assetData = assetsByAssetId[0];
          }
        } catch (err: any) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[AssetDetails] Error fetching asset by asset_id:', err);
          }
        }
      }
      
      // Fallback: try using getAll and filter by asset_id
      if (!assetData && currentAssetId) {
        try {
          const allAssets = await api.assets.getAll(buildingNumber);
          assetData = allAssets.find(a => a.asset_id === currentAssetId) || null;
        } catch (err: any) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[AssetDetails] Error in fallback getAll:', err);
          }
        }
      }
      
      // If still not found, return error
      if (!assetData) {
        setError('הנכס לא נמצא');
        setLoading(false);
        return;
      }

      // Use cached asset types from validation (faster, no API call)
      const { getAssetTypes } = await import('../lib/validation');
      const cachedAssetTypes = getAssetTypes();
      const assetTypesData = cachedAssetTypes.length > 0 ? cachedAssetTypes : await api.assetTypes.getAll();

      if (!assetData) {
        setError('הנכס לא נמצא');
        setLoading(false);
        return;
      }

      setAsset(assetData);
      setAssetTypes(assetTypesData || []);

      const buildingData = await api.buildings.getOne(assetData.building_number);
      setBuilding(buildingData);

      // Fetch all records (latest from assets + history from assets_history) using the view
      let allAssetMeasurements: Asset[] = [];
      try {
        allAssetMeasurements = await api.assets.getAssetWithHistory(assetData.asset_id, assetData.building_number);
        
        // If getAssetWithHistory returns empty (no history and no master), use the assetData we found
        if (allAssetMeasurements.length === 0) {
          allAssetMeasurements = [{ ...assetData, is_latest: true }];
        } else {
          // Ensure is_latest is set correctly
          // If no records have is_latest set, mark the first one (from assets table) as latest
          if (!allAssetMeasurements.some(m => m.is_latest === true)) {
            allAssetMeasurements[0] = { ...allAssetMeasurements[0], is_latest: true };
          }
          
          // Limit history records to last 50 to prevent performance issues with very large history
          const latestRecord = allAssetMeasurements.find(m => m.is_latest === true);
          const historyRecords = allAssetMeasurements
            .filter(m => m.is_latest !== true)
            .slice(0, 50); // Only keep last 50 history records
          
          allAssetMeasurements = latestRecord 
            ? [latestRecord, ...historyRecords]
            : historyRecords;
        }
      } catch (historyErr) {
        console.error('[AssetDetails] Error fetching asset history:', historyErr);
        // If history fetch fails, at least show the master record with is_latest set
        const masterRecord = { ...assetData, is_latest: true };
        allAssetMeasurements = [masterRecord];
      }
      
      // Final safety check: ensure we have at least one record with is_latest set
      if (allAssetMeasurements.length === 0) {
        allAssetMeasurements = [{ ...assetData, is_latest: true }];
      } else if (!allAssetMeasurements.some(m => m.is_latest === true)) {
        allAssetMeasurements[0] = { ...allAssetMeasurements[0], is_latest: true };
      }
      
      setAllMeasurements(allAssetMeasurements);
      // Store original data only if dirtyAssets is empty (initial load or after save)
      // Use shallow copy instead of deep clone for better performance
      if (dirtyAssets.size === 0) {
        setOriginalMeasurements(allAssetMeasurements.map(asset => ({ ...asset })));
      }
      
      // Check which measurements have files.
      // Active records (is_latest=true): count any file — the AssetsList upload path
      // stamps the asset's measurement_date onto the file, so a NULL-only filter
      // misses them. Key: `${asset_id}|ACTIVE`.
      // History records (is_latest=false): files pinned to that date. Key: `${asset_id}|${date}`.
      if (allAssetMeasurements.length > 0) {
        const filesMap = new Set<string>();

        await Promise.all(
          allAssetMeasurements.map(async (m) => {
            const assetId = m.asset_id;
            if (!assetId) return;
            try {
              if (m.is_latest) {
                const files = await api.assets.files.getAll(assetId);
                if (files && files.length > 0) {
                  filesMap.add(`${assetId}|ACTIVE`);
                }
              } else {
                const measurementDate = m.measurement_date ?? null;
                const files = await api.assets.files.getAll(assetId, measurementDate);
                if (files && files.length > 0) {
                  filesMap.add(`${assetId}|${measurementDate}`);
                }
              }
            } catch (err) {
              // Ignore errors - asset might not have files
            }
          })
        );

        setAssetsWithFiles(filesMap);
      } else {
        setAssetsWithFiles(new Set());
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset details');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50/50 to-white">
        <div className="text-center">
          <div className="relative">
            <Loader2 className="h-16 w-16 text-theme-tab-active animate-spin mx-auto" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 bg-theme-highlight rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="mt-6 text-slate-700 font-medium text-base animate-pulse">{t('loadingDetails')}</p>
          <p className="mt-2 text-xs text-slate-500">אנא המתן...</p>
        </div>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8 bg-gradient-to-br from-slate-50/50 to-white">
        <div className="bg-white border-2 border-red-200 rounded-xl shadow-xl p-8 max-w-md text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-red-100 p-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <p className="text-red-700 text-sm">{t('error')}: {error || 'Asset not found'}</p>
          <button
            onClick={async () => {
              setError(null);
              await fetchData();
            }}
            className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            רענן נתונים
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Validation Results Modal */}
      <ValidationResultModal
        isOpen={validationModalOpen}
        onClose={() => {
          setValidationModalOpen(false);
          setValidationResults(null);
        }}
        isLoading={isValidating}
        progress={validationProgress}
        context="single"
        singleResult={validationResults}
        singleAssetTitle={asset ? `אימות נכס ${asset.asset_id}` : undefined}
        assetId={asset?.asset_id}
      />

      {/* Loading overlay modal for file upload */}
      {uploadProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center" style={{ cursor: 'wait' }}>
          <div className="bg-white rounded-lg p-6 shadow-xl flex flex-col items-center gap-4 min-w-[240px]">
            <Loader2 className="h-12 w-12 text-theme-tab-active animate-spin" />
            <p className="text-slate-700 font-medium text-lg">
              {uploadProgress.total > 1
                ? `מעלה קובץ ${uploadProgress.currentIndex + 1} מתוך ${uploadProgress.total}`
                : (t('uploading') || 'מעלה קובץ...')}
            </p>
            <p className="text-slate-500 text-sm truncate max-w-[280px]" title={uploadProgress.fileName}>{uploadProgress.fileName}</p>
            <div className="w-full max-w-[200px] h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-theme-tab-active transition-all duration-300" style={{ width: `${uploadProgress.progress}%` }} />
            </div>
            <p className="text-slate-500 text-xs">{Math.round(uploadProgress.progress)}%</p>
          </div>
        </div>
      )}

      {/* Measurement Date Modal */}
      {measurementDateModalOpen && (
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
            measurementDateModalClosing ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 transition-all duration-300 border border-gray-100 ${
              measurementDateModalClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 bg-gradient-to-r from-theme-tab-active to-theme-action-accent bg-clip-text text-transparent">שמור כמדידה חדשה</h3>
              <button
                type="button"
                onClick={() => {
                  setMeasurementDateModalClosing(true);
                  setTimeout(() => {
                    setMeasurementDateModalOpen(false);
                    setNewMeasurementDate('');
                    setMeasurementDateModalClosing(false);
                  }, 300);
                }}
                className="text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                תאריך מדידה (DD/MM/YYYY)
              </label>
              <input
                type="text"
                value={newMeasurementDate}
                onChange={(e) => {
                  let value = e.target.value;
                  // Allow only digits and slashes
                  value = value.replace(/[^\d/]/g, '');
                  // Auto-format as user types
                  if (value.length > 10) {
                    value = value.slice(0, 10);
                  }
                  // Auto-add slashes
                  if (value.length === 2 && !value.includes('/')) {
                    value = value + '/';
                  } else if (value.length === 5 && value.split('/').length === 2) {
                    value = value + '/';
                  }
                  setNewMeasurementDate(value);
                }}
                placeholder="DD/MM/YYYY"
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-theme-action-accent focus:border-theme-action-accent text-right transition-all duration-200 hover:border-slate-400"
                maxLength={10}
              />
              <p className="mt-1 text-xs text-slate-500">
                השאר ריק לשימוש בתאריך המערכת
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setMeasurementDateModalClosing(true);
                  setTimeout(() => {
                    setMeasurementDateModalOpen(false);
                    setNewMeasurementDate('');
                    setMeasurementDateModalClosing(false);
                  }, 300);
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors font-bold"
              >
                <X className="h-3 w-3" />
                ביטול
              </button>
              <button
                onClick={handleSaveAsNewMeasurement}
                disabled={isSaving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-theme-tab-active hover:bg-theme-tab-active-hover active:bg-theme-tab-active-active disabled:bg-gray-400 text-white rounded-lg transition-all duration-200 font-semibold shadow-sm hover:shadow-md disabled:shadow-none"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                אישור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Error Modal */}
      {validationErrorModalOpen && (
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
            validationErrorModalClosing ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 transition-all duration-300 border border-gray-100 ${
              validationErrorModalClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                שגיאת אימות
              </h3>
              <button
                type="button"
                onClick={() => {
                  setValidationErrorModalClosing(true);
                  setTimeout(() => {
                    setValidationErrorModalOpen(false);
                    setValidationErrorModalClosing(false);
                  }, 300);
                }}
                className="text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-slate-700 text-right">
                תקן שגיאות אימות לפני השמירה
              </p>
              {validationErrors.size > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800 font-medium mb-2">
                    נמצאו {validationErrors.size} שגיאות אימות
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setValidationErrorModalClosing(true);
                  setTimeout(() => {
                    setValidationErrorModalOpen(false);
                    setValidationErrorModalClosing(false);
                  }, 300);
                }}
                className="flex items-center gap-1 px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors font-semibold"
              >
                <X className="h-4 w-4" />
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0 w-full py-2" style={{ maxWidth: '100vw', width: '100%', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
      <div className="page-header mb-2 rounded-lg px-3 py-2 w-full">
        <div className="flex items-center gap-2 flex-wrap w-full">
          <div className="page-header-icon shrink-0">
            <Home className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="page-header-title text-sm sm:text-base font-semibold">
              {t('assetId')}: {asset.asset_id}
            </h1>
            {building && (
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="page-header-label">מבנה {building.building_number}</span>
                <span className="page-header-label">גוש: {building?.gosh || '-'}</span>
                <span className="page-header-label">חלקה: {building?.helka || '-'}</span>
                {building?.address && (
                  <span className="page-header-badge page-header-badge-address">כתובת: {buildingAddress || '-'}</span>
                )}
                {asset?.apartment_number && (
                  <span className="page-header-label">דירה: {asset.apartment_number}</span>
                )}
                {asset?.apartment_floor != null && (
                  <span className="page-header-label">קומה: {asset.apartment_floor}</span>
                )}
                {asset?.storage_number && (
                  <span className="page-header-label">מחסן: {asset.storage_number}</span>
                )}
                {asset?.storage_floor != null && (
                  <span className="page-header-label">קומת מחסן: {asset.storage_floor}</span>
                )}
                {asset?.discount_type && (
                  <span className="page-header-label">הנחה: {asset.discount_type}</span>
                )}
                {(asset?.discount_date_from || asset?.discount_date_to) && (
                  <span className="page-header-label">תאריך הנחה: {asset?.discount_date_from || ''} - {asset?.discount_date_to || ''}</span>
                )}
                {areaDescriptionForTab && (
                  <span className="page-header-badge page-header-badge-area">{areaDescriptionForTab}</span>
                )}
                {(() => {
                  if (!asset?.main_asset_type || !assetTypes?.length || !building) return null;
                  const assetType = assetTypes.find(at => at.name === asset.main_asset_type);
                  const isBusinessAsset = assetType?.business_residence === 'עסקים';
                  if (isBusinessAsset && building.overload_ratio != null) {
                    return (
                      <span className="page-header-pill">אחוז העמסה: {building.overload_ratio.toFixed(2)}%</span>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
          <div className="flex items-center bg-white/20 rounded-lg p-1 gap-1 shrink-0">
            <button
              onClick={() => {
                setEditMode('modal');
                if (latestMeasurement) {
                  setSelectedRowForEdit(latestMeasurement);
                  setIsRowEditModalOpen(true);
                }
              }}
              className={`p-1.5 rounded transition-colors ${
                editMode === 'modal'
                  ? 'bg-white text-theme-tab-active'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
              title="עריכה בחלון נפרד"
            >
              <Square className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {allMeasurements.length > 0 && (
        <div className="action-bar mb-2">
          <div className="flex flex-wrap items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleExportToAutomation}
                    disabled={isSaving || isExporting || !latestMeasurement?.asset_id}
                    className={`btn btn-action ${latestMeasurement?.exported_to_automation ? 'btn-secondary' : 'btn-primary'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={latestMeasurement?.exported_to_automation ? 'הנכס כבר נשלח לעירייה' : 'שלח נכס זה לעירייה'}
                  >
                    {isExporting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                    <span>{latestMeasurement?.exported_to_automation ? 'נשלח לעירייה' : 'שלח לעירייה'}</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (!pinnedTopRowData || pinnedTopRowData.length === 0) {
                        setToast({ message: 'אין נתונים לייצוא', type: 'error' });
                        return;
                      }
                      try {
                        const headers = ['מזהה מבנה', 'מזהה נכס', 'מזהה משלם', 'תאריך מדידה', 'סוג נכס ראשי', 'גודל נכס', 'אזור מס'];
                        const rows = pinnedTopRowData.map(asset => [
                          asset.building_number || '',
                          asset.asset_id || '',
                          asset.payer_id || '',
                          formatDateToDDMMYYYY(asset.measurement_date) || '',
                          asset.main_asset_type || '',
                          asset.asset_size || '',
                          asset.tax_region || ''
                        ]);
                        const data = [headers, ...rows];
                        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
                        const filename = `מדידה_אחרונה_${assetId || buildingNumber}_${dateStr}.xlsx`;
                        exportToExcel({
                          filename,
                          sheetName: 'מדידה אחרונה',
                          data,
                          columnWidths: [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }]
                        });
                        setToast({ message: `יוצאו ${rows.length} מדידות בהצלחה`, type: 'success' });
                      } catch (error) {
                        console.error('Error exporting to Excel:', error);
                        setToast({ message: 'שגיאה בייצוא לקובץ Excel', type: 'error' });
                      }
                    }}
                    className="btn btn-action btn-export"
                    title="ייצא ל-Excel"
                  >
                    <Download className="h-5 w-5" />
                    <span>ייצא</span>
                  </button>
                  <button
                    onClick={handleValidateLatestRow}
                    disabled={isSaving || isValidating || !latestMeasurement}
                    className="btn btn-action btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    title="אמת את הנכס"
                  >
                    {isValidating ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" />
                    )}
                    <span>{isValidating ? 'מאמת...' : 'אמת נכס'}</span>
                  </button>
                  <button
                    onClick={handleOpenSaveAsNewMeasurementModal}
                    disabled={isSaving || isValidating || !latestMeasurement || !hasChanges || validationErrors.size > 0}
                    className="btn btn-action btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    title={validationErrors.size > 0 ? 'תקן שגיאות לפני שמירה' : !hasChanges ? 'אין שינויים לשמירה' : 'שמור כמדידה חדשה'}
                  >
                    {isSaving ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Copy className="h-5 w-5" />
                    )}
                    <span>שמור כמדידה חדשה</span>
                  </button>
                  <button
                    onClick={handleSaveChanges}
                    disabled={isSaving || (!!assetId && !hasChanges)}
                    className="btn btn-action btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    title={(!assetId && !latestMeasurement?.asset_id) ? 'מלא קוד נכס לשמירה' : (!hasChanges ? 'אין שינויים לשמירה' : 'שמור שינויים')}
                  >
                    {isSaving ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}
                    <span>{t('save')}</span>
                  </button>
                  <button
                    onClick={handleCancelChanges}
                    disabled={isSaving || !hasChanges}
                    className="btn btn-action btn-cancel"
                  >
                    <X className="h-5 w-5" />
                    <span>{t('cancel')}</span>
                  </button>
          </div>
        </div>
      )}

      {allMeasurements.length > 0 && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Latest Measurement Grid */}
          <div className="ag-theme-alpine asset-details-pinned-grid mb-2" style={{ height: '120px', width: '100%', overflowX: 'auto' }}>
                <style>{`
                  .asset-details-pinned-grid .ag-header-cell-label,
                  .asset-details-pinned-grid .ag-header-cell-text,
                  .asset-details-pinned-grid .ag-header-cell-label span,
                  .asset-details-pinned-grid .ag-header-cell-label .ag-header-cell-text {
                    color: #212529 !important;
                    opacity: 1 !important;
                    visibility: visible !important;
                    -webkit-text-fill-color: #212529 !important;
                  }
                `}</style>
                <AgGridReact<Asset>
                  ref={gridRef}
                  rowData={pinnedTopRowData}
                  columnDefs={configuredColumnDefs}
                defaultColDef={{
                  resizable: true,
                  wrapHeaderText: true,
                  autoHeaderHeight: true,
                  wrapText: true,
                  autoHeight: false,
                  sortable: false,
                  headerClass: 'ag-right-aligned-header',
                  cellStyle: { textAlign: 'right' },
                  minWidth: 40
                }}
                getRowId={(params) => {
                  // Use id + measurement_date + is_latest to ensure uniqueness
                  // This prevents duplicates when same record appears in both tables
                  const isLatest = params.data.is_latest ? 'latest' : 'history';
                  const historyCreatedAt = params.data.history_created_at ? `-${params.data.history_created_at}` : '';
                  return `${params.data.asset_id}-${params.data.measurement_date}-${isLatest}${historyCreatedAt}`;
                }}
                getRowStyle={getRowStyle}
                gridOptions={{
                  suppressColumnVirtualisation: false, // Enable virtualization for better performance
                  alwaysShowHorizontalScroll: true,
                  suppressMovableColumns: true,
                  suppressColumnMoveAnimation: true,
                  rowBuffer: 5, // Reduce row buffer for better performance
                  debounceVerticalScrollbar: true,
                  rowSelection: { mode: 'singleRow', enableClickSelection: true, checkboxes: false },
                  enableCellTextSelection: false, // Disable text selection for better performance
                  singleClickEdit: true, // Single-click to start editing (grid is editable)
                }}
                suppressHorizontalScroll={false}
                onGridReady={async (params) => {
                  await gridPreferences.loadColumnState(params.api);
                }}
                onColumnResized={(params) => {
                  gridPreferences.handleColumnResized();
                }}
                onColumnMoved={(params) => {
                  // Prevent structure drawing and asset_id columns from being moved - force them back to pinned right position
                  try {
                    setTimeout(() => {
                      if (gridRef.current?.api) {
                        const columnState = gridRef.current.api.getColumnState();
                        const structureDrawingCol = columnState.find((col: any) => col.colId === 'structure_drawing_url');
                        const assetIdCol = columnState.find((col: any) => col.colId === 'asset_id');
                        const otherCols = columnState.filter((col: any) => col.colId !== 'structure_drawing_url' && col.colId !== 'asset_id');
                        
                        if (structureDrawingCol || assetIdCol) {
                          const pinnedCols = [];
                          if (structureDrawingCol) {
                            pinnedCols.push({ ...structureDrawingCol, pinned: 'right', lockPosition: true });
                          }
                          if (assetIdCol) {
                            pinnedCols.push({ ...assetIdCol, pinned: 'right', lockPosition: true });
                          }
                          
                          gridRef.current.api.applyColumnState({
                            state: [...otherCols, ...pinnedCols],
                            applyOrder: true
                          });
                        }
                      }
                    }, 0);
                  } catch (error) {
                    console.warn('Error in onColumnMoved:', error);
                  }
                  // Save column state after move
                  gridPreferences.handleColumnMoved();
                }}
                onSortChanged={() => {}}
                onCellValueChanged={onCellValueChanged}
                onCellEditingStopped={onCellEditingStopped}
                stopEditingWhenCellsLoseFocus={true}
                enableRtl={true}
                animateRows={false}
                tooltipShowDelay={200}
                tooltipHideDelay={10000}
              />
          </div>

          {/* History Records Grid */}
          {historyRows.length > 0 && (
            <div className="flex flex-col flex-1 min-h-0">
              <h3 className="text-sm font-semibold text-slate-700 mb-1" style={{ direction: 'rtl', textAlign: 'right' }}>
                היסטוריית מדידות
              </h3>
              <div className="ag-theme-alpine flex-1 min-h-[200px]" style={{ width: '100%', overflowX: 'auto' }}>
                    <style>{`
                      .ag-theme-alpine .ag-header {
                        background: #f8f9fa !important;
                        border-bottom: 2px solid #dee2e6 !important;
                      }
                      .ag-theme-alpine .ag-header-cell-label,
                      .ag-theme-alpine .ag-header-cell-text,
                      .ag-theme-alpine .ag-header-cell-label span,
                      .ag-theme-alpine .ag-header-cell-label .ag-header-cell-text {
                        color: #212529 !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                        -webkit-text-fill-color: #212529 !important;
                      }
                      .ag-theme-alpine .ag-row {
                        border-bottom: 1px solid #e5e7eb !important;
                        transition: background-color 0.15s ease !important;
                      }
                      .ag-theme-alpine .ag-row:hover {
                        background-color: #f0f9ff !important;
                      }
                      .ag-theme-alpine .ag-row.history-row-clickable:hover {
                        background-color: #dbeafe !important;
                        box-shadow: inset 0 0 0 1px #3b82f6 !important;
                      }
                      .ag-theme-alpine .ag-row.history-row-master {
                        background-color: #fef3c7 !important;
                        font-weight: 500;
                      }
                      .ag-theme-alpine .ag-row.history-row-master:hover {
                        background-color: #fde68a !important;
                      }
                      .ag-theme-alpine .ag-row.detail-row-expanded {
                        background-color: #f8fafc !important;
                        border-top: 2px solid #3b82f6 !important;
                      }
                      .ag-theme-alpine .ag-cell {
                        border-right: 1px solid #f3f4f6 !important;
                      }
                    `}</style>
                    <AgGridReact<Asset>
                      ref={historyGridRef}
                      rowData={historyRowsWithDetails}
                      columnDefs={configuredHistoryColumnDefs}
                      onCellValueChanged={onCellValueChanged}
                      singleClickEdit={true}
                    defaultColDef={{
                      resizable: true,
                      wrapHeaderText: true,
                      autoHeaderHeight: true,
                      wrapText: false, // Prevent text wrapping, especially for dates
                      autoHeight: false,
                      sortable: false,
                      headerClass: 'ag-right-aligned-header',
                      headerStyle: {
                        fontSize: '10px',
                        textAlign: 'right',
                        fontWeight: '600',
                        backgroundColor: '#f9fafb',
                        color: '#374151',
                        borderBottom: '2px solid #e5e7eb',
                        padding: '4px 6px',
                        WebkitFontSmoothing: 'antialiased',
                        MozOsxFontSmoothing: 'grayscale'
                      },
                      cellStyle: (params: any) => {
                        const baseStyle = {
                          textAlign: 'right',
                          padding: '4px 6px',
                          fontSize: '10px',
                          borderRight: '1px solid #f3f4f6',
                          whiteSpace: 'nowrap', // Ensure dates stay on one line
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        };
                        // For date fields, ensure they stay on one line
                        if (params.colDef?.field === 'measurement_date') {
                          return { ...baseStyle, whiteSpace: 'nowrap' };
                        }
                        return baseStyle;
                      },
                      minWidth: 40
                    }}
                    gridOptions={{
                      suppressColumnVirtualisation: false, // Enable virtualization for better performance
                      alwaysShowHorizontalScroll: true,
                      suppressMovableColumns: true,
                      suppressColumnMoveAnimation: true,
                      rowBuffer: 5, // Reduce row buffer for better performance
                      debounceVerticalScrollbar: true,
                      rowSelection: { mode: 'singleRow', enableClickSelection: true, checkboxes: false },
                      enableCellTextSelection: false, // Disable text selection for better performance
                    }}
                    suppressHorizontalScroll={false}
                    getRowId={(params) => {
                      const isLatest = params.data.is_latest ? 'latest' : 'history';
                      const historyCreatedAt = params.data.history_created_at ? `-${params.data.history_created_at}` : '';
                      return `${params.data.asset_id}-${params.data.measurement_date}-${isLatest}${historyCreatedAt}`;
                    }}
                    getRowStyle={(params) => {
                      const baseStyle = getHistoryRowStyle(params);
                      return {
                        ...baseStyle,
                        transition: 'background-color 0.2s ease',
                        borderBottom: '1px solid #e5e7eb'
                      };
                    }}
                    onGridReady={async (params) => {
                      // Load saved column state first
                      await historyGridPreferences.loadColumnState(params.api);
                      // Ensure structure drawing column is visible
                      const columnState = params.api.getColumnState();
                      const structureDrawingCol = columnState.find((col: any) => col.colId === 'structure_drawing_url');
                      if (structureDrawingCol && structureDrawingCol.hide) {
                        params.api.setColumnVisible('structure_drawing_url', true);
                      }
                    }}
                    onFirstDataRendered={async (params) => {
                      // Ensure actions column is visible
                      const columnState = params.api.getColumnState();
                      const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                      if (actionsCol && actionsCol.hide) {
                        params.api.setColumnVisible('actions', true);
                      }
                    }}
                    onColumnMoved={(params) => {
                      // Prevent structure drawing and asset_id columns from being moved - force them back to pinned right position
                      try {
                        setTimeout(() => {
                          if (historyGridRef.current?.api) {
                            const columnState = historyGridRef.current.api.getColumnState();
                            const structureDrawingCol = columnState.find((col: any) => col.colId === 'structure_drawing_url');
                            const assetIdCol = columnState.find((col: any) => col.colId === 'asset_id');
                            const otherCols = columnState.filter((col: any) => col.colId !== 'structure_drawing_url' && col.colId !== 'asset_id');
                            
                            if (structureDrawingCol || assetIdCol) {
                              const pinnedCols = [];
                              if (structureDrawingCol) {
                                pinnedCols.push({ ...structureDrawingCol, pinned: 'right', lockPosition: true });
                              }
                              if (assetIdCol) {
                                pinnedCols.push({ ...assetIdCol, pinned: 'right', lockPosition: true });
                              }
                              
                              historyGridRef.current.api.applyColumnState({
                                state: [...otherCols, ...pinnedCols],
                                applyOrder: true
                              });
                            }
                          }
                        }, 0);
                      } catch (error) {
                        console.warn('Error in history grid onColumnMoved:', error);
                      }
                    }}
                    onSortChanged={() => {}}
                    onRowClicked={(event: any) => {
                      // Handle single click for audit details
                    }}
                    rowSelection={{
                      mode: 'singleRow',
                      enableClickSelection: true,
                      checkboxes: false,
                      hideDisabledCheckboxes: true
                    }}
                    stopEditingWhenCellsLoseFocus={true}
                    enableRtl={true}
                    animateRows={false}
                    tooltipShowDelay={200}
                    tooltipHideDelay={10000}
                  />
              </div>
            </div>
          )}

        </div>
      )}

        {/* Row Edit Modal */}
            <RowEditModal
              isOpen={isRowEditModalOpen}
              onClose={() => {
                setIsRowEditModalOpen(false);
                setSelectedRowForEdit(null);
              }}
              rowData={selectedRowForEdit}
              assetTypes={assetTypes}
              operators={operators}
              onSave={handleSaveFromModal}
            />


            {/* PDF Viewer Modal */}
            {selectedDrawingUrl && (
              <div 
                className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
                  fileViewerClosing ? 'opacity-0' : 'opacity-100'
                }`}
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                onClick={() => {
                  setFileViewerClosing(true);
                  setTimeout(() => {
                    setSelectedDrawingUrl(null);
                    setFileViewerClosing(false);
                  }, 300);
                }}
              >
                <div 
                  className={`bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col transition-all duration-300 ${
                    fileViewerClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-slate-800">{t('structureDrawing')}</h3>
                    <button
                      onClick={() => {
                        setFileViewerClosing(true);
                        setTimeout(() => {
                          setSelectedDrawingUrl(null);
                          setFileViewerClosing(false);
                        }, 300);
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors font-bold"
                    >
                      <X className="h-4 w-4" />
                      <span>{t('closeViewer')}</span>
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto p-4">
                    <FileViewer
                      fileUrl={selectedDrawingUrl}
                      fileName={selectedFileName || `structure-drawing-${assetId}`}
                    />
                  </div>
                </div>
              </div>
            )}

      {/* Asset Files Modal */}
      {assetFilesModalOpen && selectedAssetIdForFiles && (
        <AssetFilesModal
          ref={assetFilesModalRef}
          isOpen={assetFilesModalOpen}
          onClose={() => {
            setAssetFilesModalOpen(false);
            setSelectedAssetIdForFiles(null);
          }}
          assetId={selectedAssetIdForFiles}
          measurementDate={selectedMeasurementDateForFiles}
          isUploading={uploadingAssetId === selectedAssetIdForFiles}
          onFilesDeleted={(assetId, hasFiles) => {
            // undefined → modal was opened for the active row (no date filter) → ACTIVE key.
            // null or a date → modal was filtered to that measurement → use that key.
            const key = selectedMeasurementDateForFiles === undefined
              ? `${assetId}|ACTIVE`
              : `${assetId}|${selectedMeasurementDateForFiles}`;
            if (hasFiles) {
              setAssetsWithFiles(prev => new Set(prev).add(key));
            } else {
              setAssetsWithFiles(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
              });
            }
          }}
        />
      )}
    </div>
    </>
  );
});
