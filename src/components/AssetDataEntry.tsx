import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Asset, Building, AssetType } from '../lib/api';
import { assetValidators, validateAll } from '../lib/validation';
import { Save, Plus, Trash2, Upload, Download, RefreshCw, FileText, AlertCircle } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent } from 'ag-grid-community';
import { Toast } from './Toast';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
interface AssetRow {
  id: string;
  building_number: number | null;
  payer_id: string;
  asset_id: string;
  measurement_date: string;
  main_asset_type: string;
  asset_size: number;
  sub_asset_type_1: string;
  sub_asset_size_1: number;
  sub_asset_type_2: string;
  sub_asset_size_2: number;
  sub_asset_type_3: string;
  sub_asset_size_3: number;
  sub_asset_type_4: string;
  sub_asset_size_4: number;
  sub_asset_type_5: string;
  sub_asset_size_5: number;
  sub_asset_type_6: string;
  sub_asset_size_6: number;
  _isNew?: boolean;
  _dbId?: number;
  _isDirty?: boolean;
  _dirtyFields?: Set<string>;
  _validationErrors?: Map<string, string>;
}
export function AssetDataEntry() {
  const { t } = useTranslation();
  const gridRef = useRef<AgGridReact>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [rowData, setRowData] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [validateBeforeImport, setValidateBeforeImport] = useState(true);
  const [importValidationErrors, setImportValidationErrors] = useState<string[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<number | 'all'>('all');
  const showToast = (message: string, type: 'error' | 'success' | 'info') => {
    setToast({ message, type });
  };
  useEffect(() => {
    fetchBuildings();
    fetchAssetTypes();
  }, []);
  const fetchBuildings = async () => {
    try {
      const data = await api.buildings.getAll();
      setBuildings(data);
    } catch (err) {
      console.error('Error fetching buildings:', err);
    }
  };
  const fetchAssetTypes = async () => {
    try {
      const data = await api.assetTypes.getAll();
      setAssetTypes(data);
    } catch (err) {
      console.error('Error fetching asset types:', err);
    }
  };
  const createEmptyRow = (): AssetRow => ({
    id: `new_${Date.now()}_${Math.random()}`,
    building_number: null,
    payer_id: '',
    asset_id: '',
    measurement_date: '',
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
    _isNew: true
  });
  const addEmptyRow = () => {
    setRowData(prev => [...prev, createEmptyRow()]);
  };
  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const updatedRow = event.data as AssetRow;
    const field = event.column?.getColId();
    if (!field) return;
    // If main_asset_type changed from 199/299 to something else, clear all sub assets
    if (field === 'main_asset_type') {
      const newType = updatedRow.main_asset_type;
      if (newType && newType !== '199' && newType !== '299') {
        updatedRow.sub_asset_type_1 = null;
        updatedRow.sub_asset_type_2 = null;
        updatedRow.sub_asset_type_3 = null;
        updatedRow.sub_asset_type_4 = null;
        updatedRow.sub_asset_type_5 = null;
        updatedRow.sub_asset_type_6 = null;
        updatedRow.sub_asset_size_1 = 0;
        updatedRow.sub_asset_size_2 = 0;
        updatedRow.sub_asset_size_3 = 0;
        updatedRow.sub_asset_size_4 = 0;
        updatedRow.sub_asset_size_5 = 0;
        updatedRow.sub_asset_size_6 = 0;
        // Update the row in ag-Grid immediately
        const rowNode = event.api.getRowNode(updatedRow.id.toString());
        if (rowNode) {
          rowNode.setData(updatedRow);
        }
      }
    }
    if (!updatedRow._dirtyFields) {
      updatedRow._dirtyFields = new Set<string>();
    }
    if (!updatedRow._validationErrors) {
      updatedRow._validationErrors = new Map<string, string>();
    }
    updatedRow._dirtyFields.add(field);
    updatedRow._isDirty = true;
    updatedRow._validationErrors.clear();
    // Only validate sub-assets if main type is 199 or 299
    const shouldValidateSubAssets = updatedRow.main_asset_type === '199' || updatedRow.main_asset_type === '299';
    const validations = [
      assetValidators.validateBuildingNumber(updatedRow.building_number),
      assetValidators.validateAssetId(updatedRow.asset_id),
      assetValidators.validatePayerId(updatedRow.payer_id),
      assetValidators.validateAssetType(updatedRow.main_asset_type, 'main_asset_type'),
      assetValidators.validateMainAssetTypeForBuilding(updatedRow.building_number, updatedRow.main_asset_type),
    ];
    if (shouldValidateSubAssets) {
      validations.push(
        assetValidators.validateMinimumSubAssets([
          updatedRow.sub_asset_type_1,
          updatedRow.sub_asset_type_2,
          updatedRow.sub_asset_type_3,
          updatedRow.sub_asset_type_4,
          updatedRow.sub_asset_type_5,
          updatedRow.sub_asset_type_6
        ])
      );
    }
    validations.push(
      assetValidators.validateSubAssetSizeMatchesMain(
        updatedRow.asset_size,
        [
          updatedRow.sub_asset_type_1,
          updatedRow.sub_asset_type_2,
          updatedRow.sub_asset_type_3,
          updatedRow.sub_asset_type_4,
          updatedRow.sub_asset_type_5,
          updatedRow.sub_asset_type_6
        ],
        [
          updatedRow.sub_asset_size_1,
          updatedRow.sub_asset_size_2,
          updatedRow.sub_asset_size_3,
          updatedRow.sub_asset_size_4,
          updatedRow.sub_asset_size_5,
          updatedRow.sub_asset_size_6
        ]
      ),
      assetValidators.validateSubAssetsFor199Or299(
        updatedRow.building_number,
        updatedRow.main_asset_type,
        updatedRow.asset_size,
        [
          updatedRow.sub_asset_type_1,
          updatedRow.sub_asset_type_2,
          updatedRow.sub_asset_type_3,
          updatedRow.sub_asset_type_4,
          updatedRow.sub_asset_type_5,
          updatedRow.sub_asset_type_6
        ],
        [
          updatedRow.sub_asset_size_1,
          updatedRow.sub_asset_size_2,
          updatedRow.sub_asset_size_3,
          updatedRow.sub_asset_size_4,
          updatedRow.sub_asset_size_5,
          updatedRow.sub_asset_size_6
        ]
      ),
      assetValidators.validateAssetType(updatedRow.sub_asset_type_1, 'sub_asset_type_1'),
      assetValidators.validateAssetType(updatedRow.sub_asset_type_2, 'sub_asset_type_2'),
      assetValidators.validateAssetType(updatedRow.sub_asset_type_3, 'sub_asset_type_3'),
      assetValidators.validateAssetType(updatedRow.sub_asset_type_4, 'sub_asset_type_4'),
      assetValidators.validateAssetType(updatedRow.sub_asset_type_5, 'sub_asset_type_5'),
      assetValidators.validateAssetType(updatedRow.sub_asset_type_6, 'sub_asset_type_6'),
    );
    const validation = await validateAll(validations);
    if (!validation.valid) {
      const detailedError = validation.error || 'Unknown validation error';
      updatedRow._validationErrors.set('_row', detailedError);
    } else {
      updatedRow._validationErrors.delete('_row');
    }
    setRowData(prev => {
      const newData = prev.map(row => {
        if (row.id === updatedRow.id) {
          return { ...updatedRow };
        }
        return row;
      });
      return newData;
    });
    if (gridRef.current) {
      setTimeout(() => {
        gridRef.current?.api.refreshCells({ force: true });
      }, 0);
    }
  }, []);
  const handleLoadAssets = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const assets = await api.assets.getLatestOnly();
      const loadedRows: AssetRow[] = assets.map(asset => ({
        id: crypto.randomUUID(),
        _dbId: asset.id,
        _isNew: false,
        building_number: asset.building_number,
        payer_id: asset.payer_id || '',
        asset_id: asset.asset_id,
        measurement_date: '',
        main_asset_type: asset.main_asset_type || '',
        asset_size: asset.asset_size || 0,
        sub_asset_type_1: asset.sub_asset_type_1 || '',
        sub_asset_size_1: asset.sub_asset_size_1 || 0,
        sub_asset_type_2: asset.sub_asset_type_2 || '',
        sub_asset_size_2: asset.sub_asset_size_2 || 0,
        sub_asset_type_3: asset.sub_asset_type_3 || '',
        sub_asset_size_3: asset.sub_asset_size_3 || 0,
        sub_asset_type_4: asset.sub_asset_type_4 || '',
        sub_asset_size_4: asset.sub_asset_size_4 || 0,
        sub_asset_type_5: asset.sub_asset_type_5 || '',
        sub_asset_size_5: asset.sub_asset_size_5 || 0,
        sub_asset_type_6: asset.sub_asset_type_6 || '',
        sub_asset_size_6: asset.sub_asset_size_6 || 0
      }));
      setRowData(loadedRows);
      showToast(`${loadedRows.length} נכסים נטענו בהצלחה. ניתן לערוך ישירות בתאים`, 'success');
    } catch (err) {
      console.error('Error loading assets:', err);
      const errorMsg = err instanceof Error ? err.message : 'שגיאה בטעינת נכסים';
      setError(`שגיאה קריטית: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };
  const handleSaveAll = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const newRows = rowData.filter(row => row._isNew);
      const dirtyRows = rowData.filter(row => row._isDirty && !row._isNew && row._dbId);
      if (newRows.length === 0 && dirtyRows.length === 0) {
        showToast('אין שינויים לשמור. כל הנתונים מעודכנים.', 'info');
        setLoading(false);
        return;
      }
      const rowsWithErrors = rowData.filter(row =>
        (row._isNew || row._isDirty) &&
        row._validationErrors &&
        row._validationErrors.size > 0
      );
      if (rowsWithErrors.length > 0) {
        const errorMsg = `לא ניתן לשמור - יש ${rowsWithErrors.length} שורות עם שגיאות ולידציה.\nאנא תקן את השגיאות לפני השמירה.`;
        throw new Error(errorMsg);
      }
      const invalidRows: string[] = [];
      newRows.forEach((row, index) => {
        const rowNum = index + 1;
        const missing: string[] = [];
        if (!row.building_number) {
          missing.push('מספר בניין');
        }
        if (!row.asset_id) {
          missing.push('זיהוי נכס');
        }
        if (missing.length > 0) {
          invalidRows.push(`שורה חדשה ${rowNum}: חסרים ${missing.join(', ')}`);
        }
      });
      if (invalidRows.length > 0) {
        const errorMsg = `לא ניתן לשמור - שדות חובה חסרים:\n${invalidRows.join('\n')}\n\nאנא מלא את כל השדות הנדרשים (מסומנים בצהוב).`;
        throw new Error(errorMsg);
      }
      const rowsToSave = rowData.filter(row =>
        row._isNew && row.building_number && row.asset_id
      );
      let savedCount = 0;
      const errors: string[] = [];
      const savedAssets: string[] = [];
      for (const row of rowsToSave) {
        try {
          const validation = await validateAll([
            assetValidators.validateBuildingNumber(row.building_number),
            assetValidators.validateAssetId(row.asset_id),
            assetValidators.validatePayerId(row.payer_id),
            assetValidators.validateAssetType(row.main_asset_type, 'main_asset_type'),
            assetValidators.validateMainAssetTypeForBuilding(row.building_number, row.main_asset_type),
            assetValidators.validateMinimumSubAssets([
              row.sub_asset_type_1,
              row.sub_asset_type_2,
              row.sub_asset_type_3,
              row.sub_asset_type_4,
              row.sub_asset_type_5,
              row.sub_asset_type_6
            ]),
            assetValidators.validateSubAssetSizeMatchesMain(
              row.asset_size,
              [
                row.sub_asset_type_1,
                row.sub_asset_type_2,
                row.sub_asset_type_3,
                row.sub_asset_type_4,
                row.sub_asset_type_5,
                row.sub_asset_type_6
              ],
              [
                row.sub_asset_size_1,
                row.sub_asset_size_2,
                row.sub_asset_size_3,
                row.sub_asset_size_4,
                row.sub_asset_size_5,
                row.sub_asset_size_6
              ]
            ),
            assetValidators.validateSubAssetsFor199Or299(
              row.building_number,
              row.main_asset_type,
              row.asset_size,
              [
                row.sub_asset_type_1,
                row.sub_asset_type_2,
                row.sub_asset_type_3,
                row.sub_asset_type_4,
                row.sub_asset_type_5,
                row.sub_asset_type_6
              ],
              [
                row.sub_asset_size_1,
                row.sub_asset_size_2,
                row.sub_asset_size_3,
                row.sub_asset_size_4,
                row.sub_asset_size_5,
                row.sub_asset_size_6
              ]
            ),
            assetValidators.validateAssetType(row.sub_asset_type_1, 'sub_asset_type_1'),
            assetValidators.validateAssetType(row.sub_asset_type_2, 'sub_asset_type_2'),
            assetValidators.validateAssetType(row.sub_asset_type_3, 'sub_asset_type_3'),
            assetValidators.validateAssetType(row.sub_asset_type_4, 'sub_asset_type_4'),
            assetValidators.validateAssetType(row.sub_asset_type_5, 'sub_asset_type_5'),
            assetValidators.validateAssetType(row.sub_asset_type_6, 'sub_asset_type_6'),
          ]);
          if (!validation.valid) {
            const detailedError = validation.error || 'Unknown validation error';
            if (!row._validationErrors) {
              row._validationErrors = new Map<string, string>();
            }
            row._validationErrors.set('_row', detailedError);
            errors.push(`נכס ${row.asset_id} (בניין ${row.building_number}): ${detailedError}`);
            continue;
          }
          const assetData: Omit<Asset, 'id' | 'created_at'> = {
            building_number: row.building_number!,
            payer_id: row.payer_id || null,
            asset_id: row.asset_id,
            measurement_date: row.measurement_date || new Date().toISOString().split('T')[0],
            main_asset_type: row.main_asset_type || undefined,
            asset_size: row.asset_size || 0,
            sub_asset_type_1: row.sub_asset_type_1 || undefined,
            sub_asset_size_1: row.sub_asset_size_1 || 0,
            sub_asset_type_2: row.sub_asset_type_2 || undefined,
            sub_asset_size_2: row.sub_asset_size_2 || 0,
            sub_asset_type_3: row.sub_asset_type_3 || undefined,
            sub_asset_size_3: row.sub_asset_size_3 || 0,
            sub_asset_type_4: row.sub_asset_type_4 || undefined,
            sub_asset_size_4: row.sub_asset_size_4 || 0,
            sub_asset_type_5: row.sub_asset_type_5 || undefined,
            sub_asset_size_5: row.sub_asset_size_5 || 0,
            sub_asset_type_6: row.sub_asset_type_6 || undefined,
            sub_asset_size_6: row.sub_asset_size_6 || 0
          };
          const newAsset = await api.assets.create(assetData);
          row._dbId = newAsset.id;
          row._isNew = false;
          savedCount++;
          savedAssets.push(`נכס ${row.asset_id} בבניין ${row.building_number} - ${row.main_asset_type || 'ללא סוג'}`);
        } catch (err) {
          console.error('Error saving asset:', row.asset_id, err);
          let errorMsg = 'Unknown error';
          if (err instanceof Error) {
            errorMsg = err.message;
            if (err.stack) {
              console.error('Stack trace:', err.stack);
            }
          } else if (typeof err === 'object' && err !== null) {
            console.error('Error object:', err);
            const errObj = err as any;
            if (errObj.code === '23505') {
              errorMsg = 'נכס עם מספר זיהוי זה כבר קיים במערכת. אנא בדוק את מספר הנכס ומספר הבניין.';
            } else {
              errorMsg = JSON.stringify(err, null, 2);
            }
          } else {
            errorMsg = String(err);
          }
          errors.push(`נכס ${row.asset_id} (בניין ${row.building_number}): ${errorMsg}`);
        }
      }
      for (const row of dirtyRows) {
        try {
          const validation = await validateAll([
            assetValidators.validateBuildingNumber(row.building_number),
            assetValidators.validateAssetId(row.asset_id),
            assetValidators.validatePayerId(row.payer_id),
            assetValidators.validateAssetType(row.main_asset_type, 'main_asset_type'),
            assetValidators.validateMainAssetTypeForBuilding(row.building_number, row.main_asset_type),
            assetValidators.validateMinimumSubAssets([
              row.sub_asset_type_1,
              row.sub_asset_type_2,
              row.sub_asset_type_3,
              row.sub_asset_type_4,
              row.sub_asset_type_5,
              row.sub_asset_type_6
            ]),
            assetValidators.validateSubAssetSizeMatchesMain(
              row.asset_size,
              [
                row.sub_asset_type_1,
                row.sub_asset_type_2,
                row.sub_asset_type_3,
                row.sub_asset_type_4,
                row.sub_asset_type_5,
                row.sub_asset_type_6
              ],
              [
                row.sub_asset_size_1,
                row.sub_asset_size_2,
                row.sub_asset_size_3,
                row.sub_asset_size_4,
                row.sub_asset_size_5,
                row.sub_asset_size_6
              ]
            ),
            assetValidators.validateSubAssetsFor199Or299(
              row.building_number,
              row.main_asset_type,
              row.asset_size,
              [
                row.sub_asset_type_1,
                row.sub_asset_type_2,
                row.sub_asset_type_3,
                row.sub_asset_type_4,
                row.sub_asset_type_5,
                row.sub_asset_type_6
              ],
              [
                row.sub_asset_size_1,
                row.sub_asset_size_2,
                row.sub_asset_size_3,
                row.sub_asset_size_4,
                row.sub_asset_size_5,
                row.sub_asset_size_6
              ]
            ),
            assetValidators.validateAssetType(row.sub_asset_type_1, 'sub_asset_type_1'),
            assetValidators.validateAssetType(row.sub_asset_type_2, 'sub_asset_type_2'),
            assetValidators.validateAssetType(row.sub_asset_type_3, 'sub_asset_type_3'),
            assetValidators.validateAssetType(row.sub_asset_type_4, 'sub_asset_type_4'),
            assetValidators.validateAssetType(row.sub_asset_type_5, 'sub_asset_type_5'),
            assetValidators.validateAssetType(row.sub_asset_type_6, 'sub_asset_type_6'),
          ]);
          if (!validation.valid) {
            const detailedError = validation.error || 'Unknown validation error';
            if (!row._validationErrors) {
              row._validationErrors = new Map<string, string>();
            }
            row._validationErrors.set('_row', detailedError);
            errors.push(`נכס ${row.asset_id} (בניין ${row.building_number}): ${detailedError}`);
            continue;
          }
          const updateData: Partial<Asset> = {
            building_number: row.building_number!,
            payer_id: row.payer_id || null,
            asset_id: row.asset_id,
            main_asset_type: row.main_asset_type || null,
            asset_size: row.asset_size || 0,
            sub_asset_type_1: row.sub_asset_type_1 || null,
            sub_asset_size_1: row.sub_asset_size_1 || 0,
            sub_asset_type_2: row.sub_asset_type_2 || null,
            sub_asset_size_2: row.sub_asset_size_2 || 0,
            sub_asset_type_3: row.sub_asset_type_3 || null,
            sub_asset_size_3: row.sub_asset_size_3 || 0,
            sub_asset_type_4: row.sub_asset_type_4 || null,
            sub_asset_size_4: row.sub_asset_size_4 || 0,
            sub_asset_type_5: row.sub_asset_type_5 || null,
            sub_asset_size_5: row.sub_asset_size_5 || 0,
            sub_asset_type_6: row.sub_asset_type_6 || null,
            sub_asset_size_6: row.sub_asset_size_6 || 0
          };
          await api.assets.update(row._dbId!, updateData);
          row._isDirty = false;
          row._dirtyFields = new Set<string>();
          savedCount++;
          savedAssets.push(`נכס ${row.asset_id} בבניין ${row.building_number} - עודכן`);
        } catch (err) {
          console.error('Error updating asset:', row.asset_id, err);
          let errorMsg = 'Unknown error';
          if (err instanceof Error) {
            errorMsg = err.message;
          } else if (typeof err === 'object' && err !== null) {
            const errObj = err as any;
            if (errObj.code === '23505') {
              errorMsg = 'נכס עם מספר זיהוי זה כבר קיים במערכת. אנא בדוק את מספר הנכס ומספר הבניין.';
            } else {
              errorMsg = JSON.stringify(err, null, 2);
            }
          } else {
            errorMsg = String(err);
          }
          errors.push(`נכס ${row.asset_id} (בניין ${row.building_number}): ${errorMsg}`);
        }
      }
      setRowData(prev => [...prev]);
      if (gridRef.current) {
        gridRef.current.api.refreshCells({ force: true });
      }
      if (errors.length > 0) {
        const errorDetails = errors.join('\n');
        if (savedCount > 0) {
          const savedList = savedAssets.join('\n');
          showToast(`פעולה הסתיימה בהצלחה:\n${savedList}`, 'success');
          showToast(`${errors.length} נכשלו:\n${errorDetails}`, 'error');
        } else {
          showToast(`כל השמירות נכשלו:\n${errorDetails}`, 'error');
        }
      } else {
        const savedList = savedAssets.join('\n');
        showToast(`פעולה הסתיימה בהצלחה:\n${savedList}`, 'success');
      }
      setRowData(prev => prev.filter(row => !row._isNew || !row.building_number || !row.asset_id));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'שגיאה בשמירת נכסים';
      showToast(`שגיאה קריטית: ${errorMsg}`, 'error');
    } finally {
      setLoading(false);
    }
  };
  const handleAddNewMeasurement = useCallback(async (rowId: string) => {
    const row = rowData.find(r => r.id === rowId);
    if (!row || row._isNew) {
      showToast('יש לשמור את הנכס לפני הוספת מדידה חדשה', 'error');
      return;
    }
    try {
      setLoading(true);
      // Create new measurement with current date
      const newMeasurementData = {
        building_number: row.building_number!,
        payer_id: row.payer_id || undefined,
        asset_id: row.asset_id,
        measurement_date: new Date().toISOString().split('T')[0],
        main_asset_type: row.main_asset_type,
        asset_size: row.asset_size,
        sub_asset_type_1: row.sub_asset_type_1 || undefined,
        sub_asset_size_1: row.sub_asset_size_1 || 0,
        sub_asset_type_2: row.sub_asset_type_2 || undefined,
        sub_asset_size_2: row.sub_asset_size_2 || 0,
        sub_asset_type_3: row.sub_asset_type_3 || undefined,
        sub_asset_size_3: row.sub_asset_size_3 || 0,
        sub_asset_type_4: row.sub_asset_type_4 || undefined,
        sub_asset_size_4: row.sub_asset_size_4 || 0,
        sub_asset_type_5: row.sub_asset_type_5 || undefined,
        sub_asset_size_5: row.sub_asset_size_5 || 0,
        sub_asset_type_6: row.sub_asset_type_6 || undefined,
        sub_asset_size_6: row.sub_asset_size_6 || 0
      };
      const newAsset = await api.assets.create(newMeasurementData);
      // Add the new measurement to the grid
      const newRow: AssetRow = {
        id: `temp-${Date.now()}`,
        building_number: newAsset.building_number,
        payer_id: newAsset.payer_id || '',
        asset_id: newAsset.asset_id,
        measurement_date: newAsset.measurement_date,
        main_asset_type: newAsset.main_asset_type || '',
        asset_size: newAsset.asset_size || 0,
        sub_asset_type_1: newAsset.sub_asset_type_1 || '',
        sub_asset_size_1: newAsset.sub_asset_size_1 || 0,
        sub_asset_type_2: newAsset.sub_asset_type_2 || '',
        sub_asset_size_2: newAsset.sub_asset_size_2 || 0,
        sub_asset_type_3: newAsset.sub_asset_type_3 || '',
        sub_asset_size_3: newAsset.sub_asset_size_3 || 0,
        sub_asset_type_4: newAsset.sub_asset_type_4 || '',
        sub_asset_size_4: newAsset.sub_asset_size_4 || 0,
        sub_asset_type_5: newAsset.sub_asset_type_5 || '',
        sub_asset_size_5: newAsset.sub_asset_size_5 || 0,
        sub_asset_type_6: newAsset.sub_asset_type_6 || '',
        sub_asset_size_6: newAsset.sub_asset_size_6 || 0,
        _isNew: false,
        _dbId: newAsset.id
      };
      setRowData(prev => [...prev, newRow]);
      showToast('מדידה חדשה נוספה בהצלחה', 'success');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'שגיאה בהוספת מדידה חדשה';
      showToast(`שגיאה: ${errorMsg}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [rowData, showToast]);
  const handleDeleteRow = useCallback(async (rowId: string) => {
    const row = rowData.find(r => r.id === rowId);
    if (!row) return;
    // If this is a new row (not saved to DB), just remove it from the grid
    if (row._isNew) {
      setRowData(prev => {
        const filtered = prev.filter(r => r.id !== rowId);
        return filtered.length > 0 ? filtered : [createEmptyRow()];
      });
      return;
    }
    // For existing DB rows, ask for confirmation
    const confirmed = window.confirm(
      `האם אתה בטוח שברצונך למחוק נכס ${row.asset_id} בבניין ${row.building_number}?\nפעולה זו תמחק את הנכס מהמסד נתונים ולא ניתן לבטלה.`
    );
    if (!confirmed) return;
    try {
      setLoading(true);
      // Delete from database using _dbId
      if (row._dbId) {
        await api.assets.delete(row._dbId);
        showToast('הנכס נמחק בהצלחה', 'success');
        // Remove from grid
        setRowData(prev => {
          const filtered = prev.filter(r => r.id !== rowId);
          return filtered.length > 0 ? filtered : [createEmptyRow()];
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'שגיאה במחיקת נכס';
      showToast(`שגיאה במחיקה: ${errorMsg}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [rowData, showToast]);
  const handleDownloadTemplate = () => {
    const headers = [
      'מספר בניין',
      'זיהוי משלם',
      'זיהוי נכס',
      'תאריך מדידה',
      'סוג נכס ראשי',
      'גודל נכס ראשי',
      'סוג נכס משנה 1',
      'גודל נכס משנה 1',
      'סוג נכס משנה 2',
      'גודל נכס משנה 2',
      'סוג נכס משנה 3',
      'גודל נכס משנה 3',
      'סוג נכס משנה 4',
      'גודל נכס משנה 4',
      'סוג נכס משנה 5',
      'גודל נכס משנה 5',
      'סוג נכס משנה 6',
      'גודל נכס משנה 6'
    ];
    const csvContent = '\uFEFF' + headers.join(',');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'תבנית_נכסים.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const parseCSV = (text: string): string[][] => {
    const lines = text.split('\n');
    const result: string[][] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      result.push(values);
    }
    return result;
  };
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = parseCSV(text);
        if (lines.length === 0) {
          throw new Error('קובץ CSV ריק');
        }
        const headers = lines[0].map(h => h.trim());
        const newRows: AssetRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i];
          if (values.length === 0 || values.every(v => !v)) continue;
          const row: AssetRow = {
            id: `new_${Date.now()}_${Math.random()}_${i}`,
            building_number: null,
            payer_id: '',
            asset_id: '',
            measurement_date: '',
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
            _isNew: true
          };
          headers.forEach((header, index) => {
            const value = values[index] || '';
            const headerLower = header.toLowerCase();
            switch (header) {
              case 'building_number':
              case 'מבנה':
              case 'מספר בניין':
              case 'מספר בנין':
                row.building_number = value ? parseInt(value) : null;
                break;
              case 'payer_id':
              case 'זיהוי משלם':
                row.payer_id = value;
                break;
              case 'asset_id':
              case 'נכס':
              case 'זיהוי נכס':
                row.asset_id = value;
                break;
              case 'measurement_date':
              case 'תאריך מדידה':
                row.measurement_date = value || '';
                break;
              case 'main_asset_type':
              case 'סוג נכס':
              case 'סוג נכס ראשי':
                row.main_asset_type = value;
                break;
              case 'asset_size':
              case 'גודל נכס':
              case 'גודל נכס ראשי':
                row.asset_size = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_1':
              case 'נכס משנה 1':
              case 'סוג נכס משנה 1':
                row.sub_asset_type_1 = value;
                break;
              case 'sub_asset_size_1':
              case 'גודל נכס משנה 1':
                row.sub_asset_size_1 = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_2':
              case 'נכס משנה 2':
              case 'סוג נכס משנה 2':
                row.sub_asset_type_2 = value;
                break;
              case 'sub_asset_size_2':
              case 'גודל נכס משנה 2':
                row.sub_asset_size_2 = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_3':
              case 'נכס משנה 3':
              case 'סוג נכס משנה 3':
                row.sub_asset_type_3 = value;
                break;
              case 'sub_asset_size_3':
              case 'גודל נכס משנה 3':
                row.sub_asset_size_3 = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_4':
              case 'נכס משנה 4':
              case 'סוג נכס משנה 4':
                row.sub_asset_type_4 = value;
                break;
              case 'sub_asset_size_4':
              case 'גודל נכס משנה 4':
                row.sub_asset_size_4 = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_5':
              case 'נכס משנה 5':
              case 'סוג נכס משנה 5':
                row.sub_asset_type_5 = value;
                break;
              case 'sub_asset_size_5':
              case 'גודל נכס משנה 5':
                row.sub_asset_size_5 = value ? parseFloat(value) : 0;
                break;
              case 'sub_asset_type_6':
              case 'נכס משנה 6':
              case 'סוג נכס משנה 6':
              case 'סוג נכס משני 6':
                row.sub_asset_type_6 = value;
                break;
              case 'sub_asset_size_6':
              case 'גודל נכס משנה 6':
              case 'גודל נכסי משני 6':
                row.sub_asset_size_6 = value ? parseFloat(value) : 0;
                break;
            }
          });
          newRows.push(row);
        }
        if (newRows.length === 0) {
          throw new Error('לא נמצאו שורות נתונים תקינות ב-CSV');
        }
        const existingAssets = await api.assets.getAll();
        const existingMap = new Map<string, Asset>();
        existingAssets.forEach(asset => {
          const key = `${asset.building_number}-${asset.asset_id}`;
          existingMap.set(key, asset);
        });
        newRows.forEach(row => {
          const key = `${row.building_number}-${row.asset_id}`;
          const existing = existingMap.get(key);
          if (existing) {
            row._isNew = false;
            row._dbId = existing.id;
            row.id = existing.id;
          }
          row._isDirty = true;
        });
        if (validateBeforeImport) {
          const validationErrors: string[] = [];
          for (let i = 0; i < newRows.length; i++) {
            const row = newRows[i];
            const rowNum = i + 2;
            try {
              const validation = await validateAll([
                assetValidators.validateBuildingNumber(row.building_number),
                assetValidators.validateAssetId(row.asset_id),
                assetValidators.validateAssetType(row.main_asset_type, 'main_asset_type'),
                assetValidators.validateMainAssetTypeForBuilding(row.building_number, row.main_asset_type),
                assetValidators.validateSubAssetSizeMatchesMain(
                  row.asset_size,
                  [
                    row.sub_asset_type_1,
                    row.sub_asset_type_2,
                    row.sub_asset_type_3,
                    row.sub_asset_type_4,
                    row.sub_asset_type_5,
                    row.sub_asset_type_6
                  ],
                  [
                    row.sub_asset_size_1,
                    row.sub_asset_size_2,
                    row.sub_asset_size_3,
                    row.sub_asset_size_4,
                    row.sub_asset_size_5,
                    row.sub_asset_size_6
                  ]
                ),
                assetValidators.validateSubAssetsFor199Or299(
                  row.building_number,
                  row.main_asset_type,
                  row.asset_size,
                  [
                    row.sub_asset_type_1,
                    row.sub_asset_type_2,
                    row.sub_asset_type_3,
                    row.sub_asset_type_4,
                    row.sub_asset_type_5,
                    row.sub_asset_type_6
                  ],
                  [
                    row.sub_asset_size_1,
                    row.sub_asset_size_2,
                    row.sub_asset_size_3,
                    row.sub_asset_size_4,
                    row.sub_asset_size_5,
                    row.sub_asset_size_6
                  ]
                ),
                assetValidators.validateAssetType(row.sub_asset_type_1, 'sub_asset_type_1'),
                assetValidators.validateAssetType(row.sub_asset_type_2, 'sub_asset_type_2'),
                assetValidators.validateAssetType(row.sub_asset_type_3, 'sub_asset_type_3'),
                assetValidators.validateAssetType(row.sub_asset_type_4, 'sub_asset_type_4'),
                assetValidators.validateAssetType(row.sub_asset_type_5, 'sub_asset_type_5'),
                assetValidators.validateAssetType(row.sub_asset_type_6, 'sub_asset_type_6'),
              ]);
              if (!validation.valid) {
                validationErrors.push(`שורה ${rowNum} (נכס ${row.asset_id}): ${validation.error}`);
              }
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : 'שגיאת ולידציה';
              validationErrors.push(`שורה ${rowNum} (נכס ${row.asset_id}): ${errorMsg}`);
            }
          }
          setRowData(newRows);
          setImportValidationErrors(validationErrors);
          const newCount = newRows.filter(r => r._isNew).length;
          const updateCount = newRows.length - newCount;
          if (validationErrors.length > 0) {
            showToast(`יובאו ${newRows.length} שורות מ-CSV (${newCount} חדשות, ${updateCount} עדכון, ${validationErrors.length} עם שגיאות)`, 'info');
          } else {
            showToast(`יובאו ${newRows.length} שורות מ-CSV (${newCount} חדשות, ${updateCount} עדכון, כולן תקינות)`, 'success');
          }
        } else {
          setRowData(newRows);
          setImportValidationErrors([]);
          const newCount = newRows.filter(r => r._isNew).length;
          const updateCount = newRows.length - newCount;
          showToast(`יובאו ${newRows.length} שורות מ-CSV (${newCount} חדשות, ${updateCount} עדכון, ללא ולידציה)`, 'info');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'שגיאה בפענוח קובץ CSV');
      }
    };
    reader.onerror = () => {
      setError('שגיאה בקריאת קובץ');
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const getCellStyle = (params: any, fieldName: string, isRequired: boolean = false) => {
    const row = params.data as AssetRow;
    const isDirty = row._dirtyFields?.has(fieldName);
    const hasValidationError = row._validationErrors && row._validationErrors.size > 0;
    if (hasValidationError) {
      return {
        backgroundColor: '#fee2e2',
        border: '2px solid #ef4444',
        fontWeight: isDirty ? 'bold' : 'normal'
      };
    }
    if (isDirty) {
      return {
        backgroundColor: '#fef3c7',
        fontWeight: 'bold'
      };
    }
    if (isRequired) {
      return { backgroundColor: '#fff9e6' };
    }
    return {};
  };
  const columnDefs: ColDef<AssetRow>[] = useMemo(() => [
    {
      field: 'building_number',
      headerName: t('buildingNumber'),
      width: 140,
      minWidth: 140,
      editable: true,
      cellStyle: (params) => getCellStyle(params, 'building_number', true),
      valueFormatter: (params) => {
        if (!params.value) return '';
        const str = String(params.value);
        return str.length > 15 ? str.substring(0, 15) + '...' : str;
      }
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
      field: 'asset_id',
      headerName: t('assetId'),
      width: 120,
      minWidth: 120,
      editable: true,
      cellStyle: (params) => getCellStyle(params, 'asset_id', true)
    },
    {
      field: 'measurement_date',
      headerName: 'תאריך מדידה',
      width: 130,
      minWidth: 130,
      editable: true,
      valueFormatter: (params) => {
        if (!params.value) return '';
        const date = new Date(params.value);
        if (isNaN(date.getTime())) return params.value;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      },
      valueParser: (params) => {
        const value = params.newValue;
        if (!value) return '';
        if (value.includes('/')) {
          const parts = value.split('/');
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
          }
        }
        return value;
      },
      cellStyle: (params) => getCellStyle(params, 'measurement_date', false)
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
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
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
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
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
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
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
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
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
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
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
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
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
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '',
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_6', false)
    },
    {
      headerName: '',
      width: 50,
      minWidth: 50,
      maxWidth: 50,
      editable: false,
      pinned: 'right',
      suppressSizeToFit: true,
      resizable: false,
      cellRenderer: (params: any) => {
        const row = params.data as AssetRow;
        const hasError = row._validationErrors && row._validationErrors.size > 0;
        if (hasError) {
          const errorMessages: string[] = [];
          row._validationErrors.forEach((msg, field) => {
            errorMessages.push(msg);
          });
          return (
            <div className="flex items-center justify-center w-full h-full" title={errorMessages.join(', ')}>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
          );
        }
        return null;
      }
    },
    {
      field: 'actions',
      headerName: t('actions'),
      width: 135,
      minWidth: 135,
      maxWidth: 135,
      pinned: 'right',
      suppressSizeToFit: true,
      resizable: false,
      cellRenderer: (params: any) => {
        const row = params.data as AssetRow;
        return (
          <div className="flex items-center gap-0.5">
            {!row._isNew && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAddNewMeasurement(params.data.id);
                }}
                className="px-1.5 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium whitespace-nowrap"
                title="הוסף מדידה חדשה"
              >
                מדידה חדשה
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteRow(params.data.id);
              }}
              className="p-0.5 hover:bg-red-100 rounded transition-colors"
              title="מחק שורה"
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </button>
          </div>
        );
      }
    }
  ], [t, buildings, assetTypes, handleDeleteRow, handleAddNewMeasurement]);
  const filteredRowData = useMemo(() => {
    if (selectedBuilding === 'all') {
      return rowData;
    }
    return rowData.filter(row => row.building_number === selectedBuilding);
  }, [rowData, selectedBuilding]);
  return (
    <div className="max-w-[95vw] mx-auto px-4 py-2">
      {error && (
        <div className="mb-2 bg-red-50 border-l-4 border-red-500 rounded-lg p-2 max-h-60 overflow-y-auto">
          <p className="text-red-800 text-xs font-medium whitespace-pre-line break-words">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-2 bg-green-50 border-l-4 border-green-500 rounded-lg p-2 max-h-60 overflow-y-auto">
          <p className="text-green-800 text-xs font-medium whitespace-pre-line">{success}</p>
        </div>
      )}
      {importValidationErrors.length > 0 && (
        <div className="mb-2 bg-yellow-50 border-l-4 border-yellow-500 rounded-lg p-2 max-h-40 overflow-y-auto">
          <p className="text-yellow-900 text-xs font-bold mb-1">{t('validationErrors')} ({importValidationErrors.length}):</p>
          <ul className="list-disc list-inside space-y-0.5">
            {importValidationErrors.map((err, idx) => (
              <li key={idx} className="text-yellow-800 text-xs">{err}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 p-1.5">
          <div className="mb-1.5">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              בחר בניין
            </label>
            <input
              type="text"
              list="building-list"
              value={selectedBuilding === 'all' ? '' : selectedBuilding}
              onChange={(e) => {
                const value = e.target.value.trim();
                if (value === '') {
                  setSelectedBuilding('all');
                } else {
                  const num = Number(value);
                  if (!isNaN(num)) {
                    setSelectedBuilding(num);
                  }
                }
              }}
              placeholder="כל הבניינים"
              className="w-full md:w-64 px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
            />
            <datalist id="building-list">
              {buildings.map(building => (
                <option key={building.id} value={building.building_number}>
                  בניין {building.building_number}
                </option>
              ))}
            </datalist>
          </div>
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <div className="flex gap-1.5">
              <button
                onClick={handleLoadAssets}
                disabled={loading}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                טען נכסים קיימים
              </button>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors font-medium shadow-sm"
              >
                <Download className="h-3.5 w-3.5" />
                {t('downloadTemplate')}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium shadow-sm"
              >
                <Upload className="h-3.5 w-3.5" />
                {t('importCSV')}
              </button>
              <button
                onClick={addEmptyRow}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('addRow')}
              </button>
            </div>
            <button
              onClick={handleSaveAll}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-md transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              <Save className="h-3.5 w-3.5" />
              {loading ? t('saving') : t('saveAll')}
            </button>
          </div>
          <div className="flex items-center gap-1.5 pt-1 border-t border-gray-200">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700">
              <input
                type="checkbox"
                checked={validateBeforeImport}
                onChange={(e) => setValidateBeforeImport(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="font-medium">{t('validateOnImport')}</span>
            </label>
          </div>
        </div>
        <div className="ag-theme-alpine" style={{ height: '50vh', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={filteredRowData}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              minWidth: 120,
              cellStyle: { textAlign: 'right' }
            }}
            onCellValueChanged={onCellValueChanged}
            onGridReady={(params) => {
              if (filteredRowData.length > 0) {
                params.api.setFocusedCell(0, 'building_number');
              }
            }}
            singleClickEdit={true}
            stopEditingWhenCellsLoseFocus={true}
            enterNavigatesVertically={true}
            enterNavigatesVerticallyAfterEdit={true}
            enableRtl={true}
            theme="legacy"
          />
        </div>
      </div>
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>{t('tips')}:</strong> לחץ על כל תא לעריכה. שדות מסומנים בצהוב (מספר בניין וזיהוי נכס) נדרשים. זיהוי משלם אופציונלי.
          השתמש ב-Tab או Enter לניווט בין תאים.
        </p>
        <p className="text-sm text-blue-700 mt-2">
          <strong>פורמט CSV:</strong> השתמש בכפתור "הורד תבנית CSV" להורדת קובץ תבנית עם כותרות בעברית.
          הקובץ כולל שדות: מספר בניין, זיהוי משלם, זיהוי נכס, תאריך מדידה (אופציונלי - ברירת המחדל היום), סוג נכס ראשי, גודל נכס ראשי, ו-6 זוגות של סוג וגודל נכס משנה.
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
      />
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
