import { useEffect, useState, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, AddressList, api } from '../lib/api';
import { assetValidators, validateAll, inputValidators, validateEntity } from '../lib/validation';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, IDetailCellRendererParams } from 'ag-grid-community';
import { Building as BuildingIcon, AlertCircle, ChevronDown, ChevronRight, Loader2, Save, X, Plus, Trash2, CheckCircle2, Download, ArrowRightLeft, Upload, FileSpreadsheet, History, Share2, MapPin, MessageSquare, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ValidationResultModal, BatchValidationResults, ValidationProgress } from './ValidationResultModal';
import { DistributionHistoryModal } from './DistributionHistoryModal';
import { TransferHistoryModal } from './TransferHistoryModal';
import { ChangeTaxRegionModal } from './ChangeTaxRegionModal';
import { useValidationRules } from '../contexts/ValidationContext';
import { supabase } from '../lib/supabase';
import { compressFile } from '../lib/fileCompression';
import { formatDateToDDMMYYYY } from '../lib/dateUtils';
import { useGridPreferences } from '../lib/useGridPreferences';
import { useFieldConfig } from '../lib/useFieldConfig';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';
import { exportToExcel } from '../lib/excelExport';
import { Toast } from './Toast';
import { FileViewer } from './FileViewer';
interface AssetsListProps {
  buildingNumber: number;
  taxRegion?: string;
  onSelectAsset: (assetId: string, assetIdentifier: string, buildingNumber: number, taxRegion?: string) => void;
  onOpenTransferAreas?: (selectedAssetIds: string[], buildingNumber: number, taxRegion?: string) => void;
  onOpenNewAsset?: (buildingNumber: number, taxRegion?: string) => void;
  selectedAssetIds?: string[]; // Optional: filter to show only these asset IDs
  onOpenAssetsTab?: (buildingNumber: number, taxRegion: string, assetIds?: string[]) => void;
  onCloseTabAndOpenMultiTax?: (buildingNumber: number) => void;
  onCloseTab?: () => void;
  isErrorFixingMode?: boolean; // When true, hide all buttons except Validate, Save, Save as new, and Cancel
}

export interface AssetsListRef {
  hasUnsavedChanges: () => boolean;
}

