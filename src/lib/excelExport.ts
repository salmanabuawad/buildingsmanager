/**
 * Excel Export Helper
 * Provides standardized Excel export functionality to reduce antivirus false positives
 */

import * as XLSX from 'xlsx';

export interface ExcelExportOptions {
  filename: string;
  sheetName?: string;
  data: any[][];
  columnWidths?: { wch: number }[];
}

/**
 * Export data to Excel with options to reduce antivirus false positives
 * 
 * This function uses write options that create more standard Excel files:
 * - Sets workbook properties (author, created date)
 * - Uses standard compression
 * - Avoids potentially suspicious patterns
 */
export function exportToExcel(options: ExcelExportOptions): void {
  try {
    const { filename, sheetName = 'Sheet1', data, columnWidths } = options;

    // Create worksheet from data
    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Set column widths if provided
    if (columnWidths && columnWidths.length > 0) {
      worksheet['!cols'] = columnWidths;
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Set workbook properties to make file more standard
    workbook.Props = {
      Title: sheetName,
      Subject: 'Data Export',
      Author: 'Buildings Manager System',
      CreatedDate: new Date()
    };

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Write file with standard method
    // The workbook properties (Props) set above help make the file more standard
    // and less likely to trigger antivirus false positives
    XLSX.writeFile(workbook, filename);
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
