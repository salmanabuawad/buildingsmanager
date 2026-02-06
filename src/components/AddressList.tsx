import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AddressList, api } from '../lib/api';
import { Upload, Save, X, Loader2, MapPin, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { useGridPreferences } from '../lib/useGridPreferences';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';
import { exportToExcel } from '../lib/excelExport';

export function AddressListComponent() {
  const { t } = useTranslation();
  const [addresses, setAddresses] = useState<AddressList[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; percentage: number } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string; errors?: string[]; persistent?: boolean } | null>(null);
  const [dirtyAddresses, setDirtyAddresses] = useState<Map<number, Partial<AddressList>>>(new Map());
  const [deletedAddresses, setDeletedAddresses] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<AgGridReact<AddressList>>(null);
  
  // Grid preferences hook for saving/loading column state
  const gridPreferences = useGridPreferences(
    gridRef,
    'address-list',
    'default'
  );

  useEffect(() => {
    fetchAddresses();
  }, []);

  async function fetchAddresses(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      const data = await api.addressList.getAll();
      setAddresses(data);
    } catch (error) {
      console.error('Error fetching addresses:', error);
      showMessage('error', t('error') || 'שגיאה');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function showMessage(type: 'success' | 'error' | 'info', text: string, errors?: string[], persistent?: boolean) {
    setMessage({ type, text, errors, persistent });
    // Only auto-dismiss if not persistent
    if (!persistent) {
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function handleExportTemplate(format: 'excel' | 'csv' = 'excel') {
    // Create template data with headers only (no sample data)
    const templateData = [
      ['סמל_רחוב', 'שם_רחוב']
    ];

    if (format === 'csv') {
      // Export as CSV
      const { exportToCSV } = await import('../lib/csvExport');
      exportToCSV({
        filename: 'תבנית_רשימת_כתובות.csv',
        data: templateData
      });
    } else {
      // Export as Excel
      exportToExcel({
        filename: 'תבנית_רשימת_כתובות.xlsx',
        sheetName: 'תבנית כתובות',
        data: templateData,
        columnWidths: [
          { wch: 15 }, // סמל_רחוב
          { wch: 30 }  // שם_רחוב
        ]
      });
    }
  }

  async function handleExportToExcel() {
    if (!addresses || addresses.length === 0) {
      showMessage('error', 'אין כתובות לייצוא');
      return;
    }

    try {
      // Filter out deleted addresses and apply dirty changes
      const addressesToExport = addresses
        .filter(addr => !deletedAddresses.has(addr.street_code))
        .map(addr => {
          const dirtyChanges = dirtyAddresses.get(addr.street_code) || {};
          return { ...addr, ...dirtyChanges };
        });

      // Define headers
      const headers = ['סמל רחוב', 'שם רחוב'];

      // Convert addresses to rows
      const rows = addressesToExport.map(addr => [
        addr.street_code || '',
        addr.street_description || ''
      ]);

      // Create data array with headers and rows
      const data = [headers, ...rows];

      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const filename = `כתובות_${dateStr}.xlsx`;

      // Use improved export function to reduce antivirus false positives
      exportToExcel({
        filename,
        sheetName: 'כתובות',
        data,
        columnWidths: [
          { wch: 15 }, // סמל רחוב
          { wch: 40 }  // שם רחוב
        ]
      });
      
      showMessage('success', `יוצאו ${rows.length} כתובות בהצלחה`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      showMessage('error', 'שגיאה בייצוא לקובץ Excel');
    }
  }

  const onCellValueChanged = useCallback(async (event: any) => {
    const address = event.data as AddressList;
    if (!address || !address.street_code) return;

    const field = event.colDef.field;
    const newValue = event.newValue;
    const oldValue = event.oldValue;

    if (newValue === oldValue) return;

    // Use startTransition to prevent blocking the UI during navigation
    startTransition(() => {
      setDirtyAddresses(prev => {
        const next = new Map(prev);
        const existing = next.get(address.street_code) || {};
        next.set(address.street_code, { ...existing, [field]: newValue });
        return next;
      });
    });
  }, []);

  async function handleSaveAll() {
    if (dirtyAddresses.size === 0 && deletedAddresses.size === 0) {
      return;
    }

    setIsSaving(true);
    try {
      // Bulk delete first
      if (deletedAddresses.size > 0) {
        await api.addressList.deleteBulk(Array.from(deletedAddresses.values()));
      }

      // Bulk upsert changes (skip rows marked for deletion)
      if (dirtyAddresses.size > 0) {
        const updates = Array.from(dirtyAddresses.entries())
          .filter(([streetCode]) => !deletedAddresses.has(streetCode))
          .map(([street_code, changes]) => ({
            street_code,
            ...changes
          }));

        if (updates.length > 0) {
          await api.addressList.upsertBulk(updates);
        }
      }

      showMessage('success', 'כל השינויים נשמרו בהצלחה');
      setDirtyAddresses(new Map());
      setDeletedAddresses(new Set());
      await fetchAddresses();
      
      if (gridRef.current) {
        gridRef.current.api.refreshCells({ force: true });
        gridRef.current.api.redrawRows();
      }
    } catch (error) {
      console.error('Error saving changes:', error);
      showMessage('error', 'שגיאה בשמירת השינויים');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancelAll() {
    if (dirtyAddresses.size === 0 && deletedAddresses.size === 0) {
      return;
    }

    // Clear all changes and reload from database to restore original state
    setDirtyAddresses(new Map());
    setDeletedAddresses(new Set());
    setMessage(null);
    
    // Reload data from database
    fetchAddresses(false);
    
    if (gridRef.current) {
      gridRef.current.api.refreshCells({ force: true });
      gridRef.current.api.redrawRows();
    }
  }

  const columnDefs: ColDef<AddressList>[] = useMemo(() => {
    const defs: ColDef<AddressList>[] = [
    {
      colId: 'actions',
      headerName: 'פעולות',
      pinned: 'right',
      sortable: false,
      filter: false,
      editable: false,
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      headerClass: 'ag-right-aligned-header',
      cellRenderer: (params: any) => {
        const address = params.data as AddressList;
        if (!address) return null;
        
        const isDirty = dirtyAddresses.has(address.street_code);
        const isDeleted = deletedAddresses.has(address.street_code);

        return (
          <div className="flex items-center justify-center gap-1 h-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeletedAddresses(prev => {
                  const next = new Set(prev);
                  if (next.has(address.street_code)) {
                    next.delete(address.street_code);
                  } else {
                    next.add(address.street_code);
                  }
                  return next;
                });
              }}
              className={`p-1 transition-colors hover:scale-110 ${
                isDeleted ? 'text-red-600 hover:text-red-700' : 'text-red-400 hover:text-red-600'
              }`}
              title={isDeleted ? 'בטל מחיקה' : 'מחק'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        );
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
    },
    {
      field: 'street_code',
      headerName: 'סמל רחוב',
      editable: true,
      pinned: 'left',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      valueParser: (params) => {
        if (params.newValue === '' || params.newValue === null || params.newValue === undefined) {
          return null;
        }
        const parsed = parseInt(params.newValue);
        return isNaN(parsed) ? null : parsed;
      },
      cellStyle: (params: any) => {
        const address = params.data as AddressList;
        if (!address) return {};
        const isDirty = dirtyAddresses.has(address.street_code);
        const isDeleted = deletedAddresses.has(address.street_code);
        return {
          textAlign: 'right',
          backgroundColor: isDeleted ? '#fee2e2' : isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : 'normal'
        };
      },
      headerClass: 'ag-right-aligned-header'
    },
    {
      field: 'street_description',
      headerName: 'שם רחוב',
      editable: true,
      cellStyle: (params: any) => {
        const address = params.data as AddressList;
        if (!address) return {};
        const isDirty = dirtyAddresses.has(address.street_code);
        const isDeleted = deletedAddresses.has(address.street_code);
        return {
          textAlign: 'right',
          backgroundColor: isDeleted ? '#fee2e2' : isDirty ? '#fef3c7' : undefined,
          fontWeight: isDirty ? 'bold' : 'normal'
        };
      },
      headerClass: 'ag-right-aligned-header'
    },
    {
      field: 'extra_field_1',
      headerName: '',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    },
    {
      field: 'extra_field_2',
      headerName: '',
      editable: false,
      headerClass: 'ag-right-aligned-header',
      cellStyle: { textAlign: 'right' }
    }
    ];
    
    // Process all headers to add icons for long headers (>2 words)
    return defs.map(colDef => {
      if (colDef.headerName && typeof colDef.headerName === 'string') {
        const processed = processColumnHeader(colDef.headerName);
        return { ...colDef, ...processed };
      }
      return colDef;
    });
  }, [dirtyAddresses, deletedAddresses]);

  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      let lines: string[] = [];

      // Check file extension
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      
      if (fileExt === 'xlsx' || fileExt === 'xls') {
        // Handle Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
        
        // Convert to CSV-like lines
        lines = jsonData.map(row => row.join(','));
      } else {
        // Handle CSV file
        const text = await file.text();
        lines = text.split('\n').filter(line => line.trim());
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // First, truncate the table by deleting all records
      try {
        const allAddresses = await api.addressList.getAll();
        const totalToDelete = allAddresses.length;
        let deletedCount = 0;
        
        for (const address of allAddresses) {
          try {
            await api.addressList.delete(address.street_code);
            deletedCount++;
            if (totalToDelete > 0) {
              setImportProgress({
                current: deletedCount,
                total: totalToDelete,
                percentage: Math.round((deletedCount / totalToDelete) * 50) // First 50% is deletion
              });
            }
          } catch (err) {
            console.error(`Error deleting address ${address.street_code}:`, err);
          }
        }
      } catch (err) {
        console.error('Error truncating addresses:', err);
        showMessage('error', 'שגיאה במחיקת רשומות קיימות');
      }

      // Process headers - exact name matching only
      if (lines.length === 0) {
        showMessage('error', 'קובץ ריק', undefined, true);
        setIsImporting(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      const headerLine = lines[0];
      // Parse CSV header line - handle quoted values
      const headerParts: string[] = [];
      let current = '';
      let inQuotes = false;
      
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
        'street_code': ['סמל רחוב', 'סמל_רחוב', 'street_code'],
        'street_description': ['שם רחוב', 'שם_רחוב', 'street_description']
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

      // Require both headers
      if (headerMap['street_code'] === undefined || headerMap['street_description'] === undefined) {
        showMessage('error', 'קובץ חייב לכלול שורת כותרות עם שמות שדות. נדרשות: סמל רחוב ושם רחוב', undefined, true);
        setIsImporting(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      // Parse and import each line (skip header row)
      const dataLines = lines.slice(1).filter(line => line.trim());
      const totalLines = dataLines.length;
      let processedCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

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
        parts.push(current.trim());

        // Extract values using header mapping
        const streetCodeStr = parts[headerMap['street_code']] || '';
        const streetDescription = parts[headerMap['street_description']] || '';

        if (!streetCodeStr || streetCodeStr.trim() === '') {
          errors.push(`שורה ${i + 1}: סמל רחוב חסר. נתונים בשורה: "${streetCodeStr}" | "${streetDescription}"`);
          errorCount++;
          processedCount++;
          if (totalLines > 0) {
            setImportProgress({
              current: processedCount,
              total: totalLines,
              percentage: Math.round(50 + (processedCount / totalLines) * 50) // Second 50% is import
            });
          }
          continue;
        }

        const streetCode = parseInt(streetCodeStr);
        if (isNaN(streetCode) || streetCode < 0 || streetCode > 9999) {
          errors.push(`שורה ${i + 1}: סמל רחוב לא תקין "${streetCodeStr}" (חייב להיות מספר בין 0-9999). שם רחוב: "${streetDescription}"`);
          errorCount++;
          processedCount++;
          if (totalLines > 0) {
            setImportProgress({
              current: processedCount,
              total: totalLines,
              percentage: Math.round(50 + (processedCount / totalLines) * 50)
            });
          }
          continue;
        }

        if (!streetDescription || streetDescription.trim() === '') {
          errors.push(`שורה ${i + 1}: שם רחוב לא יכול להיות ריק. סמל רחוב: "${streetCodeStr}"`);
          errorCount++;
          processedCount++;
          if (totalLines > 0) {
            setImportProgress({
              current: processedCount,
              total: totalLines,
              percentage: Math.round(50 + (processedCount / totalLines) * 50)
            });
          }
          continue;
        }

        try {
          const addressData: Partial<AddressList> = {
            street_code: streetCode,
            street_description: streetDescription.trim(),
          };

          await api.addressList.create(addressData);
          successCount++;
        } catch (error: any) {
          // Log the full error structure for debugging
          console.error(`Import error at row ${i + 1}:`, error);
          
          // Extract detailed error information from Supabase errors
          let errorMsg = 'Unknown error';
          
          if (error instanceof Error) {
            errorMsg = error.message;
          } else if (error?.message) {
            errorMsg = error.message;
          } else if (typeof error === 'string') {
            errorMsg = error;
          }
          
          // Add additional error details if available (Supabase error structure)
          const errorDetails: string[] = [];
          if (error?.code) {
            errorDetails.push(`קוד: ${error.code}`);
          }
          if (error?.details) {
            errorDetails.push(`פרטים: ${error.details}`);
          }
          if (error?.hint) {
            errorDetails.push(`רמז: ${error.hint}`);
          }
          
          // If error is an object, try to stringify it for more info
          if (!errorMsg || errorMsg === 'Unknown error') {
            try {
              const errorString = JSON.stringify(error);
              if (errorString && errorString !== '{}') {
                errorMsg = errorString;
              }
            } catch (e) {
              // If stringify fails, use the error object's toString
              errorMsg = String(error);
            }
          }
          
          const fullErrorMsg = errorDetails.length > 0 
            ? `${errorMsg} (${errorDetails.join(', ')})`
            : errorMsg;
            
          errors.push(`שורה ${i + 1}: שגיאה בשמירה - ${fullErrorMsg}. סמל רחוב: "${streetCodeStr}", שם רחוב: "${streetDescription}"`);
          errorCount++;
        }

        processedCount++;
        if (totalLines > 0) {
          setImportProgress({
            current: processedCount,
            total: totalLines,
            percentage: Math.round(50 + (processedCount / totalLines) * 50)
          });
        }
      }

      await fetchAddresses();

      if (errors.length > 0) {
        showMessage('error', `יובאו ${successCount} רשומות. ${errorCount} שגיאות:`, errors, true);
      } else {
        showMessage('success', `יובאו בהצלחה ${successCount} רשומות`);
      }
    } catch (error) {
      showMessage('error', 'שגיאה בקריאת קובץ');
      console.error('Error importing file:', error);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-slate-700 font-medium">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-3">
      <div className="mb-3 bg-gradient-to-r from-blue-600 to-teal-600 rounded-lg shadow-lg p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-7 h-7 text-white bg-white/20 rounded-lg p-1" />
            <h1 className="text-lg sm:text-xl font-bold text-white">רשימת כתובות</h1>
          </div>
          <div className="text-white text-sm font-medium">
            {addresses.length} רשומות
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg relative ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 
            message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 
            'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="font-medium mb-2">{message.text}</div>
              {message.errors && message.errors.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-semibold mb-2">
                    פרטי השגיאות ({message.errors.length} שגיאות):
                  </div>
                  <div className="max-h-96 overflow-y-auto border border-red-200 rounded p-3 bg-red-50/50">
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {message.errors.map((error, index) => (
                        <li key={index} className="text-red-700 break-words">{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            {message.persistent && (
              <button
                onClick={() => setMessage(null)}
                className="flex-shrink-0 p-1 hover:bg-black/10 rounded transition-colors"
                title="סגור"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {isImporting && importProgress && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-900">
              מייבא... {importProgress.current} מתוך {importProgress.total}
            </span>
            <span className="text-sm font-medium text-blue-700">
              {importProgress.percentage}%
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${importProgress.percentage}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900">רשימת כתובות</h2>
            <span className="text-sm text-slate-700 bg-slate-100 px-3 py-1 rounded-lg font-semibold">
              סך הכל: {addresses.length} כתובות
            </span>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileImport}
              className="hidden"
            />
            <button
              onClick={handleExportToExcel}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md"
              title="ייצא נתונים ל-Excel"
            >
              <Download className="h-5 w-5" />
              <span className="hidden sm:inline">ייצא ל-Excel</span>
            </button>
            <div className="flex items-center">
              <button
                onClick={() => handleExportTemplate('excel')}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-l-md rounded-r-none transition-all duration-200 shadow-sm hover:shadow-md border-r-2 border-teal-500"
                title="הורד תבנית לקובץ Excel"
              >
                <Download className="h-5 w-5" />
                <span className="hidden sm:inline">הורד תבנית</span>
              </button>
              <button
                onClick={() => handleExportTemplate('csv')}
                className="flex items-center justify-center min-w-[50px] px-3 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-r-md rounded-l-none transition-all duration-200 shadow-sm hover:shadow-md text-sm font-medium whitespace-nowrap"
                title="הורד תבנית CSV"
              >
                CSV
              </button>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none"
            >
              <Upload className="h-5 w-5" />
              <span className="hidden sm:inline">{isImporting ? t('loading') : 'ייבא קובץ'}</span>
            </button>
          </div>
        </div>

        {/* Save All / Cancel buttons */}
        <div className="mb-4 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
          <button
            onClick={handleCancelAll}
            disabled={isSaving || (dirtyAddresses.size === 0 && deletedAddresses.size === 0)}
            className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-gray-500 hover:bg-gray-600 active:bg-gray-700 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50  disabled:shadow-none font-semibold w-full sm:w-auto"
          >
            <X className="h-4 w-4" />
            {t('cancel')}
          </button>
          <button
            onClick={handleSaveAll}
            disabled={isSaving || (dirtyAddresses.size === 0 && deletedAddresses.size === 0)}
            className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50  disabled:shadow-none font-semibold w-full sm:w-auto"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'שומר...' : `שמור הכל${dirtyAddresses.size + deletedAddresses.size > 0 ? ` (${dirtyAddresses.size + deletedAddresses.size})` : ''}`}
          </button>
        </div>

        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-200 border border-blue-100" style={{ height: '60vh', width: '100%', overflowX: 'auto' }}>
          <AgGridReact<AddressList>
            ref={gridRef}
            rowData={addresses}
            columnDefs={columnDefs}
            defaultColDef={{
              resizable: true,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              wrapText: true,
              autoHeight: false,
              sortable: true,
              filter: true,
              headerClass: 'ag-right-aligned-header',
              headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
              cellStyle: { textAlign: 'right' },
              minWidth: 40
            }}
            gridOptions={{
              suppressColumnVirtualisation: true,
              alwaysShowHorizontalScroll: true,
              suppressMovableColumns: true,
              suppressColumnMoveAnimation: true,
              rowBuffer: 20, // Increase buffer for smoother vertical scrolling
              debounceVerticalScrollbar: true,
              suppressRowVirtualisation: false, // Keep row virtualization enabled for better performance
              suppressCellFocus: false, // Allow cell focus for keyboard navigation
              suppressRowClickSelection: false,
              suppressScrollOnNewData: true,
              enableCellTextSelection: true, // Allow AG Grid default text selection behavior
              suppressAnimationFrame: false, // Use animation frame for smoother updates
              enableRangeSelection: false, // Disable range selection for better keyboard navigation
              enableRangeHandle: false, // Disable range handle for better keyboard navigation
            }}
            suppressHorizontalScroll={false}
            suppressRowVirtualisation={false}
            getRowId={(params) => String(params.data.street_code)}
            enterNavigatesVertically={true}
            enterNavigatesVerticallyAfterEdit={true}
            suppressKeyboardEvent={(params) => {
              // Allow arrow keys to navigate between cells
              // Don't suppress any keyboard events - let AG Grid handle navigation
              return false;
            }}
            onGridReady={async (params) => {
              await gridPreferences.loadColumnState(params.api);
              setTimeout(() => {
                detectAndApplyTextOverflow(params.api);
              }, 200);
            }}
            onFirstDataRendered={async (params) => {
              setTimeout(() => {
                detectAndApplyTextOverflow(params.api);
                setupTextOverflowObserver(params.api);
              }, 200);
            }}
            onColumnResized={(params) => {
              gridPreferences.handleColumnResized();
              setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
            }}
            onColumnMoved={gridPreferences.handleColumnMoved}
            onSortChanged={() => {}}
            onCellValueChanged={onCellValueChanged}
            singleClickEdit={true}
            stopEditingWhenCellsLoseFocus={true}
            enableRtl={true}
            animateRows={true}
            tooltipShowDelay={200}
            tooltipHideDelay={10000}
          />
        </div>
      </div>
    </div>
  );
}

