import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Asset, Building, AssetType } from '../lib/api';
import { assetValidators, validateAll, inputValidators } from '../lib/validation';
import { Save, Plus, Trash2, FileText, AlertCircle, Loader2, X } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent } from 'ag-grid-community';
import { Toast } from './Toast';
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
  penthouse?: string;
  floor?: number;
  discount_type?: string;
  discount_date_from?: string;
  discount_date_to?: string;
  _isNew?: boolean;
  _dbId?: number;
  _isDirty?: boolean;
  _dirtyFields?: Set<string>;
  _validationErrors?: Map<string, string>;
  _originalMeasurementDate?: string;
}
export function AssetDataEntry() {
  const { t } = useTranslation();
  const gridRef = useRef<AgGridReact>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);

  // Helper function to check if an asset type is not_accountable
  const isAssetTypeNotAccountable = useCallback((assetTypeName: string | null | undefined): boolean => {
    if (!assetTypeName || !assetTypes || assetTypes.length === 0) {
      return false;
    }
    
    // Find asset type by name
    const assetType = assetTypes.find(at => at.name === assetTypeName);
    return assetType?.not_accountable === true;
  }, [assetTypes]);

  // Helper function to check if an asset row is not_accountable
  const isAssetRowNotAccountable = useCallback((row: AssetRow): boolean => {
    if (!row || !row.main_asset_type) {
      return false;
    }
    return isAssetTypeNotAccountable(row.main_asset_type);
  }, [isAssetTypeNotAccountable]);

  // Helper function to check if a field should be editable
  // For non-accountable assets, only main_asset_type is editable
  const isFieldEditable = useCallback((params: any, fieldName: string): boolean => {
    if (!params || !params.data) return false;
    const row = params.data as AssetRow;
    
    // For non-accountable assets, only main_asset_type is editable
    if (isAssetRowNotAccountable(row)) {
      return fieldName === 'main_asset_type';
    }
    
    return true; // All fields are editable by default in AssetDataEntry
  }, [isAssetRowNotAccountable]);
  const [rowData, setRowData] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
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
    measurement_date: '01/01/1900',
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
    penthouse: undefined,
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
      assetValidators.validateAssetIdNotInOtherBuilding(updatedRow.asset_id, updatedRow.building_number),
      assetValidators.validatePayerId(updatedRow.payer_id),
      assetValidators.validateAssetType(updatedRow.main_asset_type, 'main_asset_type'),
      assetValidators.validateMainAssetTypeComplete(updatedRow.building_number, updatedRow.main_asset_type, updatedRow.asset_size, updatedRow),
      assetValidators.validateOnlyComplexTypesCanHaveSubAssets(updatedRow.main_asset_type, [
        updatedRow.sub_asset_type_1,
        updatedRow.sub_asset_type_2,
        updatedRow.sub_asset_type_3,
        updatedRow.sub_asset_type_4,
        updatedRow.sub_asset_type_5,
        updatedRow.sub_asset_type_6
      ]),
      assetValidators.validateComplexTypesMustHaveSubAssets(updatedRow.main_asset_type, [
        updatedRow.sub_asset_type_1,
        updatedRow.sub_asset_type_2,
        updatedRow.sub_asset_type_3,
        updatedRow.sub_asset_type_4,
        updatedRow.sub_asset_type_5,
        updatedRow.sub_asset_type_6
      ])
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
      assetValidators.validateAssetTypeRequiresSize(
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
          missing.push('מספר מבנה');
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
      const now = new Date();
      const currentDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      const filteredRowsToSave = rowsToSave.filter(row => {
        const measurementDate = row.measurement_date || currentDate;
        if (row._originalMeasurementDate && row._originalMeasurementDate === measurementDate) {
          return false;
        }
        return true;
      });
      if (filteredRowsToSave.length === 0 && rowsToSave.length > 0) {
        showToast('לא ניתן לשמור - כל השורות כבר קיימות עם אותו תאריך מדידה', 'error');
        setLoading(false);
        return;
      }
      let savedCount = 0;
      const errors: string[] = [];
      const savedAssets: string[] = [];
      for (const row of filteredRowsToSave) {
        try {
          const validation = await validateAll([
            assetValidators.validateBuildingNumber(row.building_number),
            assetValidators.validateAssetId(row.asset_id),
            assetValidators.validatePayerId(row.payer_id),
            assetValidators.validateAssetType(row.main_asset_type, 'main_asset_type'),
            assetValidators.validateMainAssetTypeComplete(row.building_number, row.main_asset_type, row.asset_size, row),
            assetValidators.validateOnlyComplexTypesCanHaveSubAssets(row.main_asset_type, [
              row.sub_asset_type_1,
              row.sub_asset_type_2,
              row.sub_asset_type_3,
              row.sub_asset_type_4,
              row.sub_asset_type_5,
              row.sub_asset_type_6
            ]),
            assetValidators.validateComplexTypesMustHaveSubAssets(row.main_asset_type, [
              row.sub_asset_type_1,
              row.sub_asset_type_2,
              row.sub_asset_type_3,
              row.sub_asset_type_4,
              row.sub_asset_type_5,
              row.sub_asset_type_6
            ]),
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
            errors.push(`נכס ${row.asset_id} (מבנה ${row.building_number}): ${detailedError}`);
            continue;
          }
          // If measurement_date is blank or 01/01/1900, use current date
          let measurementDate = row.measurement_date || '01/01/1900';
          if (measurementDate === '01/01/1900') {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            measurementDate = `${day}/${month}/${year}`;
          }

          const assetData: Omit<Asset, 'id' | 'created_at'> = {
            building_number: row.building_number!,
            payer_id: row.payer_id || null,
            asset_id: row.asset_id,
            measurement_date: measurementDate,
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
            sub_asset_size_6: row.sub_asset_size_6 || 0,
            penthouse: row.penthouse || undefined,
            floor: row.floor || undefined,
            discount_type: row.discount_type || undefined,
            discount_date_from: row.discount_date_from || undefined,
            discount_date_to: row.discount_date_to || undefined
          };
          const newAsset = await api.assets.create(assetData);
          row._dbId = newAsset.id;
          row._isNew = false;
          row._isDirty = false;
          row._dirtyFields = new Set<string>();
          savedCount++;
          savedAssets.push(`נכס ${row.asset_id} במבנה ${row.building_number} - ${row.main_asset_type || 'ללא סוג'}`);
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
              errorMsg = 'נכס עם מספר זיהוי זה כבר קיים במערכת. אנא בדוק את מספר הנכס ומספר המבנה.';
            } else {
              errorMsg = JSON.stringify(err, null, 2);
            }
          } else {
            errorMsg = String(err);
          }
          errors.push(`נכס ${row.asset_id} (מבנה ${row.building_number}): ${errorMsg}`);
        }
      }
      for (const row of dirtyRows) {
        try {
          const validation = await validateAll([
            assetValidators.validateBuildingNumber(row.building_number),
            assetValidators.validateAssetId(row.asset_id),
            assetValidators.validatePayerId(row.payer_id),
            assetValidators.validateAssetType(row.main_asset_type, 'main_asset_type'),
            assetValidators.validateMainAssetTypeComplete(row.building_number, row.main_asset_type, row.asset_size, row),
            assetValidators.validateOnlyComplexTypesCanHaveSubAssets(row.main_asset_type, [
              row.sub_asset_type_1,
              row.sub_asset_type_2,
              row.sub_asset_type_3,
              row.sub_asset_type_4,
              row.sub_asset_type_5,
              row.sub_asset_type_6
            ]),
            assetValidators.validateComplexTypesMustHaveSubAssets(row.main_asset_type, [
              row.sub_asset_type_1,
              row.sub_asset_type_2,
              row.sub_asset_type_3,
              row.sub_asset_type_4,
              row.sub_asset_type_5,
              row.sub_asset_type_6
            ]),
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
            errors.push(`נכס ${row.asset_id} (מבנה ${row.building_number}): ${detailedError}`);
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
            sub_asset_size_6: row.sub_asset_size_6 || 0,
            penthouse: row.penthouse || undefined,
            floor: row.floor || undefined,
            discount_type: row.discount_type || undefined,
            discount_date_from: row.discount_date_from || undefined,
            discount_date_to: row.discount_date_to || undefined
          };
          await api.assets.update(row._dbId!, updateData);
          row._isDirty = false;
          row._dirtyFields = new Set<string>();
          savedCount++;
          savedAssets.push(`נכס ${row.asset_id} במבנה ${row.building_number} - עודכן`);
        } catch (err) {
          console.error('Error updating asset:', row.asset_id, err);
          let errorMsg = 'Unknown error';
          if (err instanceof Error) {
            errorMsg = err.message;
          } else if (typeof err === 'object' && err !== null) {
            const errObj = err as any;
            if (errObj.code === '23505') {
              errorMsg = 'נכס עם מספר זיהוי זה כבר קיים במערכת. אנא בדוק את מספר הנכס ומספר המבנה.';
            } else {
              errorMsg = JSON.stringify(err, null, 2);
            }
          } else {
            errorMsg = String(err);
          }
          errors.push(`נכס ${row.asset_id} (מבנה ${row.building_number}): ${errorMsg}`);
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

    const dateInput = window.prompt('הכנס תאריך מדידה חדש (DD/MM/YYYY):', (() => {
      const now = new Date();
      return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    })());

    if (!dateInput) {
      return;
    }

    try {
      setLoading(true);

      // Comprehensive validation before saving
      const validations = [
        assetValidators.validateBuildingNumber(row.building_number),
        assetValidators.validateAssetId(row.asset_id),
        assetValidators.validatePayerId(row.payer_id),
        assetValidators.validateMainAssetTypeComplete(row.building_number, row.main_asset_type, row.asset_size, row),
      ];

      // Validate sub-asset types if they exist
      if (row.sub_asset_type_1) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(row.building_number, row.sub_asset_type_1, row.sub_asset_size_1, undefined, undefined, row)
        );
      }
      if (row.sub_asset_type_2) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(row.building_number, row.sub_asset_type_2, row.sub_asset_size_2, undefined, undefined, row)
        );
      }
      if (row.sub_asset_type_3) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(row.building_number, row.sub_asset_type_3, row.sub_asset_size_3, undefined, undefined, row)
        );
      }
      if (row.sub_asset_type_4) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(row.building_number, row.sub_asset_type_4, row.sub_asset_size_4, undefined, undefined, row)
        );
      }
      if (row.sub_asset_type_5) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(row.building_number, row.sub_asset_type_5, row.sub_asset_size_5, undefined, undefined, row)
        );
      }
      if (row.sub_asset_type_6) {
        validations.push(
          assetValidators.validateSubAssetTypeComplete(row.building_number, row.sub_asset_type_6, row.sub_asset_size_6, undefined, undefined, row)
        );
      }

      // Validate sub-assets constraints
      validations.push(
        assetValidators.validateOnlyComplexTypesCanHaveSubAssets(row.main_asset_type, [
          row.sub_asset_type_1,
          row.sub_asset_type_2,
          row.sub_asset_type_3,
          row.sub_asset_type_4,
          row.sub_asset_type_5,
          row.sub_asset_type_6
        ]),
        assetValidators.validateComplexTypesMustHaveSubAssets(row.main_asset_type, [
          row.sub_asset_type_1,
          row.sub_asset_type_2,
          row.sub_asset_type_3,
          row.sub_asset_type_4,
          row.sub_asset_type_5,
          row.sub_asset_type_6
        ]),
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
        )
      );

      const validation = await validateAll(validations);
      if (!validation.valid) {
        showToast(`שגיאת ולידציה: ${validation.error}`, 'error');
        setLoading(false);
        return;
      }

      const measurementDate = dateInput;
      const newMeasurementData = {
        building_number: row.building_number!,
        payer_id: row.payer_id || undefined,
        asset_id: row.asset_id,
        measurement_date: measurementDate,
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
        sub_asset_size_6: row.sub_asset_size_6 || 0,
        penthouse: row.penthouse || undefined,
        floor: row.floor || undefined,
        discount_type: row.discount_type || undefined,
        discount_date_from: row.discount_date_from || undefined,
        discount_date_to: row.discount_date_to || undefined
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
        penthouse: newAsset.penthouse || undefined,
        floor: newAsset.floor || undefined,
        discount_type: newAsset.discount_type || undefined,
        discount_date_from: newAsset.discount_date_from || undefined,
        discount_date_to: newAsset.discount_date_to || undefined,
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
      `האם אתה בטוח שברצונך למחוק נכס ${row.asset_id} במבנה ${row.building_number}?\nפעולה זו תמחק את הנכס מהמסד נתונים ולא ניתן לבטלה.`
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
  const getCellStyle = (params: any, fieldName: string, isRequired: boolean = false) => {
    const row = params.data as AssetRow;
    const isDirty = row._dirtyFields?.has(fieldName);
    const hasValidationError = row._validationErrors && row._validationErrors.size > 0;
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
      return { backgroundColor: '#fff9e6', textAlign: 'right' };
    }
    return { textAlign: 'right' };
  };
  const columnDefs: ColDef<AssetRow>[] = useMemo(() => [
    {
      colId: 'actions',
      field: 'actions',
      headerName: t('actions'),
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: any) => {
        const row = params.data as AssetRow;
        const hasError = row._validationErrors && row._validationErrors.size > 0;
        const errorMessages: string[] = [];
        if (hasError) {
          row._validationErrors.forEach((msg, field) => {
            errorMessages.push(msg);
          });
        }

        return (
          <div className="flex items-center gap-2 w-full px-2">
            {hasError && (
              <div className="flex items-center justify-center" title={errorMessages.join(', ')}>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddNewMeasurement(params.data.id);
              }}
              disabled={loading}
              className={`px-2 py-1 text-xs rounded transition-colors font-medium whitespace-nowrap ${
                loading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title="הוסף מדידה חדשה"
            >
              מדידה חדשה
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteRow(params.data.id);
              }}
              className="p-1 hover:bg-red-100 rounded transition-colors"
              title="מחק שורה"
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </button>
          </div>
        );
      }
    },
    {
      field: 'building_number',
      headerName: t('buildingNumber'),
      width: 120,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
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
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'payer_id', false)
    },
    {
      colId: 'penthouse',
      field: 'penthouse',
      headerName: 'דירת גג',
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      width: 60,
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
        const baseStyle = getCellStyle(params, 'penthouse', false);
        return { ...baseStyle, textAlign: 'center' };
      },
      headerClass: 'text-center'
    },
    {
      field: 'floor',
      headerName: 'קומה',
      width: 80,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueParser: (params) => {
        if (!params.newValue || params.newValue === '') return null;
        const num = parseInt(params.newValue, 10);
        return isNaN(num) ? null : num;
      },
      cellStyle: (params) => getCellStyle(params, 'floor', false)
    },
    {
      field: 'discount_type',
      headerName: 'סוג הנחה',
      width: 100,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'discount_type', false)
    },
    {
      field: 'discount_date_from',
      headerName: 'תאריך הנחה מ',
      width: 120,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'discount_date_from', false)
    },
    {
      field: 'discount_date_to',
      headerName: 'תאריך הנחה עד',
      width: 120,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'discount_date_to', false)
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      width: 120,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellStyle: (params) => getCellStyle(params, 'asset_id', true)
    },
    {
      field: 'measurement_date',
      headerName: 'תאריך מדידה',
      width: 120,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      cellEditor: 'agTextCellEditor',
      cellEditorParams: {
        maxLength: 10,
      },
      valueFormatter: (params) => params.value === '01/01/1900' ? '' : params.value,
      valueParser: (params) => {
        const value = params.newValue;
        if (!value) return '01/01/1900';
        // Allow only digits and forward slashes, max 10 chars
        const cleaned = value.replace(/[^\d/]/g, '').substring(0, 10);
        return cleaned;
      },
      comparator: (valueA: string, valueB: string) => {
        // Parse DD/MM/YYYY to comparable format
        const parseDate = (dateStr: string): number => {
          if (!dateStr) return 0;
          const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (!match) return 0;
          const day = parseInt(match[1], 10);
          const month = parseInt(match[2], 10);
          const year = parseInt(match[3], 10);
          return new Date(year, month - 1, day).getTime();
        };

        const dateA = parseDate(valueA);
        const dateB = parseDate(valueB);

        if (dateA === 0 && dateB === 0) return 0;
        if (dateA === 0) return -1;
        if (dateB === 0) return 1;

        return dateA - dateB;
      },
      cellStyle: (params) => getCellStyle(params, 'measurement_date', false)
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 60,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
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
      width: 80,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: (params) => getCellStyle(params, 'asset_size', false)
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 60,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
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
      width: 80,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_1', false)
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 60,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
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
      width: 80,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_2', false)
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      width: 60,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
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
      width: 80,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_3', false)
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      width: 60,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
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
      width: 80,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_4', false)
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      width: 60,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
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
      width: 80,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_5', false)
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      width: 60,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
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
      width: 80,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null || params.value === '') return '';
        const num = typeof params.value === 'number' ? params.value : parseFloat(params.value);
        if (isNaN(num) || num === 0) return '';
        return num.toFixed(2);
      },
      cellStyle: (params) => getCellStyle(params, 'sub_asset_size_6', false)
    },
    {
      field: 'extra_field_1',
      headerName: '',
      width: 120,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'extra_field_2',
      headerName: '',
      width: 120,
      editable: (params) => {
        const fieldName = params.colDef?.field || '';
        return isFieldEditable(params, fieldName);
      },
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    }
  ], [t, buildings, assetTypes, getCellStyle]);
  const filteredRowData = useMemo(() => {
    if (selectedBuilding === 'all') {
      return rowData;
    }
    return rowData.filter(row => row.building_number === selectedBuilding);
  }, [rowData, selectedBuilding]);
  return (
    <div className="max-w-[95vw] mx-auto px-4 py-2 relative">
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-2xl flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
            <p className="text-gray-700 font-medium text-lg">מעבד נתונים...</p>
          </div>
        </div>
      )}
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
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 p-1.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                בחר מבנה
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
                placeholder="כל המבנים"
                className="w-full md:w-64 px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
              />
              <datalist id="building-list">
                {buildings.map(building => (
                  <option key={building.building_number} value={building.building_number}>
                    מבנה {building.building_number}
                  </option>
                ))}
              </datalist>
            </div>
            <span className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded font-semibold whitespace-nowrap">
              סך הכל: {filteredRowData.length} נכסים
            </span>
          </div>
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={addEmptyRow}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('addRow')}
              </button>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setRowData(JSON.parse(JSON.stringify(originalRowData)));
                  showToast('השינויים בוטלו', 'info');
                }}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                <X className="h-3.5 w-3.5" />
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-md transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {loading ? t('saving') : t('saveAll')}
              </button>
            </div>
          </div>
        </div>
        <div className="ag-theme-alpine" style={{ height: '60vh', width: '100%', overflowX: 'auto' }}>
          <AgGridReact
            ref={gridRef}
            rowData={filteredRowData}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              wrapText: true,
              autoHeight: false,
              cellStyle: { textAlign: 'right' },
              minWidth: 100
            }}
            gridOptions={{
              suppressColumnVirtualisation: true,
              alwaysShowHorizontalScroll: true,
            }}
            onCellValueChanged={onCellValueChanged}
            onGridReady={async (params) => {
              if (filteredRowData.length > 0) {
                params.api.setFocusedCell(0, 'building_number');
              }
            }}
            onFirstDataRendered={async (params) => {
            }}
            onColumnResized={() => {}}
            onColumnMoved={(params) => {
              // Prevent actions column from being moved - force it back to first position
              const actionsColumn = params.columnApi.getColumn('actions');
              if (actionsColumn) {
                const allColumns = params.columnApi.getAllColumns() || [];
                const actionsIndex = allColumns.findIndex(col => col.getColId() === 'actions');
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
            }}
            onSortChanged={() => {}}
            singleClickEdit={true}
            stopEditingWhenCellsLoseFocus={true}
            enterNavigatesVertically={true}
            enterNavigatesVerticallyAfterEdit={true}
            suppressScrollOnNewData={true}
            enableRtl={true}
            theme="legacy"
          />
        </div>
      </div>
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>{t('tips')}:</strong> לחץ על כל תא לעריכה. שדות מסומנים בצהוב (מספר מבנה וזיהוי נכס) נדרשים. זיהוי משלם אופציונלי.
          השתמש ב-Tab או Enter לניווט בין תאים.
        </p>
      </div>
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
