import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, IDetailCellRendererParams } from 'ag-grid-community';
import { Building as BuildingIcon, AlertCircle, ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
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
  const [dirtyAssets, setDirtyAssets] = useState<Map<string, Partial<Asset>>>(new Map());
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
  }, [masterAssets, assets, expandedRows]);
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
      let masterAssetsList = Array.from(assetsByAssetId.values()).map(group => {
        group.sort((a, b) => new Date(b.measurement_date).getTime() - new Date(a.measurement_date).getTime());
        return group[0];
      });

      if (taxZone) {
        masterAssetsList = masterAssetsList.filter(asset => {
          const assetType = assetTypesData?.find(at => at.name === asset.main_asset_type);
          if (!assetType || !assetType.tax_region) return false;
          return assetType.tax_region.toString() === taxZone;
        });
      }

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
        assetValidators.validateMainAssetTypeForBuilding(updatedAsset.building_number, updatedAsset.main_asset_type),
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
    if (dirtyAssets.size === 0) {
      setError('אין שינויים לשמור');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let savedCount = 0;
      const errors: string[] = [];

      for (const [assetId, changes] of dirtyAssets.entries()) {
        try {
          // Get the full asset data
          const asset = displayAssets.find(a => a.id === assetId);
          if (!asset) continue;

          const updatedData = { ...asset, ...changes };

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
          await api.assets.update(assetId, changes);
          savedCount++;
        } catch (err) {
          const asset = displayAssets.find(a => a.id === assetId);
          const assetIdent = asset?.asset_id || assetId;
          errors.push(`נכס ${assetIdent}: ${err instanceof Error ? err.message : 'שגיאה בשמירה'}`);
        }
      }

      // Clear dirty assets after save
      setDirtyAssets(new Map());

      if (errors.length > 0) {
        setError(`נשמרו ${savedCount} נכסים. ${errors.length} שגיאות:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...ועוד ${errors.length - 5}` : ''}`);
      } else {
        setSuccess(`✓ נשמרו ${savedCount} נכסים בהצלחה`);
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
    },
    {
      field: 'total_size',
      headerName: t('totalSize'),
      width: 120,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right', fontWeight: 'bold', backgroundColor: '#dbeafe' }
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

  const getRowStyle = useCallback((params: any) => {
    const assetId = params.data?.id;
    if (!assetId) return undefined;

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
  }, [validationErrors, invalidAssets, masterAssets]);

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      headerName: '',
      width: 50,
      editable: false,
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        const assetId = asset.id;
        const errors: string[] = [];

        // Check for validation errors from validationErrors state
        if (validationErrors.has(assetId)) {
          const fieldErrors = validationErrors.get(assetId);
          if (fieldErrors && fieldErrors.size > 0) {
            // Add all the specific error messages
            fieldErrors.forEach((errorMsg, fieldName) => {
              errors.push(errorMsg);
            });
          }
        }

        // Also check for basic numeric validation
        const numericRegex = /^[0-9]+$/;
        const hasInvalidPayerId = asset.payer_id && !numericRegex.test(asset.payer_id);
        const hasInvalidAssetId = asset.asset_id && !numericRegex.test(asset.asset_id);

        if (hasInvalidPayerId) errors.push('מזהה משלם לא נומרי');
        if (hasInvalidAssetId) errors.push('מזהה נכס לא נומרי');

        if (errors.length > 0) {
          return (
            <div className="flex items-center justify-center h-full" title={errors.join('\n')}>
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
          );
        }
        return null;
      }
    },
    {
      headerName: t('actions'),
      width: 150,
      minWidth: 150,
      editable: false,
      cellRenderer: (params: any) => {
        if (params.data._isMasterRow === false) return null;
        return (
          <button
            onClick={() => onSelectAsset(params.data.id, params.data.asset_id, buildingNumber)}
            className="px-6 py-0.5 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 text-sm font-semibold whitespace-nowrap"
          >
            {t('viewDetails')}
          </button>
        );
      },
      cellClass: 'floating-action-cell'
    },
    {
      headerName: '',
      width: 60,
      minWidth: 60,
      editable: false,
      pinned: 'right',
      cellRenderer: (params: any) => {
        if (params.data._isMasterRow === false) return null;
        const hasHistory = assets.filter(a => a.asset_id === params.data.asset_id).length > 1;
        if (!hasHistory) return null;
        const isExpanded = expandedRows.has(params.data.asset_id);
        const handleClick = (e: any) => {
          e.preventDefault();
          e.stopPropagation();
          toggleRowExpansion(params.data.asset_id);
        };
        return (
          <button
            onClick={handleClick}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-teal-100 transition-colors duration-200"
            title={isExpanded ? t('collapse') : t('expand')}
          >
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-teal-700" />
            ) : (
              <ChevronRight className="w-5 h-5 text-teal-700 scale-x-[-1]" />
            )}
          </button>
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
      cellStyle: (params) => getCellStyle(params, 'asset_id', true)
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      width: 120,
      minWidth: 120,
      editable: true,
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
        if (val === null || val === undefined || val === '') return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? '' : num.toFixed(2);
      },
      cellStyle: (params) => getCellStyle(params, 'asset_size', false)
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
        if (val === null || val === undefined || val === '') return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? '' : num.toFixed(2);
      },
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
        if (val === null || val === undefined || val === '') return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? '' : num.toFixed(2);
      },
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
        if (val === null || val === undefined || val === '') return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? '' : num.toFixed(2);
      },
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
        if (val === null || val === undefined || val === '') return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? '' : num.toFixed(2);
      },
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
        if (val === null || val === undefined || val === '') return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? '' : num.toFixed(2);
      },
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
        if (val === null || val === undefined || val === '') return '';
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? '' : num.toFixed(2);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_6', false)
    },
    {
      field: 'total_size',
      headerName: t('totalSize'),
      width: 150,
      minWidth: 150,
      editable: false,
      valueFormatter: (params) => params.value ? params.value.toLocaleString() : '',
      cellStyle: { textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f0f9ff' }
    }
  ], [t, onSelectAsset, buildingNumber, assetTypes, assets, expandedRows, toggleRowExpansion, getCellStyle, validationErrors]);
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
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-lg">
            <p className="text-red-800 font-medium">{t('error')}: {error}</p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
        <div className="mb-4 sm:mb-6 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BuildingIcon className="w-8 h-8 text-white" />
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  {t('buildingNumber')} {building?.building_number}
                </h1>
              </div>
              <div className="flex items-center gap-4 mt-1">
                <p className="text-xs sm:text-sm text-teal-50">
                  <span className="font-semibold">{t('uniqueAssets')}:</span> {masterAssets.length}
                </p>
                <p className="text-xs sm:text-sm text-teal-50">
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
        <div className="mb-2 flex justify-end">
          <button
            onClick={handleSaveAll}
            disabled={loading || dirtyAssets.size === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            <Save className="h-4 w-4" />
            {loading ? 'שומר...' : `שמור הכל${dirtyAssets.size > 0 ? ` (${dirtyAssets.size})` : ''}`}
          </button>
        </div>
        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={displayAssets}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              wrapHeaderText: true,
              autoHeaderHeight: true
            }}
            onCellValueChanged={onCellValueChanged}
            getRowId={(params) => params.data.id}
            getRowStyle={getRowStyle}
            onGridReady={(params) => {
              params.api.autoSizeAllColumns();
            }}
            onFirstDataRendered={(params) => {
              const firstCol = params.api.getAllDisplayedColumns()[0];
              if (firstCol) {
                params.api.ensureColumnVisible(firstCol);
              }
              params.api.autoSizeAllColumns();
              setTimeout(() => {
                const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                if (gridElement) {
                  gridElement.scrollLeft = 0;
                }
              }, 100);
            }}
            animateRows={true}
            pagination={true}
            paginationPageSize={20}
            enableRtl={true}
            suppressHorizontalScroll={false}
          />
        </div>
      </div>
    </>
  );
}
