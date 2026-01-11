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

export interface ExcelExportOptions {
  filename: string;
  sheetName?: string;
  data: any[][];
  columnWidths?: { wch: number }[];
}

/**
 * Prevent spreadsheet formula injection / suspicious cell patterns.
 * If a cell starts with =, +, -, @ (after optional whitespace), Excel may treat it as a formula.
 * We prefix with an apostrophe to force text.
 */
function sanitizeSpreadsheetCell(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;

  // Avoid double-prefixing
  if (value.startsWith("'")) return value;

  // If first non-whitespace char is a formula trigger, force text
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
    const { filename, sheetName = 'Sheet1', data, columnWidths } = options;

    // Validate data
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Excel data must be a non-empty array');
    }

    // Create worksheet from data (sanitize cell values to avoid formula injection / AV suspicion)
    const safeData = data.map(row => (Array.isArray(row) ? row.map(sanitizeSpreadsheetCell) : row)) as any[][];
    const worksheet = XLSX.utils.aoa_to_sheet(safeData);

    // Set column widths if provided
    if (columnWidths && columnWidths.length > 0) {
      worksheet['!cols'] = columnWidths;
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();

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
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

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
    const fileData = XLSX.write(workbook, writeOptions);
    
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
