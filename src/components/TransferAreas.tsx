import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { supabase } from '../lib/supabase';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Building as BuildingIcon, Loader2, Save, X, AlertCircle, Copy, CheckCircle2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Toast } from './Toast';
import { useGridPreferences } from '../lib/useGridPreferences';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';

interface TransferAreasProps {
  buildingNumber: number;
  taxRegion?: string;
  selectedAssetIds: string[];
}

export function TransferAreas({ buildingNumber, taxRegion, selectedAssetIds }: TransferAreasProps) {
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

  // Helper function to check if an asset type is not_accountable
  const isAssetTypeNotAccountable = useCallback((assetTypeName: string | null | undefined): boolean => {
    if (!assetTypeName || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Find asset type by name
    const assetType = assetTypes.find(at => at.name === assetTypeName);
    return assetType?.not_accountable === true;
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
      // Use the helper function to check if asset type is not_accountable
      const totalArea = fetchedAssets.reduce((sum, asset) => {
        // Skip assets where main_asset_type has not_accountable = true
        if (asset.main_asset_type && finalAssetTypes) {
          const assetType = finalAssetTypes.find(at => at.name === asset.main_asset_type);
          if (assetType?.not_accountable === true) {
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
      const dirtyChanges = allDirtyAssets.get(assetId) || {};
      return { ...asset, ...dirtyChanges };
    });

    // Calculate current total area (excluding assets with not_accountable = true)
    const newTotalArea = updatedAssets.reduce((sum, a) => {
      // Skip assets where main_asset_type has not_accountable = true
      if (a.main_asset_type && isAssetTypeNotAccountable(a.main_asset_type)) {
        return sum;
      }
      
      return sum + (a.asset_size || 0);
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
      const originalAssets: Asset[] = [];
      const newAssetsData: Partial<Asset>[] = [];
      
      // First pass: validate all assets and prepare data
      for (const [assetId, changes] of dirtyAssets.entries()) {
        try {
          // Get the full asset data with changes (assetId is asset_id)
          const originalAsset = assets.find(a => String(a.asset_id) === assetId);
          if (!originalAsset) {
            errors.push(`נכס ${assetId}: לא נמצא`);
            continue;
          }

          const updatedData = { ...originalAsset, ...changes };

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
          const shouldValidateSubAssets = updatedData.main_asset_type === '199' || updatedData.main_asset_type === '299';
          const validations = [
            assetValidators.validateBuildingNumber(updatedData.building_number),
            assetValidators.validateAssetId(updatedData.asset_id),
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
            errors.push(`נכס ${updatedData.asset_id}: ${validation.error}`);
            continue;
          }

          // Store original asset for before data (for p_old_assets parameter)
          originalAssets.push({ ...originalAsset });
          
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
          
          newAssetsData.push(newAssetData);
        } catch (err) {
          const originalAsset = assets.find(a => String(a.asset_id) === assetId);
          const assetIdentifier = originalAsset?.asset_id || assetId;
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`נכס ${assetIdentifier}: ${errorMsg}`);
        }
      }

      // If validation errors, stop here
      if (errors.length > 0 && originalAssets.length === 0) {
        setError(errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''));
        setLoading(false);
        return;
      }

      // Save all assets in bulk with single audit entry and action_id (same as distribute)
      if (originalAssets.length > 0) {
        try {
          // Prepare before and after data - database transaction will collect automatically
          // Pass NULL to let the database function collect before/after data from the database
          // Database will collect before data from assets table before moving to history
          // Database will collect after data from assets table after creating new measurements
          const affectedAssetIds = originalAssets.map(a => a.asset_id);
          
          // Use bulkTransferAreas which handles creating new measurements and audit logging
          // Database transaction will automatically collect before/after asset data
          const result = await api.auditLog.bulkTransferAreas(
            originalAssets,
            newAssetsData,
            'transfer_area',
            null, // Database will collect before asset data automatically (lowercase null, not NULL)
            null, // Database will collect after asset data automatically (lowercase null, not NULL)
            `Transferred areas for ${originalAssets.length} assets as new measurements`
          );
          
          // Update asset identifiers for all affected assets
          const newIdentifiers = new Map<string, { asset_id: number; building_number: number }>();
          for (const originalAsset of originalAssets) {
            // The asset_id remains the same, just the measurement_date changes
            newIdentifiers.set(String(originalAsset.asset_id), {
              asset_id: originalAsset.asset_id,
              building_number: originalAsset.building_number
            });
          }
          setAssetIdentifiers(prev => {
            const next = new Map(prev);
            for (const [key, value] of newIdentifiers.entries()) {
              next.set(key, value);
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
      
      // Wait a bit for the database operations to complete, then reload data
      if (originalAssets.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await fetchData();
      }

      if (errors.length > 0) {
        const successMsg = originalAssets.length > 0 ? `נשמרו ${originalAssets.length} נכסים כמדידות חדשות. ` : '';
        setError(`${successMsg}${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`);
      } else if (originalAssets.length > 0) {
        setSuccess(`✓ נשמרו ${originalAssets.length} נכסים כמדידות חדשות בהצלחה`);
        setTimeout(() => setSuccess(null), 3000);
      }

      setDirtyAssets(new Map());
      setValidationErrors(new Map());
      
      // Wait a bit for the database trigger to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await fetchData();
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

  // Calculate current total area (sum of asset_size, excluding assets with not_accountable = true, with dirty changes applied)
  const currentTotalArea = useMemo(() => {
    return assets.reduce((sum, asset) => {
      const assetId = String(asset.asset_id);
      const dirtyChanges = dirtyAssets.get(assetId) || {};
      const assetWithChanges = { ...asset, ...dirtyChanges };
      
      // Skip assets where main_asset_type has not_accountable = true
      // Check the updated main_asset_type if it was changed in dirtyChanges
      const mainAssetType = assetWithChanges.main_asset_type || asset.main_asset_type;
      if (mainAssetType && isAssetTypeNotAccountable(mainAssetType)) {
        return sum;
      }
      
      return sum + (assetWithChanges.asset_size || 0);
    }, 0);
  }, [assets, dirtyAssets, isAssetTypeNotAccountable, assetTypes]);

  // Check if total area has changed (validation will prevent saving if changed)
  const totalAreaChanged = initialTotalArea !== null && Math.abs(currentTotalArea - initialTotalArea) > 0.01;
  
  // Display total area - always show initial value (calculated once and not changeable)
  const displayTotalArea = initialTotalArea !== null ? initialTotalArea : currentTotalArea;

  // Helper function to get cell style for dirty fields and validation errors
  const getCellStyle = useCallback((params: any, fieldName: string) => {
    const assetId = String(params.data?.asset_id);
    if (!assetId) return { textAlign: 'right' };
    
    const isDirty = dirtyAssets.has(assetId) && dirtyAssets.get(assetId)?.hasOwnProperty(fieldName);
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
        const hasValidationError = validationErrors.has(assetId);
        
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {hasValidationError && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const errorMsg = validationErrors.get(assetId);
                  setError(errorMsg || 'שגיאת אימות');
                  setTimeout(() => setError(null), 5000);
                }}
                className="p-1 text-red-600 hover:text-red-700 transition-colors hover:scale-110"
                title={validationErrors.get(assetId) || 'שגיאת אימות'}
              >
                <AlertCircle className="h-5 w-5" />
              </button>
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
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'asset_size')
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
              const headers = ['מזהה מבנה', 'מזהה נכס', 'מזהה משלם', 'תאריך מדידה', 'סוג נכס ראשי', 'גודל נכס', 'אזור מס'];
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
                  updatedAsset.tax_region || ''
                ];
              });
              const data = [headers, ...rows];
              const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
              const filename = `העברת_שטחים_מבנה_${buildingNumber}_${dateStr}.xlsx`;
              const { exportToExcel } = await import('../lib/excelExport');
              exportToExcel({
                filename,
                sheetName: 'העברת שטחים',
                data,
                columnWidths: [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }]
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
          disabled={loading || !hasChanges || validationErrors.size > 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none font-medium"
          title={validationErrors.size > 0 ? 'תקן שגיאות אימות לפני שמירה' : !hasChanges ? 'אין שינויים לשמירה' : 'שמור כמדידות חדשות (הרשומות הישנות יעברו להיסטוריה)'}
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
              rowData={assets}
              columnDefs={columnDefs}
              defaultColDef={{
                resizable: true,
                wrapHeaderText: true,
                autoHeaderHeight: true,
                wrapText: true,
                autoHeight: false,
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
              getRowId={(params) => String(params.data.asset_id)}
              onCellValueChanged={onCellValueChanged}
              getRowStyle={(params) => {
                const assetId = String(params.data?.asset_id);
                if (validationErrors.has(assetId)) {
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
              enableRtl={true}
              animateRows={true}
            />
          </div>
        </div>
      </div>

      {/* Total Area Display - Calculated once and not changeable */}
      <div className="mt-2 flex items-center justify-end gap-4">
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
      </div>

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
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-500 hover:bg-teal-600 active:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:shadow-none font-medium"
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
}

