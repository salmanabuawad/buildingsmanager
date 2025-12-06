import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, AddressList, api } from '../lib/api';
import { assetValidators, validateAll, inputValidators, validateEntity } from '../lib/validation';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, IDetailCellRendererParams } from 'ag-grid-community';
import { Building as BuildingIcon, AlertCircle, ChevronDown, ChevronRight, Loader2, Save, X, Plus, Trash2, Eye, CheckCircle2, Download, ArrowRightLeft, Upload } from 'lucide-react';
import { ValidationResultModal, BatchValidationResults, ValidationProgress } from './ValidationResultModal';
import { useValidationRules } from '../contexts/ValidationContext';
import { supabase } from '../lib/supabase';
import { compressFile } from '../lib/fileCompression';
interface AssetsListProps {
  buildingNumber: number;
  taxRegion?: string;
  onSelectAsset: (assetId: string, assetIdentifier: string, buildingNumber: number, taxRegion?: string) => void;
  onOpenTransferAreas?: (selectedAssetIds: string[], buildingNumber: number, taxRegion?: string) => void;
  onOpenNewAsset?: (buildingNumber: number, taxRegion?: string) => void;
}
export function AssetsList({ buildingNumber, taxRegion, onSelectAsset, onOpenTransferAreas, onOpenNewAsset }: AssetsListProps) {
  const { t } = useTranslation();
  const { validationRules } = useValidationRules(); // Get validation rules from context
  const [assets, setAssets] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [buildingAddress, setBuildingAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirtyAssets, setDirtyAssets] = useState<Map<string, Partial<Asset>>>(new Map());
  const [newAssets, setNewAssets] = useState<Set<string>>(new Set());
  const [deletedAssets, setDeletedAssets] = useState<Set<string>>(new Set());
  const [originalAssets, setOriginalAssets] = useState<Asset[]>([]);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const gridRef = useRef<AgGridReact<Asset>>(null);
  const [showBatchValidationModal, setShowBatchValidationModal] = useState(false);
  const [batchValidationLoading, setBatchValidationLoading] = useState(false);
  const [batchValidationProgress, setBatchValidationProgress] = useState<ValidationProgress | null>(null);
  const [batchValidationResults, setBatchValidationResults] = useState<BatchValidationResults | null>(null);
  const [uploadingAssetId, setUploadingAssetId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ assetId: number; progress: number; fileName: string } | null>(null);
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  
  // Save tax region in a variable for validation handler
  // This ensures the validation handler uses the tax region from the tab, not the building's tax regions
  const validationTaxRegion = useMemo(() => {
    const result = taxRegion && taxRegion.trim() !== '' ? taxRegion.trim() : undefined;
    // Return taxRegion if it exists and is not empty, otherwise undefined
    return result;
  }, [taxRegion, buildingNumber]);
  
  // Calculate total changes: new assets count as 1 each, even if edited
  // Edited existing assets (not in newAssets) + new assets + deleted assets
  const totalChanges = useMemo(() => {
    let editedExistingAssets = 0;
    for (const assetId of dirtyAssets.keys()) {
      if (!newAssets.has(String(assetId))) {
        editedExistingAssets++;
      }
    }
    return newAssets.size + editedExistingAssets + deletedAssets.size;
  }, [newAssets, dirtyAssets, deletedAssets]);
  
  useEffect(() => {
    fetchData();
  }, [buildingNumber, taxRegion]);
  async function fetchData(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      const [buildingData, assetsData, assetTypesData] = await Promise.all([
        api.buildings.getOne(buildingNumber),
        api.assets.getAll(buildingNumber),
        api.assetTypes.getAll()
      ]);
      setBuilding(buildingData);
      setAssetTypes(assetTypesData || []);
      
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
      console.log(`[AssetsList] Fetched data for building ${buildingNumber}:`, {
        assetsCount: (assetsData || []).length,
        assetTypesCount: (assetTypesData || []).length,
        taxRegion,
        buildingExists: !!buildingData
      });
      
      // Filter by tax region if provided
      let filteredAssets = assetsData || [];
      if (taxRegion) {
        const taxRegionNum = parseInt(taxRegion.trim());
        const taxRegionStr = taxRegion.trim();
        
        console.log(`[AssetsList] Filtering assets by tax region:`, {
          requestedTaxRegion: taxRegion,
          taxRegionNum,
          taxRegionStr,
          totalAssetsBeforeFilter: (assetsData || []).length
        });
        
        filteredAssets = [];
        let skippedNoTaxRegion = 0;
        let matched = 0;
        
        for (const asset of assetsData || []) {
          // Use asset.tax_region directly from the asset
          const assetTaxRegion = asset.tax_region;
          
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
        
        // If filtering resulted in 0 assets but we have assets in the database,
        // show a warning and include all assets (user can see what's available)
        if (filteredAssets.length === 0 && (assetsData || []).length > 0) {
          const assetTaxRegions = (assetsData || []).map(a => a.tax_region).filter(tr => tr != null);
          console.warn(`[AssetsList] Tax region filter resulted in 0 assets. Showing all assets for building ${buildingNumber}.`, {
            requestedTaxRegion: taxRegion,
            totalAssets: (assetsData || []).length,
            assetTaxRegions: [...new Set(assetTaxRegions)]
          });
          // Show all assets when filter results in 0 matches
          filteredAssets = assetsData || [];
        }
      }
      
      // Ensure all assets have valid IDs
      const validFilteredAssets = (filteredAssets || []).filter(asset => {
        if (!asset) return false;
        if (asset.id === undefined || asset.id === null) {
          console.warn('[AssetsList] Asset missing ID:', asset);
          return false;
        }
        return true;
      });
      
      // Preserve new assets that haven't been saved yet (failed saves remain visible)
      const existingNewAssets = assets.filter(a => {
        if (!a || a.id === undefined || a.id === null) return false;
        return newAssets.has(String(a.id));
      });
      const mergedAssets = [...validFilteredAssets, ...existingNewAssets];
      
      console.log(`[AssetsList] Setting assets:`, {
        validFilteredCount: validFilteredAssets.length,
        existingNewAssetsCount: existingNewAssets.length,
        totalAssets: mergedAssets.length,
        buildingNumber,
        taxRegion,
        sampleAsset: mergedAssets[0] ? {
          id: mergedAssets[0].id,
          asset_id: mergedAssets[0].asset_id,
          main_asset_type: mergedAssets[0].main_asset_type
        } : null
      });
      
      setAssets(mergedAssets);
      
      // Store original assets for cancel functionality
      if (dirtyAssets.size === 0 && newAssets.size === 0 && deletedAssets.size === 0) {
        setOriginalAssets(JSON.parse(JSON.stringify(mergedAssets)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apartments');
    } finally {
      if (showLoading) setLoading(false);
    }
  }
  // Debounce timer for validation
  const validationTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const assetId = data.id;
      const newValue = event.newValue;

      // Create updated asset with new value
      const updatedAsset = { ...data, [field]: newValue };

      // Track the change in dirtyAssets immediately (no debounce)
      setDirtyAssets(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(assetId) || {};
        newMap.set(assetId, { ...existing, [field]: newValue });
        return newMap;
      });

      // Update the assets state immediately (no debounce)
      setAssets(prevAssets =>
        prevAssets.map(asset =>
          String(asset.id) === String(assetId) ? updatedAsset : asset
        )
      );

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

      // Debounce expensive database validations (500ms delay)
      // This prevents validation from running on every keystroke
      const timer = setTimeout(async () => {
        try {
          // Build validation list - only validate fields that are relevant to the changed field
          const validations: Promise<any>[] = [];

          // Prepare cached data for validation (all data is already in memory)
          const cachedData = {
            assetTypes: assetTypes || [],
            building: building
          };

          // Always validate the changed field
          if (field === 'main_asset_type') {
            validations.push(
              assetValidators.validateAssetType(updatedAsset.main_asset_type, 'main_asset_type', validationTaxRegion),
              assetValidators.validateMainAssetTypeComplete(updatedAsset.building_number, updatedAsset.main_asset_type, updatedAsset.asset_size, updatedAsset, validationTaxRegion, cachedData)
            );
          } else if (field.startsWith('sub_asset_type_')) {
            const subIndex = field.replace('sub_asset_type_', '');
            const sizeField = `sub_asset_size_${subIndex}` as keyof Asset;
            validations.push(
              assetValidators.validateAssetType(updatedAsset[field as keyof Asset] as string, field, validationTaxRegion, validationRules, cachedData),
              assetValidators.validateSubAssetTypeComplete(
                updatedAsset.building_number,
                updatedAsset[field as keyof Asset] as string,
                updatedAsset[sizeField] as number,
                validationTaxRegion,
                cachedData,
                updatedAsset // Pass main asset data for penthouse and building-level validations
              )
            );
          } else if (field.startsWith('sub_asset_size_')) {
            const subIndex = field.replace('sub_asset_size_', '');
            const typeField = `sub_asset_type_${subIndex}` as keyof Asset;
            if (updatedAsset[typeField]) {
              validations.push(
                assetValidators.validateSubAssetTypeComplete(
                  updatedAsset.building_number,
                  updatedAsset[typeField] as string,
                  updatedAsset[field as keyof Asset] as number,
                  validationTaxRegion,
                  cachedData,
                  updatedAsset // Pass main asset data for penthouse and building-level validations
                )
              );
            }
          }

          // If main_asset_type or asset_size changed, validate sub-asset relationships
          if (field === 'main_asset_type' || field === 'asset_size') {
            const shouldValidateSubAssets = updatedAsset.main_asset_type === '199' || updatedAsset.main_asset_type === '299';
            if (shouldValidateSubAssets) {
              validations.push(
                assetValidators.validateSubAssetsFor199Or299(
                  updatedAsset.building_number,
                  updatedAsset.main_asset_type,
                  updatedAsset.asset_size,
                  [
                    updatedAsset.sub_asset_type_1,
                    updatedAsset.sub_asset_type_2,
                    updatedAsset.sub_asset_type_3,
                    updatedAsset.sub_asset_type_4,
                    updatedAsset.sub_asset_type_5,
                    updatedAsset.sub_asset_type_6
                  ],
                  [
                    updatedAsset.sub_asset_size_1,
                    updatedAsset.sub_asset_size_2,
                    updatedAsset.sub_asset_size_3,
                    updatedAsset.sub_asset_size_4,
                    updatedAsset.sub_asset_size_5,
                    updatedAsset.sub_asset_size_6
                  ],
                  validationTaxRegion,
                  cachedData
                ),
                assetValidators.validateSubAssetSizeMatchesMain(
                  updatedAsset.asset_size,
                  [
                    updatedAsset.sub_asset_type_1,
                    updatedAsset.sub_asset_type_2,
                    updatedAsset.sub_asset_type_3,
                    updatedAsset.sub_asset_type_4,
                    updatedAsset.sub_asset_type_5,
                    updatedAsset.sub_asset_type_6
                  ],
                  [
                    updatedAsset.sub_asset_size_1,
                    updatedAsset.sub_asset_size_2,
                    updatedAsset.sub_asset_size_3,
                    updatedAsset.sub_asset_size_4,
                    updatedAsset.sub_asset_size_5,
                    updatedAsset.sub_asset_size_6
                  ]
                )
              );
            }
          }

          // Only run validations if there are any
          if (validations.length > 0) {
            const validation = await validateAll(validations);

            if (!validation.valid) {
              const detailedError = validation.error || 'Unknown validation error';
              setValidationErrors(prev => {
                const newMap = new Map(prev);
                newMap.set(String(assetId), detailedError);
                return newMap;
              });
              // Refresh the grid cells to show validation styling
              event.api.refreshCells({ rowNodes: [event.node!], force: true });
            } else {
              // Clear validation error if validation passes
              setValidationErrors(prev => {
                const newMap = new Map(prev);
                newMap.delete(String(assetId));
                return newMap;
              });
              // Refresh the grid cells to clear validation styling
              event.api.refreshCells({ rowNodes: [event.node!], force: true });
            }
          } else {
            // No validations needed for this field, clear any existing errors
            setValidationErrors(prev => {
              const newMap = new Map(prev);
              newMap.delete(String(assetId));
              return newMap;
            });
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
  }, [validationTaxRegion, setAssets]);

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
        sampleAssetIds: gridAssets.slice(0, 3).map(a => ({ id: a.id, asset_id: a.asset_id, tax_region: a.tax_region }))
      });

      // IMPORTANT: Filter out historical records - only validate latest measurements (is_latest === true)
      // Historical records (is_latest === false) should NOT be validated
      let latestAssets = gridAssets.filter(asset => {
        // If is_latest is not explicitly set, assume it's latest (for backward compatibility)
        return asset.is_latest !== false;
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
        // Filter to only selected assets - match by database id (stored in selectedAssets)
        // selectedAssets contains asset.id (database ID), not asset.asset_id
        assetsToValidate = latestAssets.filter(asset => {
          const dbId = String(asset.id);
          return selectedAssets.has(dbId);
        });
        console.log(`[Batch Validation] Selected assets count: ${selectedAssets.size}, Grid assets count: ${latestAssets.length}, Assets to validate: ${assetsToValidate.length}`);
        console.log(`[Batch Validation] Selected database IDs:`, Array.from(selectedAssets));
        console.log(`[Batch Validation] Assets to validate database IDs:`, assetsToValidate.map(a => String(a.id)));
      } else {
        // Validate all assets shown in the grid
        assetsToValidate = latestAssets;
        console.log(`[Batch Validation] Validating all ${assetsToValidate.length} assets from grid`);
      }

      // Apply dirty changes to assets before validating (so we validate the current edited state)
      assetsToValidate = assetsToValidate.map(asset => {
        const dirtyChanges = dirtyAssets.get(String(asset.id));
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

      // Map unified handler results to the expected format
      // Include ALL results (both valid and invalid) in the errors array
      // The modal will filter them based on the selected filter (all/valid/invalid)
      // Verify counters match the results
      const actualValid = batchResult.results.filter(r => r.valid && (!r.errors || r.errors.length === 0)).length;
      const actualInvalid = batchResult.results.filter(r => !r.valid || (r.errors && r.errors.length > 0)).length;
      const actualTotal = batchResult.results.length;
      
      console.log(`[Batch Validation] Handler returned: total=${batchResult.total}, valid=${batchResult.valid}, invalid=${batchResult.invalid}, results.length=${batchResult.results.length}`);
      console.log(`[Batch Validation] Recalculated: actualTotal=${actualTotal}, actualValid=${actualValid}, actualInvalid=${actualInvalid}`);
      
      // Map ALL results (both valid and invalid) - the modal will filter them
      const results = {
        total: actualTotal, // Use actual count from results array
        valid: actualValid,  // Recalculate from results
        invalid: actualInvalid, // Recalculate from results
        errors: batchResult.results.map(result => {
          // Find the asset to get its database ID
          const asset = assetsToValidate.find(a => String(a.asset_id) === String(result.assetId));
          return {
            assetId: String(result.assetId),
            assetDbId: asset ? String(asset.id) : undefined,
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
        const newValidationErrors = new Map<string, Map<string, string>>();

        // Mark each invalid asset using database ID if available, otherwise fall back to asset_id lookup
        for (const errorInfo of results.errors) {
          let dbId = errorInfo.assetDbId;
          
          // If no database ID, try to find it by asset_id
          if (!dbId) {
            const asset = assets.find(a => String(a.asset_id) === errorInfo.assetId);
            if (asset) {
              dbId = String(asset.id);
            }
          }
          
          if (dbId) {
            const fieldErrors = new Map<string, string>();
            // Combine all errors into a general validation error
            fieldErrors.set('_batchValidation', errorInfo.errors.join('; '));
            newValidationErrors.set(dbId, fieldErrors);
          }
        }



        // Refresh grid to show the validation errors
        if (gridRef.current?.api) {
          gridRef.current.api.refreshCells({ force: true });
        }
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

  const handleExportInvalidAssetsToFile = useCallback(() => {
    if (!batchValidationResults || batchValidationResults.errors.length === 0) {
      return;
    }

    // Create File header
    const headers = ['מספר מבנה', 'מספר נכס', 'שגיאות'];
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
    setSuccess(null);

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
          const asset = assets.find(a => String(a.id) === String(assetId));
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
          const asset = assets.find(a => String(a.id) === String(assetId));
          const assetIdent = asset?.asset_id || assetId;
          errors.push(`נכס ${assetIdent}: ${err instanceof Error ? err.message : 'שגיאה במחיקה'}`);
        }
      }

      // Process new assets that haven't been edited yet (in newAssets but not in dirtyAssets)
      for (const newAssetId of newAssets) {
        if (!dirtyAssets.has(newAssetId) && !deletedAssets.has(newAssetId)) {
          // Add to dirtyAssets so it gets processed below
          const asset = assets.find(a => String(a.id) === newAssetId);
          if (asset) {
            setDirtyAssets(prev => {
              const next = new Map(prev);
              next.set(newAssetId, {}); // Empty changes object, will use full asset data
              return next;
            });
          }
        }
      }

      for (const [assetId, changes] of dirtyAssets.entries()) {
        try {
          // Skip if marked for deletion
          if (deletedAssets.has(assetId)) continue;

          // Get the full asset data
          const asset = assets.find(a => String(a.id) === String(assetId));
          if (!asset) continue;

          const updatedData = { ...asset, ...changes };
          const isNewAsset = String(assetId).startsWith('temp-') || newAssets.has(String(assetId));
          const currentAssetId = isNewAsset ? undefined : (typeof assetId === 'number' ? assetId : (typeof asset.id === 'number' ? asset.id : undefined));

          // For new assets, validate all required fields
          if (isNewAsset) {
            // Validate required fields
            if (!updatedData.asset_id) {
              errors.push(`נכס חדש: קוד נכס נדרש`);
              continue;
            }
            if (!updatedData.main_asset_type) {
              errors.push(`נכס ${updatedData.asset_id}: סוג נכס ראשי נדרש`);
              continue;
            }

            // Validate payer_id (optional, but if provided, must be valid)
            if (updatedData.payer_id) {
              const payerValidation = await assetValidators.validatePayerId(updatedData.payer_id);
              if (!payerValidation.valid) {
                errors.push(`נכס ${updatedData.asset_id}: ${payerValidation.error}`);
                continue;
              }
            }

            // Validate asset_id
            const assetIdValidation = await assetValidators.validateAssetId(updatedData.asset_id);
            if (!assetIdValidation.valid) {
              errors.push(`נכס ${updatedData.asset_id}: ${assetIdValidation.error}`);
              continue;
            }

            // Validate asset_id not in other building (for new assets, currentAssetId is undefined)
            const assetIdBuildingValidation = await assetValidators.validateAssetIdNotInOtherBuilding(updatedData.asset_id, updatedData.building_number, undefined);
            if (!assetIdBuildingValidation.valid) {
              errors.push(`נכס ${updatedData.asset_id}: ${assetIdBuildingValidation.error}`);
              continue;
            }

            // Validate asset types
            const assetTypeFields = ['main_asset_type', 'sub_asset_type_1', 'sub_asset_type_2', 'sub_asset_type_3', 'sub_asset_type_4', 'sub_asset_type_5', 'sub_asset_type_6'];
            for (const field of assetTypeFields) {
              if (updatedData[field as keyof Asset]) {
                const validation = await assetValidators.validateAssetType(updatedData[field as keyof Asset] as string, field, validationTaxRegion);
                if (!validation.valid) {
                  errors.push(`נכס ${updatedData.asset_id}: ${validation.error}`);
                  continue;
                }
              }
            }

            // Prepare cached data for validation (all data is already in memory)
            const cachedData = {
              assetTypes: assetTypes || [],
              building: building
            };

            // Validate main asset type complete - use validationTaxRegion from tab
            if (updatedData.main_asset_type) {
              const mainAssetValidation = await assetValidators.validateMainAssetTypeComplete(
                updatedData.building_number,
                updatedData.main_asset_type,
                updatedData.asset_size,
                updatedData,
                validationTaxRegion, // Pass validationTaxRegion from tab - this overrides building tax_region
                cachedData
              );
              if (!mainAssetValidation.valid) {
                errors.push(`נכס ${updatedData.asset_id}: ${mainAssetValidation.error}`);
                continue;
              }
            }

            // Validate sub asset types complete - use validationTaxRegion from tab
            const subAssetFields = [
              { type: updatedData.sub_asset_type_1, size: updatedData.sub_asset_size_1 },
              { type: updatedData.sub_asset_type_2, size: updatedData.sub_asset_size_2 },
              { type: updatedData.sub_asset_type_3, size: updatedData.sub_asset_size_3 },
              { type: updatedData.sub_asset_type_4, size: updatedData.sub_asset_size_4 },
              { type: updatedData.sub_asset_type_5, size: updatedData.sub_asset_size_5 },
              { type: updatedData.sub_asset_type_6, size: updatedData.sub_asset_size_6 }
            ];
            let hasSubAssetError = false;
            for (let i = 0; i < subAssetFields.length; i++) {
              if (subAssetFields[i].type) {
                const subAssetValidation = await assetValidators.validateSubAssetTypeComplete(
                  updatedData.building_number,
                  subAssetFields[i].type,
                  subAssetFields[i].size,
                  validationTaxRegion, // Pass validationTaxRegion from tab - this overrides building tax_region
                  cachedData,
                  updatedData // Pass main asset data for penthouse and building-level validations
                );
                if (!subAssetValidation.valid) {
                  errors.push(`נכס ${updatedData.asset_id}: נכס משנה ${i + 1}: ${subAssetValidation.error}`);
                  hasSubAssetError = true;
                }
              }
            }
            if (hasSubAssetError) {
              continue;
            }

            // Validate 199/299 rules
            // Use validationTaxRegion from the current tab - this overrides building tax_region
            const validation = await assetValidators.validateSubAssetsFor199Or299(
              updatedData.building_number,
              updatedData.main_asset_type,
              updatedData.asset_size,
              [
                updatedData.sub_asset_type_1,
                updatedData.sub_asset_type_2,
                updatedData.sub_asset_type_3,
                updatedData.sub_asset_type_4,
                updatedData.sub_asset_type_5,
                updatedData.sub_asset_type_6
              ],
              [
                updatedData.sub_asset_size_1,
                updatedData.sub_asset_size_2,
                updatedData.sub_asset_size_3,
                updatedData.sub_asset_size_4,
                updatedData.sub_asset_size_5,
                updatedData.sub_asset_size_6
              ],
              validationTaxRegion, // Pass validationTaxRegion from tab - this overrides building tax_region
              cachedData
            );
            if (!validation.valid) {
              errors.push(`נכס ${updatedData.asset_id}: ${validation.error}`);
              continue;
            }

            // Create new asset
            const { id, _isMasterRow, created_at, ...assetData } = updatedData;
            await api.assets.create(assetData);
            savedCount++;
            successfullySaved.add(String(assetId));
          } else {
            // Validate based on what fields changed for existing assets
            if (changes.hasOwnProperty('payer_id')) {
              const validation = await assetValidators.validatePayerId(changes.payer_id as string);
              if (!validation.valid) {
                errors.push(`נכס ${asset.asset_id}: ${validation.error}`);
                continue;
              }
            }

            if (changes.hasOwnProperty('asset_id')) {
              const validation = await assetValidators.validateAssetId(changes.asset_id as string);
              if (!validation.valid) {
                errors.push(`נכס ${asset.asset_id}: ${validation.error}`);
                continue;
              }
              
              // Also validate that the new asset_id is not in another building
              const buildingValidation = await assetValidators.validateAssetIdNotInOtherBuilding(changes.asset_id as string, updatedData.building_number, currentAssetId);
              if (!buildingValidation.valid) {
                errors.push(`נכס ${asset.asset_id}: ${buildingValidation.error}`);
                continue;
              }
            }

            // Validate asset types if any asset type field changed
            const assetTypeFields = ['main_asset_type', 'sub_asset_type_1', 'sub_asset_type_2', 'sub_asset_type_3', 'sub_asset_type_4', 'sub_asset_type_5', 'sub_asset_type_6'];
            for (const field of assetTypeFields) {
              if (changes.hasOwnProperty(field)) {
                const validation = await assetValidators.validateAssetType(updatedData[field as keyof Asset] as string, field, validationTaxRegion);
                if (!validation.valid) {
                  errors.push(`נכס ${asset.asset_id}: ${validation.error}`);
                  continue;
                }
              }
            }

            // Validate 199/299 rules if relevant fields changed
            // Use validationTaxRegion from the current tab - this overrides building tax_region
            if (changes.hasOwnProperty('main_asset_type') || changes.hasOwnProperty('asset_size') ||
                assetTypeFields.some(f => changes.hasOwnProperty(f))) {
              const validation = await assetValidators.validateSubAssetsFor199Or299(
                updatedData.building_number,
                updatedData.main_asset_type,
                updatedData.asset_size,
                [
                  updatedData.sub_asset_type_1,
                  updatedData.sub_asset_type_2,
                  updatedData.sub_asset_type_3,
                  updatedData.sub_asset_type_4,
                  updatedData.sub_asset_type_5,
                  updatedData.sub_asset_type_6
                ],
                [
                  updatedData.sub_asset_size_1,
                  updatedData.sub_asset_size_2,
                  updatedData.sub_asset_size_3,
                  updatedData.sub_asset_size_4,
                  updatedData.sub_asset_size_5,
                  updatedData.sub_asset_size_6
                ],
                validationTaxRegion // Pass validationTaxRegion from tab - this overrides building tax_region
              );
              if (!validation.valid) {
                errors.push(`נכס ${asset.asset_id}: ${validation.error}`);
                continue;
              }
            }

            // Update existing asset
            await api.assets.update(assetId, changes);
            savedCount++;
            successfullySaved.add(String(assetId));
          }
        } catch (err) {
          const asset = assets.find(a => String(a.id) === String(assetId));
          const assetIdent = asset?.asset_id || assetId;
          errors.push(`נכס ${assetIdent}: ${err instanceof Error ? err.message : 'שגיאה בשמירה'}`);
        }
      }

      // Only clear successfully processed assets from state
      // Keep failed assets in state so they remain visible on screen
      setDirtyAssets(prev => {
        const next = new Map(prev);
        for (const assetId of successfullySaved) {
          next.delete(assetId);
        }
        return next;
      });
      
      setDeletedAssets(prev => {
        const next = new Set(prev);
        for (const assetId of successfullyDeleted) {
          next.delete(assetId);
        }
        return next;
      });
      
      setNewAssets(prev => {
        const next = new Set(prev);
        for (const assetId of successfullySaved) {
          next.delete(assetId);
        }
        return next;
      });

      if (errors.length > 0) {
        const successMsg = [];
        if (savedCount > 0) successMsg.push(`נשמרו ${savedCount} נכסים`);
        if (deletedCount > 0) successMsg.push(`נמחקו ${deletedCount} נכסים`);
        setError(`${successMsg.join(', ')}. ${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`);
      } else {
        const successMsg = [];
        if (savedCount > 0) successMsg.push(`נשמרו ${savedCount} נכסים`);
        if (deletedCount > 0) successMsg.push(`נמחקו ${deletedCount} נכסים`);
        setSuccess(`✓ ${successMsg.join(', ')} בהצלחה`);
        setTimeout(() => setSuccess(null), 3000);
      }

      // Refresh data
      await fetchData(false);
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
      penthouse: null,
      floor: undefined,
      discount_type: undefined,
      discount_date_from: undefined,
      discount_date_to: undefined
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
      if (!validationResult.valid && validationResult.errors.length > 0) {
        // Store validation errors for the new asset
        setValidationErrors(prev => {
          const newMap = new Map(prev);
          newMap.set(tempId, validationResult.errors.join('\n'));
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
    // Remove new assets (temp IDs) from assets
    setAssets(prev => prev.filter(a => !newAssets.has(String(a.id))));
    
    // Restore original assets
    setAssets(prev => {
      const existingIds = new Set(prev.map(a => String(a.id)));
      const restored = JSON.parse(JSON.stringify(originalAssets));
      // Only add restored assets that aren't new
      const filtered = restored.filter((a: Asset) => !newAssets.has(String(a.id)));
      // Merge with existing non-new assets
      const merged = [...prev.filter(a => !newAssets.has(String(a.id))), ...filtered];
      // Remove duplicates by id
      const unique = merged.filter((a, index, self) => 
        index === self.findIndex(b => String(b.id) === String(a.id))
      );
      return unique;
    });
    
    setDirtyAssets(new Map());
    setDeletedAssets(new Set());
    setNewAssets(new Set());
    setValidationErrors(new Map());
    setError(null);
    setSuccess('השינויים בוטלו');
    setTimeout(() => setSuccess(null), 3000);

    // Refresh the grid
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ force: true });
    }
  };

  // Helper function to get cell style for validation errors and read-only indication
  const getCellStyle = useCallback((params: any) => {
    if (!params || !params.data) return { textAlign: 'right' };
    
    const assetId = String(params.data?.id);
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
        cursor: 'not-allowed'
      };
    }
    
    return { textAlign: 'right' };
  }, [validationErrors, newAssets, taxRegion]);

  async function handleFileUpload(assetId: number, file: File) {
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

      // Step 5: Update asset
      await api.assets.update(assetId, { structure_drawing_url: publicUrl });

      setUploadProgress({ assetId, progress: 100, fileName: file.name });

      // Show success message
      const sizeReduction = compressedSizeKB !== originalSizeKB 
        ? ` (${originalSizeKB}KB → ${compressedSizeKB}KB)`
        : '';
      setSuccess(`הקובץ הועלה בהצלחה${sizeReduction}`);
      setTimeout(() => setSuccess(null), 5000);
      
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

  const detailColumnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      cellStyle: { textAlign: 'right', backgroundColor: '#fef3c7', fontWeight: '600' }
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 60,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      width: 80,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 60,
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
      width: 80,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 60,
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
      width: 80,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'floor',
      headerName: 'קומה',
      width: 80,
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'discount_type',
      headerName: 'סוג הנחה',
      width: 100,
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'discount_date_from',
      headerName: 'תאריך הנחה מ',
      width: 120,
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'discount_date_to',
      headerName: 'תאריך הנחה עד',
      width: 120,
      cellStyle: { textAlign: 'right' }
    }
  ], [t, assetTypes, getCellStyle]);




  // Create stable penthouse checkbox cellRenderer
  const penthouseCellRenderer = useCallback((params: any) => {
    if (!params || !params.data) return null;
    
    const assetId = params.data?.id;
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
    
    // Show checkbox for new assets, read-only display for existing assets
    if (isNewAsset) {
      return (
        <div className="flex items-center justify-center h-full">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => {
              const newValue = e.target.checked ? 'כן' : null;
              
              // Track the change in dirtyAssets
              setDirtyAssets(prev => {
                const next = new Map(prev);
                const existing = next.get(assetIdStr) || {};
                next.set(assetIdStr, { ...existing, penthouse: newValue });
                return next;
              });
              
              // Update grid cell data directly
              params.node.setDataValue('penthouse', newValue);
              
              // Update assets state
              setAssets(prev => prev.map(a => 
                String(a.id) === assetIdStr ? { ...a, penthouse: newValue } : a
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
    }
    
    // Read-only display for existing assets
    return (
      <div className="flex items-center justify-center h-full">
        {currentValue === 'כן' ? '✓' : ''}
      </div>
    );
  }, [newAssets, dirtyAssets]);

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
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
      width: 200,
      maxWidth: 200,
      minWidth: 200,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return null;
        
        const assetId = String(asset.id);
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
        
        // Show delete button only if a specific tax region is selected (same visibility logic as "Save All" and "Cancel" buttons)
        // Delete button should be visible for all assets (new and existing), same as view asset button
        const hasMultipleTaxRegions = building?.tax_region && building.tax_region.includes(',');
        // If building has multiple tax regions, only show delete button when a specific taxRegion is selected
        // If building has only one tax region, show delete button (taxRegion may or may not be set)
        const shouldShowDeleteButton = !hasMultipleTaxRegions || taxRegion;
        
        // Show checkbox only when a specific tax region is selected (single tax region tab)
        // Checkbox should be hidden for new assets, same as view icon
        const shouldShowCheckbox = !!taxRegion && !isNew;
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
                title="בחר להעברת שטחים"
              />
            )}
            {hasValidationError && safeValidationErrors && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const errorMsg = safeValidationErrors?.get(assetId) || 'שגיאת אימות';
                  setError(errorMsg);
                  setTimeout(() => setError(null), 5000);
                }}
                className="p-1 text-red-600 hover:text-red-700 transition-colors hover:scale-110"
                title={safeValidationErrors?.get(assetId) || 'שגיאת אימות'}
              >
                <AlertCircle className="h-5 w-5" />
              </button>
            )}
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
            {!isNew && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAsset(assetId, asset.asset_id, buildingNumber, validationTaxRegion);
                  }}
                  className="p-1 text-teal-600 hover:text-teal-700 transition-colors hover:scale-110"
                  title={t('viewDetails')}
                >
                  <Eye className="h-5 w-5" />
                </button>
                {taxRegion && (
                  <label
                    className="p-1 text-blue-600 hover:text-blue-700 transition-colors hover:scale-110 cursor-pointer"
                    title="העלה קובץ"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {uploadingAssetId === asset.id ? (
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
                          handleFileUpload(asset.id, file);
                        }
                        // Reset input
                        if (fileInputRefs.current.has(assetId)) {
                          fileInputRefs.current.get(assetId)!.value = '';
                        }
                      }}
                    />
                  </label>
                )}
              </>
            )}
          </div>
        );
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      width: 120,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      width: 120,
      editable: (params) => {
        if (!params || !params.data || !newAssets) return false;
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
      },
      cellStyle: (params: any) => {
        if (!params || !params.data) {
          return { textAlign: 'right' };
        }
        
        const assetId = String(params.data?.id);
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
          cursor: 'not-allowed'
        };
      },
      headerClass: 'ag-right-aligned-header'
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      width: 120,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: false, // Always use checkbox, not editable cell
      width: 60,
      cellRenderer: penthouseCellRenderer,
      cellStyle: { textAlign: 'center' },
      headerClass: 'text-center'
    },
    {
      field: 'floor',
      headerName: 'קומה',
      width: 80,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
      },
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
      width: 100,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'discount_date_from',
      headerName: 'תאריך הנחה מ',
      width: 120,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'discount_date_to',
      headerName: 'תאריך הנחה עד',
      width: 120,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 60,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      width: 80,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 60,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 80,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 60,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 80,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 60,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 80,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 60,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 80,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 60,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 80,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 60,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      width: 80,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
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
      field: 'extra_field',
      headerName: '',
      width: 120,
      editable: (params) => {
        const assetId = String(params.data?.id);
        return newAssets.has(assetId) || !!taxRegion;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'extra_field_1',
      headerName: '',
      width: 120,
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'extra_field_2',
      headerName: '',
      width: 120,
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    }
  ], [t, onSelectAsset, buildingNumber, assetTypes, newAssets, dirtyAssets, building, taxRegion, selectedAssets, deletedAssets, validationErrors, getCellStyle]);
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">{t('loadingApartments')}</p>
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
              </div>
              {taxRegion ? (
                <p className="text-sm text-white font-semibold bg-teal-700 px-3 py-1 rounded">
                  אזור מס: {taxRegion}
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
                return sortedRegions.length > 0 ? (
                  <p className="text-sm text-white font-semibold bg-teal-700 px-3 py-1 rounded">
                    אזורי מס: {sortedRegions.join(', ')}
                  </p>
                ) : null;
              })()}
            </div>
          </div>
        </div>
        {success && (
          <div className="mb-2 bg-green-50 border-l-4 border-green-500 rounded-lg p-2">
            <p className="text-green-800 text-sm font-medium">{success}</p>
          </div>
        )}
        <div className="mb-2 flex justify-between items-center gap-2">
          <div className="flex gap-2">
            {/* Hide add button if building has more than one tax region and no specific taxRegion is selected */}
            {(() => {
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
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  הוסף נכס
                </button>
              );
            })()}
            <button
              type="button"
              onClick={handleBatchValidateBuildingAssets}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
              title={selectedAssets.size > 0 ? `אמת ${selectedAssets.size} נכסים נבחרים` : 'אמת את כל הנכסים'}
            >
              <CheckCircle2 className="h-4 w-4" />
              {selectedAssets.size > 0 ? `אמת נבחרים (${selectedAssets.size})` : 'אמת הכל'}
            </button>
          </div>
          {/* Show save and cancel buttons only if a specific tax region is selected (same visibility logic as delete button) */}
          {(() => {
            const hasMultipleTaxRegions = building?.tax_region && building.tax_region.includes(',');
            // If building has multiple tax regions, only show buttons when a specific taxRegion is selected
            // If building has only one tax region, show buttons (taxRegion may or may not be set)
            const shouldShowButtons = !hasMultipleTaxRegions || taxRegion;
            
            if (!shouldShowButtons) return null;
            
            // Check if we have 2 or more selected assets for transfer areas button
            const canTransferAreas = selectedAssets.size >= 2 && taxRegion;
            
            return (
              <div className="flex gap-2">
                {taxRegion && (
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
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
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
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  <X className="h-4 w-4" />
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={loading || totalChanges === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {loading ? 'שומר...' : `שמור הכל${totalChanges > 0 ? ` (${totalChanges})` : ''}`}
                </button>
              </div>
            );
          })()}
        </div>
        <div className="ag-theme-alpine rounded-xl shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%', minWidth: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={assets}
            columnDefs={columnDefs}
            getRowStyle={(params) => {
              const assetId = String(params.data?.id);
              if (deletedAssets.has(assetId)) {
                return { backgroundColor: '#fee2e2', opacity: 0.7 }; // Light red for deleted
              }
              if (validationErrors.has(assetId)) {
                return { 
                  backgroundColor: '#fee2e2', 
                  border: '2px solid #ef4444',
                  borderRadius: '4px'
                }; // Light red background with red border for validation errors
              }
              return null;
            }}
            defaultColDef={{
              resizable: true,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              wrapText: true,
              autoHeight: false,
              headerClass: 'ag-right-aligned-header',
              minWidth: 100
            }}
            gridOptions={{
              suppressColumnVirtualisation: true,
              alwaysShowHorizontalScroll: true,
            }}
            domLayout="normal"
            getRowId={(params) => String(params.data.id)}
            onCellValueChanged={onCellValueChanged}
            onGridReady={async (params) => {
              // Ensure all columns are visible and grid calculates proper width
              params.api.refreshCells({ force: true });
              // Scroll to left on grid ready
              setTimeout(() => {
                const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                if (gridElement) {
                  gridElement.scrollLeft = 0;
                }
              }, 300);
            }}
            onFirstDataRendered={async (params) => {
              // Scroll to left after data render
              setTimeout(() => {
                const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                if (gridElement) {
                  gridElement.scrollLeft = 0;
                }
              }, 200);
            }}
            onColumnResized={() => {}}
            onColumnMoved={(params) => {
              // Prevent actions column from being moved - force it back to first position
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
            }}
            onSortChanged={() => {}}
            animateRows={true}
            enableRtl={true}
            suppressHorizontalScroll={false}
          />
        </div>
      </div>

      <ValidationResultModal
        isOpen={showBatchValidationModal}
        onClose={() => setShowBatchValidationModal(false)}
        isLoading={batchValidationLoading}
        progress={batchValidationProgress}
        context="building"
        batchResults={batchValidationResults}
        batchTitle={`אימות נכסי מבנה ${buildingNumber}${taxRegion ? ` - אזור מס ${taxRegion}` : ''}`}
        buildingNumber={buildingNumber}
        taxRegion={taxRegion}
        onSelectAsset={onSelectAsset}
        onExportInvalid={batchValidationResults && batchValidationResults.errors.some(e => e.errors.length > 0) ? handleExportInvalidAssetsToFile : undefined}
      />
    </>
  );
}
