/**
 * CSV Export Helper
 * Provides standardized CSV export functionality
 */

export interface CSVExportOptions {
  filename: string;
  data: any[][];
  delimiter?: string; // Default: comma
  includeBOM?: boolean; // BOM for UTF-8 Excel support, default: true
}

/**
 * Escape CSV field value
 * Handles quotes, commas, and newlines
 */
function escapeCSVField(field: any): string {
  if (field === null || field === undefined) {
    return '';
  }
  
  const str = String(field);
  
  // If field contains delimiter, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Export data to CSV file
 * 
 * @param options CSV export options
 */
export function exportToCSV(options: CSVExportOptions): void {
  try {
    const { filename, data, delimiter = ',', includeBOM = true } = options;

    // Convert data to CSV rows
    const csvRows = data.map(row => 
      row.map(field => escapeCSVField(field)).join(delimiter)
    );

    // Join rows with newlines
    const csvContent = csvRows.join('\n');

    // Add BOM for UTF-8 Excel support if requested
    const content = includeBOM ? '\ufeff' + csvContent : csvContent;

    // Create blob
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    throw error;
  }
}

