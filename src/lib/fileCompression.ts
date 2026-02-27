import imageCompression from 'browser-image-compression';

const MAX_FILE_SIZE_KB = 30; // 30 KB

/**
 * Compresses a file to under 30KB
 * For images: uses browser-image-compression
 * For other files: tries to reduce size through other means or returns original if compression isn't possible
 */
export async function compressFile(file: File): Promise<File> {
  const fileSizeKB = file.size / 1024;
  
  // If already under 30KB, return as-is
  if (fileSizeKB <= MAX_FILE_SIZE_KB) {
    return file;
  }

  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  // Handle image files
  if (fileType.startsWith('image/') || 
      fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
    try {
      // Start with moderate settings and progressively get more aggressive
      let quality = 0.8;
      let maxWidthOrHeight = 1920;
      let compressedFile: File = file;
      let attempts = 0;
      const maxAttempts = 10; // Increased attempts

      // Progressive compression: keep reducing until we fit under 30KB
      while (compressedFile.size / 1024 > MAX_FILE_SIZE_KB && attempts < maxAttempts) {
        const options = {
          maxSizeMB: MAX_FILE_SIZE_KB / 1024, // Convert KB to MB
          maxWidthOrHeight,
          useWebWorker: true,
          fileType: fileType || undefined,
          initialQuality: quality,
        };

        compressedFile = await imageCompression(file, options);
        
        // If still too large, reduce quality and dimensions more aggressively
        if (compressedFile.size / 1024 > MAX_FILE_SIZE_KB) {
          quality = Math.max(0.1, quality - 0.1);
          maxWidthOrHeight = Math.max(200, maxWidthOrHeight - 150);
        }
        
        attempts++;
      }

      // If still too large, try binary search approach to find optimal size
      if (compressedFile.size / 1024 > MAX_FILE_SIZE_KB) {
        let minSize = 200;
        let maxSize = maxWidthOrHeight;
        let bestFile = compressedFile;
        
        // Binary search for optimal dimensions
        for (let i = 0; i < 5; i++) {
          const testSize = Math.floor((minSize + maxSize) / 2);
          const testOptions = {
            maxSizeMB: MAX_FILE_SIZE_KB / 1024,
            maxWidthOrHeight: testSize,
            useWebWorker: true,
            initialQuality: 0.2,
          };
          
          const testFile = await imageCompression(file, testOptions);
          if (testFile.size / 1024 <= MAX_FILE_SIZE_KB) {
            bestFile = testFile;
            maxSize = testSize;
          } else {
            minSize = testSize + 1;
          }
        }
        
        compressedFile = bestFile;
      }

      // Final fallback: if still too large, use minimal settings
      if (compressedFile.size / 1024 > MAX_FILE_SIZE_KB) {
        const minimalOptions = {
          maxSizeMB: MAX_FILE_SIZE_KB / 1024,
          maxWidthOrHeight: 400,
          useWebWorker: true,
          initialQuality: 0.1,
        };
        compressedFile = await imageCompression(file, minimalOptions);
      }

      return compressedFile;
    } catch (error) {
      console.error('Image compression failed:', error);
      // If compression fails, try to at least reduce the file
      // Return original file if compression fails completely
      return file;
    }
  }

  // Handle PDF files - convert first page to image and compress
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    // If already under limit, return as-is
    if (fileSizeKB <= MAX_FILE_SIZE_KB) {
      return file;
    }
    
    try {
      // Try to convert PDF to image using canvas
      // This requires pdf.js which should be available via react-pdf
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1); // Get first page
      
      // Start with lower scale to ensure smaller file size
      let scale = 1.0;
      let blob: Blob | null = null;
      
      // Try different scales until we get a file that can be compressed under 30KB
      for (let attempt = 0; attempt < 3; attempt++) {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('Canvas context not available');
        }
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
        
        // Convert canvas to blob with lower quality for smaller size
        blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) {
              resolve(b);
            } else {
              reject(new Error('Failed to convert canvas to blob'));
            }
          }, 'image/jpeg', 0.6 - (attempt * 0.1)); // Start at 0.6, reduce by 0.1 each attempt
        });
        
        // Check if the blob size is reasonable (under 100KB raw, will be compressed further)
        if (blob.size / 1024 < 100) {
          break;
        }
        
        // Reduce scale for next attempt
        scale = Math.max(0.5, scale - 0.2);
      }
      
      if (!blob) {
        throw new Error('Failed to convert PDF to image');
      }
      
      // Create a File from the blob and compress it as an image
      const imageFile = new File([blob], file.name.replace(/\.pdf$/i, '.jpg'), { type: 'image/jpeg' });
      return await compressFile(imageFile);
    } catch (error) {
      console.error('PDF to image conversion failed:', error);
      // If conversion fails and file is too large, try to reduce quality further
      // For now, return original and let user know
      if (fileSizeKB > MAX_FILE_SIZE_KB) {
        throw new Error(`לא ניתן לדחוס את קובץ ה-PDF. גודל הקובץ: ${(file.size / 1024).toFixed(2)}KB. אנא נסה קובץ קטן יותר`);
      }
      return file;
    }
  }

  // For other file types, try to convert to image if possible, otherwise try text compression
  if (fileSizeKB <= MAX_FILE_SIZE_KB) {
    return file;
  }
  
  // Try to read as text and compress (for text-based files)
  try {
    const text = await file.text();
    const compressedText = text; // Could apply text compression here if needed
    const blob = new Blob([compressedText], { type: file.type });
    const compressedFile = new File([blob], file.name, { type: file.type });
    
    // If still too large, try converting to a more compressible format
    if (compressedFile.size / 1024 > MAX_FILE_SIZE_KB) {
      // For text files, we could zip them, but that changes the format
      // Instead, try to create a thumbnail image representation
      if (fileType.startsWith('text/') || fileName.match(/\.(txt|json|xml|csv)$/i)) {
        // Create a simple image representation of the text
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = 800;
          canvas.height = 600;
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = 'black';
          ctx.font = '14px Arial';
          const lines = text.substring(0, 2000).split('\n').slice(0, 30); // First 30 lines, max 2000 chars
          lines.forEach((line, index) => {
            ctx.fillText(line.substring(0, 80), 10, 20 + (index * 20));
          });
          
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Canvas conversion failed'));
            }, 'image/jpeg', 0.7);
          });
          
          const imageFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          return await compressFile(imageFile);
        }
      }
    }
    
    return compressedFile;
  } catch (error) {
    console.error('File compression attempt failed:', error);
    // If all compression attempts fail, return original but warn
    if (fileSizeKB > MAX_FILE_SIZE_KB) {
      throw new Error(`לא ניתן לדחוס את הקובץ. גודל הקובץ: ${(file.size / 1024).toFixed(2)}KB. אנא נסה קובץ קטן יותר או דחוס אותו ידנית`);
    }
    return file;
  }
}

/**
 * Gets file type category for determining which viewer to use
 */
export function getFileTypeCategory(fileName: string, mimeType?: string): 'pdf' | 'image' | 'video' | 'document' | 'other' {
  const lowerName = fileName.toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) {
    return 'pdf';
  }

  if (lowerName.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i) ||
      lowerMime.startsWith('image/')) {
    return 'image';
  }

  if (lowerName.match(/\.(mp4|webm|mov|ogg|m4v)$/i) ||
      lowerMime.startsWith('video/')) {
    return 'video';
  }

  if (lowerName.match(/\.(doc|docx|xls|xlsx|txt|rtf)$/i) ||
      lowerMime.includes('document') || lowerMime.includes('spreadsheet')) {
    return 'document';
  }

  return 'other';
}

