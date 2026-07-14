/**
 * Excel Export Helper
 * Provides standardized Excel export functionality to reduce antivirus false positives
 * 
 * Additional measures to reduce McAfee and other antivirus false positives:
 * - Uses explicit write options with standard compression
 * - Sets comprehensive workbook metadata
 * - Ensures proper file structure and cell formatting
 * - Uses standard Excel file format specifications
 */

import * as XLSX from 'xlsx';
// xlsx-js-style is a drop-in fork of xlsx whose writer honours cell.s
// (fill/font/border/etc). The community xlsx build silently drops styles on
// write, so anything that needs coloured rows MUST go through this build.
import * as XLSXStyle from 'xlsx-js-style';

/** Per-cell style applied to every cell of the specified 0-based row indices. */
export interface RowStyleSpec {
  /** 0-based row indices (relative to `data`, including the header row at 0). */
  rowIndices: number[];
  /** xlsx-js-style cell style (fill/font/border). */
  style: any;
}

export interface ExcelExportOptions {
  filename: string;
  sheetName?: string;
  data: any[][];
  columnWidths?: { wch: number }[];
  /** 0-based column indices for size fields that should display with .00 format in Excel */
  decimalFormatColumnIndices?: number[];
  /** Optional per-row styles. When any rowStyles is supplied the writer switches
   *  to xlsx-js-style so cell.s survives the write. */
  rowStyles?: RowStyleSpec[];
}

/** Number format for size/numeric cells so Excel shows values with .00 (e.g. 5 → 5.00) */
const NUMERIC_FORMAT = '0.00';

/**
 * Apply number format 0.00 only to numeric cells in the given column indices (e.g. size columns).
 * When columnIndices is undefined or empty NOTHING is formatted — callers that don't
 * specify size columns (e.g. the עדכון_פרטי_נכס sheet whose values are all integers)
 * should keep Excel's default integer-aware formatting. The previous version of this
 * function treated a missing list as "format every numeric cell", which made integer
 * fields render as 100.00 / 200.00 in those exports.
 */
function applyNumericFormat(worksheet: XLSX.WorkSheet, columnIndices?: number[]): void {
  if (!columnIndices || columnIndices.length === 0) return;
  const ref = worksheet['!ref'];
  if (!ref) return;
  const set = new Set(columnIndices);
  const range = XLSX.utils.decode_range(ref);
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      if (!set.has(C)) continue;
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = worksheet[addr];
      if (cell && cell.t === 'n' && typeof cell.v === 'number') {
        cell.z = NUMERIC_FORMAT;
      }
    }
  }
}

/**
 * Prevent spreadsheet formula injection / suspicious cell patterns.
 * If a cell starts with =, +, -, @ (after optional whitespace), Excel may treat it as a formula.
 * We prefix with an apostrophe to force text — EXCEPT for plain numeric values (including
 * negative numbers like "-2") which are safe and should be written as numbers in Excel.
 */
function sanitizeSpreadsheetCell(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;

  // Avoid double-prefixing
  if (value.startsWith("'")) return value;

  const trimmed = value.trim();

  // Plain numeric strings (including negatives like "-2", "-1.5") → write as Excel numbers.
  // This prevents the apostrophe prefix and makes the values sortable in Excel.
  // Number() is safe here: "" → 0 (excluded by trimmed !== ''), "  " → 0 (excluded),
  // "-2" → -2 ✓, "1-" (Hebrew trailing minus) → NaN → falls through.
  if (trimmed !== '' && !isNaN(Number(trimmed)) && isFinite(Number(trimmed))) {
    return Number(trimmed);
  }

  // If first non-whitespace char is a formula trigger (=, +, -, @), force text prefix.
  // This catches things like "=SUM(...)" or "+1.5%" but not plain negative numbers (handled above).
  if (/^\s*[=+\-@]/.test(value)) {
    return `'${value}`;
  }

  return value;
}

/**
 * Export data to Excel with options to reduce antivirus false positives
 * 
 * This function uses write options that create more standard Excel files:
 * - Sets comprehensive workbook properties (author, created date, company, keywords, comments)
 * - Uses explicit write options with standard compression
 * - Sets proper cell types to avoid suspicious patterns
 * - Adds standard workbook structure
 * - Uses proper dates and metadata to match typical Excel file patterns
 */
