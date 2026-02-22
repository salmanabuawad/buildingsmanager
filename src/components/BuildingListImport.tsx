import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, Download, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export function BuildingListImport() {
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

      if (lines.length === 0) {
        throw new Error('קובץ ריק');
      }

      // Process headers - exact name matching only
      const headerLine = lines[0];
      const headerParts: string[] = [];
      let current = '';
      let inQuotes = false;
      
      // Parse CSV header line - handle quoted values
      for (let j = 0; j < headerLine.length; j++) {
        const char = headerLine[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          headerParts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      headerParts.push(current.trim()); // Add last part

      // Create header mapping - map field name to column index
      const headerMap: Record<string, number> = {};
      
      // Define exact header names (case-insensitive, trimmed)
      const exactHeaders: Record<string, string[]> = {
        'building_number': ['מזהה מבנה', 'מזהה_מבנה', 'building_number'],
        'tax_region': ['אזור מס', 'אזור_מס', 'tax_region'],
        'residence_shared_area': ['שטח משותף מגורים', 'שטח_משותף_מגורים', 'residence_shared_area', 'shared_area'],
        'business_shared_area': ['שטח משותף עסקים', 'שטח_משותף_עסקים', 'business_shared_area'],
        'shared_parking_area': ['שטח חניה משותף', 'שטח_חניה_משותף', 'shared_parking_area'],
        'number_of_parking_units': ['מספר יחידות חניה', 'מספר_יחידות_חניה', 'number_of_parking_units'],
        'building_address': ['סמל רחוב', 'סמל_רחוב', 'building_address', 'כתובת'],
        'address': ['כתובת (dropdown)', 'כתובת_dropdown', 'address', 'כתובת dropdown']
      };

      // Match headers by exact name only (case-insensitive, trimmed)
      headerParts.forEach((header, index) => {
        if (!header) return;
        const headerTrimmed = header.trim();
        
        // Check for exact match against known headers
        for (const [fieldName, possibleHeaders] of Object.entries(exactHeaders)) {
          if (possibleHeaders.some(h => headerTrimmed.toLowerCase() === h.toLowerCase())) {
            headerMap[fieldName] = index;
            break;
          }
        }
      });

      // Require at least building_number header
      if (headerMap['building_number'] === undefined) {
        throw new Error('קובץ חייב לכלול שורת כותרות. נדרש לפחות עמודת "מזהה מבנה" או "מזהה_מבנה"');
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Process data rows (starting from row 1, row 0 is headers)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const rowNumber = i + 1; // Row number for error messages (1-based, including header)
        
        // Parse CSV line - handle quoted values
        const parts: string[] = [];
        current = '';
        inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            parts.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        parts.push(current.trim()); // Add last part

        // Extract values using header mapping
        const buildingNumberStr = headerMap['building_number'] !== undefined 
          ? (parts[headerMap['building_number']] || '').trim() 
          : '';
        const taxRegion = headerMap['tax_region'] !== undefined 
          ? (parts[headerMap['tax_region']] || '').trim() 
          : '';
        const sharedAreaStr = headerMap['residence_shared_area'] !== undefined 
          ? (parts[headerMap['residence_shared_area']] || '').trim() 
          : '';
        const sharedBusinessAreaStr = headerMap['business_shared_area'] !== undefined 
          ? (parts[headerMap['business_shared_area']] || '').trim() 
          : '';
        const sharedParkingAreaStr = headerMap['shared_parking_area'] !== undefined 
          ? (parts[headerMap['shared_parking_area']] || '').trim() 
          : '';
        const numberOfParkingUnitsStr = headerMap['number_of_parking_units'] !== undefined 
          ? (parts[headerMap['number_of_parking_units']] || '').trim() 
          : '';
        const buildingAddressStr = headerMap['building_address'] !== undefined 
          ? (parts[headerMap['building_address']] || '').trim() 
          : '';
        const addressStr = headerMap['address'] !== undefined 
          ? (parts[headerMap['address']] || '').trim() 
          : '';

        const buildingNumber = buildingNumberStr ? parseInt(buildingNumberStr) : NaN;
        const sharedArea = sharedAreaStr ? parseFloat(sharedAreaStr) : undefined;
        const sharedBusinessArea = sharedBusinessAreaStr ? parseFloat(sharedBusinessAreaStr) : undefined;
        const sharedParkingArea = sharedParkingAreaStr ? parseFloat(sharedParkingAreaStr) : undefined;
        const numberOfParkingUnits = numberOfParkingUnitsStr ? parseInt(numberOfParkingUnitsStr, 10) : undefined;
        const buildingAddress = buildingAddressStr ? parseInt(buildingAddressStr) : undefined;
        // Parse address - can be "code - description" format or just code
        let address: number | undefined = undefined;
        if (addressStr) {
          if (addressStr.includes(' - ')) {
            const codeStr = addressStr.split(' - ')[0].trim();
            const code = parseInt(codeStr);
            address = isNaN(code) ? undefined : code;
          } else {
            const code = parseInt(addressStr);
            address = isNaN(code) ? undefined : code;
          }
        }

        if (isNaN(buildingNumber)) {
          errors.push(`שורה ${rowNumber}: מזהה מבנה לא תקין`);
          errorCount++;
          continue;
        }

        if (sharedAreaStr && isNaN(sharedArea!)) {
          errors.push(`שורה ${rowNumber}: שטח משותף מגורים לא תקין`);
          errorCount++;
          continue;
        }

        if (sharedBusinessAreaStr && isNaN(sharedBusinessArea!)) {
          errors.push(`שורה ${rowNumber}: שטח משותף עסקים לא תקין`);
          errorCount++;
          continue;
        }

        if (sharedParkingAreaStr && (isNaN(sharedParkingArea!) || sharedParkingArea! < 0)) {
          errors.push(`שורה ${rowNumber}: שטח חניה משותף לא תקין`);
          errorCount++;
          continue;
        }

        if (numberOfParkingUnitsStr && (isNaN(numberOfParkingUnits!) || numberOfParkingUnits! < 0)) {
          errors.push(`שורה ${rowNumber}: מספר יחידות חניה לא תקין`);
          errorCount++;
          continue;
        }

        if (buildingAddressStr && isNaN(buildingAddress!)) {
          errors.push(`שורה ${rowNumber}: סמל רחוב לא תקין`);
          errorCount++;
          continue;
        }

        if (addressStr && address === undefined) {
          errors.push(`שורה ${rowNumber}: כתובת (dropdown) לא תקין`);
          errorCount++;
          continue;
        }

        try {
          await api.buildings.create({
            building_number: buildingNumber,
            tax_region: taxRegion || undefined,
            residence_shared_area: sharedArea,
            business_shared_area: sharedBusinessArea,
            shared_parking_area: sharedParkingArea,
            number_of_parking_units: numberOfParkingUnits,
            building_address: buildingAddress,
            address: address
          });
          successCount++;
        } catch (error) {
          errors.push(`שורה ${rowNumber}: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`);
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
    const template = `מזהה מבנה,אזור מס,שטח משותף מגורים,שטח משותף עסקים,שטח חניה משותף,מספר יחידות חניה,סמל רחוב,כתובת (dropdown)
1001,10,150.5,50.2,,,603,604
1002,20,200,75,,,,
1003,"40,10",300,100,,,604,605
1004,,,,,,,,
1005,30,,,,,,606`;
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'buildings_template.csv');
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
              <li><strong>מזהה מבנה</strong> (חובה) - מספר שלם</li>
              <li><strong>אזור מס</strong> (אופציונלי) - יכול להיות ערך בודד או צירוף תקין</li>
              <li><strong>שטח משותף מגורים</strong> (אופציונלי) - מספר עשרוני</li>
              <li><strong>שטח משותף עסקים</strong> (אופציונלי) - מספר עשרוני</li>
              <li><strong>סמל רחוב</strong> (אופציונלי) - מספר שלם (סמל רחוב מטבלת כתובות)</li>
              <li><strong>כתובת (dropdown)</strong> (אופציונלי) - מספר שלם או "מספר - תיאור" (סמל רחוב מטבלת כתובות)</li>
            </ul>

            <div className="bg-white rounded-lg p-4 border border-slate-300">
              <p className="font-semibold text-slate-900 mb-2">דוגמה:</p>
              <pre className="font-mono text-sm text-slate-700 leading-relaxed">
1001,10,150.5,50.2,603,604
1002,20,200,75,,
1003,40,10,300,100,604,605
1004,,,,,
1005,30,,,,606
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
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-teal-600 to-blue-600 text-white rounded-lg hover:from-teal-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 "
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

