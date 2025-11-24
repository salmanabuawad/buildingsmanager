import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, Download, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import { api, Asset } from '../lib/api';
import { assetValidators } from '../lib/validation';
import * as XLSX from 'xlsx';

interface ImportResult {
  total: number;
  successful: number;
  failed: number;
  errors: string[];
}

interface ImportProgress {
  stage: 'parsing' | 'validating' | 'importing';
  current: number;
  total: number;
  currentAssetId?: string;
}

export function AssetsFileImport() {
  const { t } = useTranslation();
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [validateBeforeImport, setValidateBeforeImport] = useState(true);
  const [showResultModal, setShowResultModal] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function parseExcelFile(file: File): Promise<string[][]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          // Get the first worksheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert to JSON array of arrays
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as string[][];
          
          // Convert all values to strings and trim
          const result = jsonData.map(row => 
            row.map(cell => String(cell || '').trim())
          );
          
          resolve(result);
        } catch (error) {
          reject(new Error('שגיאה בקריאת קובץ Excel: ' + (error instanceof Error ? error.message : 'Unknown error')));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('שגיאה בקריאת הקובץ'));
      };
      
      reader.readAsBinaryString(file);
    });
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);
    setProgress({ stage: 'parsing', current: 0, total: 1 });

    try {
      const lines = await parseExcelFile(file);

      if (lines.length === 0) {
        throw new Error('קובץ File ריק');
      }

      const totalRows = lines.length - 1;
      const headers = lines[0].map(h => h.trim().toLowerCase());
      const assets: any[] = [];
      const errors: string[] = [];

      // Get current date for default measurement_date
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      const defaultMeasurementDate = `${day}/${month}/${year}`;

      setProgress({ stage: 'validating', current: 0, total: totalRows });

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i];
        setProgress({ 
          stage: 'validating', 
          current: i - 1, 
          total: totalRows,
          currentAssetId: values[2] || undefined
        });
        if (values.length === 0 || values.every(v => !v)) continue;

        const asset: any = {
          building_number: null,
          payer_id: '',
          asset_id: '',
          measurement_date: defaultMeasurementDate,
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
        };

        // Check if we have the expected column count (18 columns: building, payer, asset_id, main_type, main_size, 6 pairs of sub, penthouse)
        // Or if headers are empty/garbled, use fixed position mapping
        const expectedColumnCount = 18;
        const hasExpectedColumns = values.length >= 5; // At least building, payer, asset_id, type, size
        const headersAreValid = headers.length > 0 && headers.some(h => h && (h.includes('building') || h.includes('בניין') || h.includes('מזהה')));
        
        // Use fixed position mapping if:
        // 1. Headers are empty/garbled, OR
        // 2. We have exactly the expected column count and first value looks like a building number
        if (!headersAreValid || (hasExpectedColumns && values.length >= expectedColumnCount && !isNaN(parseInt(values[0])))) {
          // Fixed position mapping for the new format:
          // Column 0: Building number, Column 1: Payer ID, Column 2: Asset ID, 
          // Column 3: Main asset type, Column 4: Asset size,
          // Columns 5-16: Sub asset types and sizes (6 pairs)
          // Column 17: Penthouse (דירת גג)
          asset.building_number = values[0] ? parseInt(values[0]) : null;
          asset.payer_id = values[1] || '';
          asset.asset_id = values[2] || '';
          asset.main_asset_type = values[3] || '';
          asset.asset_size = values[4] ? parseFloat(values[4]) : 0;
          asset.sub_asset_type_1 = values[5] || '';
          asset.sub_asset_size_1 = values[6] ? parseFloat(values[6]) : 0;
          asset.sub_asset_type_2 = values[7] || '';
          asset.sub_asset_size_2 = values[8] ? parseFloat(values[8]) : 0;
          asset.sub_asset_type_3 = values[9] || '';
          asset.sub_asset_size_3 = values[10] ? parseFloat(values[10]) : 0;
          asset.sub_asset_type_4 = values[11] || '';
          asset.sub_asset_size_4 = values[12] ? parseFloat(values[12]) : 0;
          asset.sub_asset_type_5 = values[13] || '';
          asset.sub_asset_size_5 = values[14] ? parseFloat(values[14]) : 0;
          asset.sub_asset_type_6 = values[15] || '';
          asset.sub_asset_size_6 = values[16] ? parseFloat(values[16]) : 0;
          // Convert penthouse to yes/no/null: 'כן' or 'yes' -> 'כן', anything else -> omit field
          if (values.length > 17) {
            const penthouseValue = (values[17] || '').trim();
            if (penthouseValue === 'כן' || penthouseValue.toLowerCase() === 'yes') {
              asset.penthouse = 'כן';
            }
            // If not 'כן' or 'yes', don't set the field (will be null/undefined in DB)
          }
        } else {
          // Header-based mapping (for backward compatibility)
          headers.forEach((header, index) => {
            const value = values[index] || '';
            const headerLower = header.toLowerCase();
            
            if (headerLower.includes('בניין') || headerLower.includes('building') || headerLower === 'building_number') {
              asset.building_number = value ? parseInt(value) : null;
            } else if (headerLower.includes('משלם') || headerLower.includes('payer') || headerLower === 'payer_id') {
              asset.payer_id = value;
            } else if (headerLower.includes('נכס') && !headerLower.includes('משנה') && !headerLower.includes('סוג') && (headerLower.includes('id') || headerLower.includes('זיהוי'))) {
              asset.asset_id = value;
            } else if (headerLower.includes('תאריך') || headerLower.includes('date') || headerLower === 'measurement_date') {
              asset.measurement_date = value || defaultMeasurementDate;
            } else if ((headerLower.includes('סוג') || headerLower.includes('type')) && (headerLower.includes('ראשי') || headerLower.includes('main'))) {
              asset.main_asset_type = value;
            } else if ((headerLower.includes('גודל') || headerLower.includes('size')) && (headerLower.includes('ראשי') || headerLower.includes('main') || headerLower === 'asset_size')) {
              asset.asset_size = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 1') || headerLower.includes('sub') && headerLower.includes('1') && headerLower.includes('type')) {
              asset.sub_asset_type_1 = value;
            } else if (headerLower.includes('משנה 1') || headerLower.includes('sub') && headerLower.includes('1') && headerLower.includes('size')) {
              asset.sub_asset_size_1 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 2') || headerLower.includes('sub') && headerLower.includes('2') && headerLower.includes('type')) {
              asset.sub_asset_type_2 = value;
            } else if (headerLower.includes('משנה 2') || headerLower.includes('sub') && headerLower.includes('2') && headerLower.includes('size')) {
              asset.sub_asset_size_2 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 3') || headerLower.includes('sub') && headerLower.includes('3') && headerLower.includes('type')) {
              asset.sub_asset_type_3 = value;
            } else if (headerLower.includes('משנה 3') || headerLower.includes('sub') && headerLower.includes('3') && headerLower.includes('size')) {
              asset.sub_asset_size_3 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 4') || headerLower.includes('sub') && headerLower.includes('4') && headerLower.includes('type')) {
              asset.sub_asset_type_4 = value;
            } else if (headerLower.includes('משנה 4') || headerLower.includes('sub') && headerLower.includes('4') && headerLower.includes('size')) {
              asset.sub_asset_size_4 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 5') || headerLower.includes('sub') && headerLower.includes('5') && headerLower.includes('type')) {
              asset.sub_asset_type_5 = value;
            } else if (headerLower.includes('משנה 5') || headerLower.includes('sub') && headerLower.includes('5') && headerLower.includes('size')) {
              asset.sub_asset_size_5 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('משנה 6') || headerLower.includes('sub') && headerLower.includes('6') && headerLower.includes('type')) {
              asset.sub_asset_type_6 = value;
            } else if (headerLower.includes('משנה 6') || headerLower.includes('sub') && headerLower.includes('6') && headerLower.includes('size')) {
              asset.sub_asset_size_6 = value ? parseFloat(value) : 0;
            } else if (headerLower.includes('גג') || headerLower.includes('penthouse') || headerLower === 'penthouse') {
              // Convert penthouse to yes/no/null: 'כן' or 'yes' -> 'כן', anything else -> omit field
              const penthouseValue = (value || '').trim();
              if (penthouseValue === 'כן' || penthouseValue.toLowerCase() === 'yes') {
                asset.penthouse = 'כן';
              }
              // If not 'כן' or 'yes', don't set the field (will be null/undefined in DB)
            }
          });
        }

        if (validateBeforeImport) {
          try {
            // Use the same validation structure as batch validation in AssetsList
            const assetErrors: string[] = [];
            const seenErrors = new Set<string>();

            // Synchronous validations (run in parallel)
            const syncValidations = [
              assetValidators.validateOnlyComplexTypesCanHaveSubAssets(asset.main_asset_type, [
                asset.sub_asset_type_1,
                asset.sub_asset_type_2,
                asset.sub_asset_type_3,
                asset.sub_asset_type_4,
                asset.sub_asset_type_5,
                asset.sub_asset_type_6
              ]),
              assetValidators.validateComplexTypesMustHaveSubAssets(asset.main_asset_type, [
                asset.sub_asset_type_1,
                asset.sub_asset_type_2,
                asset.sub_asset_type_3,
                asset.sub_asset_type_4,
                asset.sub_asset_type_5,
                asset.sub_asset_type_6
              ]),
              assetValidators.validateSubAssetSizeMatchesMain(
                asset.asset_size,
                [
                  asset.sub_asset_type_1,
                  asset.sub_asset_type_2,
                  asset.sub_asset_type_3,
                  asset.sub_asset_type_4,
                  asset.sub_asset_type_5,
                  asset.sub_asset_type_6
                ],
                [
                  asset.sub_asset_size_1,
                  asset.sub_asset_size_2,
                  asset.sub_asset_size_3,
                  asset.sub_asset_size_4,
                  asset.sub_asset_size_5,
                  asset.sub_asset_size_6
                ]
              ),
              assetValidators.validateSubAssetSizeRequiresType(
                [
                  asset.sub_asset_type_1,
                  asset.sub_asset_type_2,
                  asset.sub_asset_type_3,
                  asset.sub_asset_type_4,
                  asset.sub_asset_type_5,
                  asset.sub_asset_type_6
                ],
                [
                  asset.sub_asset_size_1,
                  asset.sub_asset_size_2,
                  asset.sub_asset_size_3,
                  asset.sub_asset_size_4,
                  asset.sub_asset_size_5,
                  asset.sub_asset_size_6
                ]
              ),
              assetValidators.validateSubAssetOrder([
                asset.sub_asset_type_1,
                asset.sub_asset_type_2,
                asset.sub_asset_type_3,
                asset.sub_asset_type_4,
                asset.sub_asset_type_5,
                asset.sub_asset_type_6
              ])
            ];

            // Run synchronous validations in parallel
            const syncResults = await Promise.all(syncValidations);
            syncResults.forEach(result => {
              if (!result.valid && result.error) {
                if (!seenErrors.has(result.error)) {
                  assetErrors.push(result.error);
                  seenErrors.add(result.error);
                }
              }
            });

            // DB-dependent validations (run in parallel)
            const dbValidations = [
              assetValidators.validateBuildingNumber(asset.building_number),
              assetValidators.validateAssetId(String(asset.asset_id)),
              assetValidators.validatePayerId(asset.payer_id),
              assetValidators.validateAssetType(asset.main_asset_type, 'main_asset_type'),
              assetValidators.validateMainAssetTypeComplete(asset.building_number, asset.main_asset_type, asset.asset_size || 0, asset),
              assetValidators.validateSubAssetsFor199Or299(
                asset.building_number,
                asset.main_asset_type,
                asset.asset_size,
                [
                  asset.sub_asset_type_1,
                  asset.sub_asset_type_2,
                  asset.sub_asset_type_3,
                  asset.sub_asset_type_4,
                  asset.sub_asset_type_5,
                  asset.sub_asset_type_6
                ],
                [
                  asset.sub_asset_size_1,
                  asset.sub_asset_size_2,
                  asset.sub_asset_size_3,
                  asset.sub_asset_size_4,
                  asset.sub_asset_size_5,
                  asset.sub_asset_size_6
                ]
              )
            ];

            // Run DB validations in parallel
            const dbResults = await Promise.all(dbValidations);
            dbResults.forEach(result => {
              if (!result.valid && result.error) {
                if (!seenErrors.has(result.error)) {
                  assetErrors.push(result.error);
                  seenErrors.add(result.error);
                }
              }
            });

            // Validate sub asset types individually (only if they exist)
            const subAssetTypes = [
              asset.sub_asset_type_1,
              asset.sub_asset_type_2,
              asset.sub_asset_type_3,
              asset.sub_asset_type_4,
              asset.sub_asset_type_5,
              asset.sub_asset_type_6
            ];
            const subAssetSizes = [
              asset.sub_asset_size_1,
              asset.sub_asset_size_2,
              asset.sub_asset_size_3,
              asset.sub_asset_size_4,
              asset.sub_asset_size_5,
              asset.sub_asset_size_6
            ];

            // Validate sub-assets in parallel
            const subValidations = subAssetTypes
              .map((subType, idx) => subType ? 
                assetValidators.validateSubAssetTypeComplete(
                  asset.building_number,
                  subType,
                  subAssetSizes[idx]
                ) : Promise.resolve({ valid: true })
              );

            const subResults = await Promise.all(subValidations);
            subResults.forEach((result, idx) => {
              if (!result.valid && result.error && subAssetTypes[idx]) {
                const errorMsg = `נכס משנה ${idx + 1}: ${result.error}`;
                if (!seenErrors.has(errorMsg)) {
                  assetErrors.push(errorMsg);
                  seenErrors.add(errorMsg);
                }
              }
            });

            // If there are any errors, add them to the errors array
            if (assetErrors.length > 0) {
              errors.push(`שורה ${i + 1} (נכס ${asset.asset_id}): ${assetErrors.join('; ')}`);
              continue;
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'שגיאת ולידציה';
            errors.push(`שורה ${i + 1} (נכס ${asset.asset_id}): ${errorMsg}`);
            continue;
          }
        }

        // Clean up penthouse field - remove it if not 'כן' to avoid sending empty strings
        if (asset.penthouse !== 'כן') {
          delete asset.penthouse;
        }
        
        assets.push(asset);
      }

      let successCount = 0;
      const validationErrorCount = errors.length; // Count validation errors before import

      setProgress({ stage: 'importing', current: 0, total: assets.length });

      for (let idx = 0; idx < assets.length; idx++) {
        const asset = assets[idx];
        setProgress({ 
          stage: 'importing', 
          current: idx, 
          total: assets.length,
          currentAssetId: asset.asset_id
        });
        
        try {
          await api.assets.create(asset);
          successCount++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
          errors.push(`נכס ${asset.asset_id}: ${errorMsg}`);
        }
      }

      const result = {
        total: lines.length - 1,
        successful: successCount,
        failed: errors.length, // Total errors (validation + import)
        errors: errors.slice(0, 20)
      };
      setImportResult(result);
      setShowResultModal(true);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'שגיאה בקריאת קובץ File';
      const result = {
        total: 0,
        successful: 0,
        failed: 1,
        errors: [errorMsg]
      };
      setImportResult(result);
      setShowResultModal(true);
    } finally {
      setIsImporting(false);
      setProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function downloadTemplate() {
    // Create Excel template matching the new format
    // Columns: Building number, Payer ID, Asset ID, Main asset type, Asset size, 
    // Sub asset types 1-6, Sub asset sizes 1-6
    const headers = [
      'מזהה בניין',
      'מזהה משלם',
      'מזהה נכס',
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
      'גודל נכס משנה 6',
      'דירת גג'
    ];

    const data = [headers];

    // Create workbook and worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'נכסים');

    // Write to file
    XLSX.writeFile(workbook, 'assets_template.xlsx');
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-md p-4">
        <div className="flex items-center gap-2">
          <Upload className="w-6 h-6 text-white bg-white/20 rounded p-1" />
          <div>
            <h1 className="text-xl font-bold text-white">ייבוא נכסים מקובץ Excel</h1>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md border border-indigo-100 p-6">
        {/* Buttons Section - Top */}
        <div className="space-y-3 mb-6">
          <div className="flex gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={isImporting}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>מייבא...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>בחר קובץ לייבוא</span>
                </>
              )}
            </button>

            <button
              onClick={downloadTemplate}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
            >
              <Download className="h-4 w-4" />
              <span>הורד תבנית</span>
            </button>
          </div>

        {/* Progress Indicator */}
        {progress && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  {progress.stage === 'parsing' && 'קורא קובץ...'}
                  {progress.stage === 'validating' && 'מאמת נתונים...'}
                  {progress.stage === 'importing' && 'מייבא נכסים...'}
                </span>
              </div>
              <span className="text-xs text-blue-700">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            {progress.currentAssetId && (
              <p className="text-xs text-blue-700">
                מעבד נכס: {progress.currentAssetId}
              </p>
            )}
          </div>
        )}

          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={validateBeforeImport}
                onChange={(e) => setValidateBeforeImport(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-xs font-medium text-blue-900">
                בצע ולידציה לפני ייבוא (מומלץ)
              </span>
            </label>
          </div>
        </div>

        {/* Info and Tips Section - Bottom */}
        <div className="border-t border-slate-200 pt-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            פורמט קובץ Excel
          </h2>
          
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <p className="text-slate-700 mb-3 text-sm font-medium">העמודות הנדרשות בקובץ Excel:</p>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <h3 className="font-semibold text-slate-900 mb-2 text-sm">שדות חובה:</h3>
                <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs mr-4">
                  <li><strong>מזהה בניין</strong> (Building number)</li>
                  <li><strong>מזהה משלם</strong> (Payer ID - אופציונלי)</li>
                  <li><strong>מזהה נכס</strong> (Asset ID)</li>
                  <li><strong>סוג נכס ראשי</strong> (Main asset type)</li>
                  <li><strong>גודל נכס ראשי</strong> (Asset size)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2 text-sm">שדות אופציונליים:</h3>
                <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs mr-4">
                  <li><strong>סוג נכס משנה 1-6</strong> (Sub asset types)</li>
                  <li><strong>גודל נכס משנה 1-6</strong> (Sub asset sizes)</li>
                  <li><strong>דירת גג</strong> (Penthouse)</li>
                  <li><strong>תאריך מדידה</strong> (Measurement date - יוגדר אוטומטית לתאריך הנוכחי אם לא מופיע)</li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-slate-300 mb-4">
              <p className="font-semibold text-slate-900 mb-2 text-sm">דוגמה:</p>
              <p className="text-xs text-slate-700 mb-2">הקובץ צריך להיות בפורמט Excel (.xlsx) עם העמודות הבאות:</p>
              <div className="text-xs text-slate-600 space-y-1">
                <p>שורה 1: מזהה בניין | מזהה משלם | מזהה נכס | סוג נכס ראשי | גודל נכס ראשי | סוג נכס משנה 1 | גודל נכס משנה 1 | ...</p>
                <p>שורה 2: 8268128 | 516144276 | 826812801 | 311 | 552.89 | ...</p>
                <p>שורה 3: 8268128 | 516144276 | 826812802 | 299 | 264.29 | 311 | 248.2 | 702 | 10.36 | ...</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <p className="font-semibold mb-1">שימו לב:</p>
                <ul className="list-disc list-inside space-y-1 mr-4">
                  <li>הקובץ צריך להיות בפורמט Excel (.xlsx)</li>
                  <li>תאריך מדידה יוגדר אוטומטית לתאריך הנוכחי אם לא מופיע בקובץ</li>
                  <li>נכסים מסוג 199 או 299 חייבים לכלול לפחות 2 נכסי משנה</li>
                  <li>סכום נכסי המשנה חייב להתאים לגודל הנכס הראשי</li>
                  <li>הבניין חייב להיות קיים במערכת לפני ייבוא הנכסים</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p className="text-xs text-indigo-900">
              <strong>טיפ:</strong> לאחר הייבוא, חזור לרשימת הנכסים כדי לראות את הנכסים החדשים. הקובץ צריך להיות בפורמט Excel (.xlsx)
            </p>
          </div>
        </div>
      </div>

      {/* Import Results Modal */}
      {showResultModal && importResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className={`${importResult.failed === 0 ? 'bg-green-500' : importResult.successful === 0 ? 'bg-red-500' : 'bg-yellow-500'} px-6 py-4 flex items-center justify-between`}>
              <h2 className="text-2xl font-bold text-white">תוצאות ייבוא</h2>
              <button
                onClick={() => {
                  setShowResultModal(false);
                  setImportResult(null);
                }}
                className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex items-start gap-3 mb-6">
                {importResult.failed === 0 ? (
                  <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-yellow-600 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <p className="text-sm text-slate-600 mb-1">סה"כ שורות</p>
                      <p className="text-2xl font-bold text-slate-900">{importResult.total}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                      <p className="text-sm text-green-700 mb-1">יובאו בהצלחה</p>
                      <p className="text-2xl font-bold text-green-700">{importResult.successful}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                      <p className="text-sm text-red-700 mb-1">נכשלו</p>
                      <p className="text-2xl font-bold text-red-700">{importResult.failed}</p>
                    </div>
                  </div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-red-900 mb-3 text-lg">שגיאות:</h4>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <ul className="list-disc list-inside space-y-2 text-sm text-red-800">
                      {importResult.errors.map((error, index) => (
                        <li key={index} className="break-words">{error}</li>
                      ))}
                      {importResult.errors.length === 20 && (
                        <li className="text-red-600 font-semibold">...ועוד שגיאות נוספות</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {importResult.failed === 0 && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800 font-medium">כל הנכסים יובאו בהצלחה!</p>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => {
                  setShowResultModal(false);
                  setImportResult(null);
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
