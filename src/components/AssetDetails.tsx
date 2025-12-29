import { useEffect, useState, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, AddressList, api } from '../lib/api';
import { Home, Loader2, Save, X, AlertCircle, Upload, Eye, CheckCircle2, Copy, FileText, Edit, Square, Download, ChevronRight, ChevronDown, History, MessageSquare } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Toast } from './Toast';
import { FileViewer } from './FileViewer';
import { compressFile } from '../lib/fileCompression';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellClassParams } from 'ag-grid-community';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { supabase } from '../lib/supabase';
import { ValidationResultModal, SingleAssetValidationResult, ValidationProgress } from './ValidationResultModal';
import { RowEditModal } from './RowEditModal';
import { AuditLog, Building as BuildingType } from '../lib/api';
import { usePreferences } from '../contexts/PreferencesContext';
import { useValidationRules } from '../contexts/ValidationContext';
import { formatDateToDDMMYYYY, formatDateTimeToDDMMYYYYHHMM } from '../lib/dateUtils';
import { formatNumberToTwoDecimals } from '../lib/numberUtils';
import { useGridPreferences } from '../lib/useGridPreferences';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';
import { useFieldConfig } from '../lib/useFieldConfig';
import { exportToExcel } from '../lib/excelExport';

interface AssetDetailsProps {
  assetId?: number;
  buildingNumber?: number;
  taxRegion?: string;
  onDataUpdate?: () => void;
  onAssetCreated?: (assetDbId: number, assetIdentifier: string) => void;
}

export interface AssetDetailsRef {
  hasUnsavedChanges: () => boolean;
}

