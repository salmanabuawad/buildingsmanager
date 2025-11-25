import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { assetValidators, validateAll, inputValidators, validateEntity } from '../lib/validation';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, IDetailCellRendererParams } from 'ag-grid-community';
import { Building as BuildingIcon, AlertCircle, ChevronDown, ChevronRight, Loader2, Save, X, Plus, Trash2, Eye, CheckCircle2, Download } from 'lucide-react';
import { useGridPreferences } from '../hooks/useGridPreferences';
interface AssetsListProps {
  buildingNumber: number;
  taxZone?: string;
  onSelectAsset: (assetId: string, assetIdentifier: string, buildingNumber: number) => void;
}
export function AssetsList({ buildingNumber, taxZone, onSelectAsset }: AssetsListProps) {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<AgGridReact<Asset>>(null);
  const { loadColumnState, saveColumnState, columnStateLoaded } = useGridPreferences(gridRef, 'assets_list_column_state');
  const [showBatchValidationModal, setShowBatchValidationModal] = useState(false);
  const [batchValidationLoading, setBatchValidationLoading] = useState(false);
  const [batchValidationProgress, setBatchValidationProgress] = useState<{
    current: number;
    total: number;
    currentAssetId?: string;
  } | null>(null);
  const [batchValidationResults, setBatchValidationResults] = useState<{
    total: number;
    valid: number;
    invalid: number;
    errors: Array<{ assetId: string; assetDbId?: string; buildingNumber: number; errors: string[]; passed?: string[]; matchedAssetTypeRecord?: string }>;
  } | null>(null);
  useEffect(() => {
    fetchData();
  }, [buildingNumber, taxZone]);
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
      
      // Filter by tax zone if provided
      let filteredAssets = assetsData || [];
      if (taxZone) {
        const taxZoneNum = parseInt(taxZone.trim());
        const taxZoneStr = taxZone.trim();
        
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
          
          // Check if the tax_region matches the requested taxZone
          const taxRegionMatches = assetTaxRegion === taxZoneNum || String(assetTaxRegion) === taxZoneStr;
          
          if (taxRegionMatches) {
            filteredAssets.push(asset);
          }
        }
      }
      
      setAssets(filteredAssets);
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

      // Clear previous validation errors for this asset
      setValidationErrors(prev => {
        const newMap = new Map(prev);
        newMap.delete(assetId);
        return newMap;
      });

      // Validate measurement_date format if changed
      if (field === 'measurement_date' && updatedAsset.measurement_date) {
        const dateValidation = inputValidators.validateDateFormat(updatedAsset.measurement_date);
        if (!dateValidation.valid) {
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            const errorMap = new Map<string, string>();
            errorMap.set('measurement_date', dateValidation.error || 'Invalid date format');
            newMap.set(assetId, errorMap);
            return newMap;
          });
          setError(dateValidation.error || 'Invalid date format');
          setTimeout(() => setError(null), 3000);
          // Still update the display to show the invalid value
          setDisplayAssets(prevAssets =>
            prevAssets.map(asset =>
              asset.id === assetId ? updatedAsset : asset
            )
          );
          setMasterAssets(prevMasterAssets =>
            prevMasterAssets.map(asset =>
              asset.id === assetId ? updatedAsset : asset
            )
          );
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
        assetValidators.validateMainAssetTypeComplete(updatedAsset.building_number, updatedAsset.main_asset_type, updatedAsset.asset_size, updatedAsset),
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
          ]
        ),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_1, 'sub_asset_type_1'),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_2, 'sub_asset_type_2'),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_3, 'sub_asset_type_3'),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_4, 'sub_asset_type_4'),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_5, 'sub_asset_type_5'),
        assetValidators.validateAssetType(updatedAsset.sub_asset_type_6, 'sub_asset_type_6'),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_1, updatedAsset.sub_asset_size_1),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_2, updatedAsset.sub_asset_size_2),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_3, updatedAsset.sub_asset_size_3),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_4, updatedAsset.sub_asset_size_4),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_5, updatedAsset.sub_asset_size_5),
        assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_6, updatedAsset.sub_asset_size_6),
      );

      // Run all validations
      const validation = await validateAll(validations);

      if (!validation.valid) {
        const detailedError = validation.error || 'Unknown validation error';
        setValidationErrors(prev => {
          const newMap = new Map(prev);
          const errorMap = new Map<string, string>();
          errorMap.set(field, detailedError);
          newMap.set(assetId, errorMap);
          return newMap;
        });
        setError(detailedError);
        setTimeout(() => setError(null), 5000);
      }

      // Update the display data with the new value
      setDisplayAssets(prevAssets =>
        prevAssets.map(asset =>
          asset.id === assetId ? updatedAsset : asset
        )
      );

      // Also update masterAssets if this is a master row
      setMasterAssets(prevMasterAssets =>
        prevMasterAssets.map(asset =>
          asset.id === assetId ? updatedAsset : asset
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
      
      // Filter by tax zone if specified
      let filteredAssets = buildingAssets;
      if (taxZone) {
        filteredAssets = buildingAssets.filter(asset => {
          const assetType = assetTypesData.find(at => at.name === asset.main_asset_type);
          return assetType && String(assetType.tax_region) === taxZone;
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

        // Merge with existing validation errors
        setValidationErrors(prevErrors => {
          const merged = new Map(prevErrors);
          for (const [assetId, errors] of newValidationErrors.entries()) {
            const existing = merged.get(assetId) || new Map<string, string>();
            // Merge batch validation errors with existing errors
            for (const [field, error] of errors.entries()) {
              existing.set(field, error);
            }
            merged.set(assetId, existing);
          }
          return merged;
        });

        // Also mark in invalidAssets set for row styling
        setInvalidAssets(prevInvalid => {
          const newInvalid = new Set(prevInvalid);
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
              newInvalid.add(dbId);
            }
          }
          return newInvalid;
        });

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

      // Process deletions first
      for (const assetId of deletedAssets) {
        try {
          const asset = displayAssets.find(a => a.id === assetId);
          if (!asset) continue;

          // Skip deletion if it's a temp asset (not saved to database yet)
          if (String(assetId).startsWith('temp-')) {
            deletedCount++;
            continue;
          }

          await api.assets.delete(assetId);
          deletedCount++;
        } catch (err) {
          const asset = displayAssets.find(a => a.id === assetId);
          const assetIdent = asset?.asset_id || assetId;
          errors.push(`נכס ${assetIdent}: ${err instanceof Error ? err.message : 'שגיאה במחיקה'}`);
        }
      }

      // Process new assets that haven't been edited yet (in newAssets but not in dirtyAssets)
      for (const newAssetId of newAssets) {
        if (!dirtyAssets.has(newAssetId) && !deletedAssets.has(newAssetId)) {
          // Add to dirtyAssets so it gets processed below
          const asset = displayAssets.find(a => String(a.id) === newAssetId);
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
          const asset = displayAssets.find(a => String(a.id) === String(assetId));
          if (!asset) continue;

          const updatedData = { ...asset, ...changes };
          const isNewAsset = String(assetId).startsWith('temp-') || newAssets.has(String(assetId));

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
          }
        } catch (err) {
          const asset = displayAssets.find(a => String(a.id) === String(assetId));
          const assetIdent = asset?.asset_id || assetId;
          errors.push(`נכס ${assetIdent}: ${err instanceof Error ? err.message : 'שגיאה בשמירה'}`);
        }
      }

      // Clear dirty assets, deleted assets, and new assets after save
      setDirtyAssets(new Map());
      setDeletedAssets(new Set());
      setNewAssets(new Set());

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
      setError(`שגיאה בשמירה: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const addEmptyRow = () => {
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
      created_at: new Date().toISOString(),
      _isMasterRow: true
    };

    setDisplayAssets(prev => [newAsset, ...prev]);
    setMasterAssets(prev => [newAsset, ...prev]);
    setNewAssets(prev => new Set(prev).add(tempId)); // Track the new asset

    setTimeout(() => {
      if (gridRef.current) {
        gridRef.current.api.setFocusedCell(0, 'asset_id');
        gridRef.current.api.startEditingCell({ rowIndex: 0, colKey: 'asset_id' });
      }
    }, 100);
  };

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
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    }
  ], [t, assetTypes]);
  const toggleRowExpansion = useCallback((assetId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        console.log('[AssetsList] Collapsing asset_id:', assetId);
        newSet.delete(assetId);
      } else {
        console.log('[AssetsList] Expanding asset_id:', assetId);
        // Check if there are history records for this asset_id
        const historyCount = allAssets.filter(a => 
          String(a.asset_id) === assetId && String(a.id) !== String(masterAssets.find(m => String(m.asset_id) === assetId)?.id)
        ).length;
        console.log('[AssetsList] Found', historyCount, 'history records for asset_id:', assetId);
        newSet.add(assetId);
      }
      return newSet;
    });
  }, [allAssets, masterAssets]);

  const getCellStyle = useCallback((params: any, fieldName: string, isRequired: boolean = false) => {
    const assetId = params.data?.id;
    const assetErrors = validationErrors.get(assetId);
    const hasValidationError = assetErrors && assetErrors.has(fieldName);
    const isDirty = assetId && dirtyAssets.has(assetId) && dirtyAssets.get(assetId)?.hasOwnProperty(fieldName);

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

    if (isRequired) {
      return {
        backgroundColor: '#fff9e6',
        textAlign: 'right'
      };
    }

    return { textAlign: 'right' };
  }, [dirtyAssets, validationErrors]);

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
  }, []);

  const getRowStyle = useCallback((params: any) => {
    const assetId = params.data?.id;
    if (!assetId) return undefined;

    // Check if marked for deletion
    const isDeleted = deletedAssets.has(assetId);
    if (isDeleted) {
      return {
        background: '#fee2e2',
        textDecoration: 'line-through',
        opacity: 0.6
      };
    }

    const assetErrors = validationErrors.get(assetId);
    const hasErrors = assetErrors && assetErrors.size > 0;

    // Also check for numeric validation errors
    const asset = params.data as Asset;
    const numericRegex = /^[0-9]+$/;
    const hasInvalidPayerId = asset.payer_id && !numericRegex.test(asset.payer_id);
    const hasInvalidAssetId = asset.asset_id && !numericRegex.test(asset.asset_id);

    // Check if this is invalid (for backwards compatibility)
    const isInvalid = invalidAssets.has(assetId);

    // Check if this is a historical record (not in masterAssets)
    const isMaster = masterAssets.some(m => m.id === assetId);

    if (hasErrors || hasInvalidPayerId || hasInvalidAssetId || isInvalid) {
      return {
        border: '3px solid #ef4444',
        borderRadius: '4px',
        background: '#fee2e2'
      };
    }

    if (!isMaster) {
      return {
        background: 'linear-gradient(to right, #dbeafe 0%, #e0f2fe 100%)',
        fontStyle: 'italic',
        fontSize: '0.9em'
      };
    }

    return undefined;
  }, [validationErrors, invalidAssets, masterAssets, deletedAssets]);

  // Create stable penthouse checkbox cellRenderer
  const penthouseCellRenderer = useCallback((params: any) => {
    const value = params.data?.penthouse;
    return (
      <div className="flex items-center justify-center h-full">
        {value === 'כן' ? '✓' : ''}
      </div>
    );
  }, []);

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
      suppressMenu: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        const assetId = asset.id;

        return (
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => onSelectAsset(assetId, asset.asset_id, buildingNumber)}
              className="p-1 text-teal-600 hover:text-teal-700 transition-colors hover:scale-110"
              title={t('viewDetails')}
            >
              <Eye className="h-5 w-5" />
            </button>
          </div>
        );
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      editable: false,
      cellStyle: { textAlign: 'right', backgroundColor: '#ecfdf5', fontWeight: '700', color: '#065f46' }
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: false,
      cellRenderer: penthouseCellRenderer,
      cellStyle: { textAlign: 'center' },
      headerClass: 'text-center'
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
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
      headerName: t('mainAssetSize'),
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
      headerName: t('subAssetType1'),
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
      headerName: t('subAssetSize1'),
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
      headerName: t('subAssetType2'),
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
      headerName: t('subAssetSize2'),
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
      headerName: t('subAssetType3'),
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
      headerName: t('subAssetSize3'),
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
      headerName: t('subAssetType4'),
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
      headerName: t('subAssetSize4'),
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
      headerName: t('subAssetType5'),
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
      headerName: t('subAssetSize5'),
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
      headerName: t('subAssetType6'),
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
      headerName: t('subAssetSize6'),
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
  ], [t, onSelectAsset, buildingNumber, assetTypes]);
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
              {taxZone ? (
                <p className="text-sm text-white font-semibold bg-teal-700 px-3 py-1 rounded">
                  אזור מס: {taxZone}
                </p>
              ) : building?.tax_region ? (
                <p className="text-sm text-white font-semibold bg-teal-700 px-3 py-1 rounded">
                  אזורי מס: {building.tax_region}
                </p>
              ) : null}
              <div className="flex items-center gap-3">
                <p className="text-xs text-teal-50">
                  <span className="font-semibold">{t('totalMeasurements')}:</span> {assets.length}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mb-2 flex justify-end items-center gap-2">
          <button
            onClick={handleBatchValidateBuildingAssets}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
          >
            <CheckCircle2 className="h-4 w-4" />
            אמת נכסים
          </button>
        </div>
        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={assets}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              wrapText: true,
              autoHeight: false,
              headerClass: 'ag-right-aligned-header'
            }}
            getRowId={(params) => String(params.data.id)}
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

      {showBatchValidationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                אימות נכסי מבנה {buildingNumber}
                {taxZone && ` - אזור מס ${taxZone}`}
              </h3>
              <button
                onClick={() => setShowBatchValidationModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {batchValidationLoading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <div className="text-center w-full max-w-md">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-4" />
                  <p className="text-slate-600 mb-4">מאמת את נכסי המבנה...</p>
                  {batchValidationProgress && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                        <span>נכס {batchValidationProgress.current} מתוך {batchValidationProgress.total}</span>
                        <span>{Math.round((batchValidationProgress.current / batchValidationProgress.total) * 100)}%</span>
                      </div>
                      {batchValidationProgress.currentAssetId && (
                        <p className="text-xs text-slate-500 mb-3">
                          מאמת נכס: {batchValidationProgress.currentAssetId}
                        </p>
                      )}
                      <div className="w-full bg-slate-200 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${(batchValidationProgress.current / batchValidationProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : batchValidationResults ? (
              <div className="flex-1 overflow-y-auto">
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-700">{batchValidationResults.total}</div>
                    <div className="text-sm text-blue-600 mt-1">סה"כ נכסים</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-700">{batchValidationResults.valid}</div>
                    <div className="text-sm text-green-600 mt-1">תקינים</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-700">{batchValidationResults.invalid}</div>
                    <div className="text-sm text-red-600 mt-1">לא תקינים</div>
                  </div>
                </div>

                {batchValidationResults.errors.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-slate-700 mb-3">
                      {batchValidationResults.errors.some(e => e.errors.length > 0) 
                        ? 'נכסים עם שגיאות:' 
                        : 'תוצאות אימות:'}
                    </h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {batchValidationResults.errors.map((error, idx) => (
                        <div key={idx} className={`${error.errors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} border rounded-lg p-4`}>
                          <div className="flex items-start gap-2 mb-2">
                            {error.errors.length > 0 ? (
                              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <div className={`font-semibold ${error.errors.length > 0 ? 'text-red-900' : 'text-green-900'}`}>
                                נכס {error.assetId} (מבנה {error.buildingNumber})
                              </div>
                              {error.passed && error.passed.length > 0 && (
                                <div className="mt-2 mb-2">
                                  <p className="text-xs font-semibold text-slate-600 mb-1">כללי אימות שעברו:</p>
                                  <ul className="space-y-0.5">
                                    {error.passed.map((rule, ruleIdx) => (
                                      <li key={ruleIdx} className="text-xs text-green-700 flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                                        <span>{rule}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {error.matchedAssetTypeRecord && (
                                <div className="mt-2 mb-2 p-2 bg-blue-50 border border-blue-200 rounded">
                                  <p className="text-xs font-semibold text-blue-900 mb-1">רישום מסוג נכס שתואם:</p>
                                  <p className="text-xs text-blue-700">{error.matchedAssetTypeRecord}</p>
                                </div>
                              )}
                              {error.errors.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                  {error.errors.map((err, errIdx) => (
                                    <li key={errIdx} className="text-sm text-red-700 flex items-start gap-2">
                                      <span className="text-red-500">•</span>
                                      <span>{err}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                    <p className="text-lg font-semibold text-green-700">כל הנכסים תקינים!</p>
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 border-t pt-4">
              {batchValidationResults && batchValidationResults.errors.length > 0 && (
                <button
                  onClick={handleExportInvalidAssetsToFile}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <Download className="h-4 w-4" />
                  ייצא ל-File
                </button>
              )}
              <button
                onClick={() => setShowBatchValidationModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors w-full sm:w-auto"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
