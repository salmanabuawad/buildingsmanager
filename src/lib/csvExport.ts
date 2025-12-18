/**
 * CSV Export Helper
 * Provides standardized CSV export functionality with reduced antivirus false positives
 */

export interface CSVExportOptions {
  filename: string;
  data: any[][];
  delimiter?: string; // Default: comma
  includeBOM?: boolean; // BOM for UTF-8 Excel support, default: false (reduces antivirus false positives)
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
 * Optimized to reduce antivirus false positives
 * 
 * @param options CSV export options
 */
export function exportToCSV(options: CSVExportOptions): void {
  try {
    const { filename, data, delimiter = ',', includeBOM = false } = options;

    // Validate data - ensure it's a valid 2D array
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('CSV data must be a non-empty array');
    }

    // Convert data to CSV rows with proper escaping
    const csvRows = data.map(row => {
      if (!Array.isArray(row)) {
        return '';
      }
      return row.map(field => escapeCSVField(field)).join(delimiter);
    });

    // Join rows with standard newlines (Unix style for better compatibility)
    const csvContent = csvRows.join('\n');

    // Create content - BOM disabled by default to reduce antivirus false positives
    // Most modern applications can handle UTF-8 without BOM
    const content = includeBOM ? '\ufeff' + csvContent : csvContent;

    // Create blob with standard CSV MIME type (without charset parameter to reduce false positives)
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    // Create download link with standard attributes
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.style.display = 'none'; // Hide link
    document.body.appendChild(link);
    
    // Trigger download
    link.click();

    // Cleanup after a short delay to ensure download starts
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    throw error;
  }
}

