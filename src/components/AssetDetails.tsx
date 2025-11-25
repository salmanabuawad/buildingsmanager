import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, Building, AssetType, api } from '../lib/api';
import { Home, Loader2, Save, X, Plus, AlertCircle, Upload, Eye, CheckCircle2 } from 'lucide-react';
import { Toast } from './Toast';
import { PDFViewer } from './PDFViewer';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellClassParams } from 'ag-grid-community';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { AssetValidationHandler } from '../lib/assetValidationHandler';
import { supabase } from '../lib/supabase';
import { useGridPreferences } from '../hooks/useGridPreferences';
import { ValidationResultModal, SingleAssetValidationResult, ValidationProgress } from './ValidationResultModal';

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
  const [validationResults, setValidationResults] = useState<SingleAssetValidationResult | null>(null);
  const [validationProgress, setValidationProgress] = useState<ValidationProgress | null>(null);
  const gridRef = useRef<AgGridReact<Asset>>(null);
  const { loadColumnState, saveColumnState, columnStateLoaded } = useGridPreferences(gridRef, 'asset_details_column_state');

  // Find the latest measurement (from assets table, is_latest=true)
  const latestMeasurement = useMemo(() => {
    return allMeasurements.find(m => m.is_latest === true) || null;
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
    const isLatest = asset.is_latest === true;

    const baseStyle: any = {
      opacity: isLatest ? 1 : 0.7
    };

    if (hasErrors || hasInvalidPayerId || hasInvalidAssetId) {
      return {
        ...baseStyle,
        border: '3px solid #ef4444',
        borderRadius: '4px',
        background: '#fee2e2'
      };
    }

    if (!isLatest) {
      baseStyle.background = '#f9fafb';
      baseStyle.borderLeft = '3px solid #d1d5db';
    }

    return baseStyle;
  }, [validationErrors]);

  const onCellValueChanged = useCallback(async (event: any) => {
    try {
      const { data, colDef, node } = event;
      const field = colDef.field;
      const assetId = data.id;
      
      // Only allow editing for latest records
      if (data.is_latest !== true) {
        console.warn('[AssetDetails] Attempted to edit non-latest record, ignoring change');
        event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
        return;
      }
      
      let newValue = event.newValue;

      // Update the data directly in the node (AG-Grid already does this, but ensure it's set)
      data[field] = newValue;

      // Track the change in dirtyAssets (for saving later)
      setDirtyAssets(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(assetId) || {};
        newMap.set(assetId, { ...existing, [field]: newValue });
        return newMap;
      });

      // Clear validation errors for this asset (will be re-validated)
      setValidationErrors(prev => {
        const newMap = new Map(prev);
        newMap.delete(assetId);
        return newMap;
      });

      // Use the current node data (which AG-Grid has already updated)
      const updatedAsset = data;

      // If measurement_date field is being changed, validate format immediately
      if (field === 'measurement_date') {
        const dateValidation = inputValidators.validateDateFormat(newValue);
        if (!dateValidation.valid) {
          setValidationErrors(prev => {
            const newMap = new Map(prev);
            const errorMap = new Map<string, string>();
            errorMap.set(field, dateValidation.error || 'תאריך חייב להיות בפורמט DD/MM/YYYY');
            newMap.set(assetId, errorMap);
            return newMap;
          });
          // Refresh only the specific cell that has the error
          event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
          return;
        }
      }

      const shouldValidateSubAssets = updatedAsset.main_asset_type === '199' || updatedAsset.main_asset_type === '299';
      const validations = [
        inputValidators.validateDateFormat(updatedAsset.measurement_date),
        assetValidators.validateBuildingNumber(updatedAsset.building_number),
        assetValidators.validateAssetId(updatedAsset.asset_id),
        assetValidators.validateAssetIdNotInOtherBuilding(updatedAsset.asset_id, updatedAsset.building_number, typeof assetId === 'number' ? assetId : undefined),
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
        // Refresh only the specific cell that has the error
        event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
        return;
      }

      // Don't update allMeasurements state - AG-Grid already updated the node data
      // Only refresh the specific cell that changed to update styling
      event.api.refreshCells({ rowNodes: [node], columns: [field], force: true });
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
      setError(null); // Clear any previous errors on success
      
      // Refresh data from server
      // Use asset_id instead of id, since id might have changed if asset was recreated
      if (asset && asset.asset_id) {
        try {
          setLoading(true);
          const assetTypesData = await api.assetTypes.getAll();
          setAssetTypes(assetTypesData || []);
          
          const buildingData = await api.buildings.getOne(asset.building_number);
          setBuilding(buildingData);
          
          // Fetch all records using asset_id (which doesn't change)
          let allAssetMeasurements: Asset[] = [];
          try {
            allAssetMeasurements = await api.assets.getAssetWithHistory(asset.asset_id, asset.building_number);
            
            console.log('[AssetDetails] Fetched measurements after save:', {
              totalCount: allAssetMeasurements.length,
              latestCount: allAssetMeasurements.filter(m => m.is_latest).length,
              historyCount: allAssetMeasurements.filter(m => !m.is_latest).length,
            });
          } catch (historyErr) {
            console.error('[AssetDetails] Error fetching asset history after save:', historyErr);
            // Try to get just the latest asset by asset_id
            const assetsByAssetId = await api.assets.getAllByAssetId(String(asset.asset_id), asset.building_number);
            if (assetsByAssetId && assetsByAssetId.length > 0) {
              const masterRecord = { ...assetsByAssetId[0], is_latest: true };
              allAssetMeasurements = [masterRecord];
            }
          }
          
          // Update asset state with the latest measurement
          if (allAssetMeasurements.length > 0) {
            const latestMeasurement = allAssetMeasurements.find(m => m.is_latest === true) || allAssetMeasurements[0];
            setAsset(latestMeasurement);
          }
          
          setAllMeasurements(allAssetMeasurements);
          setOriginalMeasurements(allAssetMeasurements);
        } catch (fetchErr) {
          const fetchErrorMessage = fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch asset data after save';
          console.error('[AssetDetails] Error fetching data after save:', fetchErr);
          setError(fetchErrorMessage);
          setToast({ message: fetchErrorMessage, type: 'error' });
        } finally {
          setLoading(false);
        }
      } else {
        // Fallback to regular fetchData if asset or asset_id is not available
        await fetchData();
      }
      
      if (onDataUpdate) onDataUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save changes';
      console.error('[AssetDetails] Error saving changes:', err);
      setError(errorMessage);
      setToast({ message: errorMessage, type: 'error' });
      // Don't clear error automatically - let user see it
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
    if (!latestMeasurement) {
      setToast({ message: 'לא נמצא נכס לאימות', type: 'error' });
      return;
    }

    const latestRow = latestMeasurement;
    if (!latestRow) {
      setToast({ message: 'לא נמצא נכס לאימות', type: 'error' });
      return;
    }

    setIsValidating(true);
    setValidationProgress(null);
    setValidationModalOpen(true);
    try {
      // Use unified validation handler
      const result = await AssetValidationHandler.validateSingleAsset(latestRow, {
        onProgress: (progress) => {
          setValidationProgress({
            current: progress.current,
            total: progress.total,
            currentStep: progress.currentStep || 'בודק...'
          });
        }
      });

      // Show validation results in modal
      setValidationResults({
        valid: result.valid,
        errors: result.errors,
        passed: result.passed,
        matchedAssetTypeRecord: result.matchedAssetTypeRecord
      });
      setValidationProgress(null);
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
    const latestRow = originalMeasurements.find(m => m.is_latest === true);
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
        assetValidators.validateMainAssetTypeComplete(latestRow.building_number, latestRow.main_asset_type, latestRow.asset_size, latestRow),
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

      const createdAsset = await api.assets.create(newMeasurement);
      setToast({ message: 'New measurement created successfully', type: 'success' });
      setDirtyAssets(new Map());
      setValidationErrors(new Map());
      setError(null); // Clear any previous errors on success
      
      // Update the asset state with the new asset data (which has the new id)
      if (createdAsset) {
        setAsset(createdAsset);
        // Update the assetId for future fetches by storing it in a ref or state
        // Since assetId is a prop, we'll use the asset state for fetching
      }
      
      if (onDataUpdate) onDataUpdate();
      
      // Fetch data using asset_id instead of id, since the id changed
      // We'll use the created asset's id or fetch by asset_id
      if (createdAsset) {
        // Update the component to use the new id for fetching
        // Since we can't change the prop, we'll fetch directly using asset_id
        try {
          setLoading(true);
          const assetTypesData = await api.assetTypes.getAll();
          setAssetTypes(assetTypesData || []);
          
          const buildingData = await api.buildings.getOne(createdAsset.building_number);
          setBuilding(buildingData);
          
          // Fetch all records using asset_id
          let allAssetMeasurements: Asset[] = [];
          try {
            allAssetMeasurements = await api.assets.getAssetWithHistory(createdAsset.asset_id, createdAsset.building_number);
            
            console.log('[AssetDetails] Fetched measurements after new measurement:', {
              totalCount: allAssetMeasurements.length,
              latestCount: allAssetMeasurements.filter(m => m.is_latest).length,
              historyCount: allAssetMeasurements.filter(m => !m.is_latest).length,
            });
          } catch (historyErr) {
            console.error('[AssetDetails] Error fetching asset history:', historyErr);
            const masterRecord = { ...createdAsset, is_latest: true };
            allAssetMeasurements = [masterRecord];
          }
          
          setAllMeasurements(allAssetMeasurements);
          if (dirtyAssets.size === 0) {
            setOriginalMeasurements(allAssetMeasurements);
          }
        } catch (fetchErr) {
          const fetchErrorMessage = fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch asset data';
          console.error('[AssetDetails] Error fetching data after new measurement:', fetchErr);
          setError(fetchErrorMessage);
          setToast({ message: fetchErrorMessage, type: 'error' });
        } finally {
          setLoading(false);
        }
      } else {
        // Fallback to regular fetchData if createdAsset is not available
        await fetchData();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create new measurement';
      console.error('[AssetDetails] Error creating new measurement:', error);
      
      // Show error as toast only - don't set error state to keep page editable
      setToast({
        message: errorMessage,
        type: 'error'
      });
      
      // Don't clear dirtyAssets or validationErrors - let user modify and try again
      // Don't clear the form - keep all data so user can modify date or save as change
      // Don't set error state - only show toast so page remains fully functional
    } finally {
      setIsSaving(false);
    }
  }

  // Helper function to get cell style for dirty fields
  const getCellStyle = (params: any, fieldName: string) => {
    const assetId = params.data?.id;
    if (!assetId) return {};
    
    const isDirty = dirtyAssets.has(assetId) && dirtyAssets.get(assetId)?.hasOwnProperty(fieldName);
    const isLatest = params.data.is_latest === true;
    
    return {
      fontWeight: isDirty ? 'bold' : 'normal',
      backgroundColor: isLatest ? undefined : '#f3f4f6',
      color: isLatest ? undefined : '#6b7280',
      cursor: isLatest ? 'text' : 'default'
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
            {asset.is_latest === true ? (
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
            ) : (
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-400 cursor-not-allowed" title="Read-only">
                <Upload className="w-2.5 h-2.5" />
              </div>
            )}
            <button
              onClick={() => {
                if (hasDrawing && asset.structure_drawing_url) {
                  handleViewDrawing(asset.structure_drawing_url);
                }
              }}
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
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'measurement_date'),
      valueFormatter: (params) => {
        if (!params.value || params.value === '01/01/1900') return '';
        // Ensure DD/MM/YYYY format
        const dateStr = String(params.value).trim();
        // If already in DD/MM/YYYY format, return as-is
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
          return dateStr;
        }
        // Try to parse other date formats and convert to DD/MM/YYYY
        try {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
          }
        } catch (e) {
          // If parsing fails, return original value
        }
        return dateStr;
      },
      valueGetter: (params) => params.data.measurement_date,
      valueSetter: (params) => {
        let newValue = params.newValue?.trim() || '';
        
        // If empty, set to default
        if (!newValue) {
          params.data.measurement_date = '01/01/1900';
          return true;
        }
        
        // Validate DD/MM/YYYY format first
        const dateFormatPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = newValue.match(dateFormatPattern);
        
        if (match) {
          const day = parseInt(match[1], 10);
          const month = parseInt(match[2], 10);
          const year = parseInt(match[3], 10);
          
          // Validate month range
          if (month < 1 || month > 12) {
            // Invalid month - keep the value but it will be validated in onCellValueChanged
            params.data.measurement_date = newValue;
            return true;
          }
          
          // Validate day range based on month
          const daysInMonth = new Date(year, month, 0).getDate();
          if (day < 1 || day > daysInMonth) {
            // Invalid day - keep the value but it will be validated in onCellValueChanged
            params.data.measurement_date = newValue;
            return true;
          }
          
          // Validate year range (reasonable range)
          if (year < 1900 || year > 2100) {
            // Invalid year - keep the value but it will be validated in onCellValueChanged
            params.data.measurement_date = newValue;
            return true;
          }
          
          // Create date object to validate it's a real date
          const date = new Date(year, month - 1, day);
          if (!isNaN(date.getTime()) &&
              date.getDate() === day &&
              date.getMonth() === month - 1 &&
              date.getFullYear() === year) {
            params.data.measurement_date = newValue;
            return true;
          }
        }
        
        // If not in DD/MM/YYYY format, try to parse other formats and convert
        try {
          const date = new Date(newValue);
          if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            params.data.measurement_date = `${day}/${month}/${year}`;
            return true;
          }
        } catch (e) {
          // If parsing fails, keep original value - validation will catch it
        }
        
        // If format doesn't match DD/MM/YYYY, keep the value but validation will show error
        params.data.measurement_date = newValue;
        return true;
      },
      cellEditor: 'agTextCellEditor',
      cellEditorParams: {
        maxLength: 10,
        useFormatter: true,
      },
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'payer_id'),
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: (params) => params.data.is_latest === true,
      cellRenderer: (params: any) => {
        const isChecked = params.value === 'כן';
        const isEditable = params.data.is_latest === true;
        return (
          <div className="flex items-center justify-center h-full">
            {isEditable ? (
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  e.stopPropagation(); // Prevent event bubbling
                  const newValue = e.target.checked ? 'כן' : null;
                  
                  // Only allow editing for latest records
                  if (params.data.is_latest !== true) {
                    return;
                  }
                  
                  // Update the data directly in the node (this doesn't trigger onCellValueChanged)
                  params.data.penthouse = newValue;
                  params.node.setDataValue('penthouse', newValue);
                  
                  // Manually track the change in dirtyAssets
                  const assetId = params.data.id;
                  setDirtyAssets(prev => {
                    const newMap = new Map(prev);
                    const existing = newMap.get(assetId) || {};
                    newMap.set(assetId, { ...existing, penthouse: newValue });
                    return newMap;
                  });
                  
                  // Clear any validation errors for this field
                  setValidationErrors(prev => {
                    const newMap = new Map(prev);
                    const fieldErrors = newMap.get(assetId);
                    if (fieldErrors) {
                      fieldErrors.delete('penthouse');
                      if (fieldErrors.size === 0) {
                        newMap.delete(assetId);
                      }
                    }
                    return newMap;
                  });
                  
                  // Refresh only this specific cell
                  if (params.api && params.node) {
                    params.api.refreshCells({ 
                      rowNodes: [params.node], 
                      columns: ['penthouse'], 
                      force: true 
                    });
                  }
                }}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
            ) : (
              <span className="text-gray-600">{isChecked ? '✓' : ''}</span>
            )}
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
      editable: (params) => params.data.is_latest === true,
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
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'asset_size'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      editable: (params) => params.data.is_latest === true,
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
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_1'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      editable: (params) => params.data.is_latest === true,
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
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_2'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      editable: (params) => params.data.is_latest === true,
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
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_3'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      editable: (params) => params.data.is_latest === true,
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
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_4'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      editable: (params) => params.data.is_latest === true,
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
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_5'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      editable: (params) => params.data.is_latest === true,
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
      editable: (params) => params.data.is_latest === true,
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_6'),
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
    },
  ], [t, assetTypes, latestMeasurement, validationErrors, selectedDrawingUrl, dirtyAssets]);

  useEffect(() => {
    fetchData();
  }, [assetId]);

  async function fetchData() {
    try {
      setLoading(true);

      // Try to fetch by id first
      let assetData: Asset | null = null;
      try {
        assetData = await api.assets.getOne(String(assetId));
      } catch (err: any) {
        console.error('Error fetching asset by id:', err);
        // If asset not found by id, try to fetch by asset_id from the current asset state
        if (err.message === 'Asset not found' && asset) {
          console.log('Asset not found by id, trying to fetch by asset_id:', asset.asset_id);
          try {
            const assetsByAssetId = await api.assets.getAllByAssetId(String(asset.asset_id), asset.building_number);
            if (assetsByAssetId && assetsByAssetId.length > 0) {
              // Get the latest one (should be first after sorting)
              assetData = assetsByAssetId[0];
              console.log('Found asset by asset_id:', assetData);
            }
          } catch (assetIdErr) {
            console.error('Error fetching asset by asset_id:', assetIdErr);
          }
        }
        // If still not found, return error
        if (!assetData) {
          setError('הנכס לא נמצא');
          setLoading(false);
          return;
        }
      }

      const assetTypesData = await api.assetTypes.getAll();

      if (!assetData) {
        setError('הנכס לא נמצא');
        setLoading(false);
        return;
      }

      setAsset(assetData);
      setAssetTypes(assetTypesData || []);

      const buildingData = await api.buildings.getOne(assetData.building_number);
      setBuilding(buildingData);

      // Fetch all records (latest from assets + history from assets_history) using the view
      let allAssetMeasurements: Asset[] = [];
      try {
        allAssetMeasurements = await api.assets.getAssetWithHistory(assetData.asset_id, assetData.building_number);
        
        // Log for debugging
        console.log('[AssetDetails] Fetched measurements:', {
          totalCount: allAssetMeasurements.length,
          latestCount: allAssetMeasurements.filter(m => m.is_latest).length,
          historyCount: allAssetMeasurements.filter(m => !m.is_latest).length,
          allIds: allAssetMeasurements.map(m => ({ id: m.id, measurement_date: m.measurement_date, is_latest: m.is_latest }))
        });
      } catch (historyErr) {
        console.error('[AssetDetails] Error fetching asset history:', historyErr);
        // If history fetch fails, at least show the master record
        const masterRecord = { ...assetData, is_latest: true };
        allAssetMeasurements = [masterRecord];
        console.warn('[AssetDetails] Using master record only due to history fetch error');
      }
      
      setAllMeasurements(allAssetMeasurements);
      // Store original data only if dirtyAssets is empty (initial load or after save)
      if (dirtyAssets.size === 0) {
        setOriginalMeasurements(JSON.parse(JSON.stringify(allAssetMeasurements)));
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
      <ValidationResultModal
        isOpen={validationModalOpen}
        onClose={() => {
          setValidationModalOpen(false);
          setValidationResults(null);
        }}
        isLoading={isValidating}
        progress={validationProgress}
        context="single"
        singleResult={validationResults}
        singleAssetTitle={asset ? `אימות נכס ${asset.asset_id}` : undefined}
        assetId={asset?.asset_id}
      />
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
                  disabled={isSaving || isValidating || !latestMeasurement}
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
                  sortable: false,
                  headerClass: 'ag-right-aligned-header'
                }}
                getRowId={(params) => {
                  // Use id + measurement_date + is_latest to ensure uniqueness
                  // This prevents duplicates when same record appears in both tables
                  const isLatest = params.data.is_latest ? 'latest' : 'history';
                  const historyCreatedAt = params.data.history_created_at ? `-${params.data.history_created_at}` : '';
                  return `${params.data.id}-${params.data.measurement_date}-${isLatest}${historyCreatedAt}`;
                }}
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