export const AssetsList = forwardRef<AssetsListRef, AssetsListProps>(({ buildingNumber, taxRegion, onSelectAsset, onOpenTransferAreas, onOpenNewAsset, selectedAssetIds, onOpenAssetsTab, onCloseTabAndOpenMultiTax, onCloseTab, isErrorFixingMode = false }, ref) => {
  const { t } = useTranslation();
  const { validationRules } = useValidationRules(); // Get validation rules from context
  const [assets, setAssets] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [buildingAddress, setBuildingAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [dirtyAssets, setDirtyAssets] = useState<Map<string, Partial<Asset>>>(new Map());
  const [newAssets, setNewAssets] = useState<Set<string>>(new Set());
  const [deletedAssets, setDeletedAssets] = useState<Set<string>>(new Set());
  const [originalAssets, setOriginalAssets] = useState<Asset[]>([]);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const gridRef = useRef<AgGridReact<Asset>>(null);
  
  // Grid preferences hook for saving/loading column state
  const gridPreferences = useGridPreferences(
    gridRef,
    'assets-list',
    'default'
  );
  
  const [showBatchValidationModal, setShowBatchValidationModal] = useState(false);
  const [batchValidationLoading, setBatchValidationLoading] = useState(false);
  const [batchValidationProgress, setBatchValidationProgress] = useState<ValidationProgress | null>(null);
  const [batchValidationResults, setBatchValidationResults] = useState<BatchValidationResults | null>(null);
  const [uploadingAssetId, setUploadingAssetId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ assetId: number; progress: number; fileName: string } | null>(null);
  const [selectedDrawingUrl, setSelectedDrawingUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileViewerClosing, setFileViewerClosing] = useState(false);
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const isRefreshingAfterSaveRef = useRef<boolean>(false);
  // Track assets that were just saved to prevent re-marking them as dirty in fetchData
  const recentlySavedAssetsRef = useRef<Set<string>>(new Set());
  const [distributionModalOpen, setDistributionModalOpen] = useState(false);
  const [distributionResult, setDistributionResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'assets' | 'distribution-history' | 'transfer-history'>('assets');
  const [distributionHistoryCount, setDistributionHistoryCount] = useState<number>(0);
  const [transferHistoryCount, setTransferHistoryCount] = useState<number>(0);
  const [changeTaxRegionModalOpen, setChangeTaxRegionModalOpen] = useState(false);
  
  // Save tax region in a variable for validation handler
  // This ensures the validation handler uses the tax region from the tab, not the building's tax regions
  const validationTaxRegion = useMemo(() => {
    const result = taxRegion && taxRegion.trim() !== '' ? taxRegion.trim() : undefined;
    // Return taxRegion if it exists and is not empty, otherwise undefined
    return result;
  }, [taxRegion, buildingNumber]);

  // Helper function to check if an asset type is non_accountable_for_total_area
  const isAssetTypeNotAccountableForTotalArea = useCallback((assetTypeName: string | null | undefined): boolean => {
    if (!assetTypeName || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Find asset type by name - ensure both are strings for comparison
    const assetTypeNameStr = String(assetTypeName).trim();
    const assetType = assetTypes.find(at => String(at.name).trim() === assetTypeNameStr);
    return assetType?.non_accountable_for_total_area === true;
  }, [assetTypes]);

  // Helper function to check if an asset is non_accountable_for_total_area
  const isAssetNotAccountableForTotalArea = useCallback((asset: Asset): boolean => {
    if (!asset || !asset.main_asset_type) {
      return false;
    }
    return isAssetTypeNotAccountableForTotalArea(asset.main_asset_type);
  }, [isAssetTypeNotAccountableForTotalArea]);

  // Helper function to check if an asset type is non_accountable_for_distribution
  const isAssetTypeNotAccountableForDistribution = useCallback((assetTypeName: string | null | undefined): boolean => {
    if (!assetTypeName || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Find asset type by name - ensure both are strings for comparison
    const assetTypeNameStr = String(assetTypeName).trim();
    const assetType = assetTypes.find(at => String(at.name).trim() === assetTypeNameStr);
    return assetType?.non_accountable_for_distribution === true;
  }, [assetTypes]);

  // Helper function to check if an asset is non_accountable_for_distribution
  const isAssetNotAccountableForDistribution = useCallback((asset: Asset): boolean => {
    if (!asset || !asset.main_asset_type) {
      return false;
    }
    return isAssetTypeNotAccountableForDistribution(asset.main_asset_type);
  }, [isAssetTypeNotAccountableForDistribution]);

  // Helper function to check if an asset has at least one type (main or subtype) that is accountable for distribution
  // An asset is valid for distribution if it has at least one type where non_accountable_for_distribution === false
  const hasAtLeastOneAccountableTypeForDistribution = useCallback((asset: Asset): boolean => {
    if (!asset || !assetTypes || assetTypes.length === 0) {
      return false;
    }

    // Check main asset type
    if (asset.main_asset_type) {
      const mainTypeStr = String(asset.main_asset_type).trim();
      const mainAssetType = assetTypes.find(at => String(at.name).trim() === mainTypeStr);
      if (mainAssetType && mainAssetType.non_accountable_for_distribution !== true) {
        return true; // Main type is accountable
      }
    }

    // Check all subtypes (1-6)
    for (let i = 1; i <= 6; i++) {
      const subTypeField = `sub_asset_type_${i}` as keyof Asset;
      const subType = asset[subTypeField] as string | undefined;
      if (subType && subType.trim() !== '') {
        const subTypeStr = String(subType).trim();
        const subAssetType = assetTypes.find(at => String(at.name).trim() === subTypeStr);
        if (subAssetType && subAssetType.non_accountable_for_distribution !== true) {
          return true; // At least one subtype is accountable
        }
      }
    }

    // No accountable types found
    return false;
  }, [assetTypes]);

  // Helper function to check if a field should be editable
  // For non-accountable assets, all fields are readonly (main_asset_type is readonly in all tabs except TransferAreas)
  const isFieldEditable = useCallback((params: any, fieldName: string): boolean => {
    if (!params || !params.data) return false;
    const asset = params.data as Asset;
    const assetId = String(asset.asset_id);
    const baseEditable = newAssets.has(assetId) || !!taxRegion;
    
    // For non-accountable assets, all fields are readonly (including main_asset_type)
    if (isAssetNotAccountableForTotalArea(asset)) {
      return false;
    }
    
    return baseEditable;
  }, [isAssetNotAccountableForTotalArea, newAssets, taxRegion]);

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
  
  // Calculate total changes: new assets count as 1 each, even if edited
  // Edited existing assets (not in newAssets) + new assets + deleted assets
  // Check if there are any assets with previous residence distribution
  const hasPreviousResidenceDistribution = useMemo(() => {
    if (!assets || assets.length === 0) return false;
    // Check if any residential assets have area_from_distribution > 0
    // Residence distribution now uses area_from_distribution (same as business)
    return assets.some(asset => {
      const areaFromDist = asset.area_from_distribution || 0;
      return areaFromDist > 0;
    });
  }, [assets]);

  // Check if there are any assets with previous business distribution
  const hasPreviousBusinessDistribution = useMemo(() => {
    if (!assets || assets.length === 0) return false;
    // Check if any business assets have area_from_distribution > 0
    return assets.some(asset => {
      const areaFromDist = asset.area_from_distribution || 0;
      return areaFromDist > 0;
    });
  }, [assets]);

  const totalChanges = useMemo(() => {
    let editedExistingAssets = 0;
    for (const assetId of dirtyAssets.keys()) {
      if (!newAssets.has(String(assetId))) {
        editedExistingAssets++;
      }
    }
    return newAssets.size + editedExistingAssets + deletedAssets.size;
  }, [newAssets, dirtyAssets, deletedAssets]);

  // Check if there are any validation errors for assets that have changes
  const hasValidationErrors = useMemo(() => {
    // Check validation errors for dirty assets (edited existing assets)
    for (const assetId of dirtyAssets.keys()) {
      if (validationErrors.has(String(assetId))) {
        return true;
      }
    }
    // Check validation errors for new assets
    for (const assetId of newAssets) {
      if (validationErrors.has(String(assetId))) {
        return true;
      }
    }
    return false;
  }, [validationErrors, dirtyAssets, newAssets]);

  // Expose hasUnsavedChanges via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => totalChanges > 0
  }), [totalChanges]);
  
  useEffect(() => {
    fetchData();
  }, [buildingNumber, taxRegion]);

  // Clear selection when switching tabs (buildingNumber or taxRegion changes)
  useEffect(() => {
    setSelectedAssets(new Set());
  }, [buildingNumber, taxRegion]);
  async function fetchData(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      // Use cached asset types from validation (faster, no API call)
      const { getAssetTypes } = await import('../lib/validation');
      const cachedAssetTypes = getAssetTypes();
      const [buildingData, assetsData] = await Promise.all([
        api.buildings.getOne(buildingNumber),
        api.assets.getAll(buildingNumber)
      ]);
      setBuilding(buildingData);
      setAssetTypes(cachedAssetTypes.length > 0 ? cachedAssetTypes : await api.assetTypes.getAll());
      
      // Fetch building address if building_address exists
      if (buildingData?.building_address) {
        try {
          const address = await api.addressList.getOne(buildingData.building_address);
          setBuildingAddress(address.street_description);
        } catch (err) {
          console.error('Error fetching building address:', err);
          setBuildingAddress(null);
        }
      } else {
        setBuildingAddress(null);
      }
      
      // Log initial fetch results
      const assetTypesCount = cachedAssetTypes.length > 0 ? cachedAssetTypes.length : (await api.assetTypes.getAll()).length;
      console.log(`[AssetsList] Fetched data for building ${buildingNumber}:`, {
        assetsCount: (assetsData || []).length,
        assetTypesCount,
        taxRegion,
        buildingExists: !!buildingData
      });
      
      // Filter by tax region according to tab's tax region
      // If selectedAssetIds is provided (e.g., in error fixing mode), include those assets even if tax_region doesn't match
      let filteredAssets = assetsData || [];
      const selectedAssetIdsSet = selectedAssetIds && selectedAssetIds.length > 0 
        ? new Set(selectedAssetIds.map(id => String(id)))
        : null;
      
      if (taxRegion && taxRegion.trim() !== '') {
        const taxRegionNum = parseInt(taxRegion.trim());
        const taxRegionStr = taxRegion.trim();
        
        console.log(`[AssetsList] Filtering assets by tab tax region:`, {
          requestedTaxRegion: taxRegion,
          taxRegionNum,
          taxRegionStr,
          totalAssetsBeforeFilter: (assetsData || []).length,
          hasSelectedAssetIds: !!selectedAssetIdsSet
        });
        
        filteredAssets = [];
        let skippedNoTaxRegion = 0;
        let matched = 0;
        let includedFromSelectedIds = 0;
        
        for (const asset of assetsData || []) {
          // Use asset.tax_region directly from the asset
          const assetTaxRegion = asset.tax_region;
          const assetIdStr = String(asset.asset_id);
          
          // If this asset is in selectedAssetIds, include it even if tax_region doesn't match
          // This is needed for error fixing mode when changing tax regions
          if (selectedAssetIdsSet && selectedAssetIdsSet.has(assetIdStr)) {
            filteredAssets.push(asset);
            includedFromSelectedIds++;
            continue;
          }
          
          if (assetTaxRegion == null) {
            skippedNoTaxRegion++;
            continue;
          }
          
          // Check if the asset's tax_region matches the requested taxRegion
          const assetTaxRegionNum = typeof assetTaxRegion === 'string' 
            ? parseInt(assetTaxRegion, 10) 
            : assetTaxRegion;
          const taxRegionMatches = assetTaxRegionNum === taxRegionNum || String(assetTaxRegionNum) === taxRegionStr;
          
          if (taxRegionMatches) {
            matched++;
            filteredAssets.push(asset);
          } else {
            // Log why asset was filtered out for debugging
            console.log(`[AssetsList] Asset filtered out (tax region mismatch):`, {
              asset_id: asset.asset_id,
              assetTaxRegion: assetTaxRegionNum,
              requestedTaxRegion: taxRegion,
              building_number: asset.building_number
            });
          }
        }
        
        console.log(`[AssetsList] Filtering results:`, {
          matched,
          skippedNoTaxRegion,
          includedFromSelectedIds,
          filteredCount: filteredAssets.length,
          totalAssetsBeforeFilter: (assetsData || []).length,
          sampleMatched: filteredAssets[0] ? {
            asset_id: filteredAssets[0].asset_id,
            tax_region: filteredAssets[0].tax_region
          } : null,
          sampleSkipped: (assetsData || []).find(a => a.tax_region == null) ? {
            asset_id: (assetsData || []).find(a => a.tax_region == null)?.asset_id,
            tax_region: (assetsData || []).find(a => a.tax_region == null)?.tax_region
          } : null
        });
        
        // Always filter strictly by tax region - no fallback to all assets
        // This ensures the list is always according to the tab's tax region
        if (filteredAssets.length === 0 && (assetsData || []).length > 0) {
          const assetTaxRegions = (assetsData || []).map(a => a.tax_region).filter(tr => tr != null);
          console.warn(`[AssetsList] Tax region filter resulted in 0 assets. This tab will show no assets.`, {
            requestedTaxRegion: taxRegion,
            totalAssets: (assetsData || []).length,
            assetTaxRegions: [...new Set(assetTaxRegions)]
          });
          // Keep filteredAssets as empty array - strict filtering by tab tax region
        }
      } else {
        // No tax region specified - show all assets (for "all assets" tab)
        console.log(`[AssetsList] No tax region filter - showing all assets:`, {
          totalAssets: (assetsData || []).length
        });
      }
      
      // Additional filter: if selectedAssetIds is provided, filter to only show those assets
      // This is applied after tax region filtering (if any)
      // Note: Assets from selectedAssetIds are already included in tax region filtering above
      if (selectedAssetIds && selectedAssetIds.length > 0 && selectedAssetIdsSet) {
        filteredAssets = filteredAssets.filter(asset => 
          selectedAssetIdsSet.has(String(asset.asset_id))
        );
        console.log(`[AssetsList] Filtered to ${filteredAssets.length} assets with selected asset IDs`);
      }
      
      // If in error fixing mode with selectedAssetIds and taxRegion, update assets' tax_region to match the tab's tax region
      // This ensures assets are displayed with the new tax region before they're saved
      // BUT: Don't re-mark as dirty if these assets were just saved (they're in recentlySavedAssetsRef)
      if (isErrorFixingMode && selectedAssetIds && selectedAssetIds.length > 0 && taxRegion && taxRegion.trim() !== '') {
        const newTaxRegion = parseInt(taxRegion.trim(), 10);
        if (!isNaN(newTaxRegion)) {
          filteredAssets = filteredAssets.map(asset => {
            if (selectedAssetIdsSet && selectedAssetIdsSet.has(String(asset.asset_id))) {
              const assetId = String(asset.asset_id);
              const updatedAsset = {
                ...asset,
                tax_region: newTaxRegion
              };
              
              // Only track as dirty if this asset wasn't just saved
              // This prevents re-marking assets as dirty after a successful save
              if (!recentlySavedAssetsRef.current.has(assetId)) {
                // Track the tax_region change as a dirty change so it gets saved
                setDirtyAssets(prev => {
                  const newMap = new Map(prev);
                  const existing = newMap.get(assetId) || {};
                  newMap.set(assetId, { ...existing, tax_region: newTaxRegion });
                  return newMap;
                });
              } else {
                console.log(`[AssetsList] Skipping dirty mark for asset ${assetId} - was just saved`);
              }
              
              return updatedAsset;
            }
            return asset;
          });
          console.log(`[AssetsList] Updated tax_region to ${newTaxRegion} for ${filteredAssets.length} assets in error fixing mode`);
        }
      }
      
      // Ensure all assets have valid IDs
      const validFilteredAssets = (filteredAssets || []).filter(asset => {
        if (!asset) return false;
        if (asset.asset_id === undefined || asset.asset_id === null) {
          console.warn('[AssetsList] Asset missing asset_id:', asset);
          return false;
        }
        return true;
      });
      
      // Preserve new assets that haven't been saved yet (failed saves remain visible)
      const existingNewAssets = assets.filter(a => {
        if (!a || a.asset_id === undefined || a.asset_id === null) return false;
        return newAssets.has(String(a.asset_id));
      });
      const mergedAssets = [...validFilteredAssets, ...existingNewAssets];
      
      console.log(`[AssetsList] Setting assets:`, {
        validFilteredCount: validFilteredAssets.length,
        existingNewAssetsCount: existingNewAssets.length,
        totalAssets: mergedAssets.length,
        buildingNumber,
        taxRegion,
        sampleAsset: mergedAssets[0] ? {
          asset_id: mergedAssets[0].asset_id,
          main_asset_type: mergedAssets[0].main_asset_type
        } : null
      });
      
      // Update assets state - use AG Grid transaction API for smoother updates when refreshing after save
      // This preserves scroll position and selection better than full rowData replacement
      if (gridRef.current?.api && isRefreshingAfterSaveRef.current && assets.length > 0) {
        // Use transaction API for incremental updates after save
        // This is smoother and preserves UI state better
        const currentAssetIds = new Set(assets.map(a => String(a.asset_id)));
        const newAssetIds = new Set(mergedAssets.map(a => String(a.asset_id)));
        
        // Find added, updated, and removed assets
        const toAdd = mergedAssets.filter(a => !currentAssetIds.has(String(a.asset_id)));
        const toUpdate = mergedAssets.filter(a => {
          const existing = assets.find(ca => String(ca.asset_id) === String(a.asset_id));
          return existing && JSON.stringify(existing) !== JSON.stringify(a);
        });
        const toRemove = assets.filter(a => !newAssetIds.has(String(a.asset_id)));
        
        // Apply transaction for smoother update (only if there are actual changes)
        if (toAdd.length > 0 || toUpdate.length > 0 || toRemove.length > 0) {
          try {
            gridRef.current.api.applyTransaction({
              add: toAdd,
              update: toUpdate,
              remove: toRemove
            });
            // Still update state for consistency
            setAssets(mergedAssets);
            return; // Early return to skip the setAssets call below
          } catch (err) {
            console.warn('[AssetsList] Transaction API failed, falling back to full update:', err);
            // Fall through to regular setAssets
          }
        } else {
          // No changes detected, just update state
          setAssets(mergedAssets);
          return;
        }
      }
      
      // Regular update for initial load or when transaction API isn't available
      setAssets(mergedAssets);
      
      // Store original assets for cancel functionality
      // Update originalAssets whenever we load fresh data and there are no pending changes
      // This ensures cancel button always has the correct baseline
      if (dirtyAssets.size === 0 && newAssets.size === 0 && deletedAssets.size === 0) {
        setOriginalAssets(JSON.parse(JSON.stringify(mergedAssets)));
      } else {
        // Even if there are pending changes, update originalAssets with the fresh data
        // This ensures that after save/delete operations, cancel will restore to the last saved state
        // We only skip updating if we're in the middle of editing
        const hasActiveChanges = dirtyAssets.size > 0 || newAssets.size > 0 || deletedAssets.size > 0;
        // Only update if we explicitly want to (like after a save operation that refreshed data)
        // This is handled separately in handleSaveAll after fetchData
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      if (showLoading) setLoading(false);
    }
  }
  // Debounce timer for validation
  const validationTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

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
    // Skip validation if we're currently refreshing after save (prevents unnecessary API calls)
    // This is critical - when fetchData updates assets state, AG Grid may trigger this event
    // for cells that have changed values, even though the user didn't edit them
    if (isRefreshingAfterSaveRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AssetsList.onCellValueChanged] Skipping validation - refreshing after save', {
          assetId: event.data?.asset_id,
          field: event.colDef?.field,
          newValue: event.newValue
        });
      }
      // Still update the local state to reflect the change, but skip validation
      const { data, colDef } = event;
      const field = colDef.field;
      const assetId = String(data.asset_id);
      let newValue = event.newValue;

      // Normalize empty values: set to null for strings, 0 for numbers
      if (newValue === '' || newValue === null || newValue === undefined) {
        // Check if this is a numeric field based on column type
        const isNumericField = colDef.type === 'numericColumn' || 
          field === 'asset_size' || 
          field?.startsWith('sub_asset_size_') || 
          field === 'floor' || 
          field === 'tax_region';
        
        if (isNumericField) {
          newValue = 0;
        } else {
          newValue = null;
        }
      }

      const updatedAsset = { ...data, [field]: newValue };
      
      // Even during refresh, if user manually changes a field, mark it as dirty
      // This ensures user edits are not lost during refresh
      setDirtyAssets(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(assetId) || {};
        const changesToStore = { ...existing, [field]: newValue };
        newMap.set(assetId, changesToStore);
        return newMap;
      });
      
      // Update assets state without triggering validation
      setAssets(prevAssets =>
        prevAssets.map(asset =>
          String(asset.asset_id) === String(assetId) ? updatedAsset : asset
        )
      );
      return;
    }
    
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const assetId = String(data.asset_id);
      let newValue = event.newValue;

      // Normalize empty values: set to null for strings, 0 for numbers
      if (newValue === '' || newValue === null || newValue === undefined) {
        // Check if this is a numeric field based on column type
        const isNumericField = colDef.type === 'numericColumn' || 
          field === 'asset_size' || 
          field?.startsWith('sub_asset_size_') || 
          field === 'floor' || 
          field === 'tax_region';
        
        if (isNumericField) {
          newValue = 0;
        } else {
          newValue = null;
        }
      }

      // Create updated asset with new value
      let updatedAsset = { ...data, [field]: newValue };

      // Handle main_asset_type changes - validate non_accountable flags and tax region compatibility
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
          const assetTaxRegion = data.tax_region != null ? String(data.tax_region) : validationTaxRegion;
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
                  newMap.set(assetId, errorMsg);
                  return newMap;
                });
                event.api.refreshCells({ rowNodes: [event.node!], force: true });
                // Revert the change by resetting the cell value
                const rowNode = event.api.getRowNode(assetId);
                if (rowNode) {
                  rowNode.setDataValue(field, data[field]);
                }
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
        } else {
          // Asset type not found - show error (full validation will catch this later, but show immediate feedback)
          const errorMsg = `סוג נכס ${newAssetTypeName} לא נמצא`;
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            newMap.set(assetId, errorMsg);
            return newMap;
          });
          event.api.refreshCells({ rowNodes: [event.node!], force: true });
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

      // Update the assets state immediately (no debounce)
      setAssets(prevAssets =>
        prevAssets.map(asset =>
          String(asset.asset_id) === String(assetId) ? updatedAsset : asset
        )
      );

      // If area_from_distribution was automatically set to 0 due to non_accountable_for_distribution change, refresh that cell
      if (field === 'main_asset_type' && updatedAsset.area_from_distribution !== data.area_from_distribution && event.api) {
        event.api.refreshCells({ 
          rowNodes: [event.node!], 
          columns: ['area_from_distribution'],
          force: true 
        });
      }

      // Distribution flags are set in the database during the transaction save,
      // not when the field changes in the UI. This ensures flags are only set
      // when data is actually saved.

      // Skip validation if asset is not_accountable - skip ALL validations including quick ones
      if (isAssetNotAccountableForTotalArea(updatedAsset)) {
        // Clear existing validation timer for this asset
        const existingTimer = validationTimerRef.current.get(String(assetId));
        if (existingTimer) {
          clearTimeout(existingTimer);
          validationTimerRef.current.delete(String(assetId));
        }
        // Clear validation errors for this asset
        setValidationErrors(prev => {
          const newMap = new Map(prev);
          newMap.delete(assetId);
          return newMap;
        });
        event.api.refreshCells({ rowNodes: [event.node!], force: true });
        return;
      }

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
            newMap.set(String(assetId), dateValidation.error || 'Invalid date format');
            return newMap;
          });
          event.api.refreshCells({ rowNodes: [event.node!], force: true });
          return;
        }
      }

      // Quick synchronous validation for discount dates
      const discountFields = ['discount_type', 'discount_date_from', 'discount_date_to'];
      if (discountFields.includes(field)) {
        const discountErrors = validateDiscountDates(updatedAsset);
        if (discountErrors.length > 0) {
          const errorMessage = discountErrors.join('\n');
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            newMap.set(String(assetId), errorMessage);
            return newMap;
          });
          event.api.refreshCells({ rowNodes: [event.node!], force: true });
        } else {
          // Clear discount errors if validation passes (but keep other errors)
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            const existingError = newMap.get(String(assetId));
            if (existingError) {
              // Check if there are other errors (not discount-related)
              // For now, we'll clear all errors - the debounced validation will set them again if needed
              // This is fine since the debounced validation will run anyway
            }
            return newMap;
          });
        }
      }

      // Debounce expensive database validations (500ms delay)
      // This prevents validation from running on every keystroke
      const timer = setTimeout(async () => {
        try {
          // Prepare cached data for validation (all data is already in memory)
          const cachedData = {
            assetTypes: assetTypes || [],
            building: building
          };

          // Debug logging for tax region validation
          if (process.env.NODE_ENV === 'development') {
            console.log('[AssetsList.onCellValueChanged] Validation parameters:', {
              field,
              assetId: updatedAsset.asset_id,
              buildingNumber: updatedAsset.building_number,
              validationTaxRegion: validationTaxRegion || 'NOT PROVIDED (will use building tax_region)',
              buildingTaxRegion: building?.tax_region || 'NOT SET'
            });
          }

          // Use the same validation as the validate button - AssetValidationHandler.validateSingleAsset
          // This ensures consistent validation behavior across all components
          const result = await AssetValidationHandler.validateSingleAsset(updatedAsset, {
            taxRegion: validationTaxRegion, // Use validationTaxRegion from tab - same as batch validate
            cachedData: cachedData
          });

          // Add discount validation errors
          const discountErrors = validateDiscountDates(updatedAsset);
          const allErrors = [...(result.errors || []), ...discountErrors];

          // Recalculate actualValid from results - same as handleBatchValidateBuildingAssets
          // This ensures consistency: an asset is only valid if valid=true AND no errors
          const actualValid = result.valid && allErrors.length === 0;

          // Update validationErrors state to reflect validation results
          // Note: AssetsList uses Map<string, string> where the value is a joined error string
          if (actualValid) {
            // Validation passed - clear errors for this asset
            setValidationErrors(prev => {
              const newMap = new Map(prev);
              newMap.delete(String(assetId));
              return newMap;
            });
            // Refresh the grid cells to clear validation styling
            event.api.refreshCells({ rowNodes: [event.node!], force: true });
          } else if (allErrors.length > 0) {
            // Validation failed - set errors for this asset (join multiple errors with newline)
            const errorMessage = allErrors.join('\n');
            setValidationErrors(prev => {
              const newMap = new Map(prev);
              newMap.set(String(assetId), errorMessage);
              return newMap;
            });
            // Refresh the grid cells to show validation styling
            event.api.refreshCells({ rowNodes: [event.node!], force: true });
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
  }, [validationTaxRegion, assetTypes, building, setAssets, taxRegion]);

  async function handleBatchValidateBuildingAssets() {
    setShowBatchValidationModal(true);
    setBatchValidationLoading(true);
    setBatchValidationResults(null);
    setBatchValidationProgress(null);

    try {
      // Use the assets currently displayed in the grid (not fetching from API)
      // This ensures we validate exactly what the user sees in the grid
      // These assets are already filtered by tax region and exclude historical records
      const gridAssets = assets || [];
      
      console.log(`[Batch Validation] Using assets from grid: ${gridAssets.length} assets`, {
        buildingNumber,
        taxRegion: taxRegion || 'all',
        sampleAssetIds: gridAssets.slice(0, 3).map(a => ({ asset_id: a.asset_id, tax_region: a.tax_region }))
      });

      // IMPORTANT: Filter out historical records - only validate latest measurements (is_latest === true)
      // Historical records (is_latest === false) should NOT be validated
      // Also filter out non-accountable assets - they should NOT be validated
      let latestAssets = gridAssets.filter(asset => {
        // If is_latest is not explicitly set, assume it's latest (for backward compatibility)
        if (asset.is_latest === false) return false;
        
        // Skip non-accountable assets - they should not be validated
        if (isAssetNotAccountableForTotalArea(asset)) return false;
        
        return true;
      });
      console.log(`[Batch Validation] Filtered to latest only: ${latestAssets.length} out of ${gridAssets.length} assets (excluded ${gridAssets.length - latestAssets.length} historical records)`);
      
      // Pre-fetch required supporting data (asset types and building data)
      const [assetTypesData, buildingData] = await Promise.all([
        api.assetTypes.getAll(),
        api.buildings.getOne(buildingNumber).catch(() => null)
      ]);

      // If assets are selected, only validate selected ones; otherwise validate all
      let assetsToValidate: Asset[];
      if (selectedAssets.size > 0) {
        // Filter to only selected assets - match by asset_id (stored in selectedAssets)
        // selectedAssets contains asset.asset_id (primary key), not database id
        assetsToValidate = latestAssets.filter(asset => {
          const assetIdKey = String(asset.asset_id);
          return selectedAssets.has(assetIdKey);
        });
        console.log(`[Batch Validation] Selected assets count: ${selectedAssets.size}, Grid assets count: ${latestAssets.length}, Assets to validate: ${assetsToValidate.length}`);
        console.log(`[Batch Validation] Selected asset IDs:`, Array.from(selectedAssets));
        console.log(`[Batch Validation] Assets to validate asset IDs:`, assetsToValidate.map(a => String(a.asset_id)));
      } else {
        // Validate all assets shown in the grid
        assetsToValidate = latestAssets;
        console.log(`[Batch Validation] Validating all ${assetsToValidate.length} assets from grid`);
      }

      // Apply dirty changes to assets before validating (so we validate the current edited state)
      assetsToValidate = assetsToValidate.map(asset => {
        const dirtyChanges = dirtyAssets.get(String(asset.asset_id));
        if (dirtyChanges) {
          return { ...asset, ...dirtyChanges };
        }
        return asset;
      });

      // Check if there are any assets to validate
      if (assetsToValidate.length === 0) {
        console.warn(`[Batch Validation] No assets to validate. Grid assets: ${gridAssets.length}, Latest assets: ${latestAssets.length}, Selected: ${selectedAssets.size}`);
        setBatchValidationLoading(false);
        setShowBatchValidationModal(false);
        setError('לא נמצאו נכסים לבדיקה. יש לוודא שנכסים מוצגים בטבלה.');
        setTimeout(() => setError(null), 5000);
        return;
      }

      console.log(`[Batch Validation] Found ${assetsToValidate.length} assets to validate for building ${buildingNumber}`, {
        taxRegion: taxRegion || 'NOT PROVIDED (will use asset.tax_region from each asset)',
        buildingNumber,
        selectedCount: selectedAssets.size,
        validatingSelected: selectedAssets.size > 0,
        dirtyAssetsCount: dirtyAssets.size,
        gridAssetsCount: gridAssets.length,
        note: 'Each asset will be validated using its own tax_region field, not calculated from asset types'
      });

      // Prepare cached data for validation (all data is already in memory)
      const cachedData = {
        assetTypes: assetTypesData || [],
        building: buildingData
      };

      // Use unified validation handler
      // Pass taxRegion if we're in a specific tab (not "all assets")
      // This ensures validation checks:
      // 1. Asset's tax_region matches tab tax region (if tab is specific)
      // 2. Asset's tax_region is one of building's tax regions (if tab is "all")
      // 3. Asset type's tax_region matches asset's tax_region
      // Note: We already filtered out historical records (is_latest !== true) above, so validateOnlyLatest is not needed
      const batchResult = await AssetValidationHandler.validateBuildingAssets(
        assetsToValidate,
        buildingNumber,
        {
          mode: 'building',
          validateOnlyLatest: false, // Not needed - we already filtered by is_latest === true above
          taxRegion: taxRegion || undefined, // Pass taxRegion to validate against tab's tax region (if specific tab)
          cachedData: cachedData, // Pass cached data to avoid database queries (asset is added per-validation)
          validationRules: validationRules, // Pass validation rules to avoid loading from DB
          onProgress: (progress) => {
            setBatchValidationProgress({
              current: progress.current,
              total: progress.total,
              currentAssetId: progress.currentAsset || undefined
            });
          }
        }
      );

      // Add discount validation errors to each result
      const resultsWithDiscountErrors = batchResult.results.map(result => {
        // Find the corresponding asset to validate discount dates
        const asset = assetsToValidate.find(a => {
          const assetIdentifier = `נכס ${a.asset_id}${a.building_number ? ` (מבנה ${a.building_number})` : ''}`;
          return result.assetId === assetIdentifier || result.assetId === String(a.asset_id);
        });
        
        if (asset) {
          const discountErrors = validateDiscountDates(asset);
          if (discountErrors.length > 0) {
            const allErrors = [...(result.errors || []), ...discountErrors];
            const actualValid = result.valid && allErrors.length === 0;
            return {
              ...result,
              errors: allErrors,
              valid: actualValid
            };
          }
        }
        return result;
      });

      // Map unified handler results to the expected format
      // Include ALL results (both valid and invalid) in the errors array
      // The modal will filter them based on the selected filter (all/valid/invalid)
      // Verify counters match the results
      const actualValid = resultsWithDiscountErrors.filter(r => r.valid && (!r.errors || r.errors.length === 0)).length;
      const actualInvalid = resultsWithDiscountErrors.filter(r => !r.valid || (r.errors && r.errors.length > 0)).length;
      const actualTotal = resultsWithDiscountErrors.length;
      
      console.log(`[Batch Validation] Handler returned: total=${batchResult.total}, valid=${batchResult.valid}, invalid=${batchResult.invalid}, results.length=${batchResult.results.length}`);
      console.log(`[Batch Validation] Recalculated: actualTotal=${actualTotal}, actualValid=${actualValid}, actualInvalid=${actualInvalid}`);
      
      // Map ALL results (both valid and invalid) - the modal will filter them
      const results = {
        total: actualTotal, // Use actual count from results array
        valid: actualValid,  // Recalculate from results
        invalid: actualInvalid, // Recalculate from results
        errors: resultsWithDiscountErrors.map(result => {
          // Find the asset to get its database ID
          const asset = assetsToValidate.find(a => {
            const assetIdentifier = `נכס ${a.asset_id}${a.building_number ? ` (מבנה ${a.building_number})` : ''}`;
            return result.assetId === assetIdentifier || result.assetId === String(a.asset_id);
          });
          return {
            assetId: String(result.assetId),
            assetDbId: asset ? String(asset.asset_id) : undefined,
            buildingNumber: asset?.building_number || buildingNumber,
            errors: result.errors || [], // Ensure errors is always an array
            passed: result.passed,
            matchedAssetTypeRecord: result.matchedAssetTypeRecord
          };
        })
      };

      setBatchValidationResults(results);
      console.log(`[Batch Validation] Final results: ${results.valid} valid, ${results.invalid} invalid out of ${results.total} total (${results.errors.length} errors in errors array)`);

      // Mark invalid assets in the grid
      if (results.errors.length > 0) {
        const newValidationErrors = new Map<string, string>();

        // Mark each invalid asset using database ID if available, otherwise fall back to asset_id lookup
        for (const errorInfo of results.errors) {
          // Only mark assets that have errors
          if (errorInfo.errors && errorInfo.errors.length > 0) {
            let dbId = errorInfo.assetDbId ? String(errorInfo.assetDbId) : null;
            
            // If no database ID, try to find it by asset_id
            if (!dbId) {
              const asset = assets.find(a => String(a.asset_id) === String(errorInfo.assetId));
              if (asset) {
                dbId = String(asset.asset_id);
              }
            }
            
            if (dbId) {
              // Combine all errors into a single error message
              const errorMessage = errorInfo.errors.join('; ');
              newValidationErrors.set(dbId, errorMessage);
              console.log(`[Batch Validation] Setting validation error for asset ${dbId}:`, errorMessage);
            } else {
              console.warn(`[Batch Validation] Could not find asset for error:`, errorInfo);
            }
          }
        }

        console.log(`[Batch Validation] Setting ${newValidationErrors.size} validation errors:`, Array.from(newValidationErrors.keys()));
        
        // Set validation errors in state
        setValidationErrors(newValidationErrors);

        // Refresh grid to show the validation errors - specifically refresh actions column and row styling
        if (gridRef.current?.api) {
          // Force refresh of all cells, especially actions column
          gridRef.current.api.refreshCells({ 
            columns: ['actions'],
            force: true 
          });
          // Also refresh all cells to update row styling
          setTimeout(() => {
            if (gridRef.current?.api) {
              gridRef.current.api.refreshCells({ force: true });
            }
          }, 100);
        }
      } else {
        // Clear validation errors if all assets are valid
        console.log('[Batch Validation] All assets valid, clearing validation errors');
        setValidationErrors(new Map());
      }
    } catch (error) {
      console.error('Error during batch validation:', error);
      setBatchValidationResults({
        total: 0,
        valid: 0,
        invalid: 0,
        errors: [{
          assetId: 'N/A',
          buildingNumber: buildingNumber,
          errors: [`שגיאה בביצוע אימות: ${error instanceof Error ? error.message : 'Unknown error'}`]
        }]
      });
    } finally {
      setBatchValidationLoading(false);
    }
  }

  // Track if we've already auto-validated for the current assets to prevent loops
  const autoValidatedRef = useRef<string>('');
  const isAutoValidatingRef = useRef<boolean>(false);
  
  // Memoize asset IDs key to prevent unnecessary re-renders
  const assetIdsKey = useMemo(() => {
    return assets.map(a => String(a.asset_id)).sort().join(',');
  }, [assets]);
  
  // Auto-validate assets when loaded in error fixing mode (only once per asset set)
  useEffect(() => {
    // Don't run if already validating or if conditions aren't met
    // Note: We check batchValidationLoading but don't include it in deps to prevent loops
    if (!isErrorFixingMode || assets.length === 0 || !taxRegion || loading || batchValidationLoading || isAutoValidatingRef.current) {
      return;
    }
    
    // Create a unique key for this validation run based on asset IDs and tax region
    const validationKey = `${buildingNumber}-${taxRegion}-${assetIdsKey}`;
    
    // Only validate if we haven't already validated this exact set of assets
    if (autoValidatedRef.current === validationKey) {
      return; // Already validated this exact set
    }
    
    console.log('[AssetsList] Auto-validating assets in error fixing mode:', {
      isErrorFixingMode,
      assetsCount: assets.length,
      taxRegion,
      validationKey
    });
    
    // Mark that we're about to validate this set
    autoValidatedRef.current = validationKey;
    isAutoValidatingRef.current = true;
    
    // Validate assets automatically when in error fixing mode
    // Use a small delay to ensure assets are fully rendered
    const timer = setTimeout(async () => {
      try {
        await handleBatchValidateBuildingAssets();
      } catch (error) {
        console.error('[AssetsList] Error in auto-validation:', error);
      } finally {
        // Reset the flag after validation completes
        isAutoValidatingRef.current = false;
      }
    }, 500);
    
    return () => {
      clearTimeout(timer);
      // Don't reset isAutoValidatingRef here - let it complete naturally
    };
    // Only depend on stable values - exclude batchValidationLoading to prevent loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isErrorFixingMode, taxRegion, loading, buildingNumber, assetIdsKey]);

  const handleExportInvalidAssetsToFile = useCallback(() => {
    if (!batchValidationResults || batchValidationResults.errors.length === 0) {
      return;
    }

    // Create File header
    const headers = ['מזהה מבנה', 'מזהה נכס', 'שגיאות'];
    const rows: string[][] = [headers];

    // Add data rows
    batchValidationResults.errors.forEach(error => {
      // Join errors with newlines for multi-line display in File
      const errorsText = error.errors.join('\n');
      rows.push([
        String(error.buildingNumber),
        String(error.assetId),
        errorsText
      ]);
    });

    // Convert to File format
    const fileContent = rows.map(row => {
      return row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        const cellStr = String(cell || '');
        // Always wrap in quotes if contains newline, comma, or quote
        if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',');
    }).join('\n');

    // Add BOM for Hebrew support in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + fileContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.download = `נכסים_לא_תקינים_${timestamp}.file`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [batchValidationResults]);

  const handleSaveAll = async () => {
    if (dirtyAssets.size === 0 && deletedAssets.size === 0) {
      setError('אין שינויים לשמור');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setLoading(true);
    setError(null);
    setToast(null);

    try {
      let savedCount = 0;
      let deletedCount = 0;
      const errors: string[] = [];
      
      // Track successfully processed assets to remove from state
      const successfullyDeleted = new Set<string>();
      const successfullySaved = new Set<string>();

      // Process deletions first
      for (const assetId of deletedAssets) {
        try {
          const asset = assets.find(a => String(a.asset_id) === String(assetId));
          if (!asset) continue;

          // Skip deletion if it's a temp asset (not saved to database yet)
          if (String(assetId).startsWith('temp-')) {
            deletedCount++;
            successfullyDeleted.add(String(assetId));
            continue;
          }

          await api.assets.delete(assetId);
          deletedCount++;
          successfullyDeleted.add(String(assetId));
        } catch (err) {
          const asset = assets.find(a => String(a.asset_id) === String(assetId));
          const assetIdent = asset?.asset_id || assetId;
          errors.push(`נכס ${assetIdent}: ${err instanceof Error ? err.message : 'שגיאה במחיקה'}`);
        }
      }

      // Process new assets that haven't been edited yet (in newAssets but not in dirtyAssets)
      for (const newAssetId of newAssets) {
        if (!dirtyAssets.has(newAssetId) && !deletedAssets.has(newAssetId)) {
          // Add to dirtyAssets so it gets processed below
          const asset = assets.find(a => String(a.asset_id) === newAssetId);
          if (asset) {
            setDirtyAssets(prev => {
              const next = new Map(prev);
              next.set(newAssetId, {}); // Empty changes object, will use full asset data
              return next;
            });
          }
        }
      }

      const assetsToSave: any[] = [];

      // Detect if this is a distribution save by checking for distribution-related changes
      let isDistributionSave = false;
      let distributionType: 'residence' | 'business' | null = null;
      
      // Check for distribution: look for area_from_distribution changes
      // Need to determine if it's business or residence based on asset types
      for (const [assetId, changes] of dirtyAssets.entries()) {
        if (deletedAssets.has(assetId)) continue;
        if (changes.area_from_distribution !== undefined) {
          isDistributionSave = true;
          // Determine type by checking asset's business_residence type
          const asset = assets.find(a => String(a.asset_id) === String(assetId));
          if (asset && asset.main_asset_type) {
            const assetType = assetTypes.find(at => String(at.name) === String(asset.main_asset_type));
            if (assetType?.business_residence === 'עסקים') {
              distributionType = 'business';
            } else if (assetType?.business_residence === 'מגורים') {
              distributionType = 'residence';
            }
          }
          // If type not determined yet, check building flags as fallback
          if (!distributionType && building) {
            if (building.need_business_distribution) {
              distributionType = 'business';
            } else if (building.need_residence_distribution) {
              distributionType = 'residence';
            }
          }
          if (distributionType) break;
        }
      }
      
      // Check for residence distribution: look for main_asset_type changed to 199
      if (!isDistributionSave) {
        for (const [assetId, changes] of dirtyAssets.entries()) {
          if (deletedAssets.has(assetId)) continue;
          if (changes.main_asset_type === '199' || changes.main_asset_type === 199) {
            // Also check if original asset type was not 199 (to avoid false positives)
            const asset = assets.find(a => String(a.asset_id) === String(assetId));
            if (asset && String(asset.main_asset_type) !== '199') {
              isDistributionSave = true;
              distributionType = 'residence';
              break;
            }
          }
        }
      }
      
      // Fallback: check building flags if we couldn't determine from changes
      if (!isDistributionSave && building) {
        if (building.need_residence_distribution === true) {
          isDistributionSave = true;
          distributionType = 'residence';
        } else if (building.need_business_distribution === true) {
          isDistributionSave = true;
          distributionType = 'business';
        }
      }

      for (const [assetId, changes] of dirtyAssets.entries()) {
        try {
          if (deletedAssets.has(assetId)) continue;

          const asset = assets.find(a => String(a.asset_id) === String(assetId));
          if (!asset) continue;

          const updatedData = { ...asset, ...changes };
          const isNewAsset = String(assetId).startsWith('temp-') || newAssets.has(String(assetId));

          // Ensure building_number is always present
          // Try multiple sources: updatedData, asset, changes, building object, or component prop
          let buildingNumberValue = updatedData.building_number ?? asset.building_number ?? changes.building_number;
          if (!buildingNumberValue && building) {
            buildingNumberValue = building.building_number;
          }
          if (!buildingNumberValue) {
            buildingNumberValue = buildingNumber; // Use the prop from the component scope
          }
          if (!buildingNumberValue) {
            console.error('[handleSaveAll] Missing building_number for asset:', {
              asset_id: assetId,
              asset: asset,
              changes: changes,
              updatedData: updatedData,
              building: building,
              component_buildingNumber: buildingNumber
            });
            errors.push(`נכס ${asset.asset_id || assetId}: חסר מספר מבנה`);
            continue;
          }

          if (isNewAsset) {
            const { id, _isMasterRow, created_at, ...assetData } = updatedData;
            // Ensure building_number is set
            assetData.building_number = buildingNumberValue;
            assetsToSave.push(assetData);
          } else {
            // For updates, ensure building_number is included
            // Note: is_new_measurement should only be set for explicit "save as new measurement" operations,
            // not for distribution saves. Distribution saves update assets in place without creating history.
            assetsToSave.push({ 
              asset_id: assetId, 
              building_number: buildingNumberValue,
              ...changes 
            });
          }
        } catch (err) {
          const asset = assets.find(a => String(a.id) === String(assetId));
          const assetIdent = asset?.asset_id || assetId;
          errors.push(`נכס ${assetIdent}: ${err instanceof Error ? err.message : 'שגיאה בהכנת נתונים'}`);
        }
      }

      // Determine the new tax region from the assets that will be saved
      // This will be used after successful save to open the correct tab
      let newTaxRegionForTab = taxRegion || ''; // Default to current tax region
      
      if (assetsToSave.length > 0) {
        // Check if any asset has a tax_region in the saved data
        const assetWithTaxRegion = assetsToSave.find(a => a.tax_region != null);
        if (assetWithTaxRegion?.tax_region != null) {
          newTaxRegionForTab = String(assetWithTaxRegion.tax_region);
        }
        
        // Use 'business_distribution' or 'residence_distribution' action type if this is a distribution save
        let actionType: string = 'manual_update';
        if (isDistributionSave && distributionType) {
          actionType = distributionType === 'business' ? 'business_distribution' : 'residence_distribution';
        }
        
        // Create description for distribution saves (include Hebrew keywords for database detection)
        let description: string | null = null;
        let afterData: any = undefined;
        
        // Determine tab context (business or residence) for passing to API
        const isBusinessContext = !isResidentTaxRegion;
        
        if (isDistributionSave && distributionType && building) {
          if (distributionType === 'residence' && building?.residence_shared_area) {
            description = `Distributed residence shared area (מגורים) (${building.residence_shared_area.toLocaleString('he-IL')}) to ${assetsToSave.length} assets`;
          } else if (distributionType === 'business' && building?.business_shared_area != null) {
            // When shared area is 0, overload_ratio should be 0
            const overloadRatioValue = building.business_shared_area <= 0 
              ? 0 
              : (building.overload_ratio ?? 0);
            const overloadRatio = overloadRatioValue.toFixed(2);
            const sharedAreaText = building.business_shared_area > 0 
              ? building.business_shared_area.toLocaleString('he-IL')
              : '0 (clearing previous distribution)';
            description = `Distributed business shared area (עסקים) (${sharedAreaText}) to ${assetsToSave.length} assets. Overload ratio: ${overloadRatio}%`;
          }
          
          // For distribution operations, prepare after_data with overload_ratio
          // The database function will collect all assets, but we provide overload_ratio
          // When shared area is 0, overload_ratio should be 0 (not null or old value)
          afterData = {
            overload_ratio: distributionType === 'business' && building.business_shared_area! <= 0 
              ? 0 
              : (building.overload_ratio ?? null)
          };
        }
        
        const result = await api.assets.saveBulkTransactional(assetsToSave, actionType, undefined, afterData, description, isBusinessContext);

        if (result.success) {
          savedCount = result.count || 0;
          for (const assetId of dirtyAssets.keys()) {
            if (!deletedAssets.has(assetId)) {
              successfullySaved.add(String(assetId)); // Ensure string type
            }
          }
          
          // Note: Distribution flags for asset type changes are now set in the database transaction
          // via the set_distribution_flags_for_asset_type_change function, which ensures atomicity
          
          // If this was a business distribution, save the building with updated overload_ratio
          // Always save overload_ratio for business distributions, even if it's 0 (when shared area is 0)
          if (isDistributionSave && distributionType === 'business' && building) {
            try {
              // Get the old overload_ratio for audit description
              const oldBuilding = await api.buildings.getOne(building.building_number);
              const oldOverloadRatio = oldBuilding?.overload_ratio;
              
              // When shared area is 0, overload_ratio should be 0 (explicitly set, not null)
              const overloadRatioToSave = building.business_shared_area! <= 0 
                ? 0 
                : (building.overload_ratio ?? null);
              
              await api.buildings.update(building.building_number, {
                overload_ratio: overloadRatioToSave
              });
              
              // The audit entry is automatically created by api.buildings.update
              // It will include overload_ratio in the after_data via get_building_audit_data
              // The description will mention the update
            } catch (buildingUpdateError) {
              console.warn('Failed to save overload_ratio to building:', buildingUpdateError);
              // Don't fail the entire save operation if building update fails
              // The overload_ratio is already in local state and will be visible in UI
            }
          }
          
          // If this was a residence distribution, clear the residence distribution flag
          // Clear the flag even if it was a clearing distribution (area = 0)
          if (isDistributionSave && distributionType === 'residence' && building) {
            try {
              await api.buildings.markResidenceDistributionDone(building.building_number);
              // Update local building state to reflect the cleared flag
              setBuilding(prev => prev ? { ...prev, need_residence_distribution: false } : null);
            } catch (flagClearError) {
              console.warn('Failed to clear residence distribution flag:', flagClearError);
              // Don't fail the entire save operation if flag clearing fails
              // The backend might have already cleared it, or we can try again later
            }
          }
          
          // Update distribution history counter after successful distribution save
          if (isDistributionSave && distributionType) {
            try {
              // Use the specific distribution type (business_distribution or residence_distribution)
              const actionType = distributionType === 'business' ? 'business_distribution' : 'residence_distribution';
              const distributionHistory = await api.distributionAudit.getByBuilding(buildingNumber, actionType);
              setDistributionHistoryCount(distributionHistory.length);
            } catch (error) {
              console.error('Error updating distribution history count:', error);
              // Don't fail the save operation if counter update fails
            }
          }
        } else {
          if (result.validationErrors && result.validationErrors.length > 0) {
            errors.push(...result.validationErrors);
          } else if (result.error) {
            errors.push(result.error);
          }
        }
      }


      // Only clear successfully processed assets from state
      // Keep failed assets in state so they remain visible on screen
      // Remove successfully saved/deleted assets from change tracking
      // Use functional updates to ensure we're working with the latest state
      setDirtyAssets(prev => {
        const next = new Map(prev);
        for (const assetId of successfullySaved) {
          next.delete(String(assetId)); // Ensure string comparison
        }
        return next;
      });
      
      setDeletedAssets(prev => {
        const next = new Set(prev);
        for (const assetId of successfullyDeleted) {
          next.delete(String(assetId)); // Ensure string comparison
        }
        return next;
      });
      
      setNewAssets(prev => {
        const next = new Set(prev);
        for (const assetId of successfullySaved) {
          next.delete(String(assetId)); // Ensure string comparison
        }
        return next;
      });
      
      // Clear validation errors for successfully saved/deleted assets
      setValidationErrors(prev => {
        const next = new Map(prev);
        for (const assetId of successfullySaved) {
          next.delete(String(assetId));
        }
        for (const assetId of successfullyDeleted) {
          next.delete(String(assetId));
        }
        return next;
      });
      
      // Clear all pending validation timers before refreshing data
      // This prevents individual asset validations from running after save
      validationTimerRef.current.forEach(timer => clearTimeout(timer));
      validationTimerRef.current.clear();
      
      // Track which assets were just saved to prevent re-marking them as dirty in fetchData
      // This is especially important in error fixing mode where fetchData would re-mark them
      recentlySavedAssetsRef.current = new Set(successfullySaved);
      
      // Set flag to prevent onCellValueChanged from triggering validations during refresh
      // Set this BEFORE fetchData to prevent any cell change events during the refresh
      isRefreshingAfterSaveRef.current = true;
      
      // Preserve scroll position and selection before refresh
      let scrollPosition = { top: 0, left: 0 };
      let selectedRows: any[] = [];
      if (gridRef.current?.api) {
        const scrollInfo = gridRef.current.api.getVerticalPixelRange();
        scrollPosition = {
          top: scrollInfo.top || 0,
          left: gridRef.current.api.getHorizontalPixelRange()?.left || 0
        };
        selectedRows = gridRef.current.api.getSelectedRows();
      }
      
      // Refresh data from server to update grid after successful deletions and saves
      await fetchData(false);
      
      // Restore scroll position and selection after a brief delay to allow grid to update
      if (gridRef.current?.api && (scrollPosition.top > 0 || selectedRows.length > 0)) {
        setTimeout(() => {
          if (gridRef.current?.api) {
            // Restore scroll position
            gridRef.current.api.ensureIndexVisible(
              Math.floor(scrollPosition.top / 24) // Approximate row index (24px per row)
            );
            // Restore selection if possible
            if (selectedRows.length > 0) {
              const assetIds = selectedRows.map(r => String(r.asset_id)).filter(Boolean);
              gridRef.current.api.forEachNode(node => {
                if (assetIds.includes(String(node.data?.asset_id))) {
                  node.setSelected(true);
                }
              });
            }
          }
        }, 100);
      }
      
      // Keep the flag set for a longer period to ensure all grid updates complete
      // AG Grid may batch updates, so we need to wait for all re-renders to finish
      setTimeout(() => {
        isRefreshingAfterSaveRef.current = false;
        // Clear the recently saved assets after a delay to allow fetchData to complete
        recentlySavedAssetsRef.current.clear();
      }, 3000);
      
      // After fetchData completes and state is cleared, originalAssets should be updated in fetchData
      // But to be safe, explicitly update it here after all state clearing is done
      // Use a timeout to ensure state updates have propagated
      setTimeout(() => {
        setAssets(currentAssets => {
          // Only update if we have assets and no pending changes
          if (currentAssets.length >= 0 && dirtyAssets.size === 0 && newAssets.size === 0 && deletedAssets.size === 0) {
            setOriginalAssets(JSON.parse(JSON.stringify(currentAssets)));
          }
          return currentAssets;
        });
      }, 0);

      if (errors.length > 0) {
        const successMsg = [];
        if (savedCount > 0) successMsg.push(`נשמרו ${savedCount} נכסים`);
        if (deletedCount > 0) successMsg.push(`נמחקו ${deletedCount} נכסים`);
        setError(`${successMsg.join(', ')}. ${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`);
      } else {
        const successMsg = [];
        if (savedCount > 0) successMsg.push(`נשמרו ${savedCount} נכסים`);
        if (deletedCount > 0) successMsg.push(`נמחקו ${deletedCount} נכסים`);
        setToast({ message: `✓ ${successMsg.join(', ')} בהצלחה`, type: 'success' });
        setTimeout(() => setToast(null), 3000);
        
        // Close the error fixing mode tab and open normal assets tab after successful save
        if (isErrorFixingMode && onCloseTab && onOpenAssetsTab && newTaxRegionForTab) {
          // Use a small delay to allow the success message to be visible
          setTimeout(() => {
            // Close the error fixing tab
            onCloseTab();
            // Open a normal assets tab (not error fixing mode) with the new tax region
            // Don't pass assetIds to avoid error fixing mode
            onOpenAssetsTab(buildingNumber, newTaxRegionForTab);
          }, 500);
        } else if (isErrorFixingMode && onCloseTab) {
          // Fallback: just close the tab if onOpenAssetsTab is not available
          setTimeout(() => {
            onCloseTab();
          }, 500);
        }
      }
    } catch (err) {
      const errorMessage = `שגיאה בשמירה: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('[AssetsList] Error saving all:', err);
      setError(errorMessage);
      // Don't clear error automatically - let user see it
    } finally {
      setLoading(false);
    }
  };

  const addEmptyRow = async () => {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const tempId = `temp-${Date.now()}`;

    // Set tax_region from tab data if available
    const taxRegionValue = validationTaxRegion ? parseInt(validationTaxRegion, 10) : undefined;

    const newAsset: Asset = {
      id: tempId,
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
      tax_region: taxRegionValue,
      penthouse: null,
      floor: undefined,
      discount_type: undefined,
      discount_date_from: undefined,
      discount_date_to: undefined,
      comment: undefined
    };

    setAssets(prev => [newAsset, ...prev]);
    setNewAssets(prev => new Set(prev).add(tempId));

    // Run validation rules on the new asset (async, don't block UI)
    // IMPORTANT: validationTaxRegion is taken from the tab data (component prop) for validation
    // This validationTaxRegion will OVERRIDE the building's tax_region field during validation
    console.log('[AssetsList.addEmptyRow] Calling validateSingleAsset with validationTaxRegion:', validationTaxRegion, {
      assetId: newAsset.asset_id,
      buildingNumber: newAsset.building_number,
      mainAssetType: newAsset.main_asset_type
    });
    // Prepare cached data for validation (all data is already in memory)
    const cachedData = {
      assetTypes: assetTypes || [],
      building: building
    };

    AssetValidationHandler.validateSingleAsset(
      newAsset,
      {
        taxRegion: validationTaxRegion, // Use validationTaxRegion from the current tab - this overrides building tax_region
        cachedData: cachedData // Pass cached data to avoid database queries
      }
    ).then(validationResult => {
      // Add discount validation errors
      const discountErrors = validateDiscountDates(newAsset);
      const allErrors = [...(validationResult.errors || []), ...discountErrors];
      const actualValid = validationResult.valid && allErrors.length === 0;

      if (!actualValid && allErrors.length > 0) {
        // Store validation errors for the new asset
        setValidationErrors(prev => {
          const newMap = new Map(prev);
          newMap.set(tempId, allErrors.join('\n'));
          return newMap;
        });
        
        // Refresh grid to show validation errors
        if (gridRef.current?.api) {
          gridRef.current.api.refreshCells({ force: true });
        }
      }
    }).catch(err => {
      console.error('[AssetsList] Error validating new asset:', err);
      // Don't block adding the asset if validation fails
    });

    setTimeout(() => {
      if (gridRef.current) {
        const rowIndex = 0;
        gridRef.current.api.setFocusedCell(rowIndex, 'asset_id');
        gridRef.current.api.startEditingCell({ rowIndex, colKey: 'asset_id' });
      }
    }, 100);
  };

  const toggleDelete = useCallback((assetId: string) => {
    setDeletedAssets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
    
    // Refresh the grid to update row styling
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ force: true });
    }
  }, []);

  const handleCancelAll = () => {
    // Restore original assets completely (deep copy)
    // This includes restoring deleted assets and removing new assets
    const restored = JSON.parse(JSON.stringify(originalAssets));
    setAssets(restored);
    
    // Clear all change tracking
    setDirtyAssets(new Map());
    setDeletedAssets(new Set());
    setNewAssets(new Set());
    setValidationErrors(new Map());
    setError(null);
    setToast({ message: 'השינויים בוטלו', type: 'info' });
    setTimeout(() => setToast(null), 3000);

    // Refresh the grid to show restored values
    setTimeout(() => {
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
        gridRef.current.api.redrawRows();
      }
    }, 0);
  };

  // Distribute shared area to all residential assets
  const handleDistributeSharedArea = useCallback(async () => {
    // Allow distribution if flag is set, even if current area is 0 (to clear previous distribution)
    if (!building || building.residence_shared_area == null) {
      setError('אין שטח משותף מגורים במבנה');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    // If area is 0 but flag is set, allow distribution to clear previous distribution
    if (building.residence_shared_area <= 0 && building.need_residence_distribution !== true) {
      setError('אין שטח משותף מגורים במבנה או השטח הוא 0');
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (!assetTypes || assetTypes.length === 0) {
      setError('לא ניתן לטעון את סוגי הנכסים');
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Check if assets array is empty or not loaded BEFORE setting loading state
    if (!assets || assets.length === 0) {
      setError('אין נכסים במבנה');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setLoading(true);
    setError(null);
    setToast(null);

    try {
      // Refresh asset types to ensure we have latest data (in case cache is stale)
      let currentAssetTypes = assetTypes;
      try {
        const refreshedAssetTypes = await api.assetTypes.getAll();
        if (refreshedAssetTypes && refreshedAssetTypes.length > 0) {
          currentAssetTypes = refreshedAssetTypes;
          setAssetTypes(refreshedAssetTypes);
        }
      } catch (refreshError) {
        console.warn('[DistributeResidence] Failed to refresh asset types, using existing:', refreshError);
      }

      // Create asset type map for quick lookup - use multiple keys for flexibility
      const assetTypeMap = new Map<string, AssetType>();
      currentAssetTypes.forEach(at => {
        const nameKey = String(at.name).trim();
        assetTypeMap.set(nameKey, at);
        // Also add numeric version if name is numeric
        const nameAsNum = parseInt(nameKey, 10);
        if (!isNaN(nameAsNum)) {
          assetTypeMap.set(String(nameAsNum), at);
        }
      });

      // Deep check: Log all asset types with business_residence = 'מגורים'
      const residentialAssetTypes = currentAssetTypes.filter(at => {
        const br = at.business_residence ? String(at.business_residence).trim() : '';
        return br === 'מגורים';
      });
      
      // Check for null/undefined business_residence values
      const assetTypesWithNullBusinessResidence = currentAssetTypes.filter(at => 
        at.business_residence == null || at.business_residence === ''
      );
      
      console.log('[DistributeResidence] Starting distribution:', {
        totalAssets: assets.length,
        assetTypesCount: assetTypes.length,
        residenceSharedArea: building.residence_shared_area,
        residentialAssetTypesCount: residentialAssetTypes.length,
        residentialAssetTypeNames: residentialAssetTypes.map(at => at.name),
        assetTypesWithNullBusinessResidence: assetTypesWithNullBusinessResidence.length,
        allAssetTypesWithBusinessResidence: currentAssetTypes
          .filter(at => at.business_residence != null && at.business_residence !== '')
          .map(at => ({
            name: at.name,
            business_residence: at.business_residence,
            business_residence_length: String(at.business_residence).length,
            business_residence_chars: Array.from(String(at.business_residence)).map(c => c.charCodeAt(0))
          })),
        sampleAssets: assets.slice(0, 5).map(a => ({
          asset_id: a.asset_id,
          main_asset_type: a.main_asset_type,
          tax_region: a.tax_region
        }))
      });

      // Filter assets: only accountable assets
      let deletedCount = 0;
      let notAccountableForDistributionCount = 0;
      let noMainTypeCount = 0;
      let assetTypeNotFoundCount = 0;
      let residentialFoundCount = 0;
      
      const residentialAssets = assets.filter((asset, index) => {
        const debugInfo: any = {
          assetId: asset.asset_id,
          index,
          mainAssetType: asset.main_asset_type
        };
        
        // Skip deleted assets
        if (deletedAssets.has(String(asset.asset_id))) {
          deletedCount++;
          debugInfo.reason = 'deleted';
          if (index < 3) console.log('[DistributeResidence] Asset filtered:', debugInfo);
          return false;
        }
        
        // Include only assets that have at least one accountable type (main or subtype) for distribution
        if (!hasAtLeastOneAccountableTypeForDistribution(asset)) {
          notAccountableForDistributionCount++;
          debugInfo.reason = 'not_accountable_for_distribution';
          if (index < 3) console.log('[DistributeResidence] Asset filtered:', debugInfo);
          return false;
        }
        
        // Check if asset is residential type (not business)
        if (!asset.main_asset_type) {
          noMainTypeCount++;
          debugInfo.reason = 'no_main_type';
          if (index < 3) console.log('[DistributeResidence] Asset filtered:', debugInfo);
          return false;
        }
        
        // Try multiple lookup strategies to handle type mismatches
        const mainTypeStr = String(asset.main_asset_type).trim();
        let assetType = assetTypeMap.get(mainTypeStr);
        debugInfo.mainTypeStr = mainTypeStr;
        debugInfo.foundInMap = !!assetType;
        
        // If not found, try numeric lookup
        if (!assetType) {
          const mainTypeNum = parseInt(mainTypeStr, 10);
          if (!isNaN(mainTypeNum)) {
            assetType = assetTypeMap.get(String(mainTypeNum));
            debugInfo.foundNumeric = !!assetType;
          }
        }
        
        // If still not found, try finding by name directly
        if (!assetType) {
          assetType = currentAssetTypes.find(at => {
            const atNameStr = String(at.name).trim();
            return atNameStr === mainTypeStr;
          });
          debugInfo.foundInArray = !!assetType;
        }
        
        if (!assetType) {
          assetTypeNotFoundCount++;
          debugInfo.reason = 'asset_type_not_found';
          debugInfo.availableTypes = Array.from(assetTypeMap.keys()).slice(0, 10);
          console.warn('[DistributeResidence] Asset type not found:', debugInfo);
          return false;
        }
        
        // Note: non_accountable_for_distribution check is already done earlier via isAssetNotAccountableForDistribution
        // This redundant check is removed since the helper function handles it
        
        debugInfo.assetTypeName = assetType.name;
        debugInfo.assetTypeId = assetType.id;
        debugInfo.assetTypeKeys = Object.keys(assetType);
        debugInfo.assetTypeHasBusinessResidence = 'business_residence' in assetType;
        debugInfo.assetTypeBusinessResidenceValue = assetType.business_residence;
        debugInfo.assetTypeBusinessResidenceType = typeof assetType.business_residence;
        
        // Skip business_residence check - accept all assets that passed previous filters
        
        residentialFoundCount++;
        if (residentialFoundCount <= 3) {
          console.log('[DistributeResidence] Asset IS residential:', debugInfo);
        }
        return true;
      });

      console.log('[DistributeResidence] Filter results:', {
        totalAssets: assets.length,
        residentialFound: residentialFoundCount,
        deletedCount,
        notAccountableForDistributionCount,
        noMainTypeCount,
        assetTypeNotFoundCount,
        finalResidentialAssets: residentialAssets.length
      });

      if (residentialAssets.length === 0) {
        // Provide detailed error message
        const reasons: string[] = [];
        if (deletedCount > 0) reasons.push(`${deletedCount} נכסים שנמחקו`);
        if (notAccountableForDistributionCount > 0) reasons.push(`${notAccountableForDistributionCount} נכסים לא נספרים בפיזור`);
        if (noMainTypeCount > 0) reasons.push(`${noMainTypeCount} נכסים ללא סוג נכס ראשי`);
        if (assetTypeNotFoundCount > 0) reasons.push(`${assetTypeNotFoundCount} נכסים עם סוג נכס שלא נמצא`);
        
        const totalFiltered = deletedCount + notAccountableForDistributionCount + noMainTypeCount + assetTypeNotFoundCount;
        const totalAssets = assets.length;
        
        let errorMsg = 'אין נכסי מגורים במבנה לפזר בהם שטח משותף';
        if (reasons.length > 0) {
          errorMsg += `. סיבות: ${reasons.join(', ')}`;
        } else if (totalAssets > 0) {
          errorMsg += `. נמצאו ${totalAssets} נכסים במבנה, אך אף אחד מהם לא מסוג מגורים`;
        }
        if (totalAssets === 0) {
          errorMsg = 'אין נכסים במבנה';
        } else if (totalFiltered === totalAssets && totalAssets > 0) {
          errorMsg += `. כל הנכסים במבנה נפסלו (סה"כ ${totalAssets} נכסים)`;
        }
        
        console.error('[DistributeResidence] Error:', errorMsg, {
          totalAssets,
          totalFiltered,
          reasons
        });
        
        setError(errorMsg);
        setTimeout(() => setError(null), 5000);
        setLoading(false);
        return;
      }

      // Calculate area per asset (simple division for residence distribution)
      const areaPerAsset = building.residence_shared_area! / residentialAssets.length;
      const isClearing = areaPerAsset === 0;
      
      // Also clear area_from_distribution for non-accountable assets
      // (assets that don't have at least one accountable type for distribution)
      const nonAccountableAssets = assets.filter(asset => {
        // Skip deleted assets
        if (deletedAssets.has(String(asset.asset_id))) {
          return false;
        }
        // Include assets that don't have at least one accountable type
        return !hasAtLeastOneAccountableTypeForDistribution(asset);
      });

      // Track changes
      const updatedDirtyAssets = new Map(dirtyAssets);
      const updatedAssets = [...assets];
      let updatedCount = 0;

      // First, clear area_from_distribution for non-accountable assets
      for (const asset of nonAccountableAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);
        const currentAreaFromDistribution = existingChanges.area_from_distribution !== undefined
          ? existingChanges.area_from_distribution
          : (currentAsset?.area_from_distribution || 0);
        
        // Only clear if it's not already 0
        if (currentAreaFromDistribution > 0) {
          const changes: Partial<Asset> = { ...existingChanges };
          changes.area_from_distribution = 0;
          updatedDirtyAssets.set(assetId, changes);
          
          // Update local assets array for immediate UI update
          const assetIndex = updatedAssets.findIndex(a => String(a.asset_id) === assetId);
          if (assetIndex !== -1) {
            updatedAssets[assetIndex] = {
              ...updatedAssets[assetIndex],
              ...changes
            } as Asset;
          }
        }
      }

      // Find a single shared area asset type to use for all distributions (remove duplicates)
      // Collect all unique tax regions from residential assets
      const uniqueTaxRegions = new Set<string>();
      for (const asset of residentialAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);
        if (!currentAsset) continue;
        
        const currentTaxRegion = existingChanges.tax_region !== undefined 
          ? existingChanges.tax_region 
          : currentAsset.tax_region;
        if (currentTaxRegion != null) {
          uniqueTaxRegions.add(String(currentTaxRegion));
        }
      }

      // Find the first matching shared area asset type (use same one for all)
      // Prefer the tax region from the current tab, otherwise use the first available
      let sharedAreaAssetType = null;
      if (taxRegion) {
        // Try to find one matching the current tab's tax region first
        sharedAreaAssetType = currentAssetTypes.find(at => 
          at.tax_region === taxRegion && 
          at.use_shared_area === true
        );
      }
      // If not found, try any tax region from the assets
      if (!sharedAreaAssetType && uniqueTaxRegions.size > 0) {
        for (const tr of uniqueTaxRegions) {
          sharedAreaAssetType = currentAssetTypes.find(at => 
            at.tax_region === tr && 
            at.use_shared_area === true
          );
          if (sharedAreaAssetType) break;
        }
      }
      // If still not found, find any asset type with use_shared_area = true
      if (!sharedAreaAssetType) {
        sharedAreaAssetType = currentAssetTypes.find(at => at.use_shared_area === true);
      }

      if (!sharedAreaAssetType && !isClearing) {
        const taxRegionList = Array.from(uniqueTaxRegions).join(', ') || taxRegion || 'לא ידוע';
        throw new Error(`לא נמצא סוג נכס עם סימון "שימוש בשטח משותף" עבור אזורי המס: ${taxRegionList}. יש לוודא שקיים סוג נכס עם use_shared_area=true.`);
      }

      // Now distribute to accountable residential assets using the same asset type for all
      for (const asset of residentialAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);
        if (!currentAsset) continue;

        // Prepare changes object
        const changes: Partial<Asset> = { ...existingChanges };

        // Get current values (use existing changes if available, otherwise use current asset)
        const currentMainType = changes.main_asset_type !== undefined 
          ? changes.main_asset_type 
          : currentAsset.main_asset_type;

        const isMainType199 = String(currentMainType).trim() === '199';

        if (isClearing) {
          // Clearing distribution: delete ALL occurrences of the shared area subtype and move back types
          if (!isMainType199 || !sharedAreaAssetType) {
            // Skip assets that aren't type 199 or don't have the shared area type defined
            continue;
          }

          // Remove ALL occurrences of the shared area asset type subtype
          const sharedAreaTypeName = String(sharedAreaAssetType.name).trim();
          let foundAny = false;
          
          for (let i = 1; i <= 6; i++) {
            const subTypeField = `sub_asset_type_${i}` as keyof Asset;
            const subSizeField = `sub_asset_size_${i}` as keyof Asset;
            const currentSubType = changes[subTypeField] !== undefined
              ? changes[subTypeField]
              : currentAsset[subTypeField];
            
            // Check if this subtype matches the shared area asset type
            if (currentSubType && String(currentSubType).trim() === sharedAreaTypeName) {
              // Delete this shared area subtype (set to null)
              (changes as any)[subTypeField] = null;
              (changes as any)[subSizeField] = null;
              foundAny = true;
            }
          }

          if (!foundAny) {
            // No shared area subtype found, skip this asset
            continue;
          }

          // Count remaining subtypes
          let remainingSubTypeCount = 0;
          let lastSubTypeIndex = -1;
          let lastSubType: string | null = null;
          let lastSubSize: number = 0;

          for (let i = 1; i <= 6; i++) {
            const subTypeField = `sub_asset_type_${i}` as keyof Asset;
            const subSizeField = `sub_asset_size_${i}` as keyof Asset;
            const subType = changes[subTypeField] !== undefined
              ? changes[subTypeField]
              : currentAsset[subTypeField];
            const subSize = changes[subSizeField] !== undefined
              ? changes[subSizeField]
              : currentAsset[subSizeField];

            if (subType && subType !== '' && subType !== null) {
              remainingSubTypeCount++;
              lastSubTypeIndex = i;
              lastSubType = subType as string;
              lastSubSize = subSize ? Number(subSize) : 0;
            }
          }

          // If only one subtype remains, move it back to main type
          if (remainingSubTypeCount === 1 && lastSubTypeIndex > 0 && lastSubType) {
            changes.main_asset_type = lastSubType;
            changes.asset_size = lastSubSize;
            // Clear all subtypes
            for (let i = 1; i <= 6; i++) {
              const subTypeField = `sub_asset_type_${i}` as keyof Asset;
              const subSizeField = `sub_asset_size_${i}` as keyof Asset;
              (changes as any)[subTypeField] = null;
              (changes as any)[subSizeField] = null;
            }
          } else {
            // Calculate asset_size as sum of remaining subtypes
            let totalSubSize = 0;
            for (let i = 1; i <= 6; i++) {
              const subSizeField = `sub_asset_size_${i}` as keyof Asset;
              const subSize = changes[subSizeField] !== undefined
                ? changes[subSizeField]
                : currentAsset[subSizeField];
              if (subSize != null && subSize !== '' && !isNaN(Number(subSize))) {
                totalSubSize += Number(subSize);
              }
            }
            changes.asset_size = totalSubSize;
          }
        } else {
          // Adding distribution: add shared area as subtype
          // First, remove any existing shared area subtypes (duplicates) and keep only one
          let existingSharedAreaIndex = -1;
          const sharedAreaTypeName = String(sharedAreaAssetType.name).trim();
          
          // Remove all existing shared area subtypes (duplicates)
          for (let i = 1; i <= 6; i++) {
            const subTypeField = `sub_asset_type_${i}` as keyof Asset;
            const subSizeField = `sub_asset_size_${i}` as keyof Asset;
            
            const currentSubType = changes[subTypeField] !== undefined
              ? changes[subTypeField]
              : currentAsset[subTypeField];
            
            // Check if this subtype matches the shared area asset type
            if (currentSubType && String(currentSubType).trim() === sharedAreaTypeName) {
              // Remember the first index found (we'll use this position for the new one)
              if (existingSharedAreaIndex === -1) {
                existingSharedAreaIndex = i;
              }
              // Remove all shared area subtypes (we'll add a single one below)
              (changes as any)[subTypeField] = null;
              (changes as any)[subSizeField] = null;
            }
          }

          if (!isMainType199) {
            // Move current type and size to subtype 1
            // Get current subtype 1 values (prefer existing changes)
            const currentSubType1 = changes.sub_asset_type_1 !== undefined 
              ? changes.sub_asset_type_1 
              : currentAsset.sub_asset_type_1;
            const currentAssetSize = changes.asset_size !== undefined 
              ? changes.asset_size 
              : currentAsset.asset_size;

            // Only move if subtype 1 is empty
            if (!currentSubType1 || currentSubType1 === '') {
              changes.sub_asset_type_1 = currentMainType;
              changes.sub_asset_size_1 = currentAssetSize || 0;
            }

            // Set main type to 199
            changes.main_asset_type = '199';
          }

          // Determine target position for shared area subtype
          let targetSubTypeIndex = -1;
          let targetSubTypeField: keyof Asset = 'sub_asset_type_1';
          let targetSubSizeField: keyof Asset = 'sub_asset_size_1';

          // If we found an existing shared area subtype position, reuse it (it's now cleared)
          if (existingSharedAreaIndex > 0) {
            targetSubTypeIndex = existingSharedAreaIndex;
            targetSubTypeField = `sub_asset_type_${existingSharedAreaIndex}` as keyof Asset;
            targetSubSizeField = `sub_asset_size_${existingSharedAreaIndex}` as keyof Asset;
          } else {
            // Find first available subtype position (2-6 if converting to 199, 1-6 if already 199)
            targetSubTypeIndex = isMainType199 ? 1 : 2;
            targetSubTypeField = 'sub_asset_type_1';
            targetSubSizeField = 'sub_asset_size_1';

            // Check available positions starting from the appropriate index
            for (let i = (isMainType199 ? 1 : 2); i <= 6; i++) {
              const subTypeField = `sub_asset_type_${i}` as keyof Asset;
              const subSizeField = `sub_asset_size_${i}` as keyof Asset;
              
              const currentSubType = changes[subTypeField] !== undefined
                ? changes[subTypeField]
                : currentAsset[subTypeField];
              
              // If this position is empty, use it
              if (!currentSubType || currentSubType === '' || currentSubType === null) {
                targetSubTypeIndex = i;
                targetSubTypeField = subTypeField;
                targetSubSizeField = subSizeField;
                break;
              }
            }
          }

          // If no available subtype position found, throw error
          if (targetSubTypeIndex > 6 || targetSubTypeIndex < 1) {
            throw new Error(`לא נמצא מקום פנוי לנכס משנה עבור נכס ${assetId}. כל ששת המקומות תפוסים.`);
          }

          // Set the shared area subtype and size (replace all duplicates with single entry)
          (changes as any)[targetSubTypeField] = sharedAreaAssetType.name;
          (changes as any)[targetSubSizeField] = areaPerAsset;

          // Calculate asset_size as sum of all subtypes (required for type 199)
          let totalSubSize = 0;
          for (let i = 1; i <= 6; i++) {
            const subSizeField = `sub_asset_size_${i}` as keyof Asset;
            const subSize = changes[subSizeField] !== undefined
              ? changes[subSizeField]
              : currentAsset[subSizeField];
            if (subSize != null && subSize !== '' && !isNaN(Number(subSize))) {
              totalSubSize += Number(subSize);
            }
          }
          changes.asset_size = totalSubSize;
        }

        updatedDirtyAssets.set(assetId, changes);

        // Update local assets array for immediate UI update
        const assetIndex = updatedAssets.findIndex(a => String(a.asset_id) === assetId);
        if (assetIndex !== -1) {
          updatedAssets[assetIndex] = {
            ...updatedAssets[assetIndex],
            ...changes
          } as Asset;
        }

        updatedCount++;
      }

      // Update local state only - changes will be saved when user clicks "Save All"
        setDirtyAssets(updatedDirtyAssets);
        setAssets(updatedAssets);
      
      // Show result in modal
      const sharedAreaText = building.residence_shared_area! > 0 
        ? building.residence_shared_area!.toLocaleString('he-IL')
        : '0 (ניקוי פיזור קודם)';
      setDistributionResult(`פוזר שטח משותף מגורים (${sharedAreaText}) בין ${updatedCount} נכסים. השינויים יישמרו בלחיצה על "שמור הכל"`);
      setDistributionModalOpen(true);

      // Refresh grid
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בפיזור שטח משותף');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  }, [building, assets, assetTypes, dirtyAssets, deletedAssets, hasAtLeastOneAccountableTypeForDistribution]);

  const handleDistributeBusinessSharedArea = useCallback(async () => {
    // Allow distribution if flag is set, even if current area is 0 (to clear previous distribution)
    if (!building || building.business_shared_area == null) {
      setError('אין שטח משותף עסקים במבנה');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    // If area is 0 but flag is set, allow distribution to clear previous distribution
    if (building.business_shared_area <= 0 && building.need_business_distribution !== true) {
      setError('אין שטח משותף עסקים במבנה או השטח הוא 0');
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (!assetTypes || assetTypes.length === 0) {
      setError('לא ניתן לטעון את סוגי הנכסים');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setLoading(true);
    setError(null);
    setToast(null);

    try {
      // Create asset type map for quick lookup
      const assetTypeMap = new Map<string, AssetType>();
      assetTypes.forEach(at => {
        assetTypeMap.set(at.name, at);
      });

      // Filter assets: only business assets that are accountable
      let deletedCount = 0;
      let notAccountableForDistributionCount = 0;
      let noMainTypeCount = 0;
      let assetTypeNotFoundCount = 0;
      let notBusinessCount = 0;
      
      const businessAssets = assets.filter(asset => {
        // Skip deleted assets
        if (deletedAssets.has(String(asset.asset_id))) {
          deletedCount++;
          return false;
        }
        
        // Exclude non-accountable assets for distribution
        if (isAssetNotAccountableForDistribution(asset)) {
          notAccountableForDistributionCount++;
          return false;
        }
        
        // Check if asset is business type
        if (!asset.main_asset_type) {
          noMainTypeCount++;
          return false;
        }
        
        // Try multiple lookup strategies to handle type mismatches
        const mainTypeStr = String(asset.main_asset_type).trim();
        let assetType = assetTypeMap.get(mainTypeStr);
        
        // If not found, try finding by name directly (case-insensitive, handle number/string mismatches)
        if (!assetType) {
          assetType = assetTypes.find(at => {
            const atNameStr = String(at.name).trim();
            return atNameStr === mainTypeStr || 
                   atNameStr === String(asset.main_asset_type) ||
                   String(atNameStr) === String(mainTypeStr);
          });
        }
        
        if (!assetType) {
          assetTypeNotFoundCount++;
          return false;
        }
        
        // Check if asset type is business
        if (!assetType.business_residence || assetType.business_residence.trim() !== 'עסקים') {
          notBusinessCount++;
          // Log details for debugging (only first few to avoid spam)
          if (notBusinessCount <= 5) {
            console.log('[DistributeBusiness] Asset excluded - not business type:', {
              assetId: asset.asset_id,
              mainAssetType: asset.main_asset_type,
              assetTypeName: assetType.name,
              businessResidence: assetType.business_residence,
              expected: 'עסקים'
            });
          }
          return false;
        }
        
        // Note: non_accountable_for_distribution check is already done earlier via isAssetNotAccountableForDistribution
        // This redundant check is removed since the helper function handles it
        
        return true;
      });
      
      // Log summary for debugging
      console.log('[DistributeBusiness] Asset filtering summary:', {
        totalAssets: assets.length,
        businessAssetsFound: businessAssets.length,
        deletedCount,
        notAccountableForDistributionCount,
        noMainTypeCount,
        assetTypeNotFoundCount,
        notBusinessCount
      });

      if (businessAssets.length === 0) {
        // Provide detailed error message
        const reasons: string[] = [];
        if (deletedCount > 0) reasons.push(`${deletedCount} נכסים שנמחקו`);
        if (notAccountableForDistributionCount > 0) reasons.push(`${notAccountableForDistributionCount} נכסים לא נספרים בפיזור`);
        if (noMainTypeCount > 0) reasons.push(`${noMainTypeCount} נכסים ללא סוג נכס ראשי`);
        if (assetTypeNotFoundCount > 0) reasons.push(`${assetTypeNotFoundCount} נכסים עם סוג נכס שלא נמצא`);
        if (notBusinessCount > 0) reasons.push(`${notBusinessCount} נכסים שאינם מסוג עסקים`);
        
        const totalFiltered = deletedCount + notAccountableForDistributionCount + noMainTypeCount + assetTypeNotFoundCount + notBusinessCount;
        const totalAssets = assets.length;
        
        let errorMsg = 'אין נכסי עסקים במבנה לפזר בהם שטח משותף';
        if (reasons.length > 0) {
          errorMsg += `. סיבות: ${reasons.join(', ')}`;
        }
        if (totalAssets === 0) {
          errorMsg = 'אין נכסים במבנה';
        } else if (totalFiltered === totalAssets) {
          errorMsg += `. כל הנכסים במבנה נפסלו (סה"כ ${totalAssets} נכסים)`;
        }
        
        setError(errorMsg);
        setTimeout(() => setError(null), 5000);
        setLoading(false);
        return;
      }

      // Sum all business accountable assets' main size (ignore existing area_from_distribution)
      let totalMainSize = 0;
      for (const asset of businessAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = dirtyAssets.get(assetId) || {};
        const currentAssetSize = existingChanges.asset_size !== undefined
          ? existingChanges.asset_size
          : (asset.asset_size || 0);
        // Use asset_size directly, ignoring any existing area_from_distribution
        totalMainSize += currentAssetSize;
      }

      // If shared area is 0, we're clearing the distribution - allow this even if totalMainSize is 0
      const isClearingDistribution = building.business_shared_area! <= 0;
      
      if (totalMainSize <= 0 && !isClearingDistribution) {
        setError('סכום שטחי הנכסים העסקיים הוא 0 או שלילי');
        setTimeout(() => setError(null), 3000);
        setLoading(false);
        return;
      }

      // Calculate overload ratio = business_shared_area / totalMainSize
      // If shared area is 0, overloadRatio should be explicitly 0 (clearing distribution)
      // If totalMainSize is 0 but we're clearing, use 0 for overloadRatio
      const overloadRatio = isClearingDistribution || building.business_shared_area! <= 0
        ? 0
        : (totalMainSize > 0 ? (building.business_shared_area! / totalMainSize) : 0);
      // Convert to percentage for storage (multiply by 100)
      const overloadRatioPercentage = overloadRatio * 100;

      // Update local building state only - overload_ratio will be saved when user clicks "Save All"
        // Only update if we're still viewing the same building
        if (building.building_number === buildingNumber) {
          setBuilding(prev => prev ? { ...prev, overload_ratio: overloadRatioPercentage } : prev);
      }

      // Also clear area_from_distribution for non-accountable assets
      const nonAccountableAssets = assets.filter(asset => {
        // Skip deleted assets
        if (deletedAssets.has(String(asset.asset_id))) {
          return false;
        }
        // Include assets with non_accountable_for_distribution === true
        return isAssetNotAccountableForDistribution(asset);
      });

      // Track changes
      const updatedDirtyAssets = new Map(dirtyAssets);
      const updatedAssets = [...assets];
      let updatedCount = 0;

      // First, clear area_from_distribution for non-accountable assets
      for (const asset of nonAccountableAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);
        const currentAreaFromDistribution = existingChanges.area_from_distribution !== undefined
          ? existingChanges.area_from_distribution
          : (currentAsset?.area_from_distribution || 0);
        
        // Only clear if it's not already 0
        if (currentAreaFromDistribution > 0) {
          const changes: Partial<Asset> = { ...existingChanges };
          changes.area_from_distribution = 0;
          updatedDirtyAssets.set(assetId, changes);
          
          // Update local assets array for immediate UI update
          const assetIndex = updatedAssets.findIndex(a => String(a.asset_id) === assetId);
          if (assetIndex !== -1) {
            updatedAssets[assetIndex] = {
              ...updatedAssets[assetIndex],
              ...changes
            } as Asset;
          }
        }
      }

      // Now distribute to accountable business assets
      for (const asset of businessAssets) {
        const assetId = String(asset.asset_id);
        const existingChanges = updatedDirtyAssets.get(assetId) || {};
        const currentAsset = updatedAssets.find(a => String(a.asset_id) === assetId);

        // Prepare changes object
        const changes: Partial<Asset> = { ...existingChanges };

        // Get current asset size for calculation (ignore existing area_from_distribution)
        const currentAssetSize = existingChanges.asset_size !== undefined
          ? existingChanges.asset_size
          : (currentAsset?.asset_size || 0);

        // Calculate new distribution area based on asset_size directly
        // Redistribution ignores any existing area_from_distribution and recalculates from scratch
        // Note: We only READ currentAssetSize for calculation, we do NOT update it
        const newDistributionArea = overloadRatio * currentAssetSize;

        // IMPORTANT: Only update area_from_distribution field
        // Do NOT update asset_size, sub_asset_size_1, or any other sub-asset sizes
        // For clearing distribution (overloadRatio = 0), set to 0; otherwise set to new value
        changes.area_from_distribution = newDistributionArea;

        updatedDirtyAssets.set(assetId, changes);

        // Update local assets array for immediate UI update
        const assetIndex = updatedAssets.findIndex(a => String(a.asset_id) === assetId);
        if (assetIndex !== -1) {
          updatedAssets[assetIndex] = {
            ...updatedAssets[assetIndex],
            ...changes
          } as Asset;
        }

        updatedCount++;
      }

      // Update local state only - changes will be saved when user clicks "Save All"
        setDirtyAssets(updatedDirtyAssets);
        setAssets(updatedAssets);
      
      // Note: Building state with updated overload_ratio was already set in the try block above
      // Show result in modal
      const sharedAreaText = building.business_shared_area! > 0 
        ? building.business_shared_area!.toLocaleString('he-IL')
        : '0 (ניקוי פיזור קודם)';
      const overloadRatioText = building.business_shared_area! > 0
        ? ` יחס העמסה: ${overloadRatioPercentage.toFixed(2)}%.`
        : '';
      setDistributionResult(`פוזר שטח משותף עסקים (${sharedAreaText}) בין ${updatedCount} נכסים.${overloadRatioText} השינויים יישמרו בלחיצה על "שמור הכל"`);
      setDistributionModalOpen(true);

      // Refresh grid
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בפיזור שטח משותף עסקים');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  }, [building, assets, assetTypes, dirtyAssets, deletedAssets, isAssetNotAccountableForDistribution]);

  // Export assets to Excel
  const handleExportToExcel = useCallback(async () => {
    if (!assets || assets.length === 0) {
      setError('אין נכסים לייצוא');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      // Get all assets with dirty changes applied
      const assetsToExport = assets.map(asset => {
        const assetId = String(asset.asset_id);
        const dirtyChanges = dirtyAssets.get(assetId) || {};
        return { ...asset, ...dirtyChanges };
      }).filter(asset => !deletedAssets.has(String(asset.asset_id)));

      // Define headers matching the grid columns
      const headers = [
        'מזהה מבנה',
        'מזהה נכס',
        'מזהה משלם',
        'אזור מס',
        'דירת גג',
        'קומה',
        'סוג הנחה',
        'תאריך הנחה מ',
        'תאריך הנחה עד',
        'תאריך מדידה',
        'סוג נכס ראשי',
        'גודל נכס ראשי',
        'סוג נכס משנה 1',
        'גודל נכס משנה 1',
        'סוג נכס משנה 2',
        'גודל נכס משנה 2',
        'סוג נכס משנה 3',
        'גודל נכס משנה 3',
        'סוג נכס משנה 4',
        'גודל נכס משנה 4',
        'סוג נכס משנה 5',
        'גודל נכס משנה 5',
        'סוג נכס משנה 6',
        'גודל נכס משנה 6',
        'גודל שטח משותף',  // area_from_distribution
        'הערה'  // comment
      ];

      // Convert assets to rows
      const rows = assetsToExport.map(asset => [
        asset.building_number || '',
        asset.asset_id || '',
        asset.payer_id || '',
        asset.tax_region || '',
        asset.penthouse || '',
        asset.floor || '',
        asset.discount_type || '',
        formatDateToDDMMYYYY(asset.discount_date_from) || '',
        formatDateToDDMMYYYY(asset.discount_date_to) || '',
        formatDateToDDMMYYYY(asset.measurement_date) || '',
        asset.main_asset_type || '',
        asset.asset_size || '',
        asset.sub_asset_type_1 || '',
        asset.sub_asset_size_1 || '',
        asset.sub_asset_type_2 || '',
        asset.sub_asset_size_2 || '',
        asset.sub_asset_type_3 || '',
        asset.sub_asset_size_3 || '',
        asset.sub_asset_type_4 || '',
        asset.sub_asset_size_4 || '',
        asset.sub_asset_type_5 || '',
        asset.sub_asset_size_5 || '',
        asset.sub_asset_type_6 || '',
        asset.sub_asset_size_6 || '',
        asset.area_from_distribution || '',
        asset.comment || ''
      ]);

      // Create data array with headers and rows
      const data = [headers, ...rows];

      // Generate filename with current date and building number
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const filename = `נכסים_מבנה_${buildingNumber}${taxRegion ? `_אזור_${taxRegion}` : ''}_${dateStr}.xlsx`;

      // Use improved export function to reduce antivirus false positives
      exportToExcel({
        filename,
        sheetName: 'נכסים',
        data,
        columnWidths: [
          { wch: 12 }, // מזהה מבנה
          { wch: 12 }, // מזהה נכס
          { wch: 12 }, // מזהה משלם
          { wch: 10 }, // אזור מס
          { wch: 8 },  // דירת גג
          { wch: 8 },  // קומה
          { wch: 12 }, // סוג הנחה
          { wch: 12 }, // תאריך הנחה מ
          { wch: 12 }, // תאריך הנחה עד
          { wch: 12 }, // תאריך מדידה
          { wch: 12 }, // סוג נכס ראשי
          { wch: 12 }, // גודל נכס ראשי
          { wch: 12 }, // סוג נכס משנה 1
          { wch: 12 }, // גודל נכס משנה 1
          { wch: 12 }, // סוג נכס משנה 2
          { wch: 12 }, // גודל נכס משנה 2
          { wch: 12 }, // סוג נכס משנה 3
          { wch: 12 }, // גודל נכס משנה 3
          { wch: 12 }, // סוג נכס משנה 4
          { wch: 12 }, // גודל נכס משנה 4
          { wch: 12 }, // סוג נכס משנה 5
          { wch: 12 }, // גודל נכס משנה 5
          { wch: 12 }, // סוג נכס משנה 6
          { wch: 12 }  // גודל נכס משנה 6
        ]
      });
      
      setToast({ message: `יוצאו ${rows.length} נכסים בהצלחה`, type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      setError('שגיאה בייצוא לקובץ Excel');
      setTimeout(() => setError(null), 3000);
    }
  }, [assets, dirtyAssets, deletedAssets, buildingNumber, taxRegion]);

  // Helper function to get cell style for validation errors and read-only indication
  const getCellStyle = useCallback((params: any) => {
    if (!params || !params.data) return { textAlign: 'right' };
    
    const assetId = String(params.data?.asset_id);
    if (!assetId || assetId === 'undefined' || assetId === 'null') return { textAlign: 'right' };
    
    // Safety check: ensure validationErrors and newAssets are defined
    if (!validationErrors || !newAssets) return { textAlign: 'right' };
    
    const hasValidationError = validationErrors.has(assetId);
    const isNewAsset = newAssets.has(assetId);
    const isEditable = isNewAsset || !!taxRegion; // Editable if new asset OR tax region is selected
    
    if (hasValidationError) {
      return {
        backgroundColor: '#fee2e2',
        border: '2px solid #ef4444',
        textAlign: 'right'
      };
    }
    
    // Add visual indication for read-only cells (existing assets when no tax region)
    if (!isEditable) {
      return {
        textAlign: 'right',
        backgroundColor: '#f9fafb', // Light gray background for read-only
        opacity: 0.8, // Slightly faded
        cursor: 'default'
      };
    }
    
    return { textAlign: 'right' };
  }, [validationErrors, newAssets, taxRegion]);

  async function handleFileUpload(assetId: number, file: File) {
    try {
      setUploadingAssetId(assetId);
      setUploadProgress({ assetId, progress: 0, fileName: file.name });

      // Step 1: Compress file (skip compression for PDF files)
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      let compressedFile: File;
      let originalSizeKB: string;
      let compressedSizeKB: string;
      
      if (isPdf) {
        // Skip compression for PDF files
        setUploadProgress({ assetId, progress: 10, fileName: file.name });
        compressedFile = file;
        originalSizeKB = (file.size / 1024).toFixed(2);
        compressedSizeKB = originalSizeKB;
      } else {
        // Compress other file types
        setUploadProgress({ assetId, progress: 10, fileName: file.name });
        compressedFile = await compressFile(file);
        originalSizeKB = (file.size / 1024).toFixed(2);
        compressedSizeKB = (compressedFile.size / 1024).toFixed(2);
      }

      setUploadProgress({ assetId, progress: 30, fileName: file.name });

      // Step 2: Prepare file for upload
      const fileExt = compressedFile.name.split('.').pop() || file.name.split('.').pop();
      const fileName = `${assetId}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Step 3: Upload with simulated progress tracking
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

      const result = await api.assets.saveBulkTransactional([{ asset_id: assetId, structure_drawing_url: publicUrl }], 'manual_update');

      if (!result.success) {
        throw new Error(result.error || 'Failed to update structure drawing URL');
      }

      setUploadProgress({ assetId, progress: 100, fileName: file.name });

      // Show success message
      const sizeReduction = compressedSizeKB !== originalSizeKB 
        ? ` (${originalSizeKB}KB → ${compressedSizeKB}KB)`
        : '';
      setToast({ message: `הקובץ הועלה בהצלחה${sizeReduction}`, type: 'success' });
      setTimeout(() => setToast(null), 5000);
      
      // Refresh data
      await fetchData(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'נכשל בהעלאת הקובץ');
      setTimeout(() => setError(null), 5000);
    } finally {
      setUploadProgress(null);
      setUploadingAssetId(null);
    }
  }

  const handleViewDrawing = useCallback((url: string, fileName?: string) => {
    setSelectedDrawingUrl(url);
    setSelectedFileName(fileName || null);
  }, []);

  // Check if tax region is "resident" (מגורים)
  // Find asset types with this tax region and check if they are all "מגורים"
  const isResidentTaxRegion = useMemo(() => {
    if (!taxRegion || !assetTypes || assetTypes.length === 0) return false;
    
    // Parse tax region (could be single number or comma-separated)
    const taxRegionNumbers = taxRegion.split(',').map(tr => parseInt(tr.trim())).filter(tr => !isNaN(tr));
    
    if (taxRegionNumbers.length === 0) return false;
    
    // Check if all asset types with these tax regions are "מגורים" (residence)
    const assetTypesForTaxRegions = assetTypes.filter(at => 
      at.tax_region != null && taxRegionNumbers.includes(at.tax_region)
    );
    
    if (assetTypesForTaxRegions.length === 0) return false;
    
    // Check if all asset types are "מגורים" (residence)
    const allAreResidence = assetTypesForTaxRegions.every(at => 
      at.business_residence === 'מגורים'
    );
    
    return allAreResidence;
  }, [taxRegion, assetTypes]);

  // Check if tax region is "multi" (multiple tax regions - when taxRegion is not set or taxRegion itself contains comma)
  const isMultiTaxRegion = useMemo(() => {
    return !taxRegion || (taxRegion && taxRegion.includes(','));
  }, [taxRegion]);

  const detailColumnDefs: ColDef<Asset>[] = useMemo(() => {
    const defs: ColDef<Asset>[] = [
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      cellStyle: { textAlign: 'right', backgroundColor: '#fef3c7', fontWeight: '600' }
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'asset_size',
      headerName: !isResidentTaxRegion ? 'גודל נכס ללא שטח משותף' : t('mainAssetSize'),
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'floor',
      headerName: 'קומה',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'discount_type',
      headerName: 'סוג הנחה',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'discount_date_from',
      headerName: 'תאריך הנחה מ',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'discount_date_to',
      headerName: 'תאריך הנחה עד',
      cellStyle: { textAlign: 'right' },
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
      cellStyle: (params: any) => getCellStyle(params),
      tooltipValueGetter: (params) => params.value || ''
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
  }, [t, assetTypes, getCellStyle, isResidentTaxRegion]);




  // Create stable penthouse checkbox cellRenderer
  const penthouseCellRenderer = useCallback((params: any) => {
    if (!params || !params.data) return null;
    
    const assetId = params.data?.asset_id;
    if (!assetId || assetId === 'undefined' || assetId === 'null') return null;
    
    // Safety check: ensure newAssets and dirtyAssets are defined
    if (!newAssets || !dirtyAssets) return null;
    
    const assetIdStr = String(assetId);
    const isNewAsset = newAssets.has(assetIdStr);
    const dirtyChanges = dirtyAssets.get(assetIdStr);
    const currentValue = dirtyChanges && 'penthouse' in dirtyChanges 
      ? dirtyChanges.penthouse 
      : params.data?.penthouse;
    const isChecked = currentValue === 'כן';
    
    // Always show checkbox for both new and existing assets
    return (
      <div className="flex items-center justify-center h-full">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => {
            const newValue = e.target.checked ? 'כן' : null;
            
            if (isNewAsset) {
              // Track the change in dirtyAssets for new assets
              setDirtyAssets(prev => {
                const next = new Map(prev);
                const existing = next.get(assetIdStr) || {};
                next.set(assetIdStr, { ...existing, penthouse: newValue });
                return next;
              });
            } else {
              // Track the change in dirtyAssets for existing assets
              setDirtyAssets(prev => {
                const next = new Map(prev);
                const existing = next.get(assetIdStr) || {};
                next.set(assetIdStr, { ...existing, penthouse: newValue });
                return next;
              });
            }
            
            // Update grid cell data directly
            params.node.setDataValue('penthouse', newValue);
            
            // Update assets state
            setAssets(prev => prev.map(a => 
              String(a.asset_id) === assetIdStr ? { ...a, penthouse: newValue } : a
            ));
            
            // Refresh only this specific cell
            if (gridRef.current) {
              gridRef.current.api.refreshCells({ 
                rowNodes: [params.node], 
                columns: ['penthouse'],
                force: true 
              });
            }
          }}
          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
        />
      </div>
    );
  }, [newAssets, dirtyAssets, setDirtyAssets, setAssets, gridRef]);

  // Switch to assets tab if transfer-history or distribution-history is active in residence tabs or multi-tax tabs
  useEffect(() => {
    if ((activeTab === 'transfer-history' && isResidentTaxRegion) || 
        ((activeTab === 'distribution-history' || activeTab === 'transfer-history') && isMultiTaxRegion)) {
      setActiveTab('assets');
    }
  }, [isResidentTaxRegion, activeTab, isMultiTaxRegion]);

  // Fetch distribution and transfer history counts (only for single tax region tabs, not multi-tax)
  useEffect(() => {
    const fetchHistoryCounts = async () => {
      if (!buildingNumber) return;
      
      // Only fetch history counts for single tax region tabs
      if (isMultiTaxRegion) {
        setDistributionHistoryCount(0);
        setTransferHistoryCount(0);
        return;
      }
      
      try {
        // Fetch distribution history count
        const actionType = isResidentTaxRegion ? 'residence_distribution' : 'business_distribution';
        const distributionHistory = await api.distributionAudit.getByBuilding(buildingNumber, actionType);
        setDistributionHistoryCount(distributionHistory.length);
        
        // Fetch transfer history count (only for business)
        if (!isResidentTaxRegion) {
          const transferHistory = await api.distributionAudit.getByBuilding(buildingNumber, 'transfer');
          setTransferHistoryCount(transferHistory.length);
        } else {
          setTransferHistoryCount(0);
        }
      } catch (error) {
        console.error('Error fetching history counts:', error);
        setDistributionHistoryCount(0);
        setTransferHistoryCount(0);
      }
    };
    
    fetchHistoryCounts();
  }, [buildingNumber, isResidentTaxRegion, isMultiTaxRegion]);

  const columnDefs: ColDef<Asset>[] = useMemo(() => {
    const defs: ColDef<Asset>[] = [
    {
      colId: 'actions',
      headerName: t('actions'),
      editable: false,
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return null;
        
        const assetId = String(asset.asset_id);
        // Allow temporary IDs for new assets (e.g., "temp-1234567890")
        if (!assetId || assetId === 'undefined' || assetId === 'null') return null;
        
        // Safety checks for state variables - use empty defaults if undefined
        const safeNewAssets = newAssets || new Set<string>();
        const safeDeletedAssets = deletedAssets || new Set<string>();
        const safeValidationErrors = validationErrors || new Map<string, string>();
        const safeSelectedAssets = selectedAssets || new Set<string>();
        
        const isNew = safeNewAssets.has(assetId);
        const isDeleted = safeDeletedAssets.has(assetId);
        const hasValidationError = safeValidationErrors.has(assetId);
        
        // Debug logging for validation errors
        if (process.env.NODE_ENV === 'development' && hasValidationError) {
          console.log('[Actions Cell] Validation error found for asset:', {
            assetId,
            error: safeValidationErrors.get(assetId),
            validationErrorsKeys: Array.from(safeValidationErrors.keys())
          });
        }
        
        // Show delete button only if a specific tax region is selected (same visibility logic as "Save All" and "Cancel" buttons)
        // Delete button should be visible for all assets (new and existing), same as view asset button
        // Hide delete button in error fixing mode
        const hasMultipleTaxRegions = building?.tax_region && building.tax_region.includes(',');
        // If building has multiple tax regions, only show delete button when a specific taxRegion is selected
        // If building has only one tax region, show delete button (taxRegion may or may not be set)
        const shouldShowDeleteButton = !isErrorFixingMode && (!hasMultipleTaxRegions || taxRegion);
        
        // Show checkbox in multi-tax-region mode (all assets view) or single tax region tab
        // Checkbox should be hidden for new assets, same as view icon
        // Hide checkbox in error fixing mode
        const shouldShowCheckbox = !isErrorFixingMode && !isNew && (
          (!taxRegion && hasMultipleTaxRegions) || // All assets view when building has multiple tax regions
          !!taxRegion // Specific tax region tab
        );
        const isSelected = safeSelectedAssets.has(assetId);
        
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {shouldShowCheckbox && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  setSelectedAssets(prev => {
                    const next = new Set(prev || []);
                    if (e.target.checked) {
                      next.add(assetId);
                    } else {
                      next.delete(assetId);
                    }
                    return next;
                  });
                }}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                title={!taxRegion && hasMultipleTaxRegions ? "בחר לשינוי אזור מס" : "בחר להעברת שטחים"}
              />
            )}
            {hasValidationError && safeValidationErrors && safeValidationErrors.has(assetId) && (() => {
              // Validation tooltip component
              const ValidationTooltipButton = ({ errorMessage, onErrorClick }: { errorMessage: string, onErrorClick: () => void }) => {
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
                      {errorMessage}
                    </div>
                  </div>
                ) : null;

                return (
                  <>
                    <button
                      ref={buttonRef}
                      onClick={(e) => {
                        e.stopPropagation();
                        onErrorClick();
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

              const errorMsg = safeValidationErrors.get(assetId) || 'שגיאת אימות';
              return (
                <ValidationTooltipButton
                  errorMessage={errorMsg}
                  onErrorClick={() => {
                    setError(errorMsg);
                    setTimeout(() => setError(null), 5000);
                  }}
                />
              );
            })()}
            {shouldShowDeleteButton && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDelete(assetId);
                }}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 ${
                  isDeleted
                    ? 'bg-red-200 hover:bg-red-300 text-red-700'
                    : 'hover:bg-red-100 text-red-500 hover:text-red-700'
                }`}
                title={isDeleted ? 'בטל מחיקה' : 'סמן למחיקה'}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      headerName: t('structureDrawing') || 'שרטוט מבנה',
      field: 'structure_drawing_url',
      pinned: 'right',
      sortable: false,
      filter: false,
      editable: false,
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return null;
        
        const assetId = String(asset.asset_id);
        const hasDrawing = !!asset.structure_drawing_url;
        const isNew = newAssets.has(assetId);
        const isUploading = uploadingAssetId === asset.asset_id;
        
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {!isErrorFixingMode && !isNew && taxRegion && (
              <label
                className="flex items-center justify-center p-1 text-blue-600 hover:text-blue-700 transition-colors hover:scale-110 cursor-pointer"
                title={t('upload') || 'העלה קובץ'}
                onClick={(e) => e.stopPropagation()}
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
                <input
                  type="file"
                  ref={(el) => {
                    if (el) fileInputRefs.current.set(assetId, el);
                  }}
                  className="hidden"
                  accept="image/*,.pdf,.dwg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(asset.asset_id, file);
                    }
                    // Reset input
                    if (fileInputRefs.current.has(assetId)) {
                      fileInputRefs.current.get(assetId)!.value = '';
                    }
                  }}
                />
              </label>
            )}
            {hasDrawing && asset.structure_drawing_url ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Extract filename from URL if possible
                  const urlParts = asset.structure_drawing_url.split('/');
                  const fileName = urlParts[urlParts.length - 1].split('?')[0];
                  handleViewDrawing(asset.structure_drawing_url, fileName);
                }}
                className="p-1 text-green-600 hover:text-green-700 transition-colors hover:scale-110"
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
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => {
        const baseStyle = getCellStyle(params);
        const asset = params.data as Asset;
        if (asset && !newAssets.has(String(asset.asset_id))) {
          return {
            ...baseStyle,
            cursor: 'pointer',
            color: '#059669',
            fontWeight: '600',
            textDecoration: 'underline',
            textDecorationColor: '#10b981',
            textUnderlineOffset: '2px'
          };
        }
        return baseStyle;
      },
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return '';
        const isClickable = !newAssets.has(String(asset.asset_id));
        const value = params.value != null ? String(params.value) : '';
        
        if (isClickable) {
          return (
            <span 
              style={{
                color: '#059669',
                fontWeight: '600',
                textDecoration: 'underline',
                textDecorationColor: '#10b981',
                textUnderlineOffset: '2px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              className="hover:text-emerald-700 hover:decoration-emerald-600"
              title={t('viewDetails') || 'לחץ לצפייה בפרטים'}
            >
              {value}
            </span>
          );
        }
        return value;
      },
      onCellClicked: (params: any) => {
        const asset = params.data as Asset;
        if (asset && !newAssets.has(String(asset.asset_id))) {
          const assetId = String(asset.asset_id);
          onSelectAsset(assetId, assetId, buildingNumber, validationTaxRegion);
        }
      }
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      editable: (params) => isFieldEditable(params, 'measurement_date'),
      cellStyle: (params: any) => {
        if (!params || !params.data) {
          return { textAlign: 'right' };
        }
        
        const assetId = String(params.data?.asset_id);
        if (!assetId || assetId === 'undefined' || assetId === 'null') {
          return { textAlign: 'right' };
        }
        
        // Safety check: ensure newAssets is defined
        if (!newAssets) {
          return { textAlign: 'right' };
        }
        
        const isNewAsset = newAssets.has(assetId);
        
        // For new assets, use the standard cell style (with validation/read-only indication)
        if (isNewAsset) {
          return getCellStyle(params);
        }
        
        // For existing assets, use the special green background style (read-only)
        return { 
          textAlign: 'right', 
          backgroundColor: '#ecfdf5', 
          fontWeight: '700', 
          color: '#065f46',
          opacity: 0.8,
          cursor: 'default'
        };
      },
      headerClass: 'ag-right-aligned-header',
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: (params) => isFieldEditable(params, 'payer_id'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'tax_region',
      headerName: 'אזור מס',
      headerTooltip: 'אזור מס',
      tooltipValueGetter: (params) => {
        if (params.value == null) return '';
        return getAreaDescriptionForTaxRegion(params.value);
      },
      editable: (params) => isFieldEditable(params, 'tax_region'),
      type: 'numericColumn',
      valueParser: (params) => {
        if (!params.newValue || params.newValue === '') return null;
        const num = parseInt(params.newValue, 10);
        return isNaN(num) ? null : num;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: (params) => isFieldEditable(params, 'penthouse'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      cellRenderer: penthouseCellRenderer,
      hide: !isResidentTaxRegion // Hide penthouse for business assets (only show for residence)
    },
    {
      field: 'floor',
      headerName: 'קומה',
      editable: (params) => isFieldEditable(params, 'floor'),
      type: 'numericColumn',
      valueParser: (params) => {
        if (!params.newValue || params.newValue === '') return null;
        const num = parseInt(params.newValue, 10);
        return isNaN(num) ? null : num;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'discount_type',
      headerName: 'סוג הנחה',
      editable: (params) => isFieldEditable(params, 'discount_type'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'discount_date_from',
      headerName: 'תאריך הנחה מ',
      editable: (params) => isFieldEditable(params, 'discount_date_from'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      valueFormatter: (params) => formatDateToDDMMYYYY(params.value)
    },
    {
      field: 'discount_date_to',
      headerName: 'תאריך הנחה עד',
      editable: (params) => isFieldEditable(params, 'discount_date_to'),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
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
      cellStyle: (params: any) => getCellStyle(params),
      tooltipValueGetter: (params) => params.value || ''
    },
    {
      field: 'main_asset_type',
      ...processColumnHeader(t('mainAssetType')),
      editable: (params) => isFieldEditable(params, 'main_asset_type'),
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'asset_size',
      headerName: !isResidentTaxRegion ? 'גודל נכס ללא שטח משותף' : t('mainAssetSize'),
      editable: (params) => isFieldEditable(params, 'asset_size'),
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'area_from_distribution',
      headerName: 'גודל שטח משותף',
      editable: false, // Always readonly - only updated through distribution functions
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      hide: isResidentTaxRegion // Hide for residence assets (area_from_distribution is only for business distribution)
    },
    {
      field: 'business_total_area',
      headerName: 'סה"כ שטח עסקים',
      editable: false, // Always readonly - calculated field
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params),
      hide: isResidentTaxRegion // Hide for residence assets (business_total_area is only for business assets)
    },
    {
      field: 'extra_field',
      headerName: '',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
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
    
    // Process all headers to add icons for long headers (>2 words)
    return defs.map(colDef => {
      if (colDef.headerName && typeof colDef.headerName === 'string') {
        const processed = processColumnHeader(colDef.headerName);
        return { ...colDef, ...processed };
      }
      return colDef;
    });
  }, [t, onSelectAsset, buildingNumber, assetTypes, newAssets, dirtyAssets, building, taxRegion, selectedAssets, deletedAssets, validationErrors, getCellStyle, isResidentTaxRegion, isFieldEditable, penthouseCellRenderer]);

  // Apply field configurations to column definitions (must be after columnDefs is defined)
  const configuredColumnDefs = useFieldConfig(columnDefs, 'assets-list');

  // Check if all visible assets are residential assets (מגורים)
  const areAllAssetsResidence = useMemo(() => {
    if (!assets || assets.length === 0 || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Create asset type map for quick lookup
    const assetTypeMap = new Map<string, AssetType>();
    assetTypes.forEach(at => {
      assetTypeMap.set(at.name, at);
    });
    
    // Check if all assets are residential (מגורים)
    const visibleAssets = assets.filter(asset => !deletedAssets.has(String(asset.asset_id)));
    if (visibleAssets.length === 0) return false;
    
    // Check if all assets have business_residence === 'מגורים'
    const allResidence = visibleAssets.every(asset => {
      if (!asset.main_asset_type) return false;
      const assetType = assetTypeMap.get(String(asset.main_asset_type));
      return assetType && assetType.business_residence === 'מגורים';
    });
    
    return allResidence;
  }, [assets, assetTypes, deletedAssets]);

  // Extract available tax regions from building
  const availableTaxRegions = useMemo(() => {
    if (!building?.tax_region) return [];
    const taxRegionStr = String(building.tax_region);
    if (!taxRegionStr.includes(',')) {
      // Single tax region
      const num = parseInt(taxRegionStr.trim(), 10);
      return isNaN(num) ? [] : [num];
    }
    // Multiple tax regions (comma-separated)
    return taxRegionStr.split(',')
      .map(tr => parseInt(tr.trim(), 10))
      .filter(tr => !isNaN(tr))
      .sort((a, b) => a - b);
  }, [building?.tax_region]);

  // Check if tax region is "business" (עסקים) - has at least one business asset type
  const isBusinessTaxRegion = useMemo(() => {
    if (!taxRegion || !assetTypes || assetTypes.length === 0) {
      // If asset types aren't loaded yet, we can't determine - default to false
      // The button will show if !isResidentTaxRegion (which will be false when asset types aren't loaded)
      return false;
    }
    
    // Parse tax region (could be single number or comma-separated)
    const taxRegionNumbers = taxRegion.split(',').map(tr => parseInt(tr.trim())).filter(tr => !isNaN(tr));
    
    if (taxRegionNumbers.length === 0) return false;
    
    // Check if there are any business asset types with these tax regions
    const assetTypesForTaxRegions = assetTypes.filter(at => 
      at.tax_region != null && taxRegionNumbers.includes(at.tax_region)
    );
    
    if (assetTypesForTaxRegions.length === 0) return false;
    
    // Check if at least one asset type is "עסקים" (business)
    const hasBusiness = assetTypesForTaxRegions.some(at => 
      at.business_residence === 'עסקים'
    );
    
    return hasBusiness;
  }, [taxRegion, assetTypes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">{t('loadingAssets')}</p>
        </div>
      </div>
    );
  }
  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 z-50 max-w-md animate-slide-in">
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-lg relative">
            <button
              type="button"
              onClick={() => setError(null)}
              className="absolute top-2 left-2 text-red-600 hover:text-red-800 transition-colors"
              title="סגור"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="text-red-800 font-medium pr-6">{t('error')}: {error}</p>
          </div>
        </div>
      )}
      {/* Blinking warning message when distribution is needed */}
      {building && (() => {
        // Check if distribution is needed: flag must be true (needs distribution)
        // With new field names: true = needs distribution, false = already distributed
        // Show alert if flag is raised, regardless of shared area value (even if 0 or null)
        const needsResidenceDistribution = isResidentTaxRegion && 
          building.need_residence_distribution === true;
        
        // Show business distribution alert if:
        // 1. Flag is raised, AND
        // 2. We're not in a residence tax region, AND
        // 3. Either we're in a business tax region tab OR we're not in any specific tax region tab
        const needsBusinessDistribution = building.need_business_distribution === true &&
          !isResidentTaxRegion &&
          (taxRegion ? (!isMultiTaxRegion) : true); // Show if taxRegion is set (and not multi) OR if taxRegion is not set
        
        if (!needsResidenceDistribution && !needsBusinessDistribution) {
          return null;
        }
        
        return (
          <div className="fixed bottom-4 left-4 z-50 max-w-md space-y-2">
            {needsResidenceDistribution && (
              <div className="animate-pulse" style={{ animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                <div className="bg-amber-500 border-l-4 border-amber-700 rounded-lg p-4 shadow-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-900 animate-bounce" />
                    <p className="text-amber-900 font-bold text-lg">
                      ⚠️ יש צורך לפזר שטח משותף מגורים!
                    </p>
                  </div>
                </div>
              </div>
            )}
            {needsBusinessDistribution && (
              <div className="animate-pulse" style={{ animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                <div className="bg-amber-500 border-l-4 border-amber-700 rounded-lg p-4 shadow-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-900 animate-bounce" />
                    <p className="text-amber-900 font-bold text-lg">
                      ⚠️ יש צורך לפזר שטח משותף עסקים!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
      <div className="w-full py-3" style={{ maxWidth: '100vw', width: '100%', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
        <div className="mb-3 bg-gradient-to-r from-teal-600 to-blue-600 rounded-lg shadow-lg p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <BuildingIcon className="w-7 h-7 text-white" />
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-white">
                  {t('buildingNumber')} {building?.building_number}
                </h1>
                <p className="text-sm text-white/90 font-semibold bg-white/20 px-2 py-1 rounded">
                  סך הכל: {assets.length} נכסים
                </p>
                {buildingAddress && (
                  <p className="text-sm text-white/90 font-medium">
                    - {buildingAddress}
                    {building?.building_number_in_street && (
                      <span className="mr-1"> {building.building_number_in_street}</span>
                    )}
                  </p>
                )}
                <p className="text-sm text-white font-semibold bg-white/20 px-2 py-1 rounded">
                  גוש: {building?.gosh || '-'}
                </p>
                <p className="text-sm text-white font-semibold bg-white/20 px-2 py-1 rounded">
                  חלקה: {building?.helka || '-'}
                </p>
                {isResidentTaxRegion && building?.residence_shared_area != null && building.residence_shared_area > 0 && (
                  <p className="text-sm text-white font-semibold bg-indigo-700 px-2 py-1 rounded">
                    שטח משותף מגורים: {building.residence_shared_area.toLocaleString('he-IL')}
                  </p>
                )}
                {taxRegion && !isMultiTaxRegion && !isResidentTaxRegion && building?.business_shared_area != null && building.business_shared_area > 0 && (
                  <p className="text-sm text-white font-semibold bg-purple-700 px-2 py-1 rounded">
                    שטח משותף עסקים: {building.business_shared_area.toLocaleString('he-IL')}
                  </p>
                )}
                {taxRegion && !isMultiTaxRegion && !isResidentTaxRegion && building?.overload_ratio != null && (
                  <p className="text-sm text-white font-semibold bg-purple-600 px-2 py-1 rounded">
                    אחוז העמסה: {building.overload_ratio.toFixed(2)}%
                  </p>
                )}
              </div>
              {taxRegion ? (
                <p className="text-sm text-white font-semibold bg-teal-700 px-3 py-1 rounded">
                  {getAreaDescriptionForTaxRegion(taxRegion)}
                </p>
              ) : (() => {
                // Get unique tax regions from assets
                const assetTaxRegions = new Set<number>();
                assets.forEach(asset => {
                  if (asset.tax_region != null) {
                    const taxRegionNum = typeof asset.tax_region === 'string' 
                      ? parseInt(asset.tax_region, 10) 
                      : asset.tax_region;
                    if (!isNaN(taxRegionNum)) {
                      assetTaxRegions.add(taxRegionNum);
                    }
                  }
                });
                const sortedRegions = Array.from(assetTaxRegions).sort((a, b) => a - b);
                const regionDescriptions = sortedRegions.map(region => getAreaDescriptionForTaxRegion(region));
                return sortedRegions.length > 0 ? (
                  <p className="text-sm text-white font-semibold bg-teal-700 px-3 py-1 rounded">
                    {regionDescriptions.join(', ')}
                  </p>
                ) : null;
              })()}
            </div>
          </div>
        </div>
        <div className="mb-3">
          {/* All Action Buttons in One Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Hide add button if building has more than one tax region and no specific taxRegion is selected, or in error fixing mode */}
            {!isErrorFixingMode && (() => {
              const hasMultipleTaxRegions = building?.tax_region && building.tax_region.includes(',');
              // If a specific taxRegion is selected (we're in a tax region tab), show buttons
              // If no taxRegion but building has multiple regions, hide buttons
              if (hasMultipleTaxRegions && !taxRegion) return null;
              
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenNewAsset) {
                      // Use the tax region from the active tab (shown in header)
                      // This should be a single value, but if somehow it contains comma, use only the first part
                      let taxRegionToPass = taxRegion;
                      if (taxRegion && taxRegion.includes(',')) {
                        // Safety: if taxRegion somehow contains comma, extract first value
                        // This shouldn't happen if tabs are created correctly, but add safety check
                        console.warn('[AssetsList] taxRegion contains comma, extracting first value:', taxRegion);
                        taxRegionToPass = taxRegion.split(',')[0].trim();
                      }
                      console.log('[AssetsList] Opening new asset with:', { buildingNumber, taxRegion: taxRegionToPass, originalTaxRegion: taxRegion });
                      onOpenNewAsset(buildingNumber, taxRegionToPass);
                    } else {
                      addEmptyRow();
                    }
                  }}
                  className="btn btn-primary btn-md"
                >
                  <Plus className="h-4 w-4" />
                  הוסף נכס
                </button>
              );
            })()}
            <button
              type="button"
              onClick={handleBatchValidateBuildingAssets}
              className="btn btn-secondary btn-md"
              title={selectedAssets.size > 0 ? `אמת ${selectedAssets.size} נכסים נבחרים` : 'אמת את כל הנכסים'}
            >
              <CheckCircle2 className="h-4 w-4" />
              {selectedAssets.size > 0 ? `אמת נבחרים (${selectedAssets.size})` : 'אמת הכל'}
            </button>
            {!isErrorFixingMode && (
              <button
                type="button"
                onClick={handleExportToExcel}
                disabled={loading || assets.length === 0}
                className="btn btn-export btn-md"
                title="ייצא את כל הנכסים לקובץ Excel"
              >
                <FileSpreadsheet className="h-4 w-4" />
                ייצא ל-Excel
              </button>
            )}
            {/* Change tax region button - only show in "all assets" tab (when taxRegion is not set) and not in error fixing mode */}
            {!isErrorFixingMode && !taxRegion && building && availableTaxRegions.length > 1 && (
              <button
                type="button"
                onClick={() => setChangeTaxRegionModalOpen(true)}
                disabled={loading || selectedAssets.size === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 active:from-purple-700 active:to-purple-800 disabled:from-gray-400 disabled:to-gray-500  text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none disabled:cursor-not-allowed font-semibold border border-purple-700/20 disabled:border-gray-500/20"
                title={selectedAssets.size > 0 ? `שנה אזור מס ל-${selectedAssets.size} נכסים נבחרים` : 'בחר נכסים לשינוי אזור מס'}
              >
                <MapPin className="h-4 w-4" />
                שנה אזור מס {selectedAssets.size > 0 ? `(${selectedAssets.size})` : ''}
              </button>
            )}
            {/* Distribute shared area button - always visible in residence tabs, enabled when flag is on (blinking alert), hidden in error fixing mode */}
            {!isErrorFixingMode && building && isResidentTaxRegion && building.residence_shared_area != null && (
              <button
                type="button"
                onClick={handleDistributeSharedArea}
                disabled={
                  loading || 
                  assets.length === 0 || 
                  building.need_residence_distribution !== true
                  // Note: Allow distribution even if area is 0, as long as flag is true (blinking alert is on)
                }
                className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 active:from-teal-700 active:to-teal-800 disabled:from-gray-400 disabled:to-gray-500  text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none disabled:cursor-not-allowed font-semibold border border-teal-700/20 disabled:border-gray-500/20"
                title={building.need_residence_distribution === true 
                  ? building.residence_shared_area! > 0
                    ? `פזר שטח משותף מגורים (${building.residence_shared_area!.toLocaleString('he-IL')}) בין כל נכסי המגורים`
                    : 'נקה פיזור קודם של שטח משותף מגורים (שטח משותף = 0)'
                  : 'יש לשנות את שטח משותף מגורים כדי לאפשר פיזור'}
              >
                <Download className="h-4 w-4" />
                פזר שטח משותף מגורים
              </button>
            )}
            {/* Distribute business shared area button - always visible in business tabs, enabled when flag is on (blinking alert), hidden in error fixing mode */}
            {!isErrorFixingMode && building && taxRegion && !isMultiTaxRegion && !isResidentTaxRegion && building.business_shared_area != null && (
              <button
                type="button"
                onClick={handleDistributeBusinessSharedArea}
                disabled={
                  loading || 
                  assets.length === 0 || 
                  building.need_business_distribution !== true
                  // Note: Allow distribution even if area is 0, as long as flag is true (blinking alert is on)
                }
                className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 active:from-violet-700 active:to-violet-800 disabled:from-gray-400 disabled:to-gray-500  text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none disabled:cursor-not-allowed font-semibold border border-violet-700/20 disabled:border-gray-500/20"
                title={building.need_business_distribution === true
                  ? building.business_shared_area! > 0
                    ? `פזר שטח משותף עסקים (${building.business_shared_area!.toLocaleString('he-IL')}) בין כל נכסי העסקים`
                    : 'נקה פיזור קודם של שטח משותף עסקים (שטח משותף = 0)'
                  : 'יש לשנות את שטח משותף עסקים כדי לאפשר פיזור'}
              >
                <Download className="h-4 w-4" />
                פזר שטח משותף עסקים
              </button>
            )}
            {/* Show save and cancel buttons only if a specific tax region is selected (same visibility logic as delete button) */}
            {(() => {
              const hasMultipleTaxRegions = building?.tax_region && building.tax_region.includes(',');
              // If building has multiple tax regions, only show buttons when a specific taxRegion is selected
              // If building has only one tax region, show buttons (taxRegion may or may not be set)
              const shouldShowButtons = !hasMultipleTaxRegions || taxRegion;
              
              if (!shouldShowButtons) return null;
              
              // Check if building is private (single_double_family)
              const isPrivateBuilding = building?.single_double_family === 'כן' || building?.single_double_family === 'yes';
              
              // Check if tax region is "multi" (multiple tax regions - when taxRegion is not set or building has multiple)
              const isMultiTaxRegion = !taxRegion || (building?.tax_region && building.tax_region.includes(','));
              
              // Show transfer button only in business tabs (not in residence tabs)
              const shouldShowTransferButton = !isResidentTaxRegion;
              
              // Check if we have 2 or more selected assets for transfer areas button
              const canTransferAreas = selectedAssets.size >= 2 && shouldShowTransferButton;
              
              return (
                <>
                  {!isErrorFixingMode && shouldShowTransferButton && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenTransferAreas && selectedAssets.size >= 2) {
                          const selectedAssetIds = Array.from(selectedAssets);
                          onOpenTransferAreas(selectedAssetIds, buildingNumber, taxRegion);
                          // Clear selection after opening
                          setSelectedAssets(new Set());
                        }
                      }}
                      disabled={!canTransferAreas}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 active:from-indigo-700 active:to-indigo-800 disabled:from-gray-400 disabled:to-gray-500  text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none disabled:cursor-not-allowed font-semibold border border-indigo-700/20 disabled:border-gray-500/20"
                      title={canTransferAreas ? `העברת שטחים (${selectedAssets.size} נכסים נבחרו)` : 'בחר לפחות 2 נכסים להעברת שטחים'}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      העברת שטחים {selectedAssets.size > 0 ? `(${selectedAssets.size})` : ''}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCancelAll}
                    disabled={loading || totalChanges === 0}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 active:from-gray-700 active:to-gray-800 disabled:from-gray-300 disabled:to-gray-400  text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none font-semibold border border-gray-700/20 disabled:border-gray-400/20"
                  >
                    <X className="h-4 w-4" />
                    ביטול
                  </button>
                  {/* Save button: disabled when there are validation errors or no changes */}
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={loading || totalChanges === 0 || hasValidationErrors}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:from-green-700 active:to-green-800 disabled:from-gray-300 disabled:to-gray-400  text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none font-semibold border border-green-700/20 disabled:border-gray-400/20"
                    title={hasValidationErrors ? 'תקן שגיאות אימות לפני השמירה' : undefined}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {loading ? 'שומר...' : `שמור הכל${totalChanges > 0 ? ` (${totalChanges})` : ''}`}
                  </button>
                </>
              );
            })()}
          </div>
          
          {/* Tab Navigation - hidden in error fixing mode */}
          {!isErrorFixingMode && building && (
              <div className="flex items-center gap-1 border-b-2 border-gray-300 bg-gradient-to-b from-gray-50 to-gray-100 rounded-t-lg shadow-sm mt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('assets')}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all duration-200 rounded-t-lg ${
                    activeTab === 'assets'
                      ? 'text-blue-700 bg-white border-b-2 border-blue-600 shadow-md -mb-0.5'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-white/50'
                  }`}
                >
                  <BuildingIcon className="h-4 w-4" />
                  נכסים
                </button>
                {/* Only show distribution and transfer history tabs for single tax region tabs (not multi-tax) */}
                {!isMultiTaxRegion && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('distribution-history')}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all duration-200 rounded-t-lg ${
                        activeTab === 'distribution-history'
                          ? 'text-teal-700 bg-white border-b-2 border-teal-600 shadow-md -mb-0.5'
                          : 'text-gray-600 hover:text-teal-600 hover:bg-white/50'
                      }`}
                    >
                      <History className="h-4 w-4" />
                      היסטוריית פיזור
                      {distributionHistoryCount > 0 && (
                        <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 rounded-full">
                          {distributionHistoryCount}
                        </span>
                      )}
                    </button>
                    {!isResidentTaxRegion && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('transfer-history')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all duration-200 rounded-t-lg ${
                          activeTab === 'transfer-history'
                            ? 'text-violet-700 bg-white border-b-2 border-violet-600 shadow-md -mb-0.5'
                            : 'text-gray-600 hover:text-violet-600 hover:bg-white/50'
                        }`}
                      >
                        <Share2 className="h-4 w-4" />
                        היסטוריית העברות
                        {transferHistoryCount > 0 && (
                          <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 rounded-full">
                            {transferHistoryCount}
                          </span>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
          )}
        </div>
        
        {/* Tab Content */}
        {activeTab === 'assets' && (
          <div className="ag-theme-alpine rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 border border-blue-100" style={{ height: '60vh', width: '100%', minWidth: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={assets}
            columnDefs={configuredColumnDefs}
            getRowStyle={(params) => {
              const assetId = String(params.data?.asset_id);
              if (deletedAssets.has(assetId)) {
                return { backgroundColor: '#fee2e2', opacity: 0.7 }; // Light red for deleted
              }
              if (validationErrors.has(assetId)) {
                return { 
                  backgroundColor: '#fee2e2', 
                  border: '3px solid #ef4444',
                  borderRadius: '4px'
                }; // Light red background with red border for validation errors (matches other components)
              }
              return null;
            }}
            defaultColDef={{
              resizable: false, // Disabled - use field configurations instead
              wrapHeaderText: true,
              autoHeaderHeight: true,
              wrapText: true,
              autoHeight: false,
              headerClass: 'ag-right-aligned-header',
              headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
              cellStyle: { textAlign: 'right' },
              minWidth: 40
            }}
            gridOptions={{
              suppressColumnVirtualisation: true,
              alwaysShowHorizontalScroll: true,
              suppressMovableColumns: true,
              suppressColumnMoveAnimation: true,
            }}
            domLayout="normal"
            getRowId={(params) => String(params.data.asset_id)}
            onCellValueChanged={onCellValueChanged}
            onGridReady={async (params) => {
              // Load saved column state first
              await gridPreferences.loadColumnState(params.api);
              // Ensure all columns are visible and grid calculates proper width
              params.api.refreshCells({ force: true });
              // Scroll to left on grid ready
              setTimeout(() => {
                const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                if (gridElement) {
                  gridElement.scrollLeft = 0;
                }
                // Detect and apply text overflow fade
                detectAndApplyTextOverflow(params.api);
              }, 300);
            }}
            onFirstDataRendered={async (params) => {
              // Scroll to left after data render
              setTimeout(() => {
                const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                if (gridElement) {
                  gridElement.scrollLeft = 0;
                }
                // Detect and apply text overflow fade
                detectAndApplyTextOverflow(params.api);
                // Set up observer for dynamic changes
                setupTextOverflowObserver(params.api);
              }, 200);
            }}
            onColumnResized={(params) => {
              gridPreferences.handleColumnResized();
              // Re-check overflow after column resize
              setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
            }}
            onColumnMoved={(params) => {
              // Prevent actions column from being moved - force it back to pinned right
              try {
                const columnApi = (params as any).columnApi || params.api;
                if (columnApi && columnApi.getColumn) {
                  const actionsColumn = columnApi.getColumn('actions');
                  if (actionsColumn) {
                    const allColumns = columnApi.getAllColumns ? columnApi.getAllColumns() : [];
                    const actionsIndex = allColumns.findIndex((col: any) => col.getColId() === 'actions');
                    if (actionsIndex !== 0) {
                      setTimeout(() => {
                        if (gridRef.current?.api) {
                          const columnState = gridRef.current.api.getColumnState();
                          const actionsCol = columnState.find((col: any) => col.colId === 'actions');
                          const otherCols = columnState.filter((col: any) => col.colId !== 'actions');
                          if (actionsCol) {
                            gridRef.current.api.applyColumnState({
                              state: [{ ...actionsCol, pinned: 'right', lockPosition: true }, ...otherCols],
                              applyOrder: true
                            });
                          }
                        }
                      }, 0);
                      return;
                    }
                  }
                }
              } catch (error) {
                console.warn('Error in onColumnMoved:', error);
              }
              // Save column state after move
              gridPreferences.handleColumnMoved();
            }}
            onSortChanged={() => {}}
            animateRows={true}
            enableRtl={true}
            suppressHorizontalScroll={false}
          />
          </div>
        )}
        
        {/* Distribution and Transfer History tabs - only show for single tax region tabs (not multi-tax) */}
        {!isMultiTaxRegion && (
          <>
            {activeTab === 'distribution-history' && (
              <div className="rounded-xl shadow-lg border border-gray-200 bg-white overflow-hidden" style={{ height: '60vh', width: '100%' }}>
                <DistributionHistoryModal
                  isOpen={true}
                  onClose={() => setActiveTab('assets')}
                  buildingNumber={buildingNumber}
                  isResident={isResidentTaxRegion}
                  inline={true}
                />
              </div>
            )}
            
            {activeTab === 'transfer-history' && !isResidentTaxRegion && (
              <div className="rounded-xl shadow-lg border border-gray-200 bg-white overflow-hidden" style={{ height: '60vh', width: '100%' }}>
                <TransferHistoryModal
                  isOpen={true}
                  onClose={() => setActiveTab('assets')}
                  buildingNumber={buildingNumber}
                  inline={true}
                />
              </div>
            )}
          </>
        )}
      </div>

      <ValidationResultModal
        isOpen={showBatchValidationModal}
        onClose={() => setShowBatchValidationModal(false)}
        isLoading={batchValidationLoading}
        progress={batchValidationProgress}
        context="building"
        batchResults={batchValidationResults}
        batchTitle={`אימות נכסי מבנה ${buildingNumber}${taxRegion ? ` - ${getAreaDescriptionForTaxRegion(taxRegion)}` : ''}`}
        buildingNumber={buildingNumber}
        taxRegion={taxRegion}
        onSelectAsset={onSelectAsset}
        onExportInvalid={batchValidationResults && batchValidationResults.errors.some(e => e.errors.length > 0) ? handleExportInvalidAssetsToFile : undefined}
      />

      {/* Change Tax Region Modal */}
      <ChangeTaxRegionModal
        isOpen={changeTaxRegionModalOpen}
        onClose={() => {
          setChangeTaxRegionModalOpen(false);
          setSelectedAssets(new Set()); // Clear selection after closing
        }}
        selectedAssetIds={Array.from(selectedAssets)}
        buildingNumber={buildingNumber}
        onSelectAsset={onSelectAsset}
        onOpenAssetsTab={onOpenAssetsTab}
        availableTaxRegions={availableTaxRegions}
        assetTypes={assetTypes}
        onCloseTabAndOpenMultiTax={onCloseTabAndOpenMultiTax}
        onSuccess={() => {
          // Clear dirty bits for assets that were successfully saved via tax region change
          // Capture the selected asset IDs that were passed to the modal to avoid stale closures
          const savedAssetIds = Array.from(selectedAssets);
          
          console.log('[AssetsList] Clearing dirty bits after tax region change:', {
            savedAssetIds,
            dirtyAssetsSizeBefore: dirtyAssets.size,
            dirtyAssetIdsBefore: Array.from(dirtyAssets.keys())
          });
          
          setDirtyAssets(prev => {
            const next = new Map(prev);
            let clearedCount = 0;
            for (const assetId of savedAssetIds) {
              const assetIdStr = String(assetId);
              if (next.delete(assetIdStr)) {
                clearedCount++;
              }
            }
            console.log('[AssetsList] Cleared dirty bits:', { 
              clearedCount, 
              remainingSize: next.size,
              remainingIds: Array.from(next.keys())
            });
            return next;
          });
          
          // Also clear validation errors for these assets
          setValidationErrors(prev => {
            const next = new Map(prev);
            for (const assetId of savedAssetIds) {
              next.delete(String(assetId));
            }
            return next;
          });
          
          // Clear selection first before fetchData to avoid issues
          setSelectedAssets(new Set());
          
          // Refresh assets after successful change
          // This will filter assets by current tab's taxRegion, so assets with new tax_region won't appear
          // but their dirty bits are already cleared above
          fetchData(false);
        }}
      />

      {/* Distribution Result Modal */}
      {distributionModalOpen && distributionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setDistributionModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">תוצאות פיזור שטח משותף</h3>
              <button
                onClick={() => setDistributionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="סגור"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-6">
              <p className="text-gray-700 text-lg text-center">{distributionResult}</p>
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => setDistributionModalOpen(false)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-semibold"
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* File Viewer Modal */}
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
              setSelectedFileName(null);
              setFileViewerClosing(false);
            }, 300);
          }}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col transition-all duration-300 ${
              fileViewerClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-slate-800">{t('structureDrawing') || 'שרטוט מבנה'}</h3>
              <button
                onClick={() => {
                  setFileViewerClosing(true);
                  setTimeout(() => {
                    setSelectedDrawingUrl(null);
                    setSelectedFileName(null);
                    setFileViewerClosing(false);
                  }, 300);
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors font-bold"
              >
                <X className="h-4 w-4" />
                <span>{t('closeViewer') || 'סגור'}</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <FileViewer
                fileUrl={selectedDrawingUrl}
                fileName={selectedFileName || `structure-drawing-${buildingNumber}`}
              />
            </div>
          </div>
        </div>
      )}

    </>
  );
});
