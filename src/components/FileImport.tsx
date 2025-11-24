import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, Download, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export function FileImport() {
  const { t } = useTranslation();
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(s => s.trim());
        const [buildingNumberStr, taxRegion = ''] = parts;
        const buildingNumber = parseInt(buildingNumberStr);

        if (isNaN(buildingNumber)) {
          errors.push(`שורה ${i + 1}: מספר מבנה לא תקין`);
          errorCount++;
          continue;
        }

        try {
          await api.buildings.create({
            building_number: buildingNumber,
            tax_region: taxRegion || undefined,
            total_assets: 0,
            total_building_area: 0
          });
          successCount++;
        } catch (error) {
          errors.push(`שורה ${i + 1}: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`);
          errorCount++;
        }
      }

      if (errors.length > 0) {
        showMessage('error', `יובאו ${successCount} מבנים. ${errorCount} שגיאות: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
      } else {
        showMessage('success', `יובאו בהצלחה ${successCount} מבנים`);
      }
    } catch (error) {
      showMessage('error', 'שגיאה בקריאת קובץ File');
      console.error('Error importing File:', error);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function downloadTemplate() {
    const template = `1001,10
1002,20
1003,30,40
1004`;
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'buildings_template.file');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3">
          <Upload className="w-10 h-10 text-white bg-white/20 rounded-lg p-2" />
          <div>
            <h1 className="text-3xl font-bold text-white">ייבוא מבנים מקובץ File</h1>
            <p className="text-blue-50 mt-1">העלה קובץ File כדי לייבא מבנים במרוכז</p>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-8">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            פורמט קובץ File
          </h2>
          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
            <p className="text-slate-700 mb-4 font-medium">כל שורה בקובץ File צריכה להכיל:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-700 mb-4 mr-4">
              <li><strong>מספר מבנה</strong> (חובה) - מספר שלם</li>
              <li><strong>אזור מס</strong> (אופציונלי) - יכול להיות ערך בודד או צירוף תקין</li>
            </ul>

            <div className="bg-white rounded-lg p-4 border border-slate-300">
              <p className="font-semibold text-slate-900 mb-2">דוגמה:</p>
              <pre className="font-mono text-sm text-slate-700 leading-relaxed">
1001,10
1002,20
1003,40,10
1004
              </pre>
            </div>

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold mb-1">שימו לב:</p>
                <ul className="list-disc list-inside space-y-1 mr-4">
                  <li>אזור מס יכול להיות ערך בודד או צירוף מ: 40,10 או 40,20 או 40,30</li>
                  <li>אם אזור המס ריק, המבנה ייווצר ללא אזור מס</li>
                  <li>מבנים עם מספר זהה יגרמו לשגיאה</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={downloadTemplate}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
          >
            <Download className="h-5 w-5" />
            <span className="font-semibold">הורד קובץ דוגמה</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
            <span className="font-semibold">
              {isImporting ? 'מייבא...' : 'בחר קובץ File לייבוא'}
            </span>
          </button>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>טיפ:</strong> לאחר הייבוא, חזור לרשימת המבנים כדי לראות את המבנים החדשים
          </p>
        </div>
      </div>
    </div>
  );
}
