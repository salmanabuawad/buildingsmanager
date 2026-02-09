/**
 * ZIP Export Helper
 * Creates ZIP files containing Excel files and asset images/PDFs
 */

import JSZip from 'jszip';

export interface ZipFileEntry {
  filename: string;
  data: Blob | ArrayBuffer | Uint8Array | string;
}

/**
 * Create a ZIP file as Blob (without downloading)
 * 
 * @param files Array of files to include in the ZIP
 * @returns Promise resolving to ZIP Blob
 */
export async function createZipBlob(
  files: ZipFileEntry[]
): Promise<Blob> {
  try {
    const zip = new JSZip();

    // Add all files to the ZIP
    for (const file of files) {
      zip.file(file.filename, file.data);
    }

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    return zipBlob;
  } catch (error) {
    console.error('Error creating ZIP file:', error);
    throw error;
  }
}

/**
 * Create and download a ZIP file containing multiple files
 * 
 * @param zipFilename Name of the ZIP file to create
 * @param files Array of files to include in the ZIP
 */
export async function createAndDownloadZip(
  zipFilename: string,
  files: ZipFileEntry[]
): Promise<void> {
  try {
    const zipBlob = await createZipBlob(files);

    // Create download link
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error creating ZIP file:', error);
    throw error;
  }
}
