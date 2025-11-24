import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { Home, Loader2, Save, X, Plus, AlertCircle, Upload, Eye, CheckCircle2 } from 'lucide-react';
import { Toast } from './Toast';
import { PDFViewer } from './PDFViewer';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellClassParams } from 'ag-grid-community';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { supabase } from '../lib/supabase';
import { useGridPreferences } from '../hooks/useGridPreferences';

interface AssetDetailsProps {
  assetId: number;
  onDataUpdate?: () => void;
}

export function AssetDetails({ assetId, onDataUpdate }: AssetDetailsProps) {
  const { t } = useTranslation();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [allMeasurements, setAllMeasurements] = useState<Asset[]>([]);
  const [originalMeasurements, setOriginalMeasurements] = useState<Asset[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [dirtyAssets, setDirtyAssets] = useState<Map<number, Partial<Asset>>>(new Map());
  const [validationErrors, setValidationErrors] = useState<Map<number, Map<string, string>>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedDrawingUrl, setSelectedDrawingUrl] = useState<string | null>(null);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [validationResults, setValidationResults] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const gridRef = useRef<AgGridReact<Asset>>(null);
  const { loadColumnState, saveColumnState, columnStateLoaded } = useGridPreferences(gridRef, 'asset_details_column_state');

  const latestMeasurementId = useMemo(() => {
    if (allMeasurements.length === 0) return null;
    return allMeasurements[0]?.id;
  }, [allMeasurements]);

  const assetTaxRegion = useMemo(() => {
    if (!asset?.main_asset_type || assetTypes.length === 0) return null;
    const assetType = assetTypes.find(at => String(at.name) === String(asset.main_asset_type));
    return assetType?.tax_region || null;
  }, [asset?.main_asset_type, assetTypes]);

  const getRowStyle = useCallback((params: any) => {
    const assetId = params.data?.id;
    if (!assetId) return undefined;

    const assetErrors = validationErrors.get(assetId);
    const hasErrors = assetErrors && assetErrors.size > 0;

    const asset = params.data as Asset;
    const numericRegex = /^[0-9]+$/;
    const hasInvalidPayerId = asset.payer_id && !numericRegex.test(asset.payer_id);
    const hasInvalidAssetId = asset.asset_id && !numericRegex.test(asset.asset_id);

    if (hasErrors || hasInvalidPayerId || hasInvalidAssetId) {
      return {
        border: '3px solid #ef4444',
        borderRadius: '4px',
        background: '#fee2e2'
      };
    }

    return undefined;
  }, [validationErrors]);

  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef } = event;
      const field = colDef.field;
      const assetId = data.id;
      let newValue = event.newValue;

      const updatedAsset = { ...data, [field]: newValue };

      setDirtyAssets(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(assetId) || {};
        newMap.set(assetId, { ...existing, [field]: newValue });
        return newMap;
      });

      setValidationErrors(prev => {
        const newMap = new Map(prev);
        newMap.delete(assetId);
        return newMap;
      });

      const shouldValidateSubAssets = updatedAsset.main_asset_type === '199' || updatedAsset.main_asset_type === '299';
      const validations = [
        inputValidators.validateDateFormat(updatedAsset.measurement_date),
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
        )
      );

      if (updatedAsset.sub_asset_type_1) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_1, updatedAsset.sub_asset_size_1));
      }
      if (updatedAsset.sub_asset_type_2) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_2, updatedAsset.sub_asset_size_2));
      }
      if (updatedAsset.sub_asset_type_3) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_3, updatedAsset.sub_asset_size_3));
      }
      if (updatedAsset.sub_asset_type_4) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_4, updatedAsset.sub_asset_size_4));
      }
      if (updatedAsset.sub_asset_type_5) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_5, updatedAsset.sub_asset_size_5));
      }
      if (updatedAsset.sub_asset_type_6) {
        validations.push(assetValidators.validateSubAssetTypeComplete(updatedAsset.building_number, updatedAsset.sub_asset_type_6, updatedAsset.sub_asset_size_6));
      }

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
        event.api.refreshCells({ rowNodes: [event.node!], force: true });
        return;
      }

      setAllMeasurements(prevAssets =>
        prevAssets.map(asset =>
          asset.id === assetId ? updatedAsset : asset
        )
      );

      event.api.refreshCells({ rowNodes: [event.node!], force: true });
    } catch (err) {
      console.error('Validation error:', err);
    }
  }, []);

  const hasChanges = dirtyAssets.size > 0;

  async function handleSaveChanges() {
    if (validationErrors.size > 0) {
      setError('Please fix all validation errors before saving');
      return;
    }

    if (dirtyAssets.size === 0) {
      setToast({ message: 'No changes to save', type: 'info' });
      return;
    }

    setIsSaving(true);
    try {
      for (const [assetId, changes] of dirtyAssets.entries()) {
        // If measurement_date is being changed, we need special handling
        if ('measurement_date' in changes) {
          // If date is blank or 01/01/1900, use current date
          if (!changes.measurement_date || changes.measurement_date === '01/01/1900') {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            changes.measurement_date = `${day}/${month}/${year}`;
          }

          // Find the asset to get all its data
          const asset = allMeasurements.find(a => a.id === assetId);
          if (!asset) continue;

          // Delete the old record and create a new one with the new date
          await api.assets.delete(assetId);

          const newAssetData = {
            ...asset,
            ...changes,
            updated_at: new Date().toISOString()
          };
          delete (newAssetData as any).id;
          delete (newAssetData as any).created_at;

          await api.assets.create(newAssetData as any);
        } else {
          // Normal update for other fields
          await api.assets.update(assetId, changes);
        }
      }

      setToast({ message: t('updatedSuccessfully'), type: 'success' });
      setDirtyAssets(new Map());
      setValidationErrors(new Map());
      // Refresh data from server
      await fetchData();
      if (onDataUpdate) onDataUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFileUpload(assetId: number, file: File) {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${assetId}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('structure-drawings')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('structure-drawings')
        .getPublicUrl(filePath);

      await api.assets.update(assetId, { structure_drawing_url: publicUrl });

      setToast({ message: t('drawingUploadedSuccessfully'), type: 'success' });
      await fetchData();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : t('failedToUploadDrawing'),
        type: 'error'
      });
    }
  }

  function handleViewDrawing(url: string) {
    setSelectedDrawingUrl(url);
  }

  function handleCancelChanges() {
    // Restore original data using deep copy
    setAllMeasurements(JSON.parse(JSON.stringify(originalMeasurements)));
    setDirtyAssets(new Map());
    setValidationErrors(new Map());
    setError(null);
  }

  async function handleValidateLatestRow() {
    if (!latestMeasurementId) {
      setToast({ message: 'לא נמצא נכס לאימות', type: 'error' });
      return;
    }

    const latestRow = allMeasurements.find(m => m.id === latestMeasurementId);
    if (!latestRow) {
      setToast({ message: 'לא נמצא נכס לאימות', type: 'error' });
      return;
    }

    setIsValidating(true);
    try {
      const shouldValidateSubAssets = latestRow.main_asset_type === '199' || latestRow.main_asset_type === '299';
      const validations = [
        inputValidators.validateDateFormat(latestRow.measurement_date),
        assetValidators.validateBuildingNumber(latestRow.building_number),
        assetValidators.validateAssetId(latestRow.asset_id),
        assetValidators.validatePayerId(latestRow.payer_id),
        assetValidators.validateAssetType(latestRow.main_asset_type, 'main_asset_type'),
        assetValidators.validateMainAssetTypeComplete(latestRow.building_number, latestRow.main_asset_type, latestRow.asset_size),
        assetValidators.validateOnlyComplexTypesCanHaveSubAssets(latestRow.main_asset_type, [
          latestRow.sub_asset_type_1,
          latestRow.sub_asset_type_2,
          latestRow.sub_asset_type_3,
          latestRow.sub_asset_type_4,
          latestRow.sub_asset_type_5,
          latestRow.sub_asset_type_6
        ]),
        assetValidators.validateComplexTypesMustHaveSubAssets(latestRow.main_asset_type, [
          latestRow.sub_asset_type_1,
          latestRow.sub_asset_type_2,
          latestRow.sub_asset_type_3,
          latestRow.sub_asset_type_4,
          latestRow.sub_asset_type_5,
          latestRow.sub_asset_type_6
        ])
      ];

      if (shouldValidateSubAssets) {
        validations.push(
          assetValidators.validateMinimumSubAssets([
            latestRow.sub_asset_type_1,
            latestRow.sub_asset_type_2,
            latestRow.sub_asset_type_3,
            latestRow.sub_asset_type_4,
            latestRow.sub_asset_type_5,
            latestRow.sub_asset_type_6
          ])
        );
      }

      validations.push(
        assetValidators.validateSubAssetSizeMatchesMain(
          latestRow.asset_size,
          [
            latestRow.sub_asset_type_1,
            latestRow.sub_asset_type_2,
            latestRow.sub_asset_type_3,
            latestRow.sub_asset_type_4,
            latestRow.sub_asset_type_5,
            latestRow.sub_asset_type_6
          ],
          [
            latestRow.sub_asset_size_1,
            latestRow.sub_asset_size_2,
            latestRow.sub_asset_size_3,
            latestRow.sub_asset_size_4,
            latestRow.sub_asset_size_5,
            latestRow.sub_asset_size_6
          ]
        ),
        assetValidators.validateSubAssetsFor199Or299(
          latestRow.building_number,
          latestRow.main_asset_type,
          latestRow.asset_size,
          [
            latestRow.sub_asset_type_1,
            latestRow.sub_asset_type_2,
            latestRow.sub_asset_type_3,
            latestRow.sub_asset_type_4,
            latestRow.sub_asset_type_5,
            latestRow.sub_asset_type_6
          ],
          [
            latestRow.sub_asset_size_1,
            latestRow.sub_asset_size_2,
            latestRow.sub_asset_size_3,
            latestRow.sub_asset_size_4,
            latestRow.sub_asset_size_5,
            latestRow.sub_asset_size_6
          ]
        )
      );

      // Validate sub-asset types individually
      if (latestRow.sub_asset_type_1) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_1, latestRow.sub_asset_size_1)
        );
      }
      if (latestRow.sub_asset_type_2) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_2, latestRow.sub_asset_size_2)
        );
      }
      if (latestRow.sub_asset_type_3) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_3, latestRow.sub_asset_size_3)
        );
      }
      if (latestRow.sub_asset_type_4) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_4, latestRow.sub_asset_size_4)
        );
      }
      if (latestRow.sub_asset_type_5) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_5, latestRow.sub_asset_size_5)
        );
      }
      if (latestRow.sub_asset_type_6) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_6, latestRow.sub_asset_size_6)
        );
      }

      // Run all validations and collect all results (don't stop at first error)
      const validationResults = await Promise.all(validations);
      const allErrors: string[] = [];
      
      validationResults.forEach(result => {
        if (!result.valid && result.error) {
          allErrors.push(result.error);
        }
      });

      // Show validation results in modal (don't mark row)
      setValidationModalOpen(true);
      setValidationResults({
        valid: allErrors.length === 0,
        errors: allErrors
      });
    } catch (err) {
      console.error('Validation error:', err);
      setToast({ 
        message: 'שגיאה בביצוע אימות', 
        type: 'error' 
      });
    } finally {
      setIsValidating(false);
    }
  }

  async function handleNewMeasurement() {
    if (!asset || !building) return;

    // Use original data, not edited data
    const latestRow = originalMeasurements[0];
    if (!latestRow) {
      setToast({ message: 'No existing measurement to copy', type: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      // Comprehensive validation before saving
      const validations = [
        assetValidators.validateBuildingNumber(latestRow.building_number),
        assetValidators.validateAssetId(latestRow.asset_id),
        assetValidators.validatePayerId(latestRow.payer_id),
        assetValidators.validateMainAssetTypeComplete(latestRow.building_number, latestRow.main_asset_type, latestRow.asset_size),
      ];

      // Validate sub-asset types if they exist
      if (latestRow.sub_asset_type_1) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_1, latestRow.sub_asset_size_1)
        );
      }
      if (latestRow.sub_asset_type_2) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_2, latestRow.sub_asset_size_2)
        );
      }
      if (latestRow.sub_asset_type_3) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_3, latestRow.sub_asset_size_3)
        );
      }
      if (latestRow.sub_asset_type_4) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_4, latestRow.sub_asset_size_4)
        );
      }
      if (latestRow.sub_asset_type_5) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_5, latestRow.sub_asset_size_5)
        );
      }
      if (latestRow.sub_asset_type_6) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(latestRow.building_number, latestRow.sub_asset_type_6, latestRow.sub_asset_size_6)
        );
      }

      // Validate sub-assets constraints
      validations.push(
        assetValidators.validateOnlyComplexTypesCanHaveSubAssets(latestRow.main_asset_type, [
          latestRow.sub_asset_type_1,
          latestRow.sub_asset_type_2,
          latestRow.sub_asset_type_3,
          latestRow.sub_asset_type_4,
          latestRow.sub_asset_type_5,
          latestRow.sub_asset_type_6
        ]),
        assetValidators.validateComplexTypesMustHaveSubAssets(latestRow.main_asset_type, [
          latestRow.sub_asset_type_1,
          latestRow.sub_asset_type_2,
          latestRow.sub_asset_type_3,
          latestRow.sub_asset_type_4,
          latestRow.sub_asset_type_5,
          latestRow.sub_asset_type_6
        ]),
        assetValidators.validateMinimumSubAssets([
          latestRow.sub_asset_type_1,
          latestRow.sub_asset_type_2,
          latestRow.sub_asset_type_3,
          latestRow.sub_asset_type_4,
          latestRow.sub_asset_type_5,
          latestRow.sub_asset_type_6
        ]),
        assetValidators.validateSubAssetSizeMatchesMain(
          latestRow.asset_size,
          [
            latestRow.sub_asset_type_1,
            latestRow.sub_asset_type_2,
            latestRow.sub_asset_type_3,
            latestRow.sub_asset_type_4,
            latestRow.sub_asset_type_5,
            latestRow.sub_asset_type_6
          ],
          [
            latestRow.sub_asset_size_1,
            latestRow.sub_asset_size_2,
            latestRow.sub_asset_size_3,
            latestRow.sub_asset_size_4,
            latestRow.sub_asset_size_5,
            latestRow.sub_asset_size_6
          ]
        ),
        assetValidators.validateSubAssetsFor199Or299(
          latestRow.building_number,
          latestRow.main_asset_type,
          latestRow.asset_size,
          [
            latestRow.sub_asset_type_1,
            latestRow.sub_asset_type_2,
            latestRow.sub_asset_type_3,
            latestRow.sub_asset_type_4,
            latestRow.sub_asset_type_5,
            latestRow.sub_asset_type_6
          ],
          [
            latestRow.sub_asset_size_1,
            latestRow.sub_asset_size_2,
            latestRow.sub_asset_size_3,
            latestRow.sub_asset_size_4,
            latestRow.sub_asset_size_5,
            latestRow.sub_asset_size_6
          ]
        )
      );

      const validation = await validateAll(validations);
      if (!validation.valid) {
        setToast({ message: `שגיאת ולידציה: ${validation.error}`, type: 'error' });
        return;
      }

      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      const measurementDate = `${day}/${month}/${year}`;

      // Ensure payer_id is not undefined
      const payerId = latestRow.payer_id || '';

      const newMeasurement = {
        asset_id: latestRow.asset_id,
        building_number: latestRow.building_number,
        measurement_date: measurementDate,
        payer_id: payerId,
        main_asset_type: latestRow.main_asset_type,
        asset_size: latestRow.asset_size,
        sub_asset_type_1: latestRow.sub_asset_type_1,
        sub_asset_size_1: latestRow.sub_asset_size_1,
        sub_asset_type_2: latestRow.sub_asset_type_2,
        sub_asset_size_2: latestRow.sub_asset_size_2,
        sub_asset_type_3: latestRow.sub_asset_type_3,
        sub_asset_size_3: latestRow.sub_asset_size_3,
        sub_asset_type_4: latestRow.sub_asset_type_4,
        sub_asset_size_4: latestRow.sub_asset_size_4,
        sub_asset_type_5: latestRow.sub_asset_type_5,
        sub_asset_size_5: latestRow.sub_asset_size_5,
        sub_asset_type_6: latestRow.sub_asset_type_6,
        sub_asset_size_6: latestRow.sub_asset_size_6,
      };

      await api.assets.create(newMeasurement);
      setToast({ message: 'New measurement created successfully', type: 'success' });
      setDirtyAssets(new Map());
      setValidationErrors(new Map());
      if (onDataUpdate) onDataUpdate();
      await fetchData();
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to create new measurement',
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  }

  // Helper function to get cell style for dirty fields
  const getCellStyle = (params: any, fieldName: string) => {
    const assetId = params.data?.id;
    if (!assetId) return {};
    
    const isDirty = dirtyAssets.has(assetId) && dirtyAssets.get(assetId)?.hasOwnProperty(fieldName);
    const isLatest = params.data.id === latestMeasurementId;
    
    return {
      fontWeight: isDirty ? 'bold' : 'normal',
      backgroundColor: isLatest ? undefined : '#f3f4f6'
    };
  };

  const columnDefs: ColDef<Asset>[] = useMemo(() => [
    {
      headerName: t('structureDrawing'),
      field: 'structure_drawing_url',
      pinned: 'right',
      sortable: false,
      filter: false,
      editable: false,
      cellRenderer: (params: any) => {
        const asset = params.data as Asset;
        const assetId = asset.id;
        const hasDrawing = !!asset.structure_drawing_url;

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

        if (hasInvalidPayerId) errors.push('Invalid payer ID - must be numeric');
        if (hasInvalidAssetId) errors.push('Invalid asset ID - must be numeric');

        const hasErrors = errors.length > 0;

        return (
          <div className="flex items-center justify-center gap-1">
            {hasErrors && (
              <div className="flex items-center justify-center" title={errors.join('\n')}>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
            )}
            <label className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-600 hover:bg-teal-700 text-white cursor-pointer transition-colors duration-200" title={t('upload')}>
              <Upload className="w-2.5 h-2.5" />
              <input
                type="file"
                className="hidden"
                accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(asset.id, file);
                  }
                }}
              />
            </label>
            <button
              onClick={() => hasDrawing && handleViewDrawing(asset.structure_drawing_url!)}
              disabled={!hasDrawing}
              className={`flex items-center justify-center w-5 h-5 rounded-full transition-colors duration-200 ${
                !hasDrawing
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : selectedDrawingUrl === asset.structure_drawing_url
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title={hasDrawing ? (selectedDrawingUrl === asset.structure_drawing_url ? t('viewing') : t('view')) : 'No drawing'}
            >
              <Eye className="w-2.5 h-2.5" />
            </button>
          </div>
        );
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      field: 'measurement_date',
      headerName: t('measurementDate'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'measurement_date'),
      valueFormatter: (params) => params.value === '01/01/1900' ? '' : params.value,
      valueGetter: (params) => params.data.measurement_date,
      valueSetter: (params) => {
        const newValue = params.newValue?.trim();
        params.data.measurement_date = newValue || '01/01/1900';
        return true;
      },
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'payer_id'),
    },
    {
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: (params) => params.data.id === latestMeasurementId,
      cellRenderer: (params: any) => {
        const isChecked = params.value === 'כן';
        return (
          <div className="flex items-center justify-center h-full">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const newValue = e.target.checked ? 'כן' : null;
                params.setValue(newValue);
              }}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
          </div>
        );
      },
      valueGetter: (params: any) => params.data?.penthouse === 'כן' ? 'כן' : null,
      valueSetter: (params: any) => {
        params.data.penthouse = params.newValue;
        return true;
      },
      cellStyle: (params) => {
        const baseStyle = getCellStyle(params, 'penthouse');
        return { ...baseStyle, textAlign: 'center' };
      },
      headerClass: 'text-center'
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'main_asset_type'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'asset_size'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        return isNaN(num) ? '' : num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_1'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_1'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        return isNaN(num) ? '' : num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_2'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_2'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        return isNaN(num) ? '' : num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_3'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_3'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        return isNaN(num) ? '' : num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_4'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_4'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        return isNaN(num) ? '' : num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_5'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_5'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        return isNaN(num) ? '' : num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_type_6'),
      tooltipValueGetter: (params) => {
        const code = params.value;
        if (!code) return '';
        const assetType = assetTypes.find(at => at.name === code);
        return assetType?.description || code;
      },
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      editable: (params) => params.data.id === latestMeasurementId,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_6'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        return isNaN(num) ? '' : num.toFixed(2);
      },
    },
  ], [t, assetTypes, latestMeasurementId, validationErrors, selectedDrawingUrl, dirtyAssets]);

  useEffect(() => {
    fetchData();
  }, [assetId]);

  async function fetchData() {
    try {
      setLoading(true);

      const [assetData, assetTypesData] = await Promise.all([
        api.assets.getOne(String(assetId)).catch(err => {
          console.error('Error fetching asset:', err);
          if (err.message === 'Asset not found') {
            return null;
          }
          throw err;
        }),
        api.assetTypes.getAll()
      ]);

      if (!assetData) {
        setError('הנכס לא נמצא');
        setLoading(false);
        return;
      }

      setAsset(assetData);
      setAssetTypes(assetTypesData || []);

      const buildingData = await api.buildings.getOne(assetData.building_number);
      setBuilding(buildingData);

      const allAssetMeasurements = await api.assets.getAllByAssetId(String(assetData.asset_id), assetData.building_number);
      setAllMeasurements(allAssetMeasurements || []);
      // Store original data only if dirtyAssets is empty (initial load or after save)
      if (dirtyAssets.size === 0) {
        setOriginalMeasurements(JSON.parse(JSON.stringify(allAssetMeasurements || [])));
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset details');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-700 font-medium">{t('loadingDetails')}</p>
        </div>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800">{t('error')}: {error || 'Asset not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={0}
        />
      )}

      {/* Validation Results Modal */}
      {validationModalOpen && validationResults && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className={`${validationResults.valid ? 'bg-green-500' : 'bg-red-500'} px-6 py-4 flex items-center justify-between`}>
              <h2 className="text-2xl font-bold text-white">
                {validationResults.valid ? 'אימות הצליח' : 'שגיאות אימות'}
              </h2>
              <button
                onClick={() => {
                  setValidationModalOpen(false);
                  setValidationResults(null);
                }}
                className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {validationResults.valid ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                  <p className="text-xl font-semibold text-green-700 mb-2">הנכס תקין</p>
                  <p className="text-slate-600">כל האימותים עברו בהצלחה</p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-semibold text-slate-800 mb-4">
                    נמצאו {validationResults.errors.length} שגיאות:
                  </p>
                  <ul className="space-y-2">
                    {validationResults.errors.map((error, index) => (
                      <li key={index} className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <span className="text-red-800 flex-1">{error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => {
                  setValidationModalOpen(false);
                  setValidationResults(null);
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
      <div className="mb-3 bg-gradient-to-r from-blue-600 to-teal-600 rounded-lg shadow-lg p-3">
        <div className="flex items-center gap-3">
          <Home className="w-8 h-8 text-white bg-white/20 rounded-lg p-1.5" strokeWidth={1.5} />
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {t('assetId')}: {asset.asset_id}
            </h1>
            {building && (
              <div className="flex items-center gap-3 mt-1">
                <p className="text-xs sm:text-sm text-teal-50">
                  {t('building')} {building.building_number}
                </p>
                {assetTaxRegion && (
                  <p className="text-sm text-white font-semibold bg-blue-700 px-3 py-1 rounded">
                    אזור מס: {assetTaxRegion}
                  </p>
                )}
                {building.tax_region && !assetTaxRegion && (
                  <p className="text-sm text-white font-semibold bg-blue-700 px-3 py-1 rounded">
                    אזורי מס: {building.tax_region}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {allMeasurements.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-blue-100">
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {t('measurementHistory')} ({allMeasurements.length})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleValidateLatestRow}
                  disabled={isSaving || isValidating || !latestMeasurementId}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  title="אמת את הנכס"
                >
                  {isValidating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span className="text-sm">{isValidating ? 'מאמת...' : 'אמת נכס'}</span>
                </button>
                <button
                  onClick={handleSaveChanges}
                  disabled={isSaving || !hasChanges || validationErrors.size > 0}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  title={validationErrors.size > 0 ? 'תקן שגיאות לפני שמירה' : 'שמור שינויים'}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="text-sm">{t('save')}</span>
                </button>
                <button
                  onClick={handleCancelChanges}
                  disabled={isSaving || !hasChanges}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  <X className="h-4 w-4" />
                  <span className="text-sm">{t('cancel')}</span>
                </button>
                <button
                  onClick={handleNewMeasurement}
                  disabled={isSaving || !hasChanges || validationErrors.size > 0}
                  className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  title={validationErrors.size > 0 ? 'תקן שגיאות לפני יצירת מדידה חדשה' : !hasChanges ? 'בצע שינויים כדי ליצור מדידה חדשה' : 'צור מדידה חדשה'}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span className="text-sm">{t('newMeasurement')}</span>
                </button>
              </div>
            </div>
            <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%' }}>
              <AgGridReact<Asset>
                ref={gridRef}
                rowData={allMeasurements}
                columnDefs={columnDefs}
                defaultColDef={{
                  resizable: true,
                  wrapHeaderText: true,
                  autoHeaderHeight: true,
                  wrapText: true,
                  autoHeight: false,
                  minWidth: 30,
                  sortable: false,
                  headerClass: 'ag-right-aligned-header'
                }}
                getRowId={(params) => String(params.data.id)}
                getRowStyle={getRowStyle}
                onGridReady={async (params) => {
                  // Load saved column state first
                  const hasSavedState = await loadColumnState();
                  
                  // If no saved state, apply default sizing
                  if (!hasSavedState) {
                    setTimeout(() => {
                      const allColumnIds = params.api.getAllDisplayedColumns()
                        .map(col => col.getColId())
                        .filter(id => id !== 'actions'); // Exclude actions column from auto-sizing
                      
                      if (allColumnIds.length > 0) {
                        params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                      }
                    }, 100);
                  }
                }}
                onFirstDataRendered={async (params) => {
                  // Load saved column state if not already loaded
                  if (!columnStateLoaded) {
                    const hasSavedState = await loadColumnState();
                    
                    // If no saved state, apply default sizing
                    if (!hasSavedState) {
                      setTimeout(() => {
                        const allColumnIds = params.api.getAllDisplayedColumns()
                          .map(col => col.getColId())
                          .filter(id => id !== 'actions'); // Exclude actions column from auto-sizing
                        
                        if (allColumnIds.length > 0) {
                          params.api.autoSizeColumns({ skipHeader: true }, allColumnIds);
                        }
                      }, 50);
                    }
                  }
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
                onCellValueChanged={onCellValueChanged}
                enableRtl={true}
                animateRows={true}
                tooltipShowDelay={200}
                tooltipHideDelay={10000}
              />
            </div>

            {selectedDrawingUrl && (
              <div className="mt-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800">{t('structureDrawing')}</h3>
                  <button
                    onClick={() => setSelectedDrawingUrl(null)}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                  >
                    <X className="h-4 w-4" />
                    <span>{t('closeViewer')}</span>
                  </button>
                </div>
                <PDFViewer
                  fileUrl={selectedDrawingUrl}
                  fileName={`structure-drawing-${assetId}.pdf`}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