export function exportToExcel(options: ExcelExportOptions): void {
  try {
    const { filename, sheetName = 'Sheet1', data, columnWidths, rowStyles } = options;

    // Validate data
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Excel data must be a non-empty array');
    }

    // If styled rows are requested we route through xlsx-js-style; its
    // aoa_to_sheet/write pair honour cell.s. Otherwise stay on the plain xlsx
    // build so the AV-friendly output path is unchanged.
    const useStyled = !!(rowStyles && rowStyles.length > 0);
    const XLSXImpl: any = useStyled ? XLSXStyle : XLSX;

    // Create worksheet from data (sanitize cell values to avoid formula injection / AV suspicion)
    const safeData = data.map(row => (Array.isArray(row) ? row.map(sanitizeSpreadsheetCell) : row)) as any[][];
    const worksheet = XLSXImpl.utils.aoa_to_sheet(safeData);

    // Format size columns (when specified) as .00
    applyNumericFormat(worksheet, options.decimalFormatColumnIndices);

    // Apply per-row styles when supplied. We touch every column in the row so
    // the whole line reads as one visual band. Existing cell.z (number format)
    // is preserved.
    if (useStyled) {
      const ref = worksheet['!ref'];
      if (ref) {
        const range = XLSXStyle.utils.decode_range(ref);
        for (const spec of rowStyles!) {
          for (const R of spec.rowIndices) {
            if (R < range.s.r || R > range.e.r) continue;
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const addr = XLSXStyle.utils.encode_cell({ r: R, c: C });
              const cell = worksheet[addr] ?? (worksheet[addr] = { t: 's', v: '' });
              cell.s = { ...(cell.s ?? {}), ...spec.style };
            }
          }
        }
      }
    }

    // Set column widths if provided
    if (columnWidths && columnWidths.length > 0) {
      worksheet['!cols'] = columnWidths;
    }

    // Create workbook
    const workbook = XLSXImpl.utils.book_new();

    // Get current date for metadata
    const now = new Date();

    // Set comprehensive workbook properties to make file look more standard
    // Extensive metadata helps reduce antivirus false positives by making the file
    // look like it was created by a standard Excel application
    workbook.Props = {
      Title: sheetName,
      Subject: 'Data Export',
      Author: 'Buildings Manager',
      CreatedDate: now,
      ModifiedDate: now,
      LastSavedBy: 'Buildings Manager',
      Company: 'Buildings Management System',
      Category: 'Data Export',
      Keywords: 'export, data, buildings',
      Comments: 'Exported from Buildings Management System'
    };

    // Add worksheet to workbook
    XLSXImpl.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Write file with explicit options to reduce false positives
    // Using explicit write options ensures standard file format that antivirus software
    // recognizes as legitimate Excel files
    const writeOptions: XLSX.WritingOptions = {
      bookType: 'xlsx',
      bookSST: false, // Don't use shared string table - more standard format
      type: 'array',
      compression: true, // Use standard ZIP compression
      cellDates: true // Proper date handling
    };

    // Generate the file as array buffer
    const fileData = XLSXImpl.write(workbook, writeOptions);
    
    // Create a Blob with proper MIME type
    const blob = new Blob([fileData], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    
    // Create download link and trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw error;
  }
}

/**
 * Create Excel file as Blob (without downloading)
 * Useful for creating ZIP files
 * 
 * @param options Excel export options
 * @returns Blob containing the Excel file
 */
export function createExcelBlob(options: ExcelExportOptions): Blob {
  try {
    const { sheetName = 'Sheet1', data, columnWidths } = options;

    // Validate data
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Excel data must be a non-empty array');
    }

    // Create worksheet from data (sanitize cell values to avoid formula injection / AV suspicion)
    const safeData = data.map(row => (Array.isArray(row) ? row.map(sanitizeSpreadsheetCell) : row)) as any[][];
    const worksheet = XLSX.utils.aoa_to_sheet(safeData);

    // Format size columns (when specified) as .00
    applyNumericFormat(worksheet, options.decimalFormatColumnIndices);

    // Set column widths if provided
    if (columnWidths && columnWidths.length > 0) {
      worksheet['!cols'] = columnWidths;
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Get current date for metadata
    const now = new Date();

    // Set comprehensive workbook properties
    workbook.Props = {
      Title: sheetName,
      Subject: 'Data Export',
      Author: 'Buildings Manager',
      CreatedDate: now,
      ModifiedDate: now,
      LastSavedBy: 'Buildings Manager',
      Company: 'Buildings Management System',
      Category: 'Data Export',
      Keywords: 'export, data, buildings',
      Comments: 'Exported from Buildings Management System'
    };

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Write file with explicit options
    const writeOptions: XLSX.WritingOptions = {
      bookType: 'xlsx',
      bookSST: false,
      type: 'array',
      compression: true,
      cellDates: true
    };

    // Generate the file as array buffer
    const fileData = XLSX.write(workbook, writeOptions);
    
    // Create a Blob with proper MIME type
    return new Blob([fileData], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  } catch (error) {
    console.error('Error creating Excel blob:', error);
    throw error;
  }
}

/**
 * Legacy export function for backward compatibility
 * Uses the new exportToExcel function internally
 */
export function exportToExcelLegacy(
  data: any[][],
  filename: string,
  sheetName: string = 'Sheet1',
  columnWidths?: { wch: number }[]
): void {
  exportToExcel({
    filename,
    sheetName,
    data,
    columnWidths
  });
}
