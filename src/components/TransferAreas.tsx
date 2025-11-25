import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Building as BuildingIcon, Loader2, Save, X, AlertCircle, Copy, CheckCircle2 } from 'lucide-react';
import { useGridPreferences } from '../hooks/useGridPreferences';

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
  const [dirtyAssets, setDirtyAssets] = useState<Map<string, Partial<Asset>>>(new Map());
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const [measurementDateModalOpen, setMeasurementDateModalOpen] = useState(false);
  const [newMeasurementDate, setNewMeasurementDate] = useState<string>('');
  const gridRef = useRef<AgGridReact<Asset>>(null);
  const { loadColumnState, saveColumnState, columnStateLoaded } = useGridPreferences(gridRef, 'transfer_areas_column_state');

  useEffect(() => {
    fetchData();
  }, [buildingNumber, selectedAssetIds]);

  async function fetchData() {
    try {
      setLoading(true);
      const [buildingData, assetTypesData] = await Promise.all([
        api.buildings.getOne(buildingNumber),
        api.assetTypes.getAll()
      ]);

      setBuilding(buildingData);
      setAssetTypes(assetTypesData || []);

      // Fetch selected assets by their IDs
      const fetchedAssets: Asset[] = [];
      for (const assetId of selectedAssetIds) {
        try {
          const asset = await api.assets.getOne(Number(assetId));
          fetchedAssets.push(asset);
        } catch (err) {
          console.error(`Error fetching asset ${assetId}:`, err);
        }
      }

      setAssets(fetchedAssets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }

  const onCellValueChanged = useCallback(async (event: any) => {
    const { data, colDef } = event;
    const field = colDef.field;
    const assetId = String(data.id);
    const newValue = event.newValue;

    // Track the change in dirtyAssets
    setDirtyAssets(prev => {
      const next = new Map(prev);
      const existing = next.get(assetId) || {};
      next.set(assetId, { ...existing, [field]: newValue });
      return next;
    });

    // Update local state
    setAssets(prevAssets => {
      return prevAssets.map(asset => {
        if (String(asset.id) === assetId) {
          return { ...asset, [field]: newValue };
        }
        return asset;
      });
    });

    // Refresh the cell to update styling
    if (event.api) {
      event.api.refreshCells({ rowNodes: [event.node], columns: [field], force: true });
    }
  }, [assets, dirtyAssets, taxRegion]);

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
          // Get the full asset data with changes
          const originalAsset = assets.find(a => String(a.id) === assetId);
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
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_1, updatedData.sub_asset_size_1, taxRegion),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_2, updatedData.sub_asset_size_2, taxRegion),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_3, updatedData.sub_asset_size_3, taxRegion),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_4, updatedData.sub_asset_size_4, taxRegion),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_5, updatedData.sub_asset_size_5, taxRegion),
            assetValidators.validateSubAssetTypeComplete(updatedData.building_number, updatedData.sub_asset_type_6, updatedData.sub_asset_size_6, taxRegion),
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
          delete (newAssetData as any).id;
          delete (newAssetData as any).created_at;
          delete (newAssetData as any).updated_at;
          delete (newAssetData as any).is_latest;
          delete (newAssetData as any).history_created_at;
          delete (newAssetData as any).is_new_measurement;

          // First, update the old record with is_new_measurement flag set to true
          // The database trigger will automatically move it to assets_history
          await api.assets.update(Number(assetId), { is_new_measurement: true });

          // Then create the new measurement in assets table
          await api.assets.create(newAssetData as any);

          savedCount++;
        } catch (err) {
          errors.push(`נכס ${assetId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
    fetchData();
  };

  const hasChanges = dirtyAssets.size > 0;

  // Helper function to get cell style for dirty fields and validation errors
  const getCellStyle = useCallback((params: any, fieldName: string) => {
    const assetId = String(params.data?.id);
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
      suppressSizeToFit: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        if (!asset) return null;
        
        const assetId = String(asset.id);
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
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'asset_id')
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'payer_id')
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'main_asset_type')
    },
    {
      field: 'asset_size',
      headerName: t('assetSize'),
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
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_1')
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
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
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_2')
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
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
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_3')
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
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
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_4')
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
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
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_5')
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
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
      editable: true,
      headerClass: 'ag-right-aligned-header',
      cellStyle: (params: any) => getCellStyle(params, 'sub_asset_type_6')
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
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
                אזור מס: {taxRegion}
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
          <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ width: '100%', height: '60vh', direction: 'ltr' }}>
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
                headerClass: 'ag-right-aligned-header'
              }}
              getRowId={(params) => String(params.data.id)}
              onCellValueChanged={onCellValueChanged}
              getRowStyle={(params) => {
                const assetId = String(params.data?.id);
                if (validationErrors.has(assetId)) {
                  return { backgroundColor: '#fef2f2' }; // Light red for validation errors
                }
                return null;
              }}
              onGridReady={async (params) => {
                const hasSavedState = await loadColumnState();
                if (!hasSavedState) {
                  setTimeout(() => {
                    const allColumnIds = params.api.getAllDisplayedColumns()
                      .map(col => col.getColId());
                    if (allColumnIds.length > 0) {
                      params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                    }
                  }, 100);
                }
              }}
              onFirstDataRendered={async (params) => {
                if (!columnStateLoaded) {
                  const hasSavedState = await loadColumnState();
                  if (!hasSavedState) {
                    setTimeout(() => {
                      const allColumnIds = params.api.getAllDisplayedColumns()
                        .map(col => col.getColId());
                      if (allColumnIds.length > 0) {
                        params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                      }
                    }, 50);
                  }
                }
              }}
              onColumnResized={saveColumnState}
              onColumnMoved={saveColumnState}
              onSortChanged={saveColumnState}
              enableRtl={true}
              animateRows={true}
            />
          </div>
        </div>
      </div>

      {/* Measurement Date Input Modal */}
      {measurementDateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setMeasurementDateModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">שמור כמדידות חדשות</h3>
              <button
                onClick={() => {
                  setMeasurementDateModalOpen(false);
                  setNewMeasurementDate('');
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
                  setMeasurementDateModalOpen(false);
                  setNewMeasurementDate('');
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
    </div>
  );
}

