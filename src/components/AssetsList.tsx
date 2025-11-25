import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { assetValidators, validateAll, inputValidators, validateEntity } from '../lib/validation';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, IDetailCellRendererParams } from 'ag-grid-community';
import { Building as BuildingIcon, AlertCircle, ChevronDown, ChevronRight, Loader2, Save, X, Plus, Trash2, Eye, CheckCircle2, Download, ArrowRightLeft } from 'lucide-react';
import { useGridPreferences } from '../hooks/useGridPreferences';
import { ValidationResultModal, BatchValidationResults, ValidationProgress } from './ValidationResultModal';
interface AssetsListProps {
  buildingNumber: number;
  taxRegion?: string;
  onSelectAsset: (assetId: string, assetIdentifier: string, buildingNumber: number) => void;
  onOpenTransferAreas?: (selectedAssetIds: string[], buildingNumber: number, taxRegion?: string) => void;
}
export function AssetsList({ buildingNumber, taxRegion, onSelectAsset, onOpenTransferAreas }: AssetsListProps) {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
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
  const { loadColumnState, saveColumnState, columnStateLoaded } = useGridPreferences(gridRef, 'assets_list_column_state');
  const [showBatchValidationModal, setShowBatchValidationModal] = useState(false);
  const [batchValidationLoading, setBatchValidationLoading] = useState(false);
  const [batchValidationProgress, setBatchValidationProgress] = useState<ValidationProgress | null>(null);
  const [batchValidationResults, setBatchValidationResults] = useState<BatchValidationResults | null>(null);
  
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
      
      // Filter by tax region if provided
      let filteredAssets = assetsData || [];
      if (taxRegion) {
        const taxRegionNum = parseInt(taxRegion.trim());
        const taxRegionStr = taxRegion.trim();
        
        filteredAssets = [];
        
        for (const asset of assetsData || []) {
          // Skip assets without main_asset_type
          if (!asset.main_asset_type) {
            continue;
          }
          
          // Look up asset type to get tax_region
          const assetType = (assetTypesData || []).find(at => {
            return String(at.name || '').trim() === String(asset.main_asset_type || '').trim();
          });
          
          if (!assetType) {
            continue;
          }
          
          const assetTaxRegion = assetType.tax_region;
          
          if (assetTaxRegion == null) {
            continue;
          }
          
          // Check if the tax_region matches the requested taxRegion
          const taxRegionMatches = assetTaxRegion === taxRegionNum || String(assetTaxRegion) === taxRegionStr;
          
          if (taxRegionMatches) {
            filteredAssets.push(asset);
          }
        }
      }
      
      // Preserve new assets that haven't been saved yet (failed saves remain visible)
      const existingNewAssets = assets.filter(a => newAssets.has(String(a.id)));
      const mergedAssets = [...filteredAssets, ...existingNewAssets];
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
  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const assetId = data.id;
      const newValue = event.newValue;

      // Create updated asset with new value
      const updatedAsset = { ...data, [field]: newValue };

      // Track the change in dirtyAssets
      setDirtyAssets(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(assetId) || {};
        newMap.set(assetId, { ...existing, [field]: newValue });
        return newMap;
      });


      // Validate measurement_date format if changed
      if (field === 'measurement_date' && updatedAsset.measurement_date) {
        const dateValidation = inputValidators.validateDateFormat(updatedAsset.measurement_date);
        if (!dateValidation.valid) {
          setError(dateValidation.error || 'Invalid date format');
          setTimeout(() => setError(null), 3000);
          event.api.refreshCells({ rowNodes: [event.node!], force: true });
          return;
        }
      }

      // Build comprehensive validation list
      const shouldValidateSubAssets = updatedAsset.main_asset_type === '199' || updatedAsset.main_asset_type === '299';
      const validations = [
        assetValidators.validateBuildingNumber(updatedAsset.building_number),
        assetValidators.validateAssetId(updatedAsset.asset_id),
        assetValidators.validatePayerId(updatedAsset.payer_id),
        assetValidators.validateAssetType(updatedAsset.main_asset_type, 'main_asset_type'),
        assetValidators.validateMainAssetTypeComplete(updatedAsset.building_number, updatedAsset.main_asset_type, updatedAsset.asset_size, updatedAsset, taxRegion),
        assetValidators.validateOnlyComplexTypesCanHaveSubAssets(updatedAsset.main_asset_type, [
          updatedAsset.sub_asset_type_1,
          updatedAsset.sub_asset_type_2,
          updatedAsset.sub_asset_type_3,
          updatedAsset.sub_asset_type_4,
          updatedAsset.sub_asset_type_5,
          updatedAsset.sub_asset_type_6
        ]),
        assetValidators.validateComplexTypesMustHaveSubAssets(updatedAsset.main_asset_type, [
          updatedAsset.sub_asset_type_1,
          updatedAsset.sub_asset_type_2,
          updatedAsset.sub_asset_type_3,
          updatedAsset.sub_asset_type_4,
          updatedAsset.sub_asset_type_5,
          updatedAsset.sub_asset_type_6
        ])
      ];

      if (shouldValidateSubAssets) {
        validations.push(
          assetValidators.validateMinimumSubAssets([
            updatedAsset.sub_asset_type_1,
            updatedAsset.sub_asset_type_2,
            updatedAsset.sub_asset_type_3,
            updatedAsset.sub_asset_type_4,
            updatedAsset.sub_asset_type_5,
            updatedAsset.sub_asset_type_6
          ])
        );
      }

      validations.push(
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
        ),
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
          taxRegion
        ),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_1, 'sub_asset_type_1'),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_2, 'sub_asset_type_2'),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_3, 'sub_asset_type_3'),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_4, 'sub_asset_type_4'),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_5, 'sub_asset_type_5'),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_6, 'sub_asset_type_6'),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_1, updatedAsset.sub_asset_size_1, taxRegion),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_2, updatedAsset.sub_asset_size_2, taxRegion),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_3, updatedAsset.sub_asset_size_3, taxRegion),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_4, updatedAsset.sub_asset_size_4, taxRegion),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_5, updatedAsset.sub_asset_size_5, taxRegion),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_6, updatedAsset.sub_asset_size_6, taxRegion),
      );

      // Run all validations
      const validation = await validateAll(validations);

      if (!validation.valid) {
        const detailedError = validation.error || 'Unknown validation error';
        setError(detailedError);
        setTimeout(() => setError(null), 5000);
        // Store validation error for this asset
        setValidationErrors(prev => {
          const newMap = new Map(prev);
          newMap.set(String(assetId), detailedError);
          return newMap;
        });
      } else {
        // Clear validation error if validation passes
        setValidationErrors(prev => {
          const newMap = new Map(prev);
          newMap.delete(String(assetId));
          return newMap;
        });
      }


      // Update the assets state with the new value
      setAssets(prevAssets =>
        prevAssets.map(asset =>
          String(asset.id) === String(assetId) ? updatedAsset : asset
        )
      );

      // Refresh the grid cells to show validation styling
      event.api.refreshCells({ rowNodes: [event.node!], force: true });

    } catch (error) {
      console.error('Error tracking change:', error);
      setError('Failed to track change');
      setTimeout(() => setError(null), 3000);
    }
  }, []);

  async function handleBatchValidateBuildingAssets() {
    setShowBatchValidationModal(true);
    setBatchValidationLoading(true);
    setBatchValidationResults(null);
    setBatchValidationProgress(null);

    try {
      // Pre-fetch all required data once (performance optimization)
      const [buildingAssets, assetTypesData, buildingData] = await Promise.all([
        api.assets.getAll(buildingNumber),
        api.assetTypes.getAll(),
        api.buildings.getOne(buildingNumber).catch(() => null)
      ]);
      
      // Filter by tax region if specified
      let filteredAssets = buildingAssets;
      if (taxRegion) {
        filteredAssets = buildingAssets.filter(asset => {
          const assetType = assetTypesData.find(at => at.name === asset.main_asset_type);
          return assetType && String(assetType.tax_region) === taxRegion;
        });
      }

      // Use all assets directly (getAll returns only latest records from assets table)
      const assetsToValidate = filteredAssets;

      console.log(`[Batch Validation] Found ${assetsToValidate.length} assets to validate for building ${buildingNumber}`);

      // Use unified validation handler
      const batchResult = await AssetValidationHandler.validateBuildingAssets(
        assetsToValidate,
        buildingNumber,
        {
          mode: 'building',
          validateOnlyLatest: true,
          taxRegion: taxRegion,
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
      const results = {
        total: batchResult.total,
        valid: batchResult.valid,
        invalid: batchResult.invalid,
        errors: batchResult.results.map(result => {
          // Find the asset to get its database ID
          const asset = assetsToValidate.find(a => String(a.asset_id) === String(result.assetId));
          return {
            assetId: String(result.assetId),
            assetDbId: asset ? String(asset.id) : undefined,
            buildingNumber: asset?.building_number || buildingNumber,
            errors: result.errors,
            passed: result.passed,
            matchedAssetTypeRecord: result.matchedAssetTypeRecord
          };
        })
      };

      setBatchValidationResults(results);
      console.log(`[Batch Validation] Completed: ${results.valid} valid, ${results.invalid} invalid out of ${results.total} total`);

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
                const validation = await assetValidators.validateAssetType(updatedData[field as keyof Asset] as string, field);
                if (!validation.valid) {
                  errors.push(`נכס ${updatedData.asset_id}: ${validation.error}`);
                  continue;
                }
              }
            }

            // Validate 199/299 rules
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
              ]
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
                const validation = await assetValidators.validateAssetType(updatedData[field as keyof Asset] as string, field);
                if (!validation.valid) {
                  errors.push(`נכס ${asset.asset_id}: ${validation.error}`);
                  continue;
                }
              }
            }

            // Validate 199/299 rules if relevant fields changed
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
                ]
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
      penthouse: null
    };

    setAssets(prev => [newAsset, ...prev]);
    setNewAssets(prev => new Set(prev).add(tempId));

    // Run validation rules on the new asset (async, don't block UI)
    AssetValidationHandler.validateSingleAsset(
      newAsset,
      {
        taxRegion: taxRegion
      }
    ).then(validationResult => {
      if (!validationResult.passed && validationResult.errors.length > 0) {
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
    const assetId = String(params.data?.id);
    if (!assetId) return { textAlign: 'right' };
    
    const hasValidationError = validationErrors.has(assetId);
    const isNewAsset = newAssets.has(assetId);
    
    if (hasValidationError) {
      return {
        backgroundColor: '#fee2e2',
        border: '2px solid #ef4444',
        textAlign: 'right'
      };
    }
    
    // Add visual indication for read-only cells (existing assets)
    if (!isNewAsset) {
      return {
        textAlign: 'right',
        backgroundColor: '#f9fafb', // Light gray background for read-only
        opacity: 0.8, // Slightly faded
        cursor: 'not-allowed'
      };
    }
    
    return { textAlign: 'right' };
  }, [validationErrors, newAssets]);

  const detailColumnDefs: ColDef<Asset>[] = useMemo(() => [
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
      headerName: t('mainAssetSize'),
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
    }
  ], [t, assetTypes, getCellStyle]);




  // Create stable penthouse checkbox cellRenderer
  const penthouseCellRenderer = useCallback((params: any) => {
    const assetId = params.data?.id;
    if (!assetId) return null;
    
    const isNewAsset = newAssets.has(String(assetId));
    const dirtyChanges = dirtyAssets.get(String(assetId));
    const currentValue = dirtyChanges && 'penthouse' in dirtyChanges 
      ? dirtyChanges.penthouse 
      : params.data?.penthouse;
    const isChecked = currentValue === 'כן';
    
    // Only show checkbox for new assets, read-only for existing assets
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
                const existing = next.get(String(assetId)) || {};
                next.set(String(assetId), { ...existing, penthouse: newValue });
                return next;
              });
              
              // Update grid cell data directly
              params.node.setDataValue('penthouse', newValue);
              
              // Update assets state
              setAssets(prev => prev.map(a => 
                String(a.id) === String(assetId) ? { ...a, penthouse: newValue } : a
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
      suppressSizeToFit: true,
      suppressHeaderMenuButton: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return null;
        
        const assetId = String(asset.id);
        const isNew = newAssets.has(assetId);
        const isDeleted = deletedAssets.has(assetId);
        const hasValidationError = validationErrors.has(assetId);
        
        // Show delete button only if a specific tax region is selected (same visibility logic as "Save All" and "Cancel" buttons)
        // Delete button should be visible for all assets (new and existing), same as view asset button
        const hasMultipleTaxRegions = building?.tax_region && building.tax_region.includes(',');
        // If building has multiple tax regions, only show delete button when a specific taxRegion is selected
        // If building has only one tax region, show delete button (taxRegion may or may not be set)
        const shouldShowDeleteButton = !hasMultipleTaxRegions || taxRegion;
        
        // Show checkbox only when a specific tax region is selected (single tax region tab)
        const shouldShowCheckbox = taxRegion && (!hasMultipleTaxRegions || taxRegion);
        const isSelected = selectedAssets.has(assetId);
        
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {shouldShowCheckbox && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  setSelectedAssets(prev => {
                    const next = new Set(prev);
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAsset(assetId, asset.asset_id, buildingNumber);
                }}
                className="p-1 text-teal-600 hover:text-teal-700 transition-colors hover:scale-110"
                title={t('viewDetails')}
              >
                <Eye className="h-5 w-5" />
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
      editable: (params) => newAssets.has(String(params.data?.id)),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      editable: (params) => newAssets.has(String(params.data?.id)),
      cellStyle: (params: any) => {
        const assetId = String(params.data?.id);
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
      editable: (params) => newAssets.has(String(params.data?.id)),
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params)
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: false, // Always use checkbox, not editable cell
      cellRenderer: penthouseCellRenderer,
      cellStyle: { textAlign: 'center' },
      headerClass: 'text-center'
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      editable: (params) => newAssets.has(String(params.data?.id)),
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
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3">
        <div className="mb-3 bg-gradient-to-r from-teal-600 to-blue-600 rounded-lg shadow-lg p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BuildingIcon className="w-7 h-7 text-white" />
              <h1 className="text-lg sm:text-xl font-bold text-white">
                {t('buildingNumber')} {building?.building_number}
              </h1>
              {taxRegion ? (
                <p className="text-sm text-white font-semibold bg-teal-700 px-3 py-1 rounded">
                  אזור מס: {taxRegion}
                </p>
              ) : building?.tax_region ? (
                <p className="text-sm text-white font-semibold bg-teal-700 px-3 py-1 rounded">
                  אזורי מס: {building.tax_region}
                </p>
              ) : null}
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
                  onClick={addEmptyRow}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  הוסף נכס
                </button>
              );
            })()}
            <button
              onClick={handleBatchValidateBuildingAssets}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
            >
              <CheckCircle2 className="h-4 w-4" />
              אמת נכסים
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
                  onClick={handleCancelAll}
                  disabled={loading || totalChanges === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  <X className="h-4 w-4" />
                  ביטול
                </button>
                <button
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
        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%' }}>
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
              headerClass: 'ag-right-aligned-header'
            }}
            getRowId={(params) => String(params.data.id)}
            onCellValueChanged={onCellValueChanged}
            onGridReady={async (params) => {
              // Load saved column state first
              const hasSavedState = await loadColumnState();
              
              // If no saved state, apply default sizing with minimum widths
              if (!hasSavedState) {
                setTimeout(() => {
                  const allColumns = params.api.getAllDisplayedColumns();
                  const allColumnIds = allColumns
                    .map(col => col.getColId())
                    .filter(id => id !== 'actions'); // Exclude actions column from auto-sizing
                  
                  if (allColumnIds.length > 0) {
                    // Auto-size based on content (minimum width will be content width)
                    params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                  }
                }, 200);
              }

              // Scroll to left on grid ready
              setTimeout(() => {
                const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                if (gridElement) {
                  gridElement.scrollLeft = 0;
                }
              }, 300);
            }}
            onFirstDataRendered={async (params) => {
              // Load saved column state if not already loaded
              if (!columnStateLoaded) {
                const hasSavedState = await loadColumnState();
                
                // If no saved state, apply default sizing with minimum widths
                if (!hasSavedState) {
                  setTimeout(() => {
                    const allColumns = params.api.getAllDisplayedColumns();
                    const allColumnIds = allColumns
                      .map(col => col.getColId())
                      .filter(id => id !== 'actions'); // Exclude actions column from auto-sizing
                    
                    if (allColumnIds.length > 0) {
                      // First, set minimum widths to prevent very small columns
                      allColumns.forEach(col => {
                        if (col.getColId() !== 'actions') {
                          const currentWidth = col.getActualWidth();
                          if (!currentWidth || currentWidth < 100) {
                            col.setActualWidth(100); // Set minimum width of 100px
                          }
                        }
                      });
                      
                      // Then auto-size based on content
                      params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                    }
                  }, 150);
                }
              }

              // Scroll to left after data render
              setTimeout(() => {
                const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                if (gridElement) {
                  gridElement.scrollLeft = 0;
                }
              }, 200);
            }}
            onColumnResized={saveColumnState}
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
              saveColumnState();
            }}
            onSortChanged={saveColumnState}
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
        onExportInvalid={batchValidationResults && batchValidationResults.errors.some(e => e.errors.length > 0) ? handleExportInvalidAssetsToFile : undefined}
      />

    </>
  );
}
