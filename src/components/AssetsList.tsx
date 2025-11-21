import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, IDetailCellRendererParams } from 'ag-grid-community';
import { Building as BuildingIcon, AlertCircle, ChevronDown, ChevronRight, Loader2, Save, X, Plus, Trash2, Eye } from 'lucide-react';
interface AssetsListProps {
  buildingNumber: number;
  taxZone?: string;
  onSelectAsset: (assetId: string, assetIdentifier: string, buildingNumber: number) => void;
}
export function AssetsList({ buildingNumber, taxZone, onSelectAsset }: AssetsListProps) {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [masterAssets, setMasterAssets] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidAssets, setInvalidAssets] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const gridRef = useRef<AgGridReact<Asset>>(null);
  const [displayAssets, setDisplayAssets] = useState<Asset[]>([]);
  const [originalDisplayAssets, setOriginalDisplayAssets] = useState<Asset[]>([]);
  const [originalMasterAssets, setOriginalMasterAssets] = useState<Asset[]>([]);
  const [dirtyAssets, setDirtyAssets] = useState<Map<string, Partial<Asset>>>(new Map());
  const [deletedAssets, setDeletedAssets] = useState<Set<string>>(new Set());
  const [success, setSuccess] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Map<string, Map<string, string>>>(new Map());
  useEffect(() => {
    fetchData();
  }, [buildingNumber, taxZone]);
  useEffect(() => {
    // Create display data with expanded rows
    const display: Asset[] = [];
    for (const asset of masterAssets) {
      display.push({ ...asset, _isMasterRow: true });
      if (expandedRows.has(asset.asset_id)) {
        const historicalRecords = assets.filter(
          a => a.asset_id === asset.asset_id && a.measurement_date !== asset.measurement_date
        );
        display.push(...historicalRecords.map(r => ({ ...r, _isMasterRow: false })));
      }
    }
    setDisplayAssets(display);
    // Store original data only if dirtyAssets is empty (initial load or after save)
    if (dirtyAssets.size === 0) {
      setOriginalDisplayAssets(JSON.parse(JSON.stringify(display)));
      setOriginalMasterAssets(JSON.parse(JSON.stringify(masterAssets)));
    }
  }, [masterAssets, assets, expandedRows, dirtyAssets.size]);
  async function fetchData(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      const [buildingData, assetsData, assetTypesData] = await Promise.all([
        api.buildings.getOne(buildingNumber),
        api.assets.getAll(buildingNumber),
        api.assetTypes.getAll()
      ]);
      setBuilding(buildingData);
      setAssets(assetsData || []);
      setAssetTypes(assetTypesData || []);
      const assetsByAssetId = new Map<string, Asset[]>();
      for (const asset of assetsData || []) {
        if (!assetsByAssetId.has(asset.asset_id)) {
          assetsByAssetId.set(asset.asset_id, []);
        }
        assetsByAssetId.get(asset.asset_id)!.push(asset);
      }
      const masterAssetsList = Array.from(assetsByAssetId.values()).map(group => {
        group.sort((a, b) => {
          const parseDate = (dateStr: string) => {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
            return new Date(dateStr);
          };
          return parseDate(b.measurement_date).getTime() - parseDate(a.measurement_date).getTime();
        });
        return group[0];
      });

      setMasterAssets(masterAssetsList);
      const invalidSet = new Set<string>();
      const numericRegex = /^[0-9]+$/;
      for (const asset of assetsData || []) {
        const hasInvalidPayerId = asset.payer_id && !numericRegex.test(asset.payer_id);
        const hasInvalidAssetId = asset.asset_id && !numericRegex.test(asset.asset_id);
        if (hasInvalidPayerId || hasInvalidAssetId) {
          invalidSet.add(asset.id);
        }
      }
      setInvalidAssets(invalidSet);
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
        assetValidators.validateMainAssetTypeComplete(updatedAsset.building_number, updatedAsset.main_asset_type, updatedAsset.asset_size),
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

      for (const [assetId, changes] of dirtyAssets.entries()) {
        try {
          // Skip if marked for deletion
          if (deletedAssets.has(assetId)) continue;

          // Get the full asset data
          const asset = displayAssets.find(a => a.id === assetId);
          if (!asset) continue;

          const updatedData = { ...asset, ...changes };
          const isNewAsset = String(assetId).startsWith('temp-');

          // Validate based on what fields changed
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

          // Save the changes
          if (isNewAsset) {
            // Create new asset
            const { id, _isMasterRow, created_at, ...assetData } = updatedData;
            await api.assets.create(assetData);
          } else {
            // Update existing asset
            await api.assets.update(assetId, changes);
          }
          savedCount++;
        } catch (err) {
          const asset = displayAssets.find(a => a.id === assetId);
          const assetIdent = asset?.asset_id || assetId;
          errors.push(`נכס ${assetIdent}: ${err instanceof Error ? err.message : 'שגיאה בשמירה'}`);
        }
      }

      // Clear dirty assets and deleted assets after save
      setDirtyAssets(new Map());
      setDeletedAssets(new Set());

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

    const newAsset: Asset = {
      id: `temp-${Date.now()}`,
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
      asset_group: '',
      _isMasterRow: true
    };

    setDisplayAssets(prev => [newAsset, ...prev]);
    setMasterAssets(prev => [newAsset, ...prev]);

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
      width: 150,
      cellStyle: { textAlign: 'right', backgroundColor: '#fef3c7', fontWeight: '600' }
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 150,
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
      width: 120,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 120,
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
      width: 110,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 120,
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
      width: 110,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right' }
    }
  ], [t, assetTypes]);
  const toggleRowExpansion = useCallback((assetId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  }, []);

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

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      headerName: t('actions'),
      width: 150,
      minWidth: 150,
      editable: false,
      pinned: 'right',
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        if (params.data._isMasterRow === false) return null;

        const asset = params.data as Asset;
        const assetId = asset.id;
        const isDeleted = deletedAssets.has(assetId);
        const hasHistory = assets.filter(a => a.asset_id === params.data.asset_id).length > 1;
        const isExpanded = expandedRows.has(params.data.asset_id);

        const errors: string[] = [];
        if (validationErrors.has(assetId)) {
          const fieldErrors = validationErrors.get(assetId);
          if (fieldErrors && fieldErrors.size > 0) {
            fieldErrors.forEach((errorMsg) => {
              errors.push(errorMsg);
            });
          }
        }

        const numericRegex = /^[0-9]+$/;
        const hasInvalidPayerId = asset.payer_id && !numericRegex.test(asset.payer_id);
        const hasInvalidAssetId = asset.asset_id && !numericRegex.test(asset.asset_id);
        if (hasInvalidPayerId) errors.push('מזהה משלם לא נומרי');
        if (hasInvalidAssetId) errors.push('מזהה נכס לא נומרי');

        const hasErrors = errors.length > 0;

        return (
          <div className="flex items-center justify-center gap-1">
            {hasErrors && (
              <div className="flex items-center justify-center" title={errors.join('\n')}>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
            )}
            <button
              onClick={() => toggleDelete(assetId)}
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 ${
                isDeleted
                  ? 'bg-red-200 hover:bg-red-300 text-red-700'
                  : 'hover:bg-red-100 text-red-500 hover:text-red-700'
              }`}
              title={isDeleted ? 'בטל מחיקה' : 'סמן למחיקה'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {hasHistory && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleRowExpansion(params.data.asset_id);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-teal-100 transition-colors duration-200"
                title={isExpanded ? t('collapse') : t('expand')}
              >
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-teal-700" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-teal-700 scale-x-[-1]" />
                )}
              </button>
            )}
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
      field: 'measurement_date',
      headerName: t('measurementDate'),
      width: 130,
      minWidth: 130,
      editable: false,
      cellStyle: { textAlign: 'right', backgroundColor: '#ecfdf5', fontWeight: '700', color: '#065f46' }
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      width: 120,
      minWidth: 120,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'asset_id', true)
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      width: 120,
      minWidth: 120,
      maxWidth: 120,
      editable: true,
      suppressSizeToFit: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'payer_id', false)
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 70,
      minWidth: 70,
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'main_asset_type', false)
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      width: 75,
      minWidth: 75,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'asset_size', false)
    },
    {
      field: 'asset_group',
      headerName: 'קבוצת נכס',
      width: 100,
      minWidth: 100,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'asset_group', false)
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 70,
      minWidth: 70,
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_1', false)
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      width: 75,
      minWidth: 75,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_1', false)
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 70,
      minWidth: 70,
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_2', false)
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      width: 75,
      minWidth: 75,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_2', false)
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      width: 70,
      minWidth: 70,
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_3', false)
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      width: 75,
      minWidth: 75,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_3', false)
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      width: 70,
      minWidth: 70,
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_4', false)
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      width: 75,
      minWidth: 75,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_4', false)
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      width: 70,
      minWidth: 70,
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_5', false)
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      width: 75,
      minWidth: 75,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_5', false)
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      width: 70,
      minWidth: 70,
      editable: true,
      tooltipValueGetter: (params) => {
        if (!params.value) return '';
        const assetType = assetTypes.find(at => at.name === params.value);
        return assetType?.description || params.value;
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_6', false)
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      width: 75,
      minWidth: 75,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => {
        const val = params.value;
        if (val === null || val === undefined || val === '' || val === 0) return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) || num === 0 ? '' : num.toFixed(2);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_6', false)
    },
    {
      field: 'asset_group',
      headerName: 'קבוצת נכס',
      width: 120,
      minWidth: 120,
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params) => getCellStyle(params, 'asset_group', false)
    }
  ], [t, onSelectAsset, buildingNumber, assetTypes, assets, expandedRows, toggleRowExpansion, getCellStyle, validationErrors, deletedAssets, toggleDelete]);
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
              <div className="flex items-center gap-3">
                <p className="text-xs text-teal-50">
                  <span className="font-semibold">{t('uniqueAssets')}:</span> {masterAssets.length}
                </p>
                <p className="text-xs text-teal-50">
                  <span className="font-semibold">{t('totalMeasurements')}:</span> {assets.length}
                </p>
              </div>
            </div>
          </div>
        </div>
        {success && (
          <div className="mb-2 bg-green-50 border-l-4 border-green-500 rounded-lg p-2">
            <p className="text-green-800 text-sm font-medium">{success}</p>
          </div>
        )}
        <div className="mb-2 flex justify-between items-center gap-2">
          <button
            onClick={addEmptyRow}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-semibold"
          >
            <Plus className="h-4 w-4" />
            הוסף שורה
          </button>
          <div className="flex gap-2">
          <button
            onClick={() => {
              setDisplayAssets(JSON.parse(JSON.stringify(originalDisplayAssets)));
              setMasterAssets(JSON.parse(JSON.stringify(originalMasterAssets)));
              setDirtyAssets(new Map());
              setDeletedAssets(new Set());
              setValidationErrors(new Map());
              setError(null);
              setSuccess('השינויים בוטלו');
              setTimeout(() => setSuccess(null), 3000);
            }}
            disabled={loading || (dirtyAssets.size === 0 && deletedAssets.size === 0)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            <X className="h-4 w-4" />
            ביטול
          </button>
          <button
            onClick={handleSaveAll}
            disabled={loading || (dirtyAssets.size === 0 && deletedAssets.size === 0)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            <Save className="h-4 w-4" />
            {loading ? 'שומר...' : `שמור הכל${dirtyAssets.size + deletedAssets.size > 0 ? ` (${dirtyAssets.size + deletedAssets.size})` : ''}`}
          </button>
          </div>
        </div>
        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '45vh', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={displayAssets}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              headerClass: 'ag-right-aligned-header'
            }}
            onCellValueChanged={onCellValueChanged}
            getRowId={(params) => params.data.id}
            getRowStyle={getRowStyle}
            onGridReady={(params) => {
              params.api.sizeColumnsToFit();
            }}
            onFirstDataRendered={(params) => {
              const firstCol = params.api.getAllDisplayedColumns()[0];
              if (firstCol) {
                params.api.ensureColumnVisible(firstCol);
              }
              params.api.sizeColumnsToFit();
              setTimeout(() => {
                const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                if (gridElement) {
                  gridElement.scrollLeft = 0;
                }
              }, 100);
            }}
            animateRows={true}
            enableRtl={true}
            suppressHorizontalScroll={false}
          />
        </div>
        <div className="mt-3 bg-blue-50 border-r-4 border-blue-500 rounded-lg p-3">
          <p className="text-blue-900 text-sm font-medium">
            <span className="font-bold">עצות:</span> לחץ על כל תא לעריכה. שדות מסומנים בצהוב (מספר בניין וזיהוי נכס) נדרשים. זיהוי משלם אופציונלי. השתמש ב-Tab או Enter לניווט בין תאים.
          </p>
        </div>
      </div>
    </>
  );
}
