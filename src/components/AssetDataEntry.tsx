import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Asset, Building, AssetType } from '../lib/api';
import { assetValidators, validateAll } from '../lib/validation';
import { Save, Plus, Trash2, Upload, Download, RefreshCw } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface AssetRow {
  id: string;
  building_number: number | null;
  payer_id: string;
  asset_id: string;
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
  total_size: number;
  _isNew?: boolean;
  _dbId?: string;
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
  const [validateBeforeImport, setValidateBeforeImport] = useState(true);
  const [importValidationErrors, setImportValidationErrors] = useState<string[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<number | 'all'>('all');

  useEffect(() => {
    fetchBuildings();
    fetchAssetTypes();
    addEmptyRow();
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
    total_size: 0,
    _isNew: true
  });

  const addEmptyRow = () => {
    setRowData(prev => [...prev, createEmptyRow()]);
  };

  const calculateTotalSize = (row: AssetRow): number => {
    return (
      (row.asset_size || 0) +
      (row.sub_asset_size_1 || 0) +
      (row.sub_asset_size_2 || 0) +
      (row.sub_asset_size_3 || 0) +
      (row.sub_asset_size_4 || 0) +
      (row.sub_asset_size_5 || 0) +
      (row.sub_asset_size_6 || 0)
    );
  };

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const updatedRow = event.data as AssetRow;
    updatedRow.total_size = calculateTotalSize(updatedRow);

    setRowData(prev =>
      prev.map(row => row.id === updatedRow.id ? updatedRow : row)
    );

    if (gridRef.current) {
      gridRef.current.api.refreshCells({ force: true });
    }

    if (updatedRow._dbId && !updatedRow._isNew) {
      try {
        const field = event.column?.getColId();
        if (!field) return;

        const updateData: Partial<Asset> = {
          building_number: updatedRow.building_number!,
          payer_id: updatedRow.payer_id || null,
          asset_id: updatedRow.asset_id,
          main_asset_type: updatedRow.main_asset_type || null,
          asset_size: updatedRow.asset_size || 0,
          sub_asset_type_1: updatedRow.sub_asset_type_1 || null,
          sub_asset_size_1: updatedRow.sub_asset_size_1 || 0,
          sub_asset_type_2: updatedRow.sub_asset_type_2 || null,
          sub_asset_size_2: updatedRow.sub_asset_size_2 || 0,
          sub_asset_type_3: updatedRow.sub_asset_type_3 || null,
          sub_asset_size_3: updatedRow.sub_asset_size_3 || 0,
          sub_asset_type_4: updatedRow.sub_asset_type_4 || null,
          sub_asset_size_4: updatedRow.sub_asset_size_4 || 0,
          sub_asset_type_5: updatedRow.sub_asset_type_5 || null,
          sub_asset_size_5: updatedRow.sub_asset_size_5 || 0,
          sub_asset_type_6: updatedRow.sub_asset_type_6 || null,
          sub_asset_size_6: updatedRow.sub_asset_size_6 || 0,
          total_size: updatedRow.total_size
        };

        await api.assets.update(updatedRow._dbId, updateData);
        setSuccess(`נכס ${updatedRow.asset_id} עודכן בהצלחה`);
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        console.error('Error updating asset:', err);
        let errorMsg = 'שגיאה בעדכון';

        if (err instanceof Error) {
          errorMsg = err.message;
        } else if (typeof err === 'object' && err !== null) {
          const errObj = err as any;
          if (errObj.code === '23505') {
            errorMsg = 'נכס עם מספר זיהוי זה כבר קיים במערכת. אנא בדוק את מספר הנכס ומספר הבניין.';
          } else {
            errorMsg = JSON.stringify(err);
          }
        }

        setError(`שגיאה בעדכון נכס ${updatedRow.asset_id}: ${errorMsg}`);
        setTimeout(() => setError(null), 5000);
      }
    }
  }, []);

  const handleLoadAssets = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const assets = await api.assets.getAll();

      const loadedRows: AssetRow[] = assets.map(asset => ({
        id: crypto.randomUUID(),
        _dbId: asset.id,
        _isNew: false,
        building_number: asset.building_number,
        payer_id: asset.payer_id || '',
        asset_id: asset.asset_id,
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
        sub_asset_size_6: asset.sub_asset_size_6 || 0,
        total_size: asset.total_size || 0
      }));

      setRowData(loadedRows);
      setSuccess(`${loadedRows.length} נכסים נטענו בהצלחה. ניתן לערוך ישירות בתאים`);
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

      if (newRows.length === 0) {
        throw new Error('אין שורות חדשות לשמור. אנא הוסף שורות חדשות באמצעות כפתור "הוסף שורה".');
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
          invalidRows.push(`שורה ${rowNum}: חסרים ${missing.join(', ')}`);
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
            errors.push(`נכס ${row.asset_id} (בניין ${row.building_number}): ${detailedError}`);
            continue;
          }

          const assetData: Omit<Asset, 'id' | 'created_at'> = {
            building_number: row.building_number!,
            payer_id: row.payer_id || null,
            asset_id: row.asset_id,
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
            total_size: row.total_size
          };

          const newAsset = await api.assets.create(assetData);
          row._dbId = newAsset.id;
          row._isNew = false;
          savedCount++;
          savedAssets.push(`נכס ${row.asset_id} בבניין ${row.building_number} - ${row.main_asset_type || 'ללא סוג'} (${row.total_size} מ"ר)`);
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

      if (errors.length > 0) {
        const errorDetails = errors.join('\n');
        if (savedCount > 0) {
          const savedList = savedAssets.join('\n');
          setSuccess(`${savedCount} נכסים נוצרו בהצלחה:\n${savedList}`);
          setError(`${errors.length} נכשלו:\n${errorDetails}`);
        } else {
          setError(`כל השמירות נכשלו:\n${errorDetails}`);
        }
      } else {
        const savedList = savedAssets.join('\n');
        setSuccess(`${savedCount} נכסים נוצרו בהצלחה:\n${savedList}`);
      }

      setRowData(prev => prev.filter(row => !row._isNew || !row.building_number || !row.asset_id));
      if (rowData.every(row => row._dbId)) {
        addEmptyRow();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'שגיאה בשמירת נכסים';
      setError(`שגיאה קריטית: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRow = useCallback((rowId: string) => {
    setRowData(prev => {
      const filtered = prev.filter(row => row.id !== rowId);
      return filtered.length > 0 ? filtered : [createEmptyRow()];
    });
  }, []);

  const handleDownloadTemplate = () => {
    const headers = [
      'מספר בניין',
      'זיהוי משלם',
      'זיהוי נכס',
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
            total_size: 0,
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

          row.total_size = calculateTotalSize(row);
          newRows.push(row);
        }

        if (newRows.length === 0) {
          throw new Error('לא נמצאו שורות נתונים תקינות ב-CSV');
        }

        if (validateBeforeImport) {
          const validationErrors: string[] = [];
          const validRows: AssetRow[] = [];

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
              } else {
                validRows.push(row);
              }
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : 'שגיאת ולידציה';
              validationErrors.push(`שורה ${rowNum} (נכס ${row.asset_id}): ${errorMsg}`);
            }
          }

          if (validationErrors.length > 0) {
            setImportValidationErrors(validationErrors);
            setError(`נמצאו ${validationErrors.length} שגיאות ולידציה. ${validRows.length} שורות תקינות יובאו.`);
            setRowData(validRows.length > 0 ? validRows : [createEmptyRow()]);
            setSuccess(validRows.length > 0 ? `${validRows.length} שורות תקינות יובאו (${validationErrors.length} נכשלו)` : null);
          } else {
            setRowData(newRows);
            setImportValidationErrors([]);
            setSuccess(`יובאו ${newRows.length} שורות מ-CSV (כולן תקינות)`);
          }
        } else {
          setRowData(newRows);
          setImportValidationErrors([]);
          setSuccess(`יובאו ${newRows.length} שורות מ-CSV (ללא ולידציה)`);
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

  const columnDefs: ColDef<AssetRow>[] = useMemo(() => [
    {
      headerName: '',
      width: 60,
      pinned: 'left',
      cellRenderer: (params: any) => {
        return (
          <button
            onClick={() => handleDeleteRow(params.data.id)}
            className="p-1 hover:bg-red-100 rounded transition-colors"
            title="מחק שורה"
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </button>
        );
      }
    },
    {
      field: 'total_size',
      headerName: t('totalSize'),
      width: 130,
      editable: false,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00',
      cellStyle: { backgroundColor: '#e6f7ff', fontWeight: 'bold' }
    },
    {
      field: 'sub_asset_size_6',
      headerName: t('subAssetSize6'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_6',
      headerName: t('subAssetType6'),
      width: 300,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes)
    },
    {
      field: 'sub_asset_size_5',
      headerName: t('subAssetSize5'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_5',
      headerName: t('subAssetType5'),
      width: 300,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes)
    },
    {
      field: 'sub_asset_size_4',
      headerName: t('subAssetSize4'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_4',
      headerName: t('subAssetType4'),
      width: 300,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes)
    },
    {
      field: 'sub_asset_size_3',
      headerName: t('subAssetSize3'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_3',
      headerName: t('subAssetType3'),
      width: 300,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes)
    },
    {
      field: 'sub_asset_size_2',
      headerName: t('subAssetSize2'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_2',
      headerName: t('subAssetType2'),
      width: 300,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes)
    },
    {
      field: 'sub_asset_size_1',
      headerName: t('subAssetSize1'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'sub_asset_type_1',
      headerName: t('subAssetType1'),
      width: 300,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes)
    },
    {
      field: 'asset_size',
      headerName: t('mainAssetSize'),
      width: 130,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value ? params.value.toFixed(2) : '0.00'
    },
    {
      field: 'main_asset_type',
      headerName: t('mainAssetType'),
      width: 300,
      editable: true,
      valueFormatter: (params) => api.assetTypes.formatWithDescription(params.value, assetTypes)
    },
    {
      field: 'asset_id',
      headerName: t('assetId'),
      width: 150,
      editable: true,
      cellStyle: (params) => {
        const numericRegex = /^[0-9]+$/;
        const hasError = params.value && !numericRegex.test(params.value);
        return {
          backgroundColor: hasError ? '#fee2e2' : '#fff9e6',
          ...(hasError && { border: '2px solid #ef4444' })
        };
      }
    },
    {
      field: 'payer_id',
      headerName: t('payerId'),
      width: 150,
      editable: true,
      cellStyle: (params) => {
        const numericRegex = /^[0-9]+$/;
        const hasError = params.value && !numericRegex.test(params.value);
        return hasError ? { backgroundColor: '#fee2e2', border: '2px solid #ef4444' } : {};
      }
    },
    {
      field: 'building_number',
      headerName: t('buildingNumber'),
      width: 150,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: buildings.map(b => b.building_number)
      },
      cellStyle: { backgroundColor: '#fff9e6' }
    }
  ], [t, buildings, assetTypes, handleDeleteRow]);

  const filteredRowData = useMemo(() => {
    if (selectedBuilding === 'all') {
      return rowData;
    }
    return rowData.filter(row => row.building_number === selectedBuilding);
  }, [rowData, selectedBuilding]);

  return (
    <div className="max-w-[95vw] mx-auto px-4 py-8">
      <div className="mb-6 bg-gradient-to-r from-teal-600 to-blue-600 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3">
          <Plus className="h-8 w-8 text-white" />
          <div>
            <h1 className="text-3xl font-bold text-white">{t('assetDataEntry')}</h1>
            <p className="text-teal-50">עדכון והוספת נכסים</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border-l-4 border-red-500 rounded-lg p-4 max-h-96 overflow-y-auto">
          <p className="text-red-800 font-medium whitespace-pre-line break-words">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border-l-4 border-green-500 rounded-lg p-4 max-h-96 overflow-y-auto">
          <p className="text-green-800 font-medium whitespace-pre-line">{success}</p>
        </div>
      )}

      {importValidationErrors.length > 0 && (
        <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-500 rounded-lg p-4 max-h-60 overflow-y-auto">
          <p className="text-yellow-900 font-bold mb-2">{t('validationErrors')} ({importValidationErrors.length}):</p>
          <ul className="list-disc list-inside space-y-1">
            {importValidationErrors.map((err, idx) => (
              <li key={idx} className="text-yellow-800 text-sm">{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              סינון לפי בניין
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
              className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
            />
            <datalist id="building-list">
              {buildings.map(building => (
                <option key={building.id} value={building.building_number}>
                  בניין {building.building_number}
                </option>
              ))}
            </datalist>
          </div>
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex gap-2">
              <button
                onClick={handleLoadAssets}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="h-5 w-5" />
                טען נכסים קיימים
              </button>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium shadow-sm"
              >
                <Download className="h-5 w-5" />
                {t('downloadTemplate')}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm"
              >
                <Upload className="h-5 w-5" />
                {t('importCSV')}
              </button>
              <button
                onClick={addEmptyRow}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium shadow-sm"
              >
                <Plus className="h-5 w-5" />
                {t('addRow')}
              </button>
            </div>
            <button
              onClick={handleSaveAll}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              <Save className="h-5 w-5" />
              {loading ? t('saving') : t('saveAll')}
            </button>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                checked={validateBeforeImport}
                onChange={(e) => setValidateBeforeImport(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="font-medium">{t('validateOnImport')}</span>
            </label>
          </div>
        </div>

        <div className="ag-theme-alpine" style={{ height: '600px', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={filteredRowData}
            columnDefs={columnDefs}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true
            }}
            onCellValueChanged={onCellValueChanged}
            onGridReady={(params) => {
              if (filteredRowData.length > 0) {
                params.api.setFocusedCell(0, 'building_number');
              }
            }}
            onFirstDataRendered={(params) => {
              params.api.ensureColumnVisible(columnDefs[0].field || 0);
            }}
            singleClickEdit={true}
            stopEditingWhenCellsLoseFocus={true}
            enterNavigatesVertically={true}
            enterNavigatesVerticallyAfterEdit={true}
            theme="legacy"
          />
        </div>
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>{t('tips')}:</strong> לחץ על כל תא לעריכה. שדות מסומנים בצהוב (מספר בניין וזיהוי נכס) נדרשים. זיהוי משלם אופציונלי.
          סה"כ גודל מחושב אוטומטית. השתמש ב-Tab או Enter לניווט בין תאים.
        </p>
        <p className="text-sm text-blue-700 mt-2">
          <strong>פורמט CSV:</strong> השתמש בכפתור "הורד תבנית CSV" להורדת קובץ תבנית עם כותרות בעברית.
          הקובץ כולל שדות: מספר בניין, זיהוי משלם, זיהוי נכס, סוג נכס ראשי, גודל נכס ראשי, ו-6 זוגות של סוג וגודל נכס משנה.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}