export const AssetDetails = forwardRef<AssetDetailsRef, AssetDetailsProps>(({ assetId, buildingNumber, taxRegion, onDataUpdate, onAssetCreated }, ref) => {
  const { t } = useTranslation();
  const { preferences, setEditMode } = usePreferences();
  const { validationRules } = useValidationRules(); // Get validation rules from context
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
  const [selectedDrawingUrl, setSelectedDrawingUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [validationResults, setValidationResults] = useState<SingleAssetValidationResult | null>(null);
  const [validationProgress, setValidationProgress] = useState<ValidationProgress | null>(null);
  const [measurementDateModalOpen, setMeasurementDateModalOpen] = useState(false);
  const [measurementDateModalClosing, setMeasurementDateModalClosing] = useState(false);
  const [newMeasurementDate, setNewMeasurementDate] = useState<string>('');
  const [fileViewerClosing, setFileViewerClosing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ assetId: number; progress: number; fileName: string } | null>(null);
  const [uploadingAssetId, setUploadingAssetId] = useState<number | null>(null);
  const [isRowEditModalOpen, setIsRowEditModalOpen] = useState(false);
  const [selectedRowForEdit, setSelectedRowForEdit] = useState<Asset | null>(null);
  
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

  // Helper function to check if a field should be editable
  // For non-accountable assets, all fields are readonly (main_asset_type is readonly in all tabs except TransferAreas)
  const isFieldEditable = useCallback((params: any, fieldName: string): boolean => {
    if (!params || !params.data) return false;
    const asset = params.data as Asset;
    const baseEditable = asset.is_latest === true && editMode === 'inline';
    
    // For non-accountable assets, all fields are readonly (including main_asset_type)
    if (isAssetNotAccountable(asset)) {
      return false;
    }
    
    return baseEditable;
  }, [isAssetNotAccountable, editMode]);

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

    const assetErrors = validationErrors.get(assetIdNum);
    const hasErrors = assetErrors && assetErrors.size > 0;

    const asset = params.data as Asset;
    const numericRegex = /^[0-9]+$/;
    // Only check for invalid format if the field has a value (empty strings are allowed)
    const hasInvalidPayerId = asset.payer_id && asset.payer_id !== '' && !numericRegex.test(asset.payer_id);
    const hasInvalidAssetId = asset.asset_id && asset.asset_id !== '' && !numericRegex.test(asset.asset_id);
    const isLatest = asset.is_latest === true;

    const baseStyle: any = {
      opacity: isLatest ? 1 : 0.7,
      fontSize: isLatest ? '1.2em' : undefined,
      fontWeight: isLatest ? '600' : undefined,
      fontStyle: isLatest ? 'normal' : 'italic'
    };

    if (hasErrors || hasInvalidPayerId || hasInvalidAssetId) {
      return {
        ...baseStyle,
        border: '3px solid #ef4444',
        borderRadius: '4px',
        background: '#fee2e2'
      };
    }

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
      
      // Only allow editing for latest records
      if (data.is_latest !== true) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[AssetDetails] Attempted to edit non-latest record, ignoring change');
        }
        event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
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
                       at.active === 'כן';
              });
              
              if (!matchingAssetTypeForTaxRegion) {
                // Asset type doesn't exist for this tax region - find valid tax regions
                const validTaxRegions = new Set<number>();
                assetTypes.forEach(at => {
                  const atNameStr = String(at.name).trim();
                  const atTaxRegionNum = at.tax_region != null 
                    ? (typeof at.tax_region === 'string' ? parseInt(at.tax_region, 10) : at.tax_region)
                    : null;
                  if (atNameStr === newAssetTypeName && atTaxRegionNum != null && !isNaN(atTaxRegionNum) && at.active === 'כן') {
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

          // If new asset type has non_accountable_for_distribution = true and asset has area_from_distribution > 0, set it to 0
          if (newAssetTypeFinal.non_accountable_for_distribution === true) {
            const currentAreaFromDistribution = updatedAsset.area_from_distribution || 0;
            if (currentAreaFromDistribution > 0) {
              updatedAsset = { ...updatedAsset, area_from_distribution: 0 };
            }
          }
        }
      }

      // Track the change in dirtyAssets immediately (no debounce)
      setDirtyAssets(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(assetId) || {};
        const changesToStore = { ...existing, [field]: newValue };
        // Also include area_from_distribution change if it was set to 0
        if (updatedAsset.area_from_distribution !== data.area_from_distribution) {
          changesToStore.area_from_distribution = updatedAsset.area_from_distribution;
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

      // Debounce expensive database validations (800ms delay for better performance)
      // This prevents validation from running on every keystroke
      const timer = setTimeout(async () => {
        try {
          // Prepare cached data for validation (all data is already in memory)
          const cachedData = {
            assetTypes: assetTypes || [],
            building: building
          };

          // Use the same validation as the validate button - AssetValidationHandler.validateSingleAsset
          // This ensures consistent validation behavior across all components
          const result = await AssetValidationHandler.validateSingleAsset(updatedAsset, {
            taxRegion: validationTaxRegion, // Use validationTaxRegion from tab - same as AssetsList
            cachedData: cachedData
          });

          // Add discount validation errors
          const discountErrors = validateDiscountDates(updatedAsset);
          const allErrors = [...(result.errors || []), ...discountErrors];

          // Recalculate actualValid from results - same as handleValidateLatestRow
          // This ensures consistency: an asset is only valid if valid=true AND no errors
          const actualValid = result.valid && allErrors.length === 0;

          // Update validationErrors state to reflect validation results
          if (actualValid) {
            // Validation passed - clear errors for this asset
            setValidationErrors(prev => {
              const newMap = new Map(prev);
              newMap.delete(assetId);
              return newMap;
            });
            // Refresh the grid cells to clear validation styling
            // Also refresh the actions column to update invalid icon
            event.api.refreshCells({ 
              rowNodes: [node], 
              columns: ['actions', 'structure_drawing_url'],
              force: true 
            });
            // Also refresh all cells for styling updates
            event.api.refreshCells({ rowNodes: [node], force: true });
          } else if (allErrors.length > 0) {
            // Validation failed - set errors for this asset
            setValidationErrors(prev => {
              const newMap = new Map(prev);
              const errorMap = new Map<string, string>();
              allErrors.forEach((error, index) => {
                // Use a generic field name or index if we can't determine the field
                errorMap.set(`error_${index}`, error);
              });
              newMap.set(assetId, errorMap);
              return newMap;
            });
            // Refresh the grid cells to show validation styling
            // Also refresh the actions column to update invalid icon
            event.api.refreshCells({ 
              rowNodes: [node], 
              columns: ['actions', 'structure_drawing_url'],
              force: true 
            });
            // Also refresh all cells for styling updates
            event.api.refreshCells({ rowNodes: [node], force: true });
          }
        } catch (error) {
          console.error('Error in debounced validation:', error);
        } finally {
          // Clean up timer reference
          validationTimerRef.current.delete(String(assetId));
        }
      }, 500); // 500ms debounce delay

      validationTimerRef.current.set(String(assetId), timer);

    } catch (error) {
      console.error('Error tracking change:', error);
      setError('Failed to track change');
      setTimeout(() => setError(null), 3000);
    }
  }, [validationTaxRegion, assetTypes, building, validateDiscountDates]);

  const hasChanges = dirtyAssets.size > 0;

  // Expose hasUnsavedChanges via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => hasChanges
  }), [hasChanges]);

  // Handler for double-click on row
  const handleRowDoubleClick = useCallback((event: any) => {
    // Only handle double-click if edit mode is 'modal'
    if (editMode !== 'modal') return;
    
    const rowData = event.data as Asset;
    // Only allow editing for latest records
    if (rowData && rowData.is_latest === true) {
      setSelectedRowForEdit(rowData);
      setIsRowEditModalOpen(true);
    }
  }, [editMode]);

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
        console.log('[AssetDetails.handleSaveFromModal] Validation parameters:', {
          assetId: updatedAsset.asset_id,
          buildingNumber: updatedAsset.building_number,
          validationTaxRegion: validationTaxRegion || 'NOT PROVIDED (will use building tax_region)',
          buildingTaxRegion: building?.tax_region || 'NOT SET'
        });
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
      const errorMsg = 'Please fix all validation errors before saving';
      if (process.env.NODE_ENV === 'development') {
        console.error('[AssetDetails] Validation errors prevent saving:', Array.from(validationErrors.entries()));
      }
      setError(errorMsg);
      setToast({ message: 'תקן שגיאות אימות לפני השמירה', type: 'error' });
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
      const currentAssetData = { ...latestMeasurement, ...(dirtyAssets.get(String(latestMeasurement.asset_id)) || {}) };
      
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
          console.log('[AssetDetails.handleSaveChanges] Validation parameters:', {
            assetId: currentAssetData.asset_id,
            buildingNumber: currentAssetData.building_number,
            mainAssetType: currentAssetData.main_asset_type,
            validationTaxRegion: validationTaxRegion || 'NOT PROVIDED (will use building tax_region)',
            buildingTaxRegion: building?.tax_region || 'NOT SET'
          });
        }
        
        // Skip validation for asset type 990
        const isAssetType990 = currentAssetData.main_asset_type && 
          (String(currentAssetData.main_asset_type).trim() === '990' || 
           parseInt(String(currentAssetData.main_asset_type).trim(), 10) === 990);
        
        if (isAssetType990) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[AssetDetails] Skipping validation for asset type 990:', {
              assetId: currentAssetData.asset_id,
              main_asset_type: currentAssetData.main_asset_type
            });
          }
          // Skip validation - proceed directly to save
        } else {
          // Validate the asset before saving
          const shouldValidateSubAssets = currentAssetData.main_asset_type === '199' || currentAssetData.main_asset_type === '299';
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
          ])
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
          floor: currentAssetData.floor != null && currentAssetData.floor !== '' ? currentAssetData.floor : undefined,
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
        // Find the asset by database id to get its full data
        const asset = allMeasurements.find(a => a.id === dbId);
        if (!asset) {
          console.error(`[AssetDetails] Could not find asset with database id ${dbId}`);
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

        // Send full asset data merged with changes to ensure all required fields are present
        assetsToUpdate.push({
          ...asset,
          ...changes
        });
      }

      const result = await api.assets.saveBulkTransactional(assetsToUpdate, 'manual_update', undefined, undefined, undefined, isBusinessContext);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save assets');
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
              console.log('[AssetDetails] Fetched measurements after save:', {
                totalCount: allAssetMeasurements.length,
                latestCount: allAssetMeasurements.filter(m => m.is_latest).length,
                historyCount: allAssetMeasurements.filter(m => !m.is_latest).length,
              });
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
      setError('Please fix all validation errors before saving');
      setToast({ message: 'תקן שגיאות לפני שמירה', type: 'error' });
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
      // Use currentAsset.id (database ID) to get dirty changes, not asset_id
      const changes = dirtyAssets.get(currentAsset.id) || {};
      
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
              console.log('[AssetDetails] Fetched measurements after save as new:', {
                totalCount: allAssetMeasurements.length,
                latestCount: allAssetMeasurements.filter(m => m.is_latest).length,
                historyCount: allAssetMeasurements.filter(m => !m.is_latest).length,
              });
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

  const handleFileUpload = useCallback(async (assetId: number, file: File) => {
    try {
      setUploadingAssetId(assetId);
      setUploadProgress({ assetId, progress: 0, fileName: file.name });

      // Step 1: Compress file (10% progress)
      setUploadProgress({ assetId, progress: 10, fileName: file.name });
      const compressedFile = await compressFile(file);
      const originalSizeKB = (file.size / 1024).toFixed(2);
      const compressedSizeKB = (compressedFile.size / 1024).toFixed(2);

      setUploadProgress({ assetId, progress: 30, fileName: file.name });

      // Step 2: Prepare file for upload
      const fileExt = compressedFile.name.split('.').pop() || file.name.split('.').pop();
      const fileName = `${assetId}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Step 3: Upload with simulated progress tracking
      // Simulate upload progress (Supabase doesn't provide real-time progress)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (!prev || prev.assetId !== assetId) return prev;
          const newProgress = Math.min(prev.progress + 5, 90);
          return { ...prev, progress: newProgress };
        });
      }, 200);

      setUploadProgress({ assetId, progress: 40, fileName: file.name });

      const { error: uploadError } = await supabase.storage
        .from('structure-drawings')
        .upload(filePath, compressedFile, { 
          upsert: true
        });

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      setUploadProgress({ assetId, progress: 90, fileName: file.name });

      // Step 4: Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('structure-drawings')
        .getPublicUrl(filePath);

      setUploadProgress({ assetId, progress: 95, fileName: file.name });

      const result = await api.assets.saveBulkTransactional([{ asset_id: assetId, structure_drawing_url: publicUrl }], 'manual_update', undefined, undefined, undefined, isBusinessContext);

      if (!result.success) {
        throw new Error(result.error || 'Failed to update structure drawing URL');
      }

      setUploadProgress({ assetId, progress: 100, fileName: file.name });

      // Show success message with compression info
      const sizeReduction = compressedSizeKB !== originalSizeKB 
        ? ` (${originalSizeKB}KB → ${compressedSizeKB}KB)`
        : '';
      setToast({ 
        message: `${t('drawingUploadedSuccessfully')}${sizeReduction}`, 
        type: 'success' 
      });
      
      await fetchData();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : t('failedToUploadDrawing'),
        type: 'error'
      });
    } finally {
      setUploadProgress(null);
      setUploadingAssetId(null);
    }
  }, [t]);

  const handleViewDrawing = useCallback((url: string, fileName?: string) => {
    setSelectedDrawingUrl(url);
    setSelectedFileName(fileName || null);
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
        console.log('[AssetDetails.handleValidateLatestRow] Validation parameters:', {
          assetId: latestRow.asset_id,
          buildingNumber: latestRow.building_number,
          validationTaxRegion: validationTaxRegion || 'NOT PROVIDED (will use building tax_region)',
          buildingTaxRegion: building?.tax_region || 'NOT SET'
        });
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
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          right: `${position.right + 8}px`,
          transform: 'translateY(-50%)',
          zIndex: 9999,
          pointerEvents: 'none'
        }}
      >
        <div style={{
          backgroundColor: '#f9fafb',
          color: '#1f2937',
          padding: '12px 16px',
          borderRadius: '6px',
          fontSize: '14px',
          maxWidth: '500px',
          minWidth: '300px',
          direction: 'rtl',
          textAlign: 'right',
          lineHeight: '1.6',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          border: '2px solid #ef4444',
          whiteSpace: 'pre-line'
        }}>
          {errors.map((error, index) => (
            <div key={index} style={{ marginBottom: index < errors.length - 1 ? '8px' : '0' }}>
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
            <label className="flex items-center justify-center p-1 text-blue-600 hover:text-blue-700 transition-colors hover:scale-110 cursor-pointer" title={t('upload') || 'העלה קובץ'}>
              <Upload className="h-5 w-5" />
              <input
                type="file"
                className="hidden"
                accept="*/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && asset.asset_id) {
                    handleFileUpload(asset.asset_id, file);
                    e.target.value = '';
                  }
                }}
                disabled={uploadingAssetId === asset.asset_id}
              />
            </label>
            {uploadingAssetId === asset.id && uploadProgress && (
              <div className="w-24 flex flex-col items-center gap-1">
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300"
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
        {hasDrawing && asset.structure_drawing_url ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Extract filename from URL if possible
              const urlParts = asset.structure_drawing_url.split('/');
              const fileName = urlParts[urlParts.length - 1].split('?')[0];
              handleViewDrawing(asset.structure_drawing_url, fileName);
            }}
            className={`p-1 transition-colors hover:scale-110 ${
              selectedDrawingUrl === asset.structure_drawing_url
                ? 'text-green-600 hover:text-green-700'
                : 'text-green-600 hover:text-green-700'
            }`}
            title={selectedDrawingUrl === asset.structure_drawing_url ? t('viewing') || 'צופה' : t('view') || 'צפה בקובץ'}
          >
            <FileText className="h-5 w-5" />
          </button>
        ) : (
          <div className="flex items-center justify-center p-1 text-gray-400" title={t('noFile') || 'אין קובץ'}>
            <FileText className="h-5 w-5" />
          </div>
        )}
      </div>
    );
  }, [t, uploadingAssetId, uploadProgress, selectedDrawingUrl, handleFileUpload, handleViewDrawing]);

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
      field: 'floor',
      headerName: 'קומה',
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
      field: 'area_from_distribution',
      headerName: 'גודל שטח משותף',
      width: 120,
      sortable: true,
      filter: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params: any) => formatNumberToTwoDecimals(params.value),
      hide: !isBusinessContext // Hide for residence assets (area_from_distribution is only for business distribution)
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
                className="text-blue-600 hover:text-blue-800 underline decoration-blue-600 hover:decoration-blue-800 cursor-pointer transition-colors font-semibold"
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
      valueParser: (params) => {
        if (!params.newValue || params.newValue === '') return null;
        const num = parseInt(params.newValue, 10);
        return isNaN(num) ? null : num;
      },
      cellStyle: (params) => getCellStyle(params, 'tax_region'),
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      hide: isBusinessAsset, // Hide penthouse for business assets (only show for residence)
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellRenderer: (params: any) => {
        const isChecked = params.value === 'כן';
        const isEditable = params.data.is_latest === true && editMode === 'inline';
        return (
          <div className="flex items-center justify-center h-full">
            {isEditable ? (
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  e.stopPropagation(); // Prevent event bubbling
                  const newValue = e.target.checked ? 'כן' : null;
                  
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
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
            ) : (
              <span className="text-gray-600">{isChecked ? '✓' : ''}</span>
            )}
          </div>
        );
      },
      valueGetter: (params: any) => params.data?.penthouse === 'כן' ? 'כן' : null,
      valueSetter: (params: any) => {
        params.data.penthouse = params.newValue;
        return true;
      },
      cellStyle: (params) => {
        const baseStyle = getCellStyle(params, 'penthouse');
        return { ...baseStyle, textAlign: 'center' };
      },
      headerClass: 'text-center'
    },
    {
      field: 'floor',
      headerName: 'קומה',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueParser: (params) => {
        if (!params.newValue || params.newValue === '') return null;
        const num = parseInt(params.newValue, 10);
        return isNaN(num) ? null : num;
      },
      cellStyle: (params) => getCellStyle(params, 'floor')
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
              cursor: isEditable ? 'pointer' : 'default', 
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
  }, [t, assetTypes, editMode, isFieldEditable, getCellStyle, structureDrawingCellRenderer, actionsCellRenderer, asset, isBusinessAsset]);

  // Apply field configurations to column definitions for main grid
  const configuredColumnDefs = useFieldConfig(columnDefs, 'asset-details-main');

  // Column definitions for history grid - no validation
  const historyColumnDefs: ColDef<Asset>[] = useMemo(() => {
    return columnDefs.map(colDef => {
      // Replace actions cell renderer with null renderer for history grid
      if (colDef.colId === 'actions') {
        return {
          ...colDef,
          cellRenderer: historyActionsCellRenderer
        };
      }
      return colDef;
    });
  }, [columnDefs, historyActionsCellRenderer]);

  // Apply field configurations to column definitions for history grid
  const configuredHistoryColumnDefs = useFieldConfig(historyColumnDefs, 'asset-details-history');

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
      if (building?.building_address) {
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
  }, [building?.building_address]);

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
          floor: undefined,
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
            <Loader2 className="h-16 w-16 text-teal-600 animate-spin mx-auto" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 bg-teal-100 rounded-full animate-pulse"></div>
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
          <h3 className="text-lg font-semibold text-red-900 mb-2">שגיאה בטעינת הנתונים</h3>
          <p className="text-red-700 text-sm">{t('error')}: {error || 'Asset not found'}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            רענן דף
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
          duration={0}
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
              <h3 className="text-lg font-bold text-slate-900 bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent">שמור כמדידה חדשה</h3>
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
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-right transition-all duration-200 hover:border-slate-400"
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
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:bg-gray-400 text-white rounded-lg transition-all duration-200 font-semibold shadow-sm hover:shadow-md disabled:shadow-none"
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
      <div className="w-full mx-auto px-1 sm:px-2 py-1 sm:py-2">
      <div className="mb-2 bg-gradient-to-r from-blue-600 via-blue-500 to-teal-600 rounded-lg shadow-lg p-1.5 border border-blue-400/20">
        <div className="flex items-center gap-2">
          <Home className="w-5 h-5 text-white bg-white/20 rounded-lg p-1" strokeWidth={1.5} />
          <div className="flex-1">
            <h1 className="text-base sm:text-lg font-semibold text-white">
              {t('assetId')}: {asset.asset_id}
            </h1>
            {building && (
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] sm:text-xs text-teal-50">
                    מבנה {building.building_number}
                  </p>
                  {buildingAddress && (
                    <p className="text-[10px] sm:text-xs text-teal-50">
                      - {buildingAddress}
                      {building?.building_number_in_street && (
                        <span className="mr-1"> {building.building_number_in_street}</span>
                      )}
                    </p>
                  )}
                  <p className="text-[10px] sm:text-xs text-teal-50 font-medium bg-white/20 px-1.5 py-0.5 rounded">
                    גוש: {building?.gosh || '-'}
                  </p>
                  <p className="text-[10px] sm:text-xs text-teal-50 font-medium bg-white/20 px-1.5 py-0.5 rounded">
                    חלקה: {building?.helka || '-'}
                  </p>
                  <p className="text-[10px] sm:text-xs text-teal-50 font-medium bg-white/20 px-1.5 py-0.5 rounded">
                    קומה: {asset?.floor != null ? asset.floor : '-'}
                  </p>
                  {asset?.discount_type && (
                    <p className="text-[10px] sm:text-xs text-teal-50 font-medium bg-white/20 px-1.5 py-0.5 rounded">
                      סוג הנחה: {asset.discount_type}
                    </p>
                  )}
                  {(asset?.discount_date_from || asset?.discount_date_to) && (
                    <p className="text-[10px] sm:text-xs text-teal-50 font-medium bg-white/20 px-1.5 py-0.5 rounded">
                      תאריך הנחה: {asset?.discount_date_from || ''} - {asset?.discount_date_to || ''}
                    </p>
                  )}
                </div>
                {areaDescriptionForTab && (
                  <p className="text-xs text-white font-medium bg-blue-700 px-2 py-0.5 rounded">
                    {areaDescriptionForTab}
                  </p>
                )}
                {(() => {
                  // Check if asset is a business asset
                  if (!asset?.main_asset_type || !assetTypes || assetTypes.length === 0 || !building) {
                    return null;
                  }
                  const assetType = assetTypes.find(at => at.name === asset.main_asset_type);
                  const isBusinessAsset = assetType?.business_residence === 'עסקים';
                  
                  // Show overload_ratio for business assets only
                  if (isBusinessAsset && building.overload_ratio != null) {
                    return (
                      <p className="text-xs text-white font-medium bg-purple-600 px-2 py-0.5 rounded">
                        אחוז העמסה: {building.overload_ratio.toFixed(2)}%
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/20 rounded-lg p-1 gap-1">
              <button
                onClick={() => setEditMode('inline')}
                className={`p-1.5 rounded transition-colors ${
                  editMode === 'inline'
                    ? 'bg-white text-blue-600'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                title="עריכה ישירה בתא"
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                onClick={() => setEditMode('modal')}
                className={`p-1.5 rounded transition-colors ${
                  editMode === 'modal'
                    ? 'bg-white text-blue-600'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                title="עריכה בחלון נפרד"
              >
                <Square className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {allMeasurements.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-blue-100 hover:shadow-xl transition-shadow duration-200">
          <div className="p-2">
            {/* Latest Measurement Grid */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-slate-800">מדידה אחרונה</h3>
                <div className="flex gap-1">
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
                    className="btn btn-export btn-lg"
                    title="ייצא ל-Excel"
                  >
                    <Download className="h-5 w-5" />
                    <span>ייצא</span>
                  </button>
                  <button
                    onClick={handleValidateLatestRow}
                    disabled={isSaving || isValidating || !latestMeasurement}
                    className="btn btn-secondary btn-lg"
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
                    className="btn btn-primary btn-lg"
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
                    disabled={isSaving || (!!assetId && !hasChanges) || validationErrors.size > 0}
                    className="btn btn-primary btn-lg"
                    title={validationErrors.size > 0 ? 'תקן שגיאות לפני שמירה' : (!assetId && !latestMeasurement?.asset_id) ? 'מלא קוד נכס לשמירה' : 'שמור שינויים'}
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
                    className="btn btn-cancel btn-lg"
                  >
                    <X className="h-5 w-5" />
                    <span>{t('cancel')}</span>
                  </button>
                </div>
              </div>
              <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100 asset-details-pinned-grid" style={{ height: '85px', width: '100%', overflowX: 'auto' }}>
                <style>{`
                  .asset-details-pinned-grid .ag-header-cell-label,
                  .asset-details-pinned-grid .ag-header-cell-text,
                  .asset-details-pinned-grid .ag-header-cell-label span,
                  .asset-details-pinned-grid .ag-header-cell-label .ag-header-cell-text {
                    color: white !important;
                    opacity: 1 !important;
                    visibility: visible !important;
                    -webkit-text-fill-color: white !important;
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
                  rowSelection: { enableClickSelection: true },
                  enableCellTextSelection: false, // Disable text selection for better performance
                }}
                suppressHorizontalScroll={false}
                onGridReady={async (params) => {
                  await gridPreferences.loadColumnState(params.api);
                  // Delay text overflow detection to avoid blocking initial render
                  // Use requestAnimationFrame for better performance
                  requestAnimationFrame(() => {
                    setTimeout(() => {
                      detectAndApplyTextOverflow(params.api);
                    }, 1000);
                  });
                }}
                onFirstDataRendered={async (params) => {
                  // Delay text overflow detection to avoid blocking initial render
                  // Only run in development for performance
                  if (process.env.NODE_ENV === 'development') {
                    setTimeout(() => {
                      detectAndApplyTextOverflow(params.api);
                    }, 2000);
                  }
                }}
                onColumnResized={(params) => {
                  gridPreferences.handleColumnResized();
                  // Debounce text overflow detection to avoid excessive calls
                  if (process.env.NODE_ENV === 'development') {
                    clearTimeout((params.api as any)._textOverflowTimeout);
                    (params.api as any)._textOverflowTimeout = setTimeout(() => {
                      detectAndApplyTextOverflow(params.api);
                    }, 500);
                  }
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
                onRowDoubleClicked={handleRowDoubleClick}
                enableRtl={true}
                animateRows={true}
                tooltipShowDelay={200}
                tooltipHideDelay={10000}
              />
              </div>
            </div>

            {/* History Records Grid */}
            {historyRows.length > 0 && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-2" style={{ direction: 'rtl', textAlign: 'right' }}>
                  היסטוריית מדידות
                </h3>
                <div className="ag-theme-alpine rounded-xl shadow-lg border-2 border-gray-200 bg-gradient-to-br from-white to-gray-50" style={{ height: '300px', width: '100%', overflowX: 'auto' }}>
                    <style>{`
                      .ag-theme-alpine .ag-header {
                        background: linear-gradient(to bottom, #f9fafb, #f3f4f6) !important;
                        border-bottom: 2px solid #e5e7eb !important;
                      }
                      .ag-theme-alpine .ag-header-cell-label,
                      .ag-theme-alpine .ag-header-cell-text,
                      .ag-theme-alpine .ag-header-cell-label span,
                      .ag-theme-alpine .ag-header-cell-label .ag-header-cell-text {
                        color: #374151 !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                        -webkit-text-fill-color: #374151 !important;
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
                      rowSelection: { enableClickSelection: true },
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
                      // Delay text overflow detection to avoid blocking initial render
                      setTimeout(() => {
                        detectAndApplyTextOverflow(params.api);
                      }, 500);
                    }}
                    onFirstDataRendered={async (params) => {
                      // Ensure actions column is visible
                      const columnState = params.api.getColumnState();
                      const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                      if (actionsCol && actionsCol.hide) {
                        params.api.setColumnVisible('actions', true);
                      }
                      // Delay text overflow detection - only in development
                      if (process.env.NODE_ENV === 'development') {
                        setTimeout(() => {
                          detectAndApplyTextOverflow(params.api);
                        }, 2000);
                      }
                    }}
                    onColumnResized={(params) => {
                      // Debounce text overflow detection to avoid excessive calls
                      // Only run in development for performance
                      if (process.env.NODE_ENV === 'development') {
                        clearTimeout((params.api as any)._textOverflowTimeout);
                        (params.api as any)._textOverflowTimeout = setTimeout(() => {
                          detectAndApplyTextOverflow(params.api);
                        }, 500);
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
                    onRowDoubleClicked={(event: any) => {
                      // Handle double-click for editing (only for latest records)
                      // Don't process double-click for history rows - they should open audit modal
                      if (event.data?.is_latest === true) {
                        handleRowDoubleClick(event);
                      }
                    }}
                    onRowClicked={(event: any) => {
                      // Handle single click for audit details
                    }}
                    suppressRowClickSelection={false}
                    stopEditingWhenCellsLoseFocus={true}
                    enableRtl={true}
                    animateRows={true}
                    tooltipShowDelay={200}
                    tooltipHideDelay={10000}
                  />
                </div>
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
          </div>
        </div>
      )}
    </div>
    </>
  );
});
