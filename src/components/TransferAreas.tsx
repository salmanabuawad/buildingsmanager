import { useEffect, useState, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { supabase } from '../lib/supabase';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Building as BuildingIcon, Loader2, Save, X, AlertCircle, Copy, CheckCircle2, Download, Plus, MessageSquare } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Toast } from './Toast';
import { useGridPreferences } from '../lib/useGridPreferences';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';
import { exportToExcel } from '../lib/excelExport';
import { useFieldConfig } from '../lib/useFieldConfig';

interface TransferAreasProps {
  buildingNumber: number;
  taxRegion?: string;
  selectedAssetIds: string[];
  onCloseTab?: () => void;
  onOpenAssetsTab?: (buildingNumber: number, taxRegion?: string, selectedAssetIds?: string[]) => void;
  onCloseAllTabsExceptEssential?: () => void;
}

export interface TransferAreasRef {
  hasUnsavedChanges: () => boolean;
}

export const TransferAreas = forwardRef<TransferAreasRef, TransferAreasProps>(({ buildingNumber, taxRegion, selectedAssetIds, onCloseTab, onOpenAssetsTab, onCloseAllTabsExceptEssential }, ref) => {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [dirtyAssets, setDirtyAssets] = useState<Map<string, Partial<Asset>>>(new Map());
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const [measurementDateModalOpen, setMeasurementDateModalOpen] = useState(false);
  const [measurementDateModalClosing, setMeasurementDateModalClosing] = useState(false);
  const [newMeasurementDate, setNewMeasurementDate] = useState<string>('');
  const [add999AssetModalOpen, setAdd999AssetModalOpen] = useState(false);
  const [add999AssetModalClosing, setAdd999AssetModalClosing] = useState(false);
  const [new999AssetId, setNew999AssetId] = useState<string>('');
  const [new999AssetSize, setNew999AssetSize] = useState<string>('');
  const [new999AssetComment, setNew999AssetComment] = useState<string>('');
  const [add999AssetPersistentError, setAdd999AssetPersistentError] = useState<string | null>(null);
  // Store asset_id and building_number for each asset to reload after save (key is asset_id string)
  const [assetIdentifiers, setAssetIdentifiers] = useState<Map<string, { asset_id: number; building_number: number }>>(new Map());
  // Store initial total area for validation
  const [initialTotalArea, setInitialTotalArea] = useState<number | null>(null);
  const gridRef = useRef<AgGridReact<Asset>>(null);
  
  // Grid preferences hook for saving/loading column state
  const gridPreferences = useGridPreferences(
    gridRef,
    'transfer-areas',
    'default'
  );

  useEffect(() => {
    fetchData();
  }, [buildingNumber, selectedAssetIds]);

  // Sort assets to put errored rows first
  const sortedAssets = useMemo(() => {
    return [...assets].map((asset, idx) => ({ asset, idx }))
      .sort((a, b) => {
        const aId = String(a.asset.asset_id);
        const bId = String(b.asset.asset_id);
        const aHasError = validationErrors.has(aId);
        const bHasError = validationErrors.has(bId);
        if (aHasError !== bHasError) {
          return aHasError ? -1 : 1;
        }
        // Preserve original order within error/non-error groups
        return a.idx - b.idx;
      })
      .map(x => x.asset);
  }, [assets, validationErrors]);

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
  const isAssetNotAccountable = useCallback((asset: Asset): boolean => {
    if (!asset || !asset.main_asset_type) {
      return false;
    }
    return isAssetTypeNotAccountable(asset.main_asset_type);
  }, [isAssetTypeNotAccountable]);

  // Helper function to check if a field should be editable
  // For non-accountable assets, only main_asset_type is editable
  const isFieldEditable = useCallback((params: any, fieldName: string): boolean => {
    if (!params || !params.data) return false;
    const asset = params.data as Asset;
    
    // For non-accountable assets, only main_asset_type is editable
    if (isAssetNotAccountable(asset)) {
      return fieldName === 'main_asset_type';
    }
    
    return true; // All fields are editable by default in TransferAreas
  }, [isAssetNotAccountable]);

  // Refresh actions column when validationErrors change to update invalid icons
  useEffect(() => {
    if (gridRef.current?.api && assets.length > 0) {
      // Get all row nodes
      const rowNodes: any[] = [];
      gridRef.current.api.forEachNode((node) => {
        rowNodes.push(node);
      });
      
      if (rowNodes.length > 0) {
        // Refresh actions column for all rows to update invalid icons
        gridRef.current.api.refreshCells({ 
          rowNodes: rowNodes, 
          columns: ['actions'],
          force: true 
        });
      }
    }
  }, [validationErrors, assets.length]);

  async function fetchData() {
    try {
      setLoading(true);
      // Use cached asset types from validation (faster, no API call)
      const { getAssetTypes } = await import('../lib/validation');
      const cachedAssetTypes = getAssetTypes();
      const buildingData = await api.buildings.getOne(buildingNumber);
      setBuilding(buildingData);
      setAssetTypes(cachedAssetTypes.length > 0 ? cachedAssetTypes : await api.assetTypes.getAll());

      // Fetch assets by ID first (for initial load), then by asset_id and building_number (after save)
      const fetchedAssets: Asset[] = [];
      
      // If we have asset identifiers (after save), use them
      if (assetIdentifiers.size > 0) {
        // Collect unique asset identifiers to avoid duplicates
        const uniqueIdentifiers = new Map<string, { asset_id: number; building_number: number }>();
        for (const identifier of assetIdentifiers.values()) {
          const key = `${identifier.asset_id}_${identifier.building_number}`;
          if (!uniqueIdentifiers.has(key)) {
            uniqueIdentifiers.set(key, identifier);
          }
        }

        for (const identifier of uniqueIdentifiers.values()) {
          try {
            // Get all assets with this asset_id and building_number, then take the latest
            const allAssets = await api.assets.getAllByAssetId(String(identifier.asset_id), identifier.building_number);
            // Filter by building_number and get the latest (is_latest = true or most recent)
            const buildingAssets = allAssets.filter(a => a.building_number === identifier.building_number);
            if (buildingAssets.length > 0) {
              // First try to find asset with is_latest = true
              let latestAsset = buildingAssets.find(a => a.is_latest === true);
              // If not found, sort by created_at descending and take the first (most recent)
              if (!latestAsset) {
                latestAsset = buildingAssets.sort((a, b) => 
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                )[0];
              }
              if (latestAsset) {
                fetchedAssets.push(latestAsset);
                // Update asset identifiers (key is asset_id)
                setAssetIdentifiers(prev => {
                  const next = new Map(prev);
                  next.set(String(latestAsset!.asset_id), { asset_id: latestAsset!.asset_id, building_number: latestAsset!.building_number });
                  return next;
                });
              }
            } else {
              console.warn(`No assets found for asset_id ${identifier.asset_id}, building_number ${identifier.building_number}`);
            }
          } catch (err) {
            console.error(`Error fetching asset by asset_id ${identifier.asset_id}, building_number ${identifier.building_number}:`, err);
            // If error, try to get all assets for this building and find by asset_id
            try {
              const allBuildingAssets = await api.assets.getAll(buildingNumber);
              const matchingAsset = allBuildingAssets.find(a => 
                a.asset_id === identifier.asset_id && 
                a.building_number === identifier.building_number &&
                (a.is_latest === true || !a.is_latest) // Prefer latest, but accept any
              );
              if (matchingAsset) {
                fetchedAssets.push(matchingAsset);
                setAssetIdentifiers(prev => {
                  const next = new Map(prev);
                  next.set(String(matchingAsset.asset_id), { asset_id: matchingAsset.asset_id, building_number: matchingAsset.building_number });
                  return next;
                });
              } else {
                console.warn(`Asset with asset_id ${identifier.asset_id} not found in building ${identifier.building_number}`);
              }
            } catch (fallbackErr) {
              console.error(`Fallback fetch also failed:`, fallbackErr);
            }
          }
        }
      } else {
        // Initial load: batch fetch all assets by asset_ids in a single query
        // Convert selectedAssetIds to numbers for the query
        const assetIdNumbers = selectedAssetIds.map(id => Number(id)).filter(id => !isNaN(id));
        
        if (assetIdNumbers.length > 0) {
          try {
            // Batch fetch all assets at once using 'in' filter
            const { data, error } = await supabase
              .from('assets')
              .select('*')
              .in('asset_id', assetIdNumbers);

            if (error) {
              console.error('Error batch fetching assets:', error);
            } else if (data) {
              fetchedAssets.push(...data);
              // Store asset identifiers for future reloads
              setAssetIdentifiers(prev => {
                const next = new Map(prev);
                data.forEach(asset => {
                  next.set(String(asset.asset_id), { 
                    asset_id: asset.asset_id, 
                    building_number: asset.building_number 
                  });
                });
                return next;
              });
            }
          } catch (err) {
            console.error('Error batch fetching assets:', err);
            // Fallback to individual fetches if batch fails
            for (const assetId of selectedAssetIds) {
              try {
                const asset = await api.assets.getOne(Number(assetId));
                fetchedAssets.push(asset);
                setAssetIdentifiers(prev => {
                  const next = new Map(prev);
                  next.set(String(asset.asset_id), { 
                    asset_id: asset.asset_id, 
                    building_number: asset.building_number 
                  });
                  return next;
                });
              } catch (individualErr) {
                console.error(`Error fetching asset ${assetId}:`, individualErr);
              }
            }
          }
        }
      }

      setAssets(fetchedAssets);
      const finalAssetTypes = cachedAssetTypes.length > 0 ? cachedAssetTypes : await api.assetTypes.getAll();
      setAssetTypes(finalAssetTypes || []);
      
      // Wait for assetTypes state to be set before calculating initial total area
      // Calculate initial total area (sum of asset_size, excluding assets with not_accountable = true)
      // EXCEPT: Type 999 should always be included regardless of the flag
      const totalArea = fetchedAssets.reduce((sum, asset) => {
        // Skip assets where main_asset_type has not_accountable = true
        // EXCEPT for type 999, which should always be included in transfer area calculations
        if (asset.main_asset_type && asset.main_asset_type !== '999' && finalAssetTypes) {
          const assetType = finalAssetTypes.find(at => at.name === asset.main_asset_type);
          if (assetType?.non_accountable_for_total_area === true) {
            return sum;
          }
        }
        return sum + (asset.asset_size || 0);
      }, 0);
      setInitialTotalArea(totalArea);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }

  // Helper function to validate a single asset
  const validateAsset = useCallback(async (asset: Asset): Promise<{ valid: boolean; error?: string }> => {
    // Skip validation if asset is not_accountable
    if (asset.main_asset_type && isAssetTypeNotAccountable(asset.main_asset_type)) {
      return { valid: true };
    }

    // For transfer areas tab: combine asset's tax_region with tab's taxRegion
    // This allows validation against both the original asset tax region and the transferred tax region
    let combinedTaxRegion = '';
    // Parse asset.tax_region - can be number or string (including comma-separated)
    const assetTaxRegionStr = asset.tax_region != null ? String(asset.tax_region) : '';
    const assetTaxRegions = assetTaxRegionStr 
      ? assetTaxRegionStr.split(',').map(r => r.trim()).filter(r => r)
      : [];
    const tabTaxRegions = taxRegion ? taxRegion.split(',').map(r => r.trim()).filter(r => r) : [];
    
    // Combine tax regions - merge both lists and remove duplicates
    const allTaxRegions = new Set<string>();
    assetTaxRegions.forEach(tr => allTaxRegions.add(tr));
    tabTaxRegions.forEach(tr => allTaxRegions.add(tr));
    
    combinedTaxRegion = Array.from(allTaxRegions).join(',');
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[TransferAreas.validateAsset] Combining tax regions:', {
        assetTaxRegion: asset.tax_region,
        assetTaxRegionStr,
        assetTaxRegions,
        tabTaxRegion: taxRegion,
        tabTaxRegions,
        combinedTaxRegion,
        allTaxRegions: Array.from(allTaxRegions)
      });
    }

    // Create a modified asset object with combined tax region for validation
    // This ensures validateAssetTypeComplete uses the combined tax regions
    const assetForValidation = { ...asset, tax_region: combinedTaxRegion };

    const shouldValidateSubAssets = asset.main_asset_type === '199' || asset.main_asset_type === '299';
    const validations = [
      assetValidators.validateBuildingNumber(asset.building_number),
      assetValidators.validateAssetId(asset.asset_id),
      assetValidators.validatePayerId(asset.payer_id),
      assetValidators.validateAssetType(asset.main_asset_type, 'main_asset_type'),
      assetValidators.validateMainAssetTypeComplete(asset.building_number, asset.main_asset_type, asset.asset_size, assetForValidation, combinedTaxRegion),
      assetValidators.validateOnlyComplexTypesCanHaveSubAssets(asset.main_asset_type, [
        asset.sub_asset_type_1,
        asset.sub_asset_type_2,
        asset.sub_asset_type_3,
        asset.sub_asset_type_4,
        asset.sub_asset_type_5,
        asset.sub_asset_type_6
      ]),
      assetValidators.validateComplexTypesMustHaveSubAssets(asset.main_asset_type, [
        asset.sub_asset_type_1,
        asset.sub_asset_type_2,
        asset.sub_asset_type_3,
        asset.sub_asset_type_4,
        asset.sub_asset_type_5,
        asset.sub_asset_type_6
      ])
    ];

    if (shouldValidateSubAssets) {
      validations.push(
        assetValidators.validateMinimumSubAssets([
          asset.sub_asset_type_1,
          asset.sub_asset_type_2,
          asset.sub_asset_type_3,
          asset.sub_asset_type_4,
          asset.sub_asset_type_5,
          asset.sub_asset_type_6
        ])
      );
    }

    validations.push(
      assetValidators.validateAssetTypeRequiresSize(
        asset.main_asset_type,
        asset.asset_size,
        [
          asset.sub_asset_type_1,
          asset.sub_asset_type_2,
          asset.sub_asset_type_3,
          asset.sub_asset_type_4,
          asset.sub_asset_type_5,
          asset.sub_asset_type_6
        ],
        [
          asset.sub_asset_size_1,
          asset.sub_asset_size_2,
          asset.sub_asset_size_3,
          asset.sub_asset_size_4,
          asset.sub_asset_size_5,
          asset.sub_asset_size_6
        ]
      ),
      assetValidators.validateSubAssetSizeMatchesMain(
        asset.asset_size,
        [
          asset.sub_asset_type_1,
          asset.sub_asset_type_2,
          asset.sub_asset_type_3,
          asset.sub_asset_type_4,
          asset.sub_asset_type_5,
          asset.sub_asset_type_6
        ],
        [
          asset.sub_asset_size_1,
          asset.sub_asset_size_2,
          asset.sub_asset_size_3,
          asset.sub_asset_size_4,
          asset.sub_asset_size_5,
          asset.sub_asset_size_6
        ],
        asset.main_asset_type
      ),
      assetValidators.validateSubAssetsFor199Or299(
        asset.building_number,
        asset.main_asset_type,
        asset.asset_size,
        [
          asset.sub_asset_type_1,
          asset.sub_asset_type_2,
          asset.sub_asset_type_3,
          asset.sub_asset_type_4,
          asset.sub_asset_type_5,
          asset.sub_asset_type_6
        ],
        [
          asset.sub_asset_size_1,
          asset.sub_asset_size_2,
          asset.sub_asset_size_3,
          asset.sub_asset_size_4,
          asset.sub_asset_size_5,
          asset.sub_asset_size_6
        ],
        combinedTaxRegion
      ),
      assetValidators.validateAssetType(asset.sub_asset_type_1, 'sub_asset_type_1'),
      assetValidators.validateAssetType(asset.sub_asset_type_2, 'sub_asset_type_2'),
      assetValidators.validateAssetType(asset.sub_asset_type_3, 'sub_asset_type_3'),
      assetValidators.validateAssetType(asset.sub_asset_type_4, 'sub_asset_type_4'),
      assetValidators.validateAssetType(asset.sub_asset_type_5, 'sub_asset_type_5'),
      assetValidators.validateAssetType(asset.sub_asset_type_6, 'sub_asset_type_6'),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_1, asset.sub_asset_size_1, combinedTaxRegion, undefined, assetForValidation),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_2, asset.sub_asset_size_2, combinedTaxRegion, undefined, assetForValidation),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_3, asset.sub_asset_size_3, combinedTaxRegion, undefined, assetForValidation),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_4, asset.sub_asset_size_4, combinedTaxRegion, undefined, assetForValidation),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_5, asset.sub_asset_size_5, combinedTaxRegion, undefined, assetForValidation),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_6, asset.sub_asset_size_6, combinedTaxRegion, undefined, assetForValidation),
    );

    const validation = await validateAll(validations);
    return validation;
  }, [taxRegion]);

  // Function to validate all assets
  const validateAllAssets = useCallback(async (allAssets: Asset[], allDirtyAssets: Map<string, Partial<Asset>>, currentInitialTotalArea: number | null): Promise<Map<string, string>> => {
    const newValidationErrors = new Map<string, string>();
    
    // Build updated assets with dirty changes applied
    const updatedAssets = allAssets.map(asset => {
      const assetId = String(asset.asset_id);
      
      // Get dirty changes by asset_id (works for both new and existing assets)
      let dirtyChanges: Partial<Asset> = {};
      if (assetId) {
        const assetIdChanges = allDirtyAssets.get(assetId);
        if (assetIdChanges) {
          dirtyChanges = assetIdChanges;
        }
      }
      
      // Merge asset with dirty changes - ensure asset_size is included
      const merged = { ...asset, ...dirtyChanges };
      
      // Ensure asset_size is properly set - prioritize dirty changes, then asset object
      if (dirtyChanges.asset_size !== undefined && dirtyChanges.asset_size !== null) {
        merged.asset_size = dirtyChanges.asset_size;
      } else if (merged.asset_size === undefined || merged.asset_size === null) {
        // If no asset_size after merge, use 0 (shouldn't happen, but safety check)
        merged.asset_size = 0;
      }
      
      return merged;
    });

    // Calculate current total area (excluding assets with not_accountable = true)
    // EXCEPT: Type 999 should always be included regardless of the flag
    const newTotalArea = updatedAssets.reduce((sum, a) => {
      // Skip assets where main_asset_type has not_accountable = true
      // EXCEPT for type 999, which should always be included in transfer area calculations
      if (a.main_asset_type && a.main_asset_type !== '999' && isAssetTypeNotAccountable(a.main_asset_type)) {
        return sum;
      }
      
      // Get asset_size - ensure it's a valid number
      const assetSize = a.asset_size !== undefined && a.asset_size !== null 
        ? (typeof a.asset_size === 'number' ? a.asset_size : parseFloat(String(a.asset_size)))
        : 0;
      
      return sum + (isNaN(assetSize) ? 0 : assetSize);
    }, 0);

    // Validate total area if initial total area is set
    let totalAreaError: string | null = null;
    if (currentInitialTotalArea !== null && Math.abs(newTotalArea - currentInitialTotalArea) > 0.01) {
      totalAreaError = `השטח הכולל של הנכסים המקושרים חייב להישאר ${currentInitialTotalArea.toLocaleString('he-IL')}. השטח הכולל הנוכחי הוא ${newTotalArea.toLocaleString('he-IL')}`;
    }

    // Validate each asset
    for (const asset of updatedAssets) {
      const assetId = String(asset.asset_id);
      const validation = await validateAsset(asset);
      
      if (!validation.valid || totalAreaError) {
        const errors: string[] = [];
        if (!validation.valid) {
          errors.push(validation.error || 'Unknown validation error');
        }
        if (totalAreaError) {
          errors.push(totalAreaError);
        }
        newValidationErrors.set(assetId, errors.join('\n'));
      }
    }

    return newValidationErrors;
  }, [validateAsset, isAssetTypeNotAccountable]);

  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const assetId = String(data.asset_id);
      const newValue = event.newValue;

      // Get the original asset from state
      const originalAsset = assets.find(a => String(a.asset_id) === assetId);
      if (!originalAsset) return;

      // Validate date format if measurement_date is being changed
      if (field === 'measurement_date' && newValue) {
        const dateValidation = inputValidators.validateDate(newValue);
        if (!dateValidation.valid) {
          setToast({ message: dateValidation.error || 'Invalid date format', type: 'error' });
          setTimeout(() => setToast(null), 5000);
          event.api.refreshCells({ rowNodes: [event.node!], force: true });
          return;
        }
      }

      // Build updated dirty assets map
      const updatedDirtyAssets = new Map(dirtyAssets);
      const existing = updatedDirtyAssets.get(assetId) || {};
      updatedDirtyAssets.set(assetId, { ...existing, [field]: newValue });

      // Build updated assets array with all dirty changes applied
      const updatedAssets = assets.map(asset => {
        const assetIdStr = String(asset.asset_id);
        if (assetIdStr === assetId) {
          // This is the asset that was just changed
          const dirtyChanges = updatedDirtyAssets.get(assetIdStr) || {};
          return { ...asset, ...dirtyChanges, [field]: newValue };
        }
        // Apply any existing dirty changes to other assets
        const assetDirtyChanges = updatedDirtyAssets.get(assetIdStr) || {};
        return { ...asset, ...assetDirtyChanges };
      });

      // Update state
      setDirtyAssets(updatedDirtyAssets);
      setAssets(updatedAssets);

      // Wait for state updates to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Validate all assets with the updated state
      const newValidationErrors = await validateAllAssets(updatedAssets, updatedDirtyAssets, initialTotalArea);
      
      // Update validation errors for all assets
      setValidationErrors(newValidationErrors);

      // Show toast if there are validation errors
      if (newValidationErrors.size > 0) {
        const firstError = Array.from(newValidationErrors.values())[0];
        setToast({ message: firstError, type: 'error' });
        setTimeout(() => setToast(null), 5000);
      }

      // Refresh all cells to update styling and invalid icons
      if (event.api) {
        setTimeout(() => {
          // Refresh all rows to update validation icons and styling
          const rowNodes: any[] = [];
          event.api.forEachNode((node) => {
            rowNodes.push(node);
          });
          if (rowNodes.length > 0) {
            // Refresh actions column for all rows to update invalid icons
            event.api.refreshCells({ rowNodes: rowNodes, columns: ['actions'], force: true });
            // Refresh all cells in all rows to update validation styling
            event.api.refreshCells({ rowNodes: rowNodes, force: true });
          }
        }, 0);
      }
    } catch (err) {
      console.error('[TransferAreas] Validation error:', err);
    }
  }, [assets, dirtyAssets, taxRegion, initialTotalArea, validateAllAssets]);

  // Ensure clearing a cell (e.g. numeric → 0) always triggers dirty when edit stops.
  const onCellEditingStopped = useCallback((event: any) => {
    const { data, column, colDef } = event;
    const field = colDef?.field ?? column?.getColDef?.()?.field;
    if (!data?.asset_id || !field) return;
    const assetId = String(data.asset_id);
    if (!assets.some(a => String(a.asset_id) === assetId)) return;
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
    setAssets(prev => prev.map(a =>
      String(a.asset_id) === assetId ? { ...a, [field]: newValue } : a
    ));
  }, [assets]);

  const handleOpenSaveAsNewMeasurementModal = useCallback(() => {
    if (dirtyAssets.size === 0) {
      setSuccess('אין שינויים לשמירה');
      setTimeout(() => setSuccess(null), 3000);
      return;
    }

    // Check for validation errors before saving
    if (validationErrors.size > 0) {
      const errorList = Array.from(validationErrors.values()).slice(0, 3).join('\n');
      setError(`תקן שגיאות אימות לפני שמירה:\n${errorList}${validationErrors.size > 3 ? `\n...ועוד ${validationErrors.size - 3} שגיאות` : ''}`);
      return;
    }

    // Set default date to today
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    setNewMeasurementDate(`${day}/${month}/${year}`);
    setMeasurementDateModalOpen(true);
  }, [dirtyAssets, validationErrors]);

  const handleSaveAsNewMeasurements = async () => {
    if (dirtyAssets.size === 0) {
      setSuccess('אין שינויים לשמירה');
      setTimeout(() => setSuccess(null), 3000);
      return;
    }

    // Validate date format if provided
    let finalMeasurementDate: string;
    if (newMeasurementDate && newMeasurementDate.trim() !== '') {
      // Validate DD/MM/YYYY format
      const dateFormatPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      const match = newMeasurementDate.trim().match(dateFormatPattern);
      
      if (!match) {
        setError('תאריך לא תקין. נא להזין בפורמט DD/MM/YYYY');
        setTimeout(() => setError(null), 5000);
        return;
      }

      const [, day, month, year] = match;
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);

      // Validate date ranges
      if (monthNum < 1 || monthNum > 12) {
        setError('חודש לא תקין (1-12)');
        setTimeout(() => setError(null), 5000);
        return;
      }

      const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
      if (dayNum < 1 || dayNum > daysInMonth) {
        setError(`יום לא תקין לחודש ${monthNum} (1-${daysInMonth})`);
        setTimeout(() => setError(null), 5000);
        return;
      }

      if (yearNum < 1900 || yearNum > 2100) {
        setError('שנה לא תקינה (1900-2100)');
        setTimeout(() => setError(null), 5000);
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

    setLoading(true);
    try {
      const errors: string[] = [];
      const errorAssetIds: string[] = []; // Track asset IDs with validation errors
      const originalAssets: Asset[] = [];
      const newAssetsData: Partial<Asset>[] = [];
      
      // First pass: validate all assets and prepare data
      for (const [assetId, changes] of dirtyAssets.entries()) {
        try {
          // Get the full asset data with changes
          // Find asset by asset_id (works for both new and existing assets)
          const originalAsset = assets.find(a => String(a.asset_id) === assetId);
          
          // Check if this is a new asset (not found in assets array but has dirty changes)
          const isNewAsset = !originalAsset && dirtyAssets.has(assetId);
          
          // For new assets, create from dirty changes
          // For existing assets, find the original
          if (!originalAsset && !isNewAsset) {
            errors.push(`נכס ${assetId}: לא נמצא`);
            if (!errorAssetIds.includes(assetId)) {
              errorAssetIds.push(assetId);
            }
            continue;
          }

          const updatedData = isNewAsset 
            ? { ...changes, asset_id: parseInt(assetId, 10) } as Partial<Asset> // New asset: use changes as base
            : { ...originalAsset, ...changes }; // Existing asset: merge with changes

          // For transfer areas tab: combine asset's tax_region with tab's taxRegion
          // This allows validation against both the original asset tax region and the transferred tax region
          let combinedTaxRegion = '';
          // Parse updatedData.tax_region - can be number or string (including comma-separated)
          const assetTaxRegionStr = updatedData.tax_region != null ? String(updatedData.tax_region) : '';
          const assetTaxRegions = assetTaxRegionStr 
            ? assetTaxRegionStr.split(',').map(r => r.trim()).filter(r => r)
            : [];
          const tabTaxRegions = taxRegion ? taxRegion.split(',').map(r => r.trim()).filter(r => r) : [];
          
          // Combine tax regions - merge both lists and remove duplicates
          const allTaxRegions = new Set<string>();
          assetTaxRegions.forEach(tr => allTaxRegions.add(tr));
          tabTaxRegions.forEach(tr => allTaxRegions.add(tr));
          
          combinedTaxRegion = Array.from(allTaxRegions).join(',');

          // Create a modified asset object with combined tax region for validation
          // This ensures validateAssetTypeComplete uses the combined tax regions
          const assetForValidation = { ...updatedData, tax_region: combinedTaxRegion };

          // Validate before saving
          // For new assets, skip asset_id validation (it's a temp ID)
          const shouldValidateSubAssets = updatedData.main_asset_type === '199' || updatedData.main_asset_type === '299';
          const validations = [
            assetValidators.validateBuildingNumber(updatedData.building_number),
            ...(isNewAsset ? [] : [assetValidators.validateAssetId(updatedData.asset_id)]), // Skip asset_id validation for new assets
            assetValidators.validatePayerId(updatedData.payer_id),
            assetValidators.validateAssetType(updatedData.main_asset_type, 'main_asset_type'),
            assetValidators.validateMainAssetTypeComplete(updatedData.building_number, updatedData.main_asset_type, updatedData.asset_size, assetForValidation, combinedTaxRegion),
            assetValidators.validateOnlyComplexTypesCanHaveSubAssets(updatedData.main_asset_type, [
              updatedData.sub_asset_type_1,
              updatedData.sub_asset_type_2,
              updatedData.sub_asset_type_3,
              updatedData.sub_asset_type_4,
              updatedData.sub_asset_type_5,
              updatedData.sub_asset_type_6
            ]),
            assetValidators.validateComplexTypesMustHaveSubAssets(updatedData.main_asset_type, [
              updatedData.sub_asset_type_1,
              updatedData.sub_asset_type_2,
              updatedData.sub_asset_type_3,
              updatedData.sub_asset_type_4,
              updatedData.sub_asset_type_5,
              updatedData.sub_asset_type_6
            ])
          ];

          if (shouldValidateSubAssets) {
            validations.push(
              assetValidators.validateMinimumSubAssets([
                updatedData.sub_asset_type_1,
                updatedData.sub_asset_type_2,
                updatedData.sub_asset_type_3,
                updatedData.sub_asset_type_4,
                updatedData.sub_asset_type_5,
                updatedData.sub_asset_type_6
              ])
            );
          }

          validations.push(
            assetValidators.validateSubAssetSizeMatchesMain(
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
              updatedData.main_asset_type
            ),
            assetValidators.validateSubAssetsFor199Or299(
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
              combinedTaxRegion
            ),
            assetValidators.validateAssetType(updatedData.sub_asset_type_1, 'sub_asset_type_1'),
            assetValidators.validateAssetType(updatedData.sub_asset_type_2, 'sub_asset_type_2'),
            assetValidators.validateAssetType(updatedData.sub_asset_type_3, 'sub_asset_type_3'),
            assetValidators.validateAssetType(updatedData.sub_asset_type_4, 'sub_asset_type_4'),
            assetValidators.validateAssetType(updatedData.sub_asset_type_5, 'sub_asset_type_5'),
            assetValidators.validateAssetType(updatedData.sub_asset_type_6, 'sub_asset_type_6'),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_1, updatedData.sub_asset_size_1, combinedTaxRegion, undefined, assetForValidation),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_2, updatedData.sub_asset_size_2, combinedTaxRegion, undefined, assetForValidation),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_3, updatedData.sub_asset_size_3, combinedTaxRegion, undefined, assetForValidation),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_4, updatedData.sub_asset_size_4, combinedTaxRegion, undefined, assetForValidation),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_5, updatedData.sub_asset_size_5, combinedTaxRegion, undefined, assetForValidation),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_6, updatedData.sub_asset_size_6, combinedTaxRegion, undefined, assetForValidation),
          );

          const validation = await validateAll(validations);
          if (!validation.valid) {
            const assetIdStr = String(updatedData.asset_id || assetId);
            errors.push(`נכס ${assetIdStr}: ${validation.error}`);
            if (!errorAssetIds.includes(assetIdStr)) {
              errorAssetIds.push(assetIdStr);
            }
            continue;
          }

          // For new assets, don't add to originalAssets (no history needed)
          // For existing assets, store original asset for before data
          if (!isNewAsset) {
            originalAssets.push({ ...originalAsset });
          }
          
          // Prepare new asset data with updated measurement date (for database insertion)
          const newAssetData: Partial<Asset> = {
            ...updatedData,
            measurement_date: finalMeasurementDate
          };

          // Remove fields that shouldn't be in new record
          delete (newAssetData as any).created_at;
          delete (newAssetData as any).updated_at;
          delete (newAssetData as any).is_latest;
          delete (newAssetData as any).history_created_at;
          delete (newAssetData as any).is_new_measurement;
          
          // For new assets, remove asset_id so database can assign it
          // For existing assets, set is_new_measurement to create history
          if (isNewAsset) {
            delete (newAssetData as any).asset_id;
            delete (newAssetData as any).id;
          } else {
            (newAssetData as any).is_new_measurement = true;
          }
          
          newAssetsData.push(newAssetData);
        } catch (err) {
          const originalAsset = assets.find(a => String(a.asset_id) === assetId);
          const assetIdentifier = String(originalAsset?.asset_id || assetId);
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`נכס ${assetIdentifier}: ${errorMsg}`);
          if (!errorAssetIds.includes(assetIdentifier)) {
            errorAssetIds.push(assetIdentifier);
          }
        }
      }

      // Separate new assets from existing assets
      const newAssets = newAssetsData.filter(asset => !asset.asset_id);
      const existingAssetsForSave = newAssetsData.filter(asset => asset.asset_id);

      // If validation errors and no assets to save, still close tab and open error fixing tab
      if (errors.length > 0 && originalAssets.length === 0 && newAssets.length === 0) {
        setError(errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''));
        // Clear dirty assets and validation errors
        setDirtyAssets(new Map());
        setValidationErrors(new Map());
        
        // Close transfer tab and open error fixing tab
        if (onCloseTab && onOpenAssetsTab && errorAssetIds.length > 0) {
          setTimeout(() => {
            // Extract the original tax region
            let originalTaxRegion: string | undefined = undefined;
            if (taxRegion) {
              const regions = taxRegion.split(',').map(r => r.trim()).filter(r => r);
              const notAccountableRegions = new Set<string>();
              assetTypes.forEach(at => {
                if (at.non_accountable_for_total_area === true && at.tax_region != null) {
                  notAccountableRegions.add(String(at.tax_region));
                }
              });
              const originalRegions = regions.filter(r => r !== '990' && !notAccountableRegions.has(r));
              originalTaxRegion = originalRegions.length > 0 ? originalRegions[0] : undefined;
            }
            
            onCloseTab();
            // Open error fixing tab with asset IDs that have errors
            onOpenAssetsTab(buildingNumber, originalTaxRegion || '', errorAssetIds);
          }, 500);
        }
        setLoading(false);
        return;
      }

      // Save all assets in bulk with single audit entry (same as distribute)
      if (originalAssets.length > 0 || newAssets.length > 0) {
        try {
          // Prepare assets - for existing assets, set is_new_measurement to create history
          // For new assets, they're already new so no history needed
          const assetsToSave = newAssetsData.map(asset => {
            // If asset has asset_id, it's an existing asset being updated
            if (asset.asset_id) {
              return {
                ...asset,
                is_new_measurement: true, // This flag tells the function to copy to history before updating
              };
            }
            // New asset - no is_new_measurement flag needed
            return asset;
          });
          
          // Prepare before_data from originalAssets for audit logging
          // Include all asset fields to ensure complete audit trail including asset types and sub asset types
          const beforeDataForAudit = originalAssets.length > 0 ? {
            assets: originalAssets.map(asset => ({
              ...asset, // Include all asset fields
              // Explicitly ensure asset type fields are included (they're already in the spread, but being explicit)
              main_asset_type: asset.main_asset_type,
              sub_asset_type_1: asset.sub_asset_type_1,
              sub_asset_type_2: asset.sub_asset_type_2,
              sub_asset_type_3: asset.sub_asset_type_3,
              sub_asset_type_4: asset.sub_asset_type_4,
              sub_asset_type_5: asset.sub_asset_type_5,
              sub_asset_type_6: asset.sub_asset_type_6,
              sub_asset_size_1: asset.sub_asset_size_1,
              sub_asset_size_2: asset.sub_asset_size_2,
              sub_asset_size_3: asset.sub_asset_size_3,
              sub_asset_size_4: asset.sub_asset_size_4,
              sub_asset_size_5: asset.sub_asset_size_5,
              sub_asset_size_6: asset.sub_asset_size_6,
            }))
          } : null;
          
          // Use saveBulkTransactional which handles creating new measurements and audit logging
          // Database transaction will automatically collect before/after asset data
          const result = await api.assets.saveBulkTransactional(
            assetsToSave,
            'transfer_area',
            beforeDataForAudit,
            null, // Database will collect after asset data automatically
            `Transferred areas for ${originalAssets.length} assets as new measurements`,
            isBusinessContext
          );
          
          if (!result.success) {
            throw new Error(result.error || 'Failed to transfer areas');
          }
          
          // Update asset identifiers for all affected assets
          const newIdentifiers = new Map<string, { asset_id: number; building_number: number }>();
          
          // For existing assets, the asset_id remains the same
          for (const originalAsset of originalAssets) {
            newIdentifiers.set(String(originalAsset.asset_id), {
              asset_id: originalAsset.asset_id,
              building_number: originalAsset.building_number
            });
          }
          
          // For new assets, map asset IDs to new database-assigned asset_ids from result
          // The result.affected_asset_ids array contains IDs in the same order as assetsToSave
          // First come existing assets (originalAssets.length), then new assets
          if (result.affected_asset_ids && result.affected_asset_ids.length > 0 && newAssets.length > 0) {
            // Iterate over newAssets in the same order they were saved
            newAssets.forEach((newAsset, index) => {
              const newAssetIndex = originalAssets.length + index;
              if (newAssetIndex < result.affected_asset_ids!.length) {
                const newAssetId = result.affected_asset_ids![newAssetIndex];
                // Use the original asset_id (user-entered) as the key
                const originalAssetIdKey = newAsset.asset_id ? String(newAsset.asset_id) : null;
                if (originalAssetIdKey && newAssetId) {
                  newIdentifiers.set(originalAssetIdKey, {
                    asset_id: newAssetId,
                    building_number: newAsset.building_number || buildingNumber
                  });
                }
              }
            });
          }
          
          setAssetIdentifiers(prev => {
            const next = new Map(prev);
            for (const [key, value] of newIdentifiers.entries()) {
              // Use the database-assigned asset_id as the key for future lookups
              // This ensures the new 999 asset can be reloaded correctly
              next.set(String(value.asset_id), value);
            }
            return next;
          });
          
          // Clear dirty assets and validation errors after successful save
          setDirtyAssets(new Map());
          setValidationErrors(new Map());
        } catch (auditError) {
          console.warn('Failed to bulk transfer areas:', auditError);
          errors.push(`שגיאה בשמירה: ${auditError instanceof Error ? auditError.message : 'Unknown error'}`);
        }
      }
      
      // Show success/error messages
      if (errors.length > 0) {
        const totalSaved = originalAssets.length + newAssets.length;
        const successMsg = totalSaved > 0 ? `נשמרו ${totalSaved} נכסים${originalAssets.length > 0 ? ' כמדידות חדשות' : ''}. ` : '';
        setError(`${successMsg}${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`);
      } else if (originalAssets.length > 0 || newAssets.length > 0) {
        const totalSaved = originalAssets.length + newAssets.length;
        const msg = originalAssets.length > 0 && newAssets.length > 0
          ? `✓ נשמרו ${originalAssets.length} נכסים כמדידות חדשות ו-${newAssets.length} נכסים חדשים בהצלחה`
          : originalAssets.length > 0
          ? `✓ נשמרו ${originalAssets.length} נכסים כמדידות חדשות בהצלחה`
          : `✓ נשמרו ${newAssets.length} נכסים חדשים בהצלחה`;
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
      }

      // Clear dirty assets and validation errors after save attempt
      setDirtyAssets(new Map());
      setValidationErrors(new Map());
      
      // Always close all tabs except essential (buildings list and regular assets tabs) after save
      if (onCloseAllTabsExceptEssential) {
        // Use a small delay to allow the success/error message to be visible
        setTimeout(() => {
          // Close all tabs except buildings list and regular assets list tabs (residential and business)
          onCloseAllTabsExceptEssential();
          
          // Then open the appropriate assets tab if needed
          if (onOpenAssetsTab) {
            // Extract the original tax region (remove 990 and not_accountable regions that were added for transfer)
            // The taxRegion prop contains the combined tax region, but we need the original one
            let originalTaxRegion: string | undefined = undefined;
            if (taxRegion) {
              const regions = taxRegion.split(',').map(r => r.trim()).filter(r => r);
              
              // Get not_accountable tax regions from asset types
              const notAccountableRegions = new Set<string>();
              assetTypes.forEach(at => {
                if (at.non_accountable_for_total_area === true && at.tax_region != null) {
                  notAccountableRegions.add(String(at.tax_region));
                }
              });
              
              // Remove 990 (always added for transfer) and not_accountable regions
              // Keep only the original tax region(s) that were passed when opening transfer
              const originalRegions = regions.filter(r => r !== '990' && !notAccountableRegions.has(r));
              originalTaxRegion = originalRegions.length > 0 ? originalRegions[0] : undefined;
            }
            
            // If there are validation errors with specific asset IDs, open error fixing tab
            // Otherwise, open normal assets tab
            if (errorAssetIds.length > 0) {
              // Open error fixing tab with asset IDs that have errors
              onOpenAssetsTab(buildingNumber, originalTaxRegion || '', errorAssetIds);
            } else if (originalTaxRegion) {
              // Open normal assets tab with the original tax region
              onOpenAssetsTab(buildingNumber, originalTaxRegion);
            }
          }
        }, 500);
      } else if (onCloseTab && onOpenAssetsTab) {
        // Fallback to old behavior if new function not available
        setTimeout(() => {
          let originalTaxRegion: string | undefined = undefined;
          if (taxRegion) {
            const regions = taxRegion.split(',').map(r => r.trim()).filter(r => r);
            const notAccountableRegions = new Set<string>();
            assetTypes.forEach(at => {
              if (at.non_accountable_for_total_area === true && at.tax_region != null) {
                notAccountableRegions.add(String(at.tax_region));
              }
            });
            const originalRegions = regions.filter(r => r !== '990' && !notAccountableRegions.has(r));
            originalTaxRegion = originalRegions.length > 0 ? originalRegions[0] : undefined;
          }
          
          onCloseTab();
          
          if (errorAssetIds.length > 0) {
            onOpenAssetsTab(buildingNumber, originalTaxRegion || '', errorAssetIds);
          } else {
            onOpenAssetsTab(buildingNumber, originalTaxRegion || '');
          }
        }, 500);
      }
    } catch (err) {
      const errorMessage = `שגיאה בשמירה: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('[TransferAreas] Error saving as new measurements:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAll = () => {
    // Clear all dirty changes and validation errors
    setDirtyAssets(new Map());
    setValidationErrors(new Map());
    setError(null);
    setSuccess(null);
    setToast(null);
    
    // Reload data from database to restore original state
    fetchData();
  };


  const hasChanges = dirtyAssets.size > 0;

  // Expose hasUnsavedChanges via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => hasChanges
  }), [hasChanges]);

  // Calculate current total area (sum of asset_size, excluding assets with not_accountable = true, with dirty changes applied)
  const currentTotalArea = useMemo(() => {
    return assets.reduce((sum, asset) => {
      // For new assets (temp IDs), check both the asset_id and the tracking ID
      const assetId = String(asset.asset_id);
      
      // Get dirty changes by asset_id (works for both new and existing assets)
      let dirtyChanges = dirtyAssets.get(assetId) || {};
      
      const assetWithChanges = { ...asset, ...dirtyChanges };
      
      // Skip assets where main_asset_type has not_accountable = true
      // EXCEPT for type 999, which should always be included in transfer area calculations
      // Check the updated main_asset_type if it was changed in dirtyChanges
      const mainAssetType = assetWithChanges.main_asset_type || asset.main_asset_type;
      if (mainAssetType && mainAssetType !== '999' && isAssetTypeNotAccountable(mainAssetType)) {
        return sum;
      }
      
      return sum + (assetWithChanges.asset_size || 0);
    }, 0);
  }, [assets, dirtyAssets, isAssetTypeNotAccountable, assetTypes]);

  // Check if total area has changed (validation will prevent saving if changed)
  const totalAreaChanged = initialTotalArea !== null && Math.abs(currentTotalArea - initialTotalArea) > 0.01;
  
  // Display total area - always show initial value (calculated once and not changeable)
  const displayTotalArea = initialTotalArea !== null ? initialTotalArea : currentTotalArea;

  // Calculate missing size (when current sum is less than required)
  const missingSize = useMemo(() => {
    if (initialTotalArea === null) return 0;
    const missing = initialTotalArea - currentTotalArea;
    return missing > 0.01 ? missing : 0; // Only show if missing is significant (>0.01)
  }, [initialTotalArea, currentTotalArea]);

  // Enable adding a special 999 asset only when the ONLY remaining issue is total-area mismatch.
  // (validateAllAssets adds the total-area message to every asset error string)
  const canAdd999Asset = useMemo(() => {
    if (missingSize <= 0) return false;
    if (validationErrors.size === 0) return true;

    const areaErrorPatterns = [
      'השטח הכולל',
      'חייב להישאר',
      'השטח הכולל הנוכחי',
      'השטח הכולל של הנכסים'
    ];

    for (const msg of validationErrors.values()) {
      const nonAreaLines = (msg || '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .filter(l => !areaErrorPatterns.some(p => l.includes(p)));

      if (nonAreaLines.length > 0) {
        return false; // there are other errors besides total-area
      }
    }

    return true;
  }, [missingSize, validationErrors]);

  // Function to open modal for adding new asset with type 999
  const handleAddMissingAsset = useCallback(() => {
    if (missingSize <= 0 || !building || !assetTypes.length) return;
    if (!canAdd999Asset) {
      setToast({ message: 'ניתן להוסיף נכס מסוג 999 רק לאחר תיקון כל השגיאות האחרות (כאשר רק השטח הכולל חסר).', type: 'error' });
      setTimeout(() => setToast(null), 5000);
      return;
    }
    setNew999AssetId('');
    // Keep empty: user must type the correct value
    setNew999AssetSize('');
    setNew999AssetComment('');
    setAdd999AssetPersistentError(null);
    setAdd999AssetModalOpen(true);
  }, [missingSize, building, assetTypes, canAdd999Asset]);

  // Function to save new 999 asset from modal
  const handleSave999Asset = useCallback(async () => {
    setAdd999AssetPersistentError(null);
    if (!building || !new999AssetId || !new999AssetSize) {
      setToast({ message: 'נא למלא מזהה נכס וגודל', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // Validate asset ID is a valid number
    const assetIdTrimmed = new999AssetId.trim();
    if (!assetIdTrimmed) {
      setToast({ message: 'מזהה נכס לא יכול להיות ריק', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // Check if asset ID is numeric (allows integers)
    const numericRegex = /^[0-9]+$/;
    if (!numericRegex.test(assetIdTrimmed)) {
      setToast({ message: 'מזהה נכס חייב להיות מספר שלם', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // Convert to number for consistency
    const assetIdNum = parseInt(assetIdTrimmed, 10);
    if (isNaN(assetIdNum)) {
      setToast({ message: 'מזהה נכס לא תקין', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // Persistent uniqueness check (DB + current draft)
    if (assets.some(a => String(a.asset_id) === String(assetIdNum)) || dirtyAssets.has(String(assetIdNum))) {
      setAdd999AssetPersistentError(`מזהה נכס ${assetIdNum} כבר קיים ברשימה/טיוטה הנוכחית. בחר מזהה אחר.`);
      return;
    }

    try {
      const { data: existingAsset, error: existingErr } = await supabase
        .from('assets')
        .select('asset_id')
        .eq('asset_id', assetIdNum)
        .maybeSingle();

      if (existingErr) {
        setAdd999AssetPersistentError('לא ניתן לבדוק אם מזהה הנכס כבר קיים במערכת. נסה שוב.');
        return;
      }

      if (existingAsset?.asset_id != null) {
        setAdd999AssetPersistentError(`מזהה נכס ${assetIdNum} כבר קיים במערכת. בחר מזהה אחר.`);
        return;
      }
    } catch (e) {
      setAdd999AssetPersistentError('שגיאה בבדיקת מזהה הנכס מול בסיס הנתונים. נסה שוב.');
      return;
    }

    // User-entered size must match the missing area (within tolerance)
    const assetSize = parseFloat(new999AssetSize);
    if (isNaN(assetSize) || assetSize <= 0) {
      setAdd999AssetPersistentError('גודל נכס חייב להיות מספר חיובי');
      return;
    }
    if (missingSize <= 0.01) {
      setAdd999AssetPersistentError('אין שטח חסר תקין להוספה');
      return;
    }
    if (Math.abs(assetSize - missingSize) > 0.01) {
      setAdd999AssetPersistentError(`גודל נכס חייב להיות בדיוק השטח החסר: ${missingSize.toFixed(2)} מ"ר`);
      return;
    }

    // Get the first asset to copy some default values (payer_id, measurement_date, etc.)
    const firstAsset = assets[0];
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    
    // Use user-entered asset ID directly (like regular assets)
    const assetIdStr = String(assetIdNum);

    // Create new asset with type 999 - use user-entered asset ID (as number)
    const newAsset: Asset = {
      id: assetIdStr, // Use asset_id as id (like regular assets)
      asset_id: assetIdNum, // User-entered asset ID from modal (converted to number)
      building_number: building.building_number,
      payer_id: firstAsset?.payer_id || '',
      measurement_date: firstAsset?.measurement_date || dateStr,
      main_asset_type: '999',
      asset_size: assetSize,
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
      penthouse: null,
      apartment_number: undefined,
      apartment_floor: undefined,
      storage_number: undefined,
      storage_floor: undefined,
      discount_type: undefined,
      discount_date_from: undefined,
      discount_date_to: undefined,
      comment: new999AssetComment || undefined,
      tax_region: firstAsset?.tax_region || building.tax_region || undefined,
      is_latest: true,
      business_distribution_area: 0
    };

    // Add comment to all affected assets (all assets in the transfer) and add new asset
    let finalAssets: Asset[];
    let finalDirtyAssets: Map<string, Partial<Asset>>;
    
    if (new999AssetComment && new999AssetComment.trim()) {
      const updatedDirtyAssets = new Map(dirtyAssets);
      assets.forEach(asset => {
        const assetId = String(asset.asset_id);
        const existing = updatedDirtyAssets.get(assetId) || {};
        const existingComment = asset.comment || existing.comment || '';
        const newComment = existingComment 
          ? `${existingComment}; ${new999AssetComment.trim()}`
          : new999AssetComment.trim();
        updatedDirtyAssets.set(assetId, { ...existing, comment: newComment });
      });
      
      // Add the new asset to dirtyAssets map - use asset_id as key (like regular assets)
      updatedDirtyAssets.set(assetIdStr, {
        asset_id: assetIdNum,
        asset_size: assetSize,
        comment: new999AssetComment || undefined
      });
      
      finalDirtyAssets = updatedDirtyAssets;

      // Update assets array with comments and add new asset
      finalAssets = assets.map(asset => {
        const assetId = String(asset.asset_id);
        const dirtyChanges = updatedDirtyAssets.get(assetId) || {};
        return { ...asset, ...dirtyChanges };
      });
      finalAssets.push(newAsset);
      
      setDirtyAssets(updatedDirtyAssets);
      setAssets(finalAssets);
    } else {
      // No comment to add, just add the new asset
      finalAssets = [...assets, newAsset];
      
      // Mark as new asset - use asset_id as key (like regular assets)
      const updatedDirtyAssets = new Map(dirtyAssets);
      updatedDirtyAssets.set(assetIdStr, {
        asset_id: assetIdNum,
        asset_size: assetSize,
        comment: new999AssetComment || undefined
      });
      finalDirtyAssets = updatedDirtyAssets;
      
      setAssets(finalAssets);
      setDirtyAssets(updatedDirtyAssets);
    }

    // Revalidate all assets after addition
    setTimeout(async () => {
      // Calculate total area including the new 999 asset
      // IMPORTANT: The new asset has asset_size set directly in the asset object AND in dirtyAssets
      // We need to make sure we're getting the size correctly
      const totalAreaWithNewAsset = finalAssets.reduce((sum, asset) => {
        const assetId = String(asset.asset_id);
        
        // Get dirty changes - use asset_id as key (works for both new and existing assets)
        let dirtyChanges: Partial<Asset> = {};
        if (assetId) {
          const assetIdChanges = finalDirtyAssets.get(assetId);
          if (assetIdChanges) {
            dirtyChanges = assetIdChanges;
          }
        }
        
        // Get asset_size - prioritize dirty changes, then asset object
        // The new 999 asset should have asset_size in both the asset object (set when created) and dirtyAssets
        let finalAssetSize = 0;
        
        // First check dirty changes (for new assets, this is stored with trackingId)
        if (dirtyChanges && typeof dirtyChanges === 'object' && 'asset_size' in dirtyChanges) {
          const dirtySize = dirtyChanges.asset_size;
          if (dirtySize !== undefined && dirtySize !== null && !isNaN(Number(dirtySize)) && Number(dirtySize) > 0) {
            finalAssetSize = Number(dirtySize);
          }
        }
        
        // If no size from dirty changes, use asset object's size
        if (finalAssetSize === 0 && asset.asset_size !== undefined && asset.asset_size !== null) {
          const assetSizeNum = Number(asset.asset_size);
          if (!isNaN(assetSizeNum) && assetSizeNum > 0) {
            finalAssetSize = assetSizeNum;
          }
        }
        
        // Skip assets where main_asset_type has not_accountable = true
        // EXCEPT for type 999, which should always be included in transfer area calculations
        const mainAssetType = (dirtyChanges.main_asset_type || asset.main_asset_type);
        if (mainAssetType && mainAssetType !== '999' && isAssetTypeNotAccountable(mainAssetType)) {
          return sum;
        }
        
        return sum + finalAssetSize;
      }, 0);

      // Debug: Log the calculation for troubleshooting
      console.log('[TransferAreas] Area calculation after adding 999 asset:', {
        initialTotalArea,
        totalAreaWithNewAsset,
        difference: initialTotalArea !== null ? totalAreaWithNewAsset - initialTotalArea : null,
        newAssetSize: assetSize,
        newAssetId: assetIdNum,
        assetIdStr: assetIdStr,
        finalAssetsCount: finalAssets.length,
        newAssetInFinalAssets: finalAssets.find(a => String(a.asset_id) === String(assetIdNum)),
        dirtyAssetsHasAssetId: finalDirtyAssets.has(assetIdStr),
        dirtyAssetsAssetIdValue: finalDirtyAssets.get(assetIdStr),
        areaMatches: initialTotalArea !== null && Math.abs(totalAreaWithNewAsset - initialTotalArea) <= 0.01
      });
      
      // Check if total area now matches the required area (with small tolerance for floating point)
      const areaMatches = initialTotalArea !== null && Math.abs(totalAreaWithNewAsset - initialTotalArea) <= 0.01;
      
      // Define area error patterns for filtering
      const areaErrorPatterns = [
        'השטח הכולל',
        'חייב להישאר',
        'השטח הכולל הנוכחי',
        'השטח הכולל של הנכסים'
      ];
      
      // Helper function to remove area errors from error message
      const removeAreaErrors = (errorMsg: string): string => {
        if (!errorMsg) return '';
        return errorMsg
          .split('\n')
          .filter(line => {
            const lineTrimmed = line.trim();
            return lineTrimmed && !areaErrorPatterns.some(pattern => lineTrimmed.includes(pattern));
          })
          .join('\n')
          .trim();
      };
      
      // If area matches, first clear ALL existing validation errors (they might all be area-related)
      // This ensures we start fresh before re-validating
      if (areaMatches) {
        // Clear all validation errors immediately
        setValidationErrors(new Map());
      }
      
      // Validate all assets - but skip area validation if area matches
      // Pass null to prevent area error from being added
      const newValidationErrors = await validateAllAssets(finalAssets, finalDirtyAssets, areaMatches ? null : initialTotalArea);
      
      // If area matches, ensure no area errors are in the results
      if (areaMatches) {
        // Clear area errors from new validation errors
        const cleanedErrors = new Map<string, string>();
        for (const [assetId, errorMsg] of newValidationErrors.entries()) {
          if (!errorMsg) continue;
          const cleanedError = removeAreaErrors(errorMsg);
          if (cleanedError) {
            cleanedErrors.set(assetId, cleanedError);
          }
          // If error is empty after cleaning, don't add it (removes from map)
        }
        
        // Set only cleaned errors (no area errors) - this should be empty if area matches
        setValidationErrors(cleanedErrors);
        
        // Double-check: ensure no area errors remain by doing a final pass after state updates
        // This handles any edge cases where errors might have been added with different keys
        setTimeout(() => {
          setValidationErrors(prev => {
            const finalCleaned = new Map<string, string>();
            for (const [key, errorMsg] of prev.entries()) {
              const cleaned = removeAreaErrors(errorMsg);
              if (cleaned) {
                finalCleaned.set(key, cleaned);
              }
            }
            return finalCleaned;
          });
          
          // Force grid refresh after final cleanup
          if (gridRef.current?.api) {
            gridRef.current.api.refreshCells({ force: true });
            gridRef.current.api.refreshClientSideRowModel('aggregate');
          }
        }, 100);
        
        // Show success message if area is now correct
        if (cleanedErrors.size === 0) {
          setToast({ 
            message: `נכס נוסף בהצלחה. השטח הכולל תקין`, 
            type: 'success' 
          });
        } else {
          setToast({ 
            message: `נכס נוסף. השטח הכולל תקין, אך נמצאו ${cleanedErrors.size} שגיאות אחרות`, 
            type: 'info' 
          });
        }
        setTimeout(() => setToast(null), 5000);
      } else {
        // Area doesn't match, keep all errors
        setValidationErrors(newValidationErrors);
        
        if (newValidationErrors.size > 0) {
          const errorCount = newValidationErrors.size;
          setToast({ 
            message: `נכס נוסף. נמצאו ${errorCount} שגיאות אימות`, 
            type: 'error' 
          });
          setTimeout(() => setToast(null), 5000);
        }
      }
    }, 100);

    // Close modal
    setAdd999AssetModalClosing(true);
    setTimeout(() => {
      setAdd999AssetModalOpen(false);
      setAdd999AssetModalClosing(false);
      setNew999AssetId('');
      setNew999AssetSize('');
      setNew999AssetComment('');
      setAdd999AssetPersistentError(null);
    }, 300);

    // Scroll to the new asset in the grid
    setTimeout(() => {
      if (gridRef.current?.api) {
        const rowIndex = assets.length; // New row will be at the end
        gridRef.current.api.ensureIndexVisible(rowIndex, 'middle');
        gridRef.current.api.setFocusedCell(rowIndex, 'asset_size');
      }
    }, 400);

    setToast({ message: `נוסף נכס חדש מסוג 999`, type: 'success' });
    setTimeout(() => setToast(null), 3000);
  }, [building, new999AssetId, new999AssetSize, assets, dirtyAssets, new999AssetComment, missingSize]);

  // Helper function to get cell style for dirty fields and validation errors
  const getCellStyle = useCallback((params: any, fieldName: string) => {
    const assetId = String(params.data?.asset_id);
    if (!assetId) return { textAlign: 'right' };
    
    // Get dirty changes and validation errors by asset_id (works for both new and existing assets)
    const isDirty = dirtyAssets.has(assetId);
    const dirtyChanges = dirtyAssets.get(assetId) || {};
    const isFieldDirty = dirtyChanges?.hasOwnProperty(fieldName);
    
    // Check validation errors by asset_id
    const hasValidationError = validationErrors.has(assetId);
    
    if (hasValidationError) {
      return {
        backgroundColor: '#fee2e2',
        border: '2px solid #ef4444',
        fontWeight: isDirty ? 'bold' : 'normal',
        textAlign: 'right'
      };
    }
    
    if (isDirty) {
      return {
        backgroundColor: '#fef3c7',
        fontWeight: 'bold',
        textAlign: 'right'
      };
    }
    
    return { textAlign: 'right' };
  }, [dirtyAssets, validationErrors]);

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
        
        // Check validation errors by asset_id
        const hasValidationError = validationErrors.has(assetId);
        const errorMsg = hasValidationError ? (validationErrors.get(assetId) || 'שגיאת אימות') : '';
        
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
                <AlertCircle className="h-4 w-4" />
              </button>
              {tooltipContent && createPortal(tooltipContent, document.body)}
            </>
          );
        };
        
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {hasValidationError && (
              <ValidationTooltipButton
                errorMessage={errorMsg}
                onErrorClick={() => {
                  setError(errorMsg);
                  setTimeout(() => setError(null), 5000);
                }}
              />
            )}
          </div>
        );
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'asset_id')
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'payer_id')
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'main_asset_type')
    },
    {
      field: 'asset_size',
      headerName: 'גודל נכס',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) {
          // Show watermark for type 999 assets with 0 size
          const asset = params.data as Asset;
          if (asset?.main_asset_type === '999') {
            // Get missing size from the asset's comment if it contains the suggestion
            const comment = asset.comment || '';
            const match = comment.match(/מוצע: ([\d.]+)/);
            if (match) {
              return `[מוצע: ${match[1]}]`;
            }
            return '[הזן גודל]';
          }
          return '';
        }
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => {
        const style = getCellStyle(params, 'asset_size');
        const asset = params.data as Asset;
        const val = params.value;
        // Style watermark text for type 999 with 0 size
        if (asset?.main_asset_type === '999' && (val === 0 || val === null || val === undefined || val === '')) {
          return {
            ...style,
            color: '#9ca3af', // Gray color for watermark
            fontStyle: 'italic'
          };
        }
        return style;
      }
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_1')
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
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_size_1')
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_2')
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
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_size_2')
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_3')
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
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_size_3')
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_4')
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
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_size_4')
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_5')
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
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_size_5')
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_6')
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
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_size_6')
    },
    {
      field: 'comment',
      headerName: t('comment') || 'הערה',
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
      cellStyle: (params: any) => getCellStyle(params, 'comment'),
      tooltipValueGetter: (params) => params.value || ''
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
  }, [t, validationErrors, getCellStyle]);

  // Apply field configurations from database
  const configuredColumnDefs = useFieldConfig(columnDefs, 'transfer-areas');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3">
      <div className="mb-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg shadow-lg p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <BuildingIcon className="w-7 h-7 text-white" />
            <h1 className="text-lg sm:text-xl font-bold text-white">
              העברת שטחים - מבנה {building?.building_number}
            </h1>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-2 bg-red-50 border-l-4 border-red-500 rounded-lg p-2">
          <p className="text-red-800 text-sm font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-2 bg-green-50 border-l-4 border-green-500 rounded-lg p-2">
          <p className="text-green-800 text-sm font-medium">{success}</p>
        </div>
      )}

      <div className="mb-2 flex justify-end gap-2">
        <button
          onClick={async () => {
            if (!assets || assets.length === 0) {
              setToast({ message: 'אין נכסים לייצוא', type: 'error' });
              return;
            }
            try {
              const headers = ['מזהה מבנה', 'מזהה נכס', 'מזהה משלם', 'תאריך מדידה', 'סוג נכס ראשי', 'גודל נכס', 'אזור מס', 'הערה'];
              const rows = assets.map(asset => {
                const assetId = String(asset.asset_id);
                const dirtyChanges = dirtyAssets.get(assetId) || {};
                const updatedAsset = { ...asset, ...dirtyChanges };
                return [
                  updatedAsset.building_number || '',
                  updatedAsset.asset_id || '',
                  updatedAsset.payer_id || '',
                  updatedAsset.measurement_date || '',
                  updatedAsset.main_asset_type || '',
                  updatedAsset.asset_size || '',
                  updatedAsset.tax_region || '',
                  updatedAsset.comment || ''
                ];
              });
              const data = [headers, ...rows];
              const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
              const filename = `העברת_שטחים_מבנה_${buildingNumber}_${dateStr}.xlsx`;
              exportToExcel({
                filename,
                sheetName: 'העברת שטחים',
                data,
                columnWidths: [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 30 }]
              });
              setToast({ message: `יוצאו ${rows.length} נכסים בהצלחה`, type: 'success' });
            } catch (error) {
              console.error('Error exporting to Excel:', error);
              setToast({ message: 'שגיאה בייצוא לקובץ Excel', type: 'error' });
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md font-medium"
          title="ייצא ל-Excel"
        >
          <Download className="h-4 w-4" />
          ייצא ל-Excel
        </button>
        <button
          onClick={handleCancelAll}
          disabled={loading || !hasChanges}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-500 hover:bg-slate-600 active:bg-slate-700 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none font-medium"
        >
          <X className="h-4 w-4" />
          ביטול
        </button>
        <button
          onClick={handleOpenSaveAsNewMeasurementModal}
          disabled={loading || !hasChanges}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none font-medium"
          title={!hasChanges ? 'אין שינויים לשמירה' : 'שמור כמדידות חדשות (הרשומות הישנות יעברו להיסטוריה)'}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {loading ? 'שומר...' : `שמור כמדידות חדשות${hasChanges ? ` (${dirtyAssets.size})` : ''}${validationErrors.size > 0 ? ` - ${validationErrors.size} שגיאות` : ''}`}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 border border-blue-100">
        <div className="p-3">
          <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ width: '100%', height: '50vh', direction: 'ltr', overflowX: 'auto' }}>
            <AgGridReact<Asset>
              ref={gridRef}
              rowData={sortedAssets}
              columnDefs={configuredColumnDefs}
              defaultColDef={{
                resizable: true,
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
              suppressHorizontalScroll={false}
              getRowId={(params) => String(params.data.asset_id)}
              onCellValueChanged={onCellValueChanged}
              onCellEditingStopped={onCellEditingStopped}
              getRowStyle={(params) => {
        const assetId = String(params.data?.asset_id);
        
        // Check validation errors by asset_id
        const hasValidationError = validationErrors.has(assetId);
                
                if (hasValidationError) {
                  return { backgroundColor: '#fef2f2' }; // Light red for validation errors
                }
                return null;
              }}
              onGridReady={async (params) => {
                await gridPreferences.loadColumnState(params.api);
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
                gridPreferences.handleColumnResized();
                setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
              }}
              onColumnMoved={gridPreferences.handleColumnMoved}
              onSortChanged={() => {}}
              singleClickEdit={true}
              stopEditingWhenCellsLoseFocus={true}
              enableRtl={true}
              animateRows={false}
            />
          </div>
        </div>
      </div>

      {/* Total Area Display - Calculated once and not changeable */}
      <div className="mt-2 flex items-center justify-end gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-700">שטח כולל של הנכסים המקושרים:</label>
          <input
            type="text"
            value={displayTotalArea !== null ? displayTotalArea.toLocaleString('he-IL') : ''}
            readOnly
            className={`px-3 py-2 border rounded-lg text-right font-semibold ${
              totalAreaChanged
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-slate-300 bg-slate-50 text-slate-700'
            }`}
            style={{ minWidth: '150px' }}
            title="שטח כולל מחושב פעם אחת ולא ניתן לשינוי"
          />
          {totalAreaChanged && (
            <span className="text-xs text-red-600 font-medium">
              (השטח הכולל השתנה - חייב להישאר {initialTotalArea?.toLocaleString('he-IL')})
            </span>
          )}
        </div>
        {missingSize > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-amber-600 font-medium">
              חסר: {missingSize.toFixed(2)} מ"ר
            </span>
            <button
              onClick={handleAddMissingAsset}
              disabled={!canAdd999Asset}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all duration-200 shadow-sm font-medium ${
                canAdd999Asset
                  ? 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white hover:shadow-md'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
              title={canAdd999Asset ? 'הוסף נכס חדש מסוג 999 עם הגודל החסר' : 'תקן קודם את כל השגיאות האחרות (מלבד השטח הכולל)'}
            >
              <Plus className="h-4 w-4" />
              הוסף נכס מסוג 999
            </button>
          </div>
        )}
      </div>

      {/* Add 999 Asset Modal */}
      {add999AssetModalOpen && (
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
            add999AssetModalClosing ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => {
            setAdd999AssetModalClosing(true);
            setTimeout(() => {
              setAdd999AssetModalOpen(false);
              setAdd999AssetModalClosing(false);
              setNew999AssetId('');
              setNew999AssetSize('');
              setNew999AssetComment('');
              setAdd999AssetPersistentError(null);
            }, 300);
          }}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 flex flex-col transition-all duration-300 ${
              add999AssetModalClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">הוסף נכס מסוג 999</h3>
              <button
                onClick={() => {
                  setAdd999AssetModalClosing(true);
                  setTimeout(() => {
                    setAdd999AssetModalOpen(false);
                    setAdd999AssetModalClosing(false);
                    setNew999AssetId('');
                    setNew999AssetSize('');
                    setNew999AssetComment('');
                    setAdd999AssetPersistentError(null);
                  }, 300);
                }}
                className="text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <label htmlFor="new999AssetId" className="block text-sm font-medium text-slate-700 mb-1">
                מזהה נכס <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="new999AssetId"
                value={new999AssetId}
                onChange={(e) => {
                  setNew999AssetId(e.target.value);
                  if (add999AssetPersistentError) setAdd999AssetPersistentError(null);
                }}
                placeholder="הזן מזהה נכס"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-right"
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label htmlFor="new999AssetSize" className="block text-sm font-medium text-slate-700 mb-1">
                גודל נכס (מ"ר) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="new999AssetSize"
                value={new999AssetSize}
                onChange={(e) => {
                  // Allow only numbers and decimal point
                  const value = e.target.value.replace(/[^\d.]/g, '');
                  setNew999AssetSize(value);
                  if (add999AssetPersistentError) setAdd999AssetPersistentError(null);
                }}
                placeholder=""
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-right"
              />
              {missingSize > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  שטח חסר: {missingSize.toFixed(2)} מ"ר
                </p>
              )}
            </div>

            <div className="mb-4">
              <label htmlFor="new999AssetComment" className="block text-sm font-medium text-slate-700 mb-1">
                הערה (תתווסף לכל הנכסים המושפעים)
              </label>
              <textarea
                id="new999AssetComment"
                value={new999AssetComment}
                onChange={(e) => setNew999AssetComment(e.target.value)}
                placeholder="הזן הערה שתתווסף לכל הנכסים בפעולת ההעברה"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-right resize-none"
              />
            </div>

            {add999AssetPersistentError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm whitespace-pre-wrap">
                {add999AssetPersistentError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setAdd999AssetModalClosing(true);
                  setTimeout(() => {
                    setAdd999AssetModalOpen(false);
                    setAdd999AssetModalClosing(false);
                    setNew999AssetId('');
                    setNew999AssetSize('');
                    setNew999AssetComment('');
                    setAdd999AssetPersistentError(null);
                  }, 300);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-500 hover:bg-slate-600 text-white rounded-md transition-all shadow-sm hover:shadow font-medium"
              >
                <X className="h-4 w-4" />
                ביטול
              </button>
              <button
                onClick={handleSave999Asset}
                disabled={!new999AssetId || !new999AssetSize}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-500 hover:bg-teal-600 text-white rounded-md transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <Plus className="h-4 w-4" />
                הוסף
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Measurement Date Input Modal */}
      {measurementDateModalOpen && (
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
            measurementDateModalClosing ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => {
            setMeasurementDateModalClosing(true);
            setTimeout(() => {
              setMeasurementDateModalOpen(false);
              setMeasurementDateModalClosing(false);
            }, 300);
          }}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 flex flex-col transition-all duration-300 ${
              measurementDateModalClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">שמור כמדידות חדשות</h3>
              <button
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
              <label htmlFor="newMeasurementDate" className="block text-sm font-medium text-slate-700 mb-1">
                תאריך מדידה (DD/MM/YYYY)
              </label>
              <input
                type="text"
                id="newMeasurementDate"
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
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-right"
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-500 hover:bg-slate-600 text-white rounded-md transition-all shadow-sm hover:shadow font-medium"
              >
                <X className="h-4 w-4" />
                ביטול
              </button>
              <button
                onClick={handleSaveAsNewMeasurements}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-500 hover:bg-teal-600 active:bg-teal-700 disabled:bg-gray-400  text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:shadow-none font-medium"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                אישור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

    </div>
  );
});


