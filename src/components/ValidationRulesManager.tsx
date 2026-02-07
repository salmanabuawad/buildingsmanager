import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ValidationRule, api } from '../lib/api';
import { useValidationRules } from '../contexts/ValidationContext';
import { Settings, Plus, Save, X, RefreshCw, Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { useGridPreferences } from '../lib/useGridPreferences';
import { processColumnHeader } from '../lib/gridHeaderUtils';
import { detectAndApplyTextOverflow, setupTextOverflowObserver } from '../lib/textOverflowDetector';
import { exportToExcel } from '../lib/excelExport';

export function ValidationRulesManager() {
  const { t } = useTranslation();
  const { refreshRules } = useValidationRules();
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emptyRule: Omit<ValidationRule, 'id' | 'created_at' | 'updated_at'> = {
    rule_key: '',
    rule_type: 'required',
    field_name: '',
    entity_type: '',
    value_numeric: undefined,
    value_text: '',
    enabled: true,
    error_message: '',
    description: '',
    compare_table: undefined,
    compare_field: undefined,
    join_field: undefined,
    comparison_operator: undefined,
  };

  const [formData, setFormData] = useState(emptyRule);
  const [editValues, setEditValues] = useState<Partial<ValidationRule>>({});

  useEffect(() => {
    fetchRules();
  }, []);

  async function fetchRules() {
    try {
      setLoading(true);
      console.log('Fetching validation rules...');
      const data = await api.validationRules.getAll();
      console.log('Fetched validation rules:', data.length, 'rules');
      console.log('Sample rule:', data[0]);
      setRules(data);
    } catch (error) {
      console.error('Error fetching validation rules:', error);
      showMessage('error', 'שגיאה בטעינת כללי תקינות');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshCache() {
    try {
      // Refresh rules in context (which will update the in-memory store)
      await refreshRules();
      showMessage('success', 'מטמון רוענן בהצלחה');
    } catch (error) {
      showMessage('error', 'שגיאה בריענון מטמון');
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleExportToExcel() {
    if (!rules || rules.length === 0) {
      showMessage('error', 'אין כללי תקינות לייצוא');
      return;
    }

    try {
      // Define headers
      const headers = [
        t('enabled'),
        t('ruleKey'),
        t('entityType'),
        t('fieldName'),
        t('ruleType'),
        t('numericValue'),
        t('textValue'),
        t('errorMessage'),
        t('compareTable'),
        t('compareField'),
        t('joinField'),
        t('operator')
      ];

      // Convert rules to rows
      const rows = rules.map(rule => [
        rule.enabled ? 'כן' : 'לא',
        rule.rule_key || '',
        rule.entity_type || '',
        rule.field_name || '',
        rule.rule_type || '',
        rule.value_numeric || '',
        rule.value_text || '',
        rule.error_message || '',
        rule.compare_table || '',
        rule.compare_field || '',
        rule.join_field || '',
        rule.comparison_operator || ''
      ]);

      // Create data array with headers and rows
      const data = [headers, ...rows];

      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const filename = `כללי_תקינות_${dateStr}.xlsx`;

      // Use improved export function to reduce antivirus false positives
      exportToExcel({
        filename,
        sheetName: 'כללי תקינות',
        data,
        columnWidths: [
          { wch: 8 },  // enabled
          { wch: 20 }, // rule_key
          { wch: 15 }, // entity_type
          { wch: 20 }, // field_name
          { wch: 15 }, // rule_type
          { wch: 12 }, // value_numeric
          { wch: 20 }, // value_text
          { wch: 30 }, // error_message
          { wch: 20 }, // compare_table
          { wch: 20 }, // compare_field
          { wch: 20 }, // join_field
          { wch: 15 }  // comparison_operator
        ]
      });
      
      showMessage('success', `יוצאו ${rows.length} כללי תקינות בהצלחה`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      showMessage('error', 'שגיאה בייצוא לקובץ Excel');
    }
  }

  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      // Check if it's Excel file
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      
      let rows: any[][] = [];
      
      if (isExcel) {
        // Handle Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
      } else {
        // Handle CSV file
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        
        // Parse CSV lines - handle quoted values
        for (const line of lines) {
          const parts: string[] = [];
          let current = '';
          let inQuotes = false;
          
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
          rows.push(parts);
        }
      }

      if (rows.length === 0) {
        showMessage('error', 'קובץ ריק');
        return;
      }

      // Process headers - normalize and create mapping
      const originalHeaders = rows[0].map(h => String(h || '').trim());
      const normalizedHeaders = originalHeaders.map(h => h.toLowerCase());
      
      // Define exact field name mappings (Hebrew and English)
      const fieldMappings: Record<string, string> = {
        // enabled field
        'enabled': 'enabled',
        'מופעל': 'enabled',
        'פעיל': 'enabled',
        // rule_key field
        'rule_key': 'rule_key',
        'rulekey': 'rule_key',
        'מפתח כלל': 'rule_key',
        'מפתחכלל': 'rule_key',
        // entity_type field
        'entity_type': 'entity_type',
        'entitytype': 'entity_type',
        'סוג ישות': 'entity_type',
        'סוגישות': 'entity_type',
        // field_name field
        'field_name': 'field_name',
        'fieldname': 'field_name',
        'שם שדה': 'field_name',
        'שםשדה': 'field_name',
        // rule_type field
        'rule_type': 'rule_type',
        'ruletype': 'rule_type',
        'סוג כלל': 'rule_type',
        'סוגכלל': 'rule_type',
        // value_numeric field
        'value_numeric': 'value_numeric',
        'valuenumeric': 'value_numeric',
        'ערך מספרי': 'value_numeric',
        'ערכמספרי': 'value_numeric',
        // value_text field
        'value_text': 'value_text',
        'valuetext': 'value_text',
        'ערך טקסט': 'value_text',
        'ערכטקסט': 'value_text',
        // error_message field
        'error_message': 'error_message',
        'errormessage': 'error_message',
        'הודעת שגיאה': 'error_message',
        'הודעתשגיאה': 'error_message',
        // description field
        'description': 'description',
        'תיאור': 'description',
        // compare_table field
        'compare_table': 'compare_table',
        'comparetable': 'compare_table',
        'טבלת השוואה': 'compare_table',
        'טבלתהשוואה': 'compare_table',
        // compare_field field
        'compare_field': 'compare_field',
        'comparefield': 'compare_field',
        'שדה השוואה': 'compare_field',
        'שדההשוואה': 'compare_field',
        // join_field field
        'join_field': 'join_field',
        'joinfield': 'join_field',
        'שדה חיבור': 'join_field',
        'שדהחיבור': 'join_field',
        // comparison_operator field
        'comparison_operator': 'comparison_operator',
        'comparisonoperator': 'comparison_operator',
        'אופרטור השוואה': 'comparison_operator',
        'אופרטורהשוואה': 'comparison_operator',
        'operator': 'comparison_operator',
        'אופרטור': 'comparison_operator',
      };

      // Create header mapping - map column index to field name
      const headerMap: Record<string, number> = {};
      for (let i = 0; i < originalHeaders.length; i++) {
        const header = originalHeaders[i];
        const normalized = normalizedHeaders[i];
        const fieldName = fieldMappings[header] || fieldMappings[normalized];
        if (fieldName) {
          headerMap[fieldName] = i;
        }
      }

      // Validate required fields
      if (headerMap['rule_key'] === undefined) {
        showMessage('error', 'שדה חובה חסר: "מפתח כלל" או "rule_key"');
        return;
      }
      if (headerMap['field_name'] === undefined) {
        showMessage('error', 'שדה חובה חסר: "שם שדה" או "field_name"');
        return;
      }
      if (headerMap['entity_type'] === undefined) {
        showMessage('error', 'שדה חובה חסר: "סוג ישות" או "entity_type"');
        return;
      }
      if (headerMap['rule_type'] === undefined) {
        showMessage('error', 'שדה חובה חסר: "סוג כלל" או "rule_type"');
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Parse and import each data row (skip header row)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Extract values by field name using header mapping
        const getValue = (fieldName: string): string => {
          const colIndex = headerMap[fieldName];
          if (colIndex === undefined || colIndex >= row.length) return '';
          return String(row[colIndex] || '').trim();
        };

        const rule_key = getValue('rule_key');
        const field_name = getValue('field_name');
        const entity_type = getValue('entity_type');
        const rule_type = getValue('rule_type');
        
        // Skip empty rows
        if (!rule_key || !field_name || !entity_type || !rule_type) {
          continue;
        }

        try {
          // Extract all field values
          const enabledStr = getValue('enabled');
          const value_numericStr = getValue('value_numeric');
          const value_text = getValue('value_text');
          const error_message = getValue('error_message');
          const description = getValue('description');
          const compare_table = getValue('compare_table');
          const compare_field = getValue('compare_field');
          const join_field = getValue('join_field');
          const comparison_operator = getValue('comparison_operator');

          // Parse enabled field - default to true if not specified
          const enabled = enabledStr === '' || enabledStr === undefined 
            ? true 
            : (enabledStr.toLowerCase() === 'כן' || enabledStr.toLowerCase() === 'yes' || enabledStr === '1' || enabledStr === 'true' || enabledStr === '✓');

          // Parse value_numeric
          const value_numeric = value_numericStr ? parseInt(value_numericStr) : undefined;

          const ruleData: Omit<ValidationRule, 'id' | 'created_at' | 'updated_at'> = {
            rule_key,
            field_name,
            entity_type,
            rule_type,
            enabled,
            value_numeric: isNaN(value_numeric as any) ? undefined : value_numeric,
            value_text: value_text || undefined,
            error_message: error_message || undefined,
            description: description || undefined,
            compare_table: compare_table || undefined,
            compare_field: compare_field || undefined,
            join_field: join_field || undefined,
            comparison_operator: comparison_operator || undefined,
          };

          // Try to create the rule
          try {
            await api.validationRules.create(ruleData);
            successCount++;
          } catch (createError: any) {
            // If rule already exists (unique constraint on rule_key), try to update it
            if (createError.message?.includes('duplicate') || createError.message?.includes('unique')) {
              try {
                // Get existing rule by key
                const existingRule = await api.validationRules.getByKey(rule_key);
                await api.validationRules.update(existingRule.id, ruleData);
                successCount++;
              } catch (updateError: any) {
                errors.push(`שורה ${i + 1}: ${updateError.message || 'שגיאה בעדכון כלל'}`);
                errorCount++;
              }
            } else {
              errors.push(`שורה ${i + 1}: ${createError.message || 'שגיאה ביצירת כלל'}`);
              errorCount++;
            }
          }
        } catch (error) {
          errors.push(`שורה ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          errorCount++;
        }
      }

      await fetchRules();
      await handleRefreshCache();

      if (errors.length > 0) {
        showMessage('error', `יובאו ${successCount} כללי תקינות. ${errorCount} שגיאות: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
      } else {
        showMessage('success', `יובאו בהצלחה ${successCount} כללי תקינות`);
      }
    } catch (error) {
      console.error('Error importing validation rules:', error);
      showMessage('error', 'שגיאה בקריאת קובץ Excel');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleAdd() {
    setFormData(emptyRule);
    setIsAdding(true);
  }

  async function handleSave() {
    if (!formData.rule_key.trim()) {
      showMessage('error', 'מפתח כלל נדרש');
      return;
    }

    if (!formData.field_name.trim()) {
      showMessage('error', 'שם שדה נדרש');
      return;
    }

    if (!formData.entity_type.trim()) {
      showMessage('error', 'סוג ישות נדרש');
      return;
    }

    try {
      await api.validationRules.create(formData);
      showMessage('success', 'כלל תקינות נוצר בהצלחה');
      setIsAdding(false);
      setFormData(emptyRule);
      fetchRules();
      handleRefreshCache();
    } catch (error: any) {
      showMessage('error', error.message || 'שגיאה ביצירת כלל');
    }
  }

  function startEdit(rule: ValidationRule) {
    setEditingId(rule.id);
    setEditValues({
      rule_key: rule.rule_key,
      rule_type: rule.rule_type,
      field_name: rule.field_name,
      entity_type: rule.entity_type,
      value_numeric: rule.value_numeric,
      value_text: rule.value_text,
      enabled: rule.enabled,
      error_message: rule.error_message,
      description: rule.description,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  async function saveEdit(id: string) {
    try {
      await api.validationRules.update(id, editValues);
      showMessage('success', 'כלל תקינות עודכן בהצלחה');
      setEditingId(null);
      setEditValues({});
      fetchRules();
      handleRefreshCache();
    } catch (error: any) {
      showMessage('error', error.message || 'שגיאה בעדכון כלל');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק כלל תקינות זה?')) return;

    try {
      await api.validationRules.delete(id);
      showMessage('success', 'כלל תקינות נמחק בהצלחה');
      fetchRules();
      handleRefreshCache();
    } catch (error: any) {
      showMessage('error', error.message || 'שגיאה במחיקת כלל');
    }
  }

  const columnDefs: ColDef[] = useMemo(() => {
    const defs: ColDef[] = [
    {
      colId: 'actions',
      headerName: t('actions'),
      pinned: 'right',
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        if (!params.data) return null;
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <div className="flex gap-1">
              <button
                onClick={() => saveEdit(rule.id)}
                className="p-1 text-teal-600 hover:text-teal-700"
                title={t('save')}
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                onClick={cancelEdit}
                className="p-1 text-slate-600 hover:text-slate-700"
                title={t('cancel')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        }
        return (
          <div className="flex gap-1">
            <button
              onClick={() => startEdit(rule)}
              className="px-2 py-1 text-sm text-teal-600 hover:text-teal-700"
            >
              {t('edit')}
            </button>
            <button
              onClick={() => handleDelete(rule.id)}
              className="px-2 py-1 text-sm text-red-600 hover:text-red-700"
            >
              {t('delete')}
            </button>
          </div>
        );
      }
    },
    {
      headerName: t('enabled'),
      field: 'enabled',
      editable: true,
      cellRenderer: (params: any) => {
        if (!params.data) return '';
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <input
              type="checkbox"
              checked={editValues.enabled ?? rule.enabled}
              onChange={(e) => setEditValues({ ...editValues, enabled: e.target.checked })}
              className="h-4 w-4"
            />
          );
        }
        return rule.enabled ? '✓' : '✗';
      }
    },
    { headerName: t('ruleKey'), field: 'rule_key' },
    { headerName: t('entityType'), field: 'entity_type' },
    { headerName: t('fieldName'), field: 'field_name' },
    { headerName: t('ruleType'), field: 'rule_type' },
    {
      headerName: t('numericValue'),
      field: 'value_numeric',
      cellRenderer: (params: any) => {
        if (!params.data) return '';
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <input
              type="number"
              value={editValues.value_numeric ?? rule.value_numeric ?? ''}
              onChange={(e) => setEditValues({ ...editValues, value_numeric: e.target.value ? parseInt(e.target.value) : undefined })}
              className="w-full px-2 py-1 border rounded"
            />
          );
        }
        return rule.value_numeric ?? '';
      }
    },
    {
      headerName: t('textValue'),
      field: 'value_text',
      cellRenderer: (params: any) => {
        if (!params.data) return '';
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <input
              type="text"
              value={editValues.value_text ?? rule.value_text ?? ''}
              onChange={(e) => setEditValues({ ...editValues, value_text: e.target.value })}
              className="w-full px-2 py-1 border rounded"
            />
          );
        }
        return rule.value_text ?? '';
      }
    },
    {
      headerName: t('errorMessage'),
      field: 'error_message',
      cellRenderer: (params: any) => {
        if (!params.data) return '';
        const rule = params.data as ValidationRule;
        if (editingId === rule.id) {
          return (
            <input
              type="text"
              value={editValues.error_message ?? rule.error_message ?? ''}
              onChange={(e) => setEditValues({ ...editValues, error_message: e.target.value })}
              className="w-full px-2 py-1 border rounded"
            />
          );
        }
        return rule.error_message ?? '';
      }
    },
    { headerName: t('compareTable'), field: 'compare_table' },
    { headerName: t('compareField'), field: 'compare_field' },
    { headerName: t('joinField'), field: 'join_field' },
    { headerName: t('operator'), field: 'comparison_operator' },
    {
      field: 'extra_field_1',
      headerName: '',
      editable: false
    },
    {
      field: 'extra_field_2',
      headerName: '',
      editable: false
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
  }, [editingId, editValues]);

  const gridRef = useRef<AgGridReact<ValidationRule>>(null);
  
  // Grid preferences hook for saving/loading column state
  const gridPreferences = useGridPreferences(
    gridRef,
    'validation-rules-manager',
    'default'
  );

  const defaultColDef = useMemo(() => ({
    resizable: true,
    wrapHeaderText: true,
    autoHeaderHeight: true,
    wrapText: true,
    autoHeight: true,
    headerStyle: { fontSize: '11px', textAlign: 'right', fontWeight: 'normal', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
    cellStyle: { textAlign: 'right' },
    minWidth: 40
  }), []);

  const gridOptions = useMemo(() => ({
    suppressColumnVirtualisation: true,
    alwaysShowHorizontalScroll: true,
    suppressMovableColumns: true,
    suppressColumnMoveAnimation: true,
  }), []);

  const onGridReady = useCallback(async (params: any) => {
    console.log('Grid ready, rules count:', rules.length);
  }, [rules]);

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg shadow-lg">
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-teal-600" />
          <h2 className="text-lg font-bold text-slate-800">{t('validationRules')}</h2>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="h-4 w-4" />
            {isImporting ? 'מייבא...' : 'ייבא מ-Excel'}
          </button>
          <button
            onClick={handleExportToExcel}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            ייצא ל-Excel
          </button>
          <button
            onClick={handleRefreshCache}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            {t('refreshCache')}
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('addRule')}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mx-6 mt-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {isAdding && (
        <div className="m-6 p-6 bg-slate-50 rounded-lg border border-slate-200">
          <h3 className="text-lg font-semibold mb-4">{t('addRule')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('ruleKey')} *</label>
              <input
                type="text"
                value={formData.rule_key}
                onChange={(e) => setFormData({ ...formData, rule_key: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="asset_type_name_required"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('entityType')} *</label>
              <select
                value={formData.entity_type}
                onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">בחר...</option>
                <option value="asset_type">סוג נכס</option>
                <option value="asset">נכס</option>
                <option value="building">מבנה</option>
                <option value="measurement">מדידה</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('fieldName')} *</label>
              <input
                type="text"
                value={formData.field_name}
                onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Type name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('ruleType')} *</label>
              <select
                value={formData.rule_type}
                onChange={(e) => setFormData({ ...formData, rule_type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="required">נדרש</option>
                <option value="exact_length">אורך מדויק</option>
                <option value="min_length">אורך מינימלי</option>
                <option value="max_length">אורך מקסימלי</option>
                <option value="pattern">תבנית</option>
                <option value="numeric">מספרי</option>
                <option value="positive_number">מספר חיובי</option>
                <option value="exists_in_table">קיים בטבלה</option>
                <option value="cross_table_comparison">השוואה בין טבלאות</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('numericValue')}</label>
              <input
                type="number"
                value={formData.value_numeric ?? ''}
                onChange={(e) => setFormData({ ...formData, value_numeric: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('textValue')}</label>
              <input
                type="text"
                value={formData.value_text ?? ''}
                onChange={(e) => setFormData({ ...formData, value_text: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="^\d{3}$"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">{t('errorMessage')}</label>
              <input
                type="text"
                value={formData.error_message ?? ''}
                onChange={(e) => setFormData({ ...formData, error_message: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Field is required"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">{t('description')}</label>
              <input
                type="text"
                value={formData.description ?? ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Description of what this rule validates"
              />
            </div>
            {formData.rule_type === 'exists_in_table' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Compare Table</label>
                  <input
                    type="text"
                    value={formData.compare_table ?? ''}
                    onChange={(e) => setFormData({ ...formData, compare_table: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="asset_types"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Compare Field</label>
                  <input
                    type="text"
                    value={formData.compare_field ?? ''}
                    onChange={(e) => setFormData({ ...formData, compare_field: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="tax_region"
                  />
                </div>
              </>
            )}
            {formData.rule_type === 'cross_table_comparison' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Compare Table</label>
                  <input
                    type="text"
                    value={formData.compare_table ?? ''}
                    onChange={(e) => setFormData({ ...formData, compare_table: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="building"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Compare Field</label>
                  <input
                    type="text"
                    value={formData.compare_field ?? ''}
                    onChange={(e) => setFormData({ ...formData, compare_field: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="area_for_control"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Join Field</label>
                  <input
                    type="text"
                    value={formData.join_field ?? ''}
                    onChange={(e) => setFormData({ ...formData, join_field: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="building_number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Comparison Operator</label>
                  <select
                    value={formData.comparison_operator ?? ''}
                    onChange={(e) => setFormData({ ...formData, comparison_operator: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select...</option>
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                  </select>
                </div>
              </>
            )}
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="h-4 w-4"
              />
              <label className="text-sm font-medium">{t('enabled')}</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              {t('save')}
            </button>
            <button
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-600">{t('loading')}</div>
          </div>
        ) : rules.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-600">לא נמצאו כללי תקינות</div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="mb-2 text-sm text-slate-600">
              מציג {rules.length} כללי תקינות
            </div>
            <div className="ag-theme-alpine" style={{ height: '60vh', width: '100%', overflowX: 'auto' }}>
              <AgGridReact
                ref={gridRef}
                rowData={rules}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                gridOptions={gridOptions}
                suppressHorizontalScroll={false}
                onGridReady={async (params) => {
                  await gridPreferences.loadColumnState(params.api);
                  onGridReady(params);
                }}
                onFirstDataRendered={async (params) => {
                  setTimeout(() => {
                    const gridElement = document.querySelector('.ag-body-horizontal-scroll-viewport');
                    if (gridElement) {
                      gridElement.scrollLeft = 0;
                    }
                    // Detect and apply text overflow fade
                    detectAndApplyTextOverflow(params.api);
                    // Set up observer for dynamic changes
                    setupTextOverflowObserver(params.api);
                  }, 200);
                }}
                onColumnResized={(params) => {
                  gridPreferences.handleColumnResized();
                  setTimeout(() => detectAndApplyTextOverflow(params.api), 100);
                }}
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
                  // Save column state after move
                  gridPreferences.handleColumnMoved();
                }}
                onSortChanged={() => {}}
                pagination={true}
                paginationPageSize={20}
                paginationPageSizeSelector={[10, 20, 50, 100]}
                singleClickEdit={true}
                stopEditingWhenCellsLoseFocus={true}
                enableRtl={true}
                animateRows={false}
                getRowId={(params) => params.data.id}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
