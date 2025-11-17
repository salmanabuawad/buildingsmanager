import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, Download, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { api, Asset } from '../lib/api';
import { assetValidators, validateAll } from '../lib/validation';

interface ImportResult {
  total: number;
  successful: number;
  failed: number;
  errors: string[];
}

export function AssetsCSVImport() {
  const { t } = useTranslation();
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [validateBeforeImport, setValidateBeforeImport] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function parseCSV(text: string): string[][] {
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
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const lines = parseCSV(text);

      if (lines.length === 0) {
        throw new Error('קובץ CSV ריק');
      }

      const headers = lines[0].map(h => h.trim());
      const assets: any[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i];
        if (values.length === 0 || values.every(v => !v)) continue;

        const asset: any = {
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
        };

        headers.forEach((header, index) => {
          const value = values[index] || '';
          switch (header) {
            case 'building_number':
            case 'מבנה':
            case 'מספר בניין':
            case 'מספר בנין':
              asset.building_number = value ? parseInt(value) : null;
              break;
            case 'payer_id':
            case 'זיהוי משלם':
              asset.payer_id = value;
              break;
            case 'asset_id':
            case 'נכס':
            case 'זיהוי נכס':
              asset.asset_id = value;
              break;
            case 'measurement_date':
            case 'תאריך מדידה':
              asset.measurement_date = value || '';
              break;
            case 'main_asset_type':
            case 'סוג נכס':
            case 'סוג נכס ראשי':
              asset.main_asset_type = value;
              break;
            case 'asset_size':
            case 'גודל נכס':
            case 'גודל נכס ראשי':
              asset.asset_size = value ? parseFloat(value) : 0;
              break;
            case 'sub_asset_type_1':
            case 'נכס משנה 1':
            case 'סוג נכס משנה 1':
              asset.sub_asset_type_1 = value;
              break;
            case 'sub_asset_size_1':
            case 'גודל נכס משנה 1':
              asset.sub_asset_size_1 = value ? parseFloat(value) : 0;
              break;
            case 'sub_asset_type_2':
            case 'נכס משנה 2':
            case 'סוג נכס משנה 2':
              asset.sub_asset_type_2 = value;
              break;
            case 'sub_asset_size_2':
            case 'גודל נכס משנה 2':
              asset.sub_asset_size_2 = value ? parseFloat(value) : 0;
              break;
            case 'sub_asset_type_3':
            case 'נכס משנה 3':
            case 'סוג נכס משנה 3':
              asset.sub_asset_type_3 = value;
              break;
            case 'sub_asset_size_3':
            case 'גודל נכס משנה 3':
              asset.sub_asset_size_3 = value ? parseFloat(value) : 0;
              break;
            case 'sub_asset_type_4':
            case 'נכס משנה 4':
            case 'סוג נכס משנה 4':
              asset.sub_asset_type_4 = value;
              break;
            case 'sub_asset_size_4':
            case 'גודל נכס משנה 4':
              asset.sub_asset_size_4 = value ? parseFloat(value) : 0;
              break;
            case 'sub_asset_type_5':
            case 'נכס משנה 5':
            case 'סוג נכס משנה 5':
              asset.sub_asset_type_5 = value;
              break;
            case 'sub_asset_size_5':
            case 'גודל נכס משנה 5':
              asset.sub_asset_size_5 = value ? parseFloat(value) : 0;
              break;
            case 'sub_asset_type_6':
            case 'נכס משנה 6':
            case 'סוג נכס משנה 6':
              asset.sub_asset_type_6 = value;
              break;
            case 'sub_asset_size_6':
            case 'גודל נכס משנה 6':
              asset.sub_asset_size_6 = value ? parseFloat(value) : 0;
              break;
          }
        });

        if (validateBeforeImport) {
          try {
            const validation = await validateAll([
              assetValidators.validateBuildingNumber(asset.building_number),
              assetValidators.validateAssetId(asset.asset_id),
              assetValidators.validateAssetType(asset.main_asset_type, 'main_asset_type'),
              assetValidators.validateMainAssetTypeForBuilding(asset.building_number, asset.main_asset_type),
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
            ]);
            if (!validation.valid) {
              errors.push(`שורה ${i + 1} (נכס ${asset.asset_id}): ${validation.error}`);
              continue;
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'שגיאת ולידציה';
            errors.push(`שורה ${i + 1} (נכס ${asset.asset_id}): ${errorMsg}`);
            continue;
          }
        }

        assets.push(asset);
      }

      let successCount = 0;
      let failCount = 0;

      for (const asset of assets) {
        try {
          await api.assets.create(asset);
          successCount++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
          errors.push(`נכס ${asset.asset_id}: ${errorMsg}`);
          failCount++;
        }
      }

      setImportResult({
        total: lines.length - 1,
        successful: successCount,
        failed: failCount + errors.length,
        errors: errors.slice(0, 20)
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'שגיאה בקריאת קובץ CSV';
      setImportResult({
        total: 0,
        successful: 0,
        failed: 1,
        errors: [errorMsg]
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function downloadTemplate() {
    const template = `building_number,asset_id,measurement_date,payer_id,main_asset_type,asset_size,sub_asset_type_1,sub_asset_size_1,sub_asset_type_2,sub_asset_size_2
1001,101,01/01/2024,,199,120,40,100,30,20
1001,102,01/01/2024,,299,85,40,70,30,15
1002,201,01/01/2024,,40,95,,,
1002,202,01/01/2024,12345,30,45,,,`;
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'assets_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3">
          <Upload className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" />
          <div>
            <h1 className="text-3xl font-bold text-white">ייבוא נכסים מקובץ CSV</h1>
            <p className="text-indigo-50 mt-1">העלה קובץ CSV כדי לייבא נכסים במרוכז</p>
          </div>
        </div>
      </div>

      {importResult && (
        <div className={`mb-6 p-6 rounded-lg border-2 ${
          importResult.failed === 0
            ? 'bg-green-50 border-green-200'
            : importResult.successful === 0
              ? 'bg-red-50 border-red-200'
              : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-start gap-3 mb-4">
            {importResult.failed === 0 ? (
              <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-2">תוצאות ייבוא</h3>
              <div className="space-y-1 text-sm">
                <p><strong>סה"כ שורות:</strong> {importResult.total}</p>
                <p className="text-green-700"><strong>יובאו בהצלחה:</strong> {importResult.successful}</p>
                <p className="text-red-700"><strong>נכשלו:</strong> {importResult.failed}</p>
              </div>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="mt-4 p-4 bg-white rounded-lg border">
              <h4 className="font-semibold text-red-900 mb-2">שגיאות:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-800 max-h-60 overflow-y-auto">
                {importResult.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
                {importResult.errors.length === 20 && (
                  <li className="text-red-600 font-semibold">...ועוד שגיאות נוספות</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-indigo-100 p-8">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-600" />
            פורמט קובץ CSV
          </h2>
          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
            <p className="text-slate-700 mb-4 font-medium">העמודות הנדרשות בקובץ CSV:</p>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">שדות חובה:</h3>
                <ul className="list-disc list-inside space-y-1 text-slate-700 text-sm mr-4">
                  <li><strong>building_number</strong> (מספר בניין)</li>
                  <li><strong>asset_id</strong> (זיהוי נכס)</li>
                  <li><strong>measurement_date</strong> (תאריך מדידה - DD/MM/YYYY)</li>
                  <li><strong>main_asset_type</strong> (סוג נכס ראשי)</li>
                  <li><strong>asset_size</strong> (גודל נכס)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">שדות אופציונליים:</h3>
                <ul className="list-disc list-inside space-y-1 text-slate-700 text-sm mr-4">
                  <li><strong>payer_id</strong> (זיהוי משלם)</li>
                  <li><strong>sub_asset_type_1-6</strong> (סוגי נכס משנה)</li>
                  <li><strong>sub_asset_size_1-6</strong> (גדלים של נכסי משנה)</li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-300">
              <p className="font-semibold text-slate-900 mb-2">דוגמה:</p>
              <pre className="font-mono text-xs text-slate-700 leading-relaxed overflow-x-auto">
building_number,asset_id,measurement_date,main_asset_type,asset_size,sub_asset_type_1,sub_asset_size_1
1001,101,01/01/2024,199,120,40,100
1002,201,01/01/2024,40,95,,
              </pre>
            </div>

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold mb-1">שימו לב:</p>
                <ul className="list-disc list-inside space-y-1 mr-4">
                  <li>תאריך מדידה חייב להיות בפורמט DD/MM/YYYY</li>
                  <li>נכסים מסוג 199 או 299 חייבים לכלול לפחות 2 נכסי משנה</li>
                  <li>סכום נכסי המשנה חייב להתאים לגודל הנכס הראשי</li>
                  <li>הבניין חייב להיות קיים במערכת לפני ייבוא הנכסים</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={downloadTemplate}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
          >
            <Download className="h-5 w-5" />
            <span className="font-semibold">הורד קובץ דוגמה</span>
          </button>

          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={validateBeforeImport}
                onChange={(e) => setValidateBeforeImport(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-blue-900">
                בצע ולידציה לפני ייבוא (מומלץ)
              </span>
            </label>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={isImporting}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="font-semibold">מייבא נכסים...</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                <span className="font-semibold">בחר קובץ CSV לייבוא</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <p className="text-sm text-indigo-900">
            <strong>טיפ:</strong> לאחר הייבוא, חזור לרשימת הנכסים כדי לראות את הנכסים החדשים
          </p>
        </div>
      </div>
    </div>
  );
}
