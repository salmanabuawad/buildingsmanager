import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Building as BuildingIcon, Loader2, Save, X, AlertCircle, Copy, CheckCircle2 } from 'lucide-react';
import { Toast } from './Toast';

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
      const [buildingData, assetTypesData] = await Promise.all([
        api.buildings.getOne(buildingNumber),
        api.assetTypes.getAll()
      ]);

      setBuilding(buildingData);
      setAssetTypes(assetTypesData || []);

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
        // Initial load: fetch by asset_ids
        for (const assetId of selectedAssetIds) {
          try {
            // assetId is actually asset_id, fetch using getAllByAssetId
            const asset = await api.assets.getOne(Number(assetId));
            fetchedAssets.push(asset);
            // Store asset identifier for future reloads (key is asset_id)
            setAssetIdentifiers(prev => {
              const next = new Map(prev);
              next.set(String(asset.asset_id), { asset_id: asset.asset_id, building_number: asset.building_number });
              return next;
            });
          } catch (err) {
            console.error(`Error fetching asset ${assetId}:`, err);
            // Don't add to errors array here - just log it
          }
        }
      }

      setAssets(fetchedAssets);
      
      // Calculate initial total area (sum of asset_size only)
      const totalArea = fetchedAssets.reduce((sum, asset) => {
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
    const shouldValidateSubAssets = asset.main_asset_type === '199' || asset.main_asset_type === '299';
    const validations = [
      assetValidators.validateBuildingNumber(asset.building_number),
      assetValidators.validateAssetId(asset.asset_id),
      assetValidators.validatePayerId(asset.payer_id),
      assetValidators.validateAssetType(asset.main_asset_type, 'main_asset_type'),
      assetValidators.validateMainAssetTypeComplete(asset.building_number, asset.main_asset_type, asset.asset_size, asset, taxRegion),
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
        ]
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
        taxRegion
      ),
      assetValidators.validateAssetType(asset.sub_asset_type_1, 'sub_asset_type_1'),
      assetValidators.validateAssetType(asset.sub_asset_type_2, 'sub_asset_type_2'),
      assetValidators.validateAssetType(asset.sub_asset_type_3, 'sub_asset_type_3'),
      assetValidators.validateAssetType(asset.sub_asset_type_4, 'sub_asset_type_4'),
      assetValidators.validateAssetType(asset.sub_asset_type_5, 'sub_asset_type_5'),
      assetValidators.validateAssetType(asset.sub_asset_type_6, 'sub_asset_type_6'),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_1, asset.sub_asset_size_1, taxRegion, undefined, asset),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_2, asset.sub_asset_size_2, taxRegion, undefined, asset),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_3, asset.sub_asset_size_3, taxRegion, undefined, asset),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_4, asset.sub_asset_size_4, taxRegion, undefined, asset),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_5, asset.sub_asset_size_5, taxRegion, undefined, asset),
      assetValidators.validateSubAssetTypeComplete(asset.building_number, asset.sub_asset_type_6, asset.sub_asset_size_6, taxRegion, undefined, asset),
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

    // Calculate current total area
    const newTotalArea = updatedAssets.reduce((sum, a) => {
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
  }, [validateAsset]);

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
      let savedCount = 0;
      const errors: string[] = [];

      for (const [assetId, changes] of dirtyAssets.entries()) {
        try {
          // Get the full asset data with changes (assetId is asset_id)
          const originalAsset = assets.find(a => String(a.asset_id) === assetId);
          if (!originalAsset) {
            errors.push(`נכס ${assetId}: לא נמצא`);
            continue;
          }

          const updatedData = { ...originalAsset, ...changes };

          // Validate before saving
          const shouldValidateSubAssets = updatedData.main_asset_type === '199' || updatedData.main_asset_type === '299';
          const validations = [
            assetValidators.validateBuildingNumber(updatedData.building_number),
            assetValidators.validateAssetId(updatedData.asset_id),
            assetValidators.validatePayerId(updatedData.payer_id),
            assetValidators.validateAssetType(updatedData.main_asset_type, 'main_asset_type'),
            assetValidators.validateMainAssetTypeComplete(updatedData.building_number, updatedData.main_asset_type, updatedData.asset_size, updatedData, taxRegion),
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
              ]
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
              taxRegion
            ),
            assetValidators.validateAssetType(updatedData.sub_asset_type_1, 'sub_asset_type_1'),
            assetValidators.validateAssetType(updatedData.sub_asset_type_2, 'sub_asset_type_2'),
            assetValidators.validateAssetType(updatedData.sub_asset_type_3, 'sub_asset_type_3'),
            assetValidators.validateAssetType(updatedData.sub_asset_type_4, 'sub_asset_type_4'),
            assetValidators.validateAssetType(updatedData.sub_asset_type_5, 'sub_asset_type_5'),
            assetValidators.validateAssetType(updatedData.sub_asset_type_6, 'sub_asset_type_6'),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_1, updatedData.sub_asset_size_1, taxRegion, undefined, updatedData),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_2, updatedData.sub_asset_size_2, taxRegion, undefined, updatedData),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_3, updatedData.sub_asset_size_3, taxRegion, undefined, updatedData),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_4, updatedData.sub_asset_size_4, taxRegion, undefined, updatedData),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_5, updatedData.sub_asset_size_5, taxRegion, undefined, updatedData),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_6, updatedData.sub_asset_size_6, taxRegion, undefined, updatedData),
          );

          const validation = await validateAll(validations);
          if (!validation.valid) {
            errors.push(`נכס ${updatedData.asset_id}: ${validation.error}`);
            continue;
          }

          // Prepare new asset data with updated measurement date
          const newAssetData = {
            ...updatedData,
            measurement_date: finalMeasurementDate
          };

          // Remove fields that shouldn't be in new record
          delete (newAssetData as any).created_at;
          delete (newAssetData as any).updated_at;
          delete (newAssetData as any).is_latest;
          delete (newAssetData as any).history_created_at;
          delete (newAssetData as any).is_new_measurement;

          // First, try to update the old record with is_new_measurement flag set to true
          // The database trigger will automatically move it to assets_history
          try {
            await api.assets.update(originalAsset.asset_id, { is_new_measurement: true });
          } catch (updateErr) {
            // If update fails (e.g., asset already moved to history), that's okay
            // We'll just create the new measurement
            console.warn(`Could not update old asset ${assetId} (might already be in history):`, updateErr);
          }

          // Then create the new measurement in assets table
          const createdAsset = await api.assets.create(newAssetData as any);

          // Update asset identifiers (key is asset_id)
          setAssetIdentifiers(prev => {
            const next = new Map(prev);
            // Update the mapping: old asset_id -> new asset identifier
            next.set(String(createdAsset.asset_id), { asset_id: createdAsset.asset_id, building_number: createdAsset.building_number });
            return next;
          });

          savedCount++;
        } catch (err) {
          const originalAsset = assets.find(a => String(a.asset_id) === assetId);
          const assetIdentifier = originalAsset?.asset_id || assetId;
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`נכס ${assetIdentifier}: ${errorMsg}`);
        }
      }

      if (errors.length > 0) {
        const successMsg = savedCount > 0 ? `נשמרו ${savedCount} נכסים כמדידות חדשות. ` : '';
        setError(`${successMsg}${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`);
      } else {
        setSuccess(`✓ נשמרו ${savedCount} נכסים כמדידות חדשות בהצלחה`);
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
    setDirtyAssets(new Map());
    setValidationErrors(new Map());
    fetchData();
  };


  const hasChanges = dirtyAssets.size > 0;

  // Calculate current total area (sum of asset_size only, with dirty changes applied)
  const currentTotalArea = useMemo(() => {
    return assets.reduce((sum, asset) => {
      const assetId = String(asset.asset_id);
      const dirtyChanges = dirtyAssets.get(assetId) || {};
      const assetWithChanges = { ...asset, ...dirtyChanges };
      
      return sum + (assetWithChanges.asset_size || 0);
    }, 0);
  }, [assets, dirtyAssets]);

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
      width: 120,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'asset_id')
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      width: 120,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'payer_id')
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 60,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'main_asset_type')
    },
    {
      field: 'asset_size',
      headerName: 'גודל נכס',
      width: 80,
      editable: true,
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
      width: 60,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_1')
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      width: 80,
      editable: true,
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
      width: 60,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_2')
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      width: 80,
      editable: true,
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
      width: 60,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_3')
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      width: 80,
      editable: true,
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
      width: 60,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_4')
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      width: 80,
      editable: true,
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
      width: 60,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_5')
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      width: 80,
      editable: true,
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
      width: 60,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_6')
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      width: 80,
      editable: true,
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
  ], [t, validationErrors, getCellStyle]);

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
          <div className="flex items-center gap-3">
            <BuildingIcon className="w-7 h-7 text-white" />
            <h1 className="text-lg sm:text-xl font-bold text-white">
              העברת שטחים - מבנה {building?.building_number}
            </h1>
            {taxRegion && (
              <p className="text-sm text-white font-semibold bg-purple-700 px-3 py-1 rounded">
                {getAreaDescriptionForTaxRegion(taxRegion)}
              </p>
            )}
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
          onClick={handleCancelAll}
          disabled={loading || !hasChanges}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          <X className="h-4 w-4" />
          ביטול
        </button>
        <button
          onClick={handleOpenSaveAsNewMeasurementModal}
          disabled={loading || !hasChanges || validationErrors.size > 0}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
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

      <div className="bg-white rounded-xl shadow-lg border border-blue-100">
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
                minWidth: 100
              }}
              gridOptions={{
                suppressColumnVirtualisation: true,
                alwaysShowHorizontalScroll: true,
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
              }}
              onFirstDataRendered={async (params) => {
              }}
              onColumnResized={() => {}}
              onColumnMoved={() => {}}
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
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
                ביטול
              </button>
              <button
                onClick={handleSaveAsNewMeasurements}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
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

