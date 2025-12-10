import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AddressList, api } from '../lib/api';
import { Upload, Save, X, Loader2, MapPin, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';

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

  function handleExportTemplate() {
    // Create template data with headers and example rows
    const templateData = [
      ['סמל_רחוב', 'שם_רחוב'],
      ['1001', 'רחוב הרצל'],
      ['1002', 'רחוב ויצמן'],
      ['1003', 'רחוב בן גוריון']
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // סמל_רחוב
      { wch: 30 }  // שם_רחוב
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'תבנית כתובות');

    // Generate file and download
    XLSX.writeFile(wb, 'תבנית_רשימת_כתובות.xlsx');
  }

  const onCellValueChanged = useCallback(async (event: any) => {
    const address = event.data as AddressList;
    if (!address || !address.street_code) return;

    const field = event.colDef.field;
    const newValue = event.newValue;
    const oldValue = event.oldValue;

    if (newValue === oldValue) return;

    setDirtyAddresses(prev => {
      const next = new Map(prev);
      const existing = next.get(address.street_code) || {};
      next.set(address.street_code, { ...existing, [field]: newValue });
      return next;
    });
  }, []);

  async function handleSaveAll() {
    if (dirtyAddresses.size === 0 && deletedAddresses.size === 0) {
      return;
    }

    setIsSaving(true);
    try {
      // Handle deletions
      for (const streetCode of deletedAddresses) {
        await api.addressList.delete(streetCode);
      }

      // Handle updates
      for (const [streetCode, changes] of dirtyAddresses) {
        if (deletedAddresses.has(streetCode)) continue;
        await api.addressList.update(streetCode, changes);
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

  const columnDefs: ColDef<AddressList>[] = useMemo(() => [
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
  ], [dirtyAddresses, deletedAddresses]);

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
              onClick={handleExportTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              title="הורד תבנית לקובץ Excel"
            >
              <Download className="h-5 w-5" />
              <span className="hidden sm:inline">הורד תבנית</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
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
            className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold w-full sm:w-auto"
          >
            <X className="h-4 w-4" />
            {t('cancel')}
          </button>
          <button
            onClick={handleSaveAll}
            disabled={isSaving || (dirtyAddresses.size === 0 && deletedAddresses.size === 0)}
            className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold w-full sm:w-auto"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'שומר...' : `שמור הכל${dirtyAddresses.size + deletedAddresses.size > 0 ? ` (${dirtyAddresses.size + deletedAddresses.size})` : ''}`}
          </button>
        </div>

        <div className="ag-theme-alpine rounded-xl overflow-hidden shadow-lg border border-blue-100" style={{ height: '60vh', width: '100%', overflowX: 'auto' }}>
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
              minWidth: 100
            }}
            gridOptions={{
              suppressColumnVirtualisation: true,
              alwaysShowHorizontalScroll: true,
            }}
            suppressHorizontalScroll={false}
            getRowId={(params) => String(params.data.street_code)}
            onGridReady={async (params) => {
            }}
            onFirstDataRendered={async (params) => {
            }}
            onColumnResized={gridPreferences.handleColumnResized}
            onColumnMoved={gridPreferences.handleColumnMoved}
            onSortChanged={() => {}}
            onCellValueChanged={onCellValueChanged}
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

