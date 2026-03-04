import { useState, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut, Download, RotateCw, ChevronLeft, ChevronRight, File as FileIcon, Printer } from 'lucide-react';
import { sanitizeFilename } from '../lib/sanitize';
import { getFileTypeCategory } from '../lib/fileCompression';
import { supabase } from '../lib/supabase';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface FileViewerProps {
  fileUrl: string;
  fileName?: string;
}

export function FileViewer({ fileUrl, fileName }: FileViewerProps) {
  const [fileType, setFileType] = useState<'pdf' | 'image' | 'video' | 'document' | 'other' | 'loading'>('loading');
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [imageError, setImageError] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [actualFileUrl, setActualFileUrl] = useState<string | null>(null);
  const [isPreparingUrl, setIsPreparingUrl] = useState<boolean>(true);

  // Try to get signed URL if the file is from a private bucket
  useEffect(() => {
    let cancelled = false;

    const getSignedUrlIfNeeded = async () => {
      setIsPreparingUrl(true);
      setPdfLoadError(null);

      if (fileUrl.includes('.supabase.co/storage/v1/object/sign/')) {
        if (!cancelled) setActualFileUrl(fileUrl);
        setIsPreparingUrl(false);
        return;
      }

      try {
        const urlObj = new URL(fileUrl);
        const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);

        if (pathMatch) {
          const [, bucket, path] = pathMatch;

          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, 3600); // 1 hour expiry

          if (cancelled) return;

          if (!error && data?.signedUrl) {
            if (process.env.NODE_ENV === 'development') {
            }
            setActualFileUrl(data.signedUrl);
            setIsPreparingUrl(false);
            return;
          }
          if (error) {
            if (error.message?.includes('Bucket not found') || error.statusCode === '404') {
              setPdfLoadError(`Storage bucket "${bucket}" not found. See CREATE_STORAGE_BUCKETS.md for instructions.`);
            } else if (process.env.NODE_ENV === 'development') {
              console.warn('Failed to create signed URL, using original:', error);
            }
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Could not parse file URL for signed URL generation:', error);
        }
      }

      if (!cancelled) {
        setActualFileUrl(fileUrl);
        setIsPreparingUrl(false);
      }
    };

    getSignedUrlIfNeeded();
    return () => { cancelled = true; };
  }, [fileUrl]);

  // Reset state when file changes to handle switching between different file types
  useEffect(() => {
    setFileType('loading');
    setNumPages(0);
    setPageNumber(1);
    setScale(1.0);
    setRotation(0);
    setImageError(false);
    setPdfLoadError(null);
    setActualFileUrl(null);
    setIsPreparingUrl(true);
  }, [fileUrl, fileName]);

  // Detect file type from URL and filename (use original fileUrl to avoid duplicate calls)
  useEffect(() => {
    const detectFileType = async () => {
      const name = (fileName || fileUrl).toLowerCase();
      
      // First check filename extension - this works without fetching
      const category = getFileTypeCategory(name, '');
      if (category !== 'other') {
        setFileType(category);
        return;
      }

      // Only fetch headers if we can't determine from extension
      // Use original fileUrl to avoid duplicate calls when actualFileUrl changes
      try {
        const response = await fetch(fileUrl, { method: 'HEAD' });
        const contentType = response.headers.get('content-type') || '';
        const detectedCategory = getFileTypeCategory(name, contentType);
        setFileType(detectedCategory);
      } catch (error) {
        // If HEAD request fails, try to determine from extension
        setFileType(getFileTypeCategory(name, ''));
      }
    };

    // Only run detection once when fileUrl or fileName changes, not when actualFileUrl changes
    detectFileType();
  }, [fileUrl, fileName]); // Removed actualFileUrl from dependencies to avoid duplicate calls

  const documentOptions = useMemo(() => ({
    httpHeaders: {},
    withCredentials: false,
  }), []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
    setPdfLoadError(null);
  }

  function onDocumentLoadError(error: Error) {
    console.error('PDF load error:', error);
    
    // Check if it's a bucket not found error from the error message
    const errorMessage = error.message || '';
    if (errorMessage.includes('Bucket not found') || errorMessage.includes('404')) {
      const bucketMatch = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\//);
      const bucketName = bucketMatch ? bucketMatch[1] : 'unknown';
      setPdfLoadError(
        `Storage bucket "${bucketName}" not found. ` +
        `Please create the bucket in Supabase Dashboard: Storage → New bucket → Name: "${bucketName}". ` +
        `See CREATE_STORAGE_BUCKETS.md for detailed instructions.`
      );
    } else {
      setPdfLoadError(error.message || 'Failed to load PDF file. The file may be corrupted or inaccessible.');
    }
  }

  function changePage(offset: number) {
    setPageNumber(prevPageNumber => {
      const newPage = prevPageNumber + offset;
      return Math.max(1, Math.min(newPage, numPages));
    });
  }

  function previousPage() {
    changePage(-1);
  }

  function nextPage() {
    changePage(1);
  }

  function zoomIn() {
    setScale(prevScale => Math.min(prevScale + 0.25, 3.0));
  }

  function zoomOut() {
    setScale(prevScale => Math.max(prevScale - 0.25, 0.5));
  }

  function rotate() {
    setRotation(prevRotation => (prevRotation + 90) % 360);
  }

  async function handleDownload() {
    try {
      // Use actualFileUrl if available (signed URL), otherwise fallback to fileUrl
      const urlToDownload = actualFileUrl || fileUrl;
      
      if (!urlToDownload) {
        alert('File URL not available. Please try again.');
        return;
      }
      
      const response = await fetch(urlToDownload);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from URL if fileName is not provided or extract from URL path
      let downloadName = fileName;
      if (!downloadName || downloadName === 'file') {
        try {
          const urlObj = new URL(urlToDownload);
          const pathParts = urlObj.pathname.split('/');
          const lastPart = pathParts[pathParts.length - 1];
          // Remove query parameters if any
          const filenameFromUrl = lastPart.split('?')[0];
          if (filenameFromUrl && filenameFromUrl !== '') {
            downloadName = filenameFromUrl;
          }
        } catch (e) {
          // If URL parsing fails, use default
        }
      }
      
      link.download = sanitizeFilename(downloadName || 'file');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    }
  }

  function handlePrint() {
    const urlToPrint = actualFileUrl || fileUrl;
    if (!urlToPrint) {
      alert('כתובת הקובץ אינה זמינה. נסה שוב.');
      return;
    }

    fetch(urlToPrint)
      .then(response => response.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const printWindow = window.open(blobUrl, '_blank');
        if (!printWindow) {
          alert('לא ניתן לפתוח חלון להדפסה. בדוק אם חוסם חלונות קופצים פעיל.');
          URL.revokeObjectURL(blobUrl);
          return;
        }
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
            URL.revokeObjectURL(blobUrl);
          }, 500);
        };
      })
      .catch(() => {
        alert('לא ניתן להדפיס את הקובץ. נסה להוריד אותו במקום זאת.');
      });
  }

  // Loading state
  if (fileType === 'loading') {
    return (
      <div className="w-full">
        <div className="border border-slate-300 rounded-lg bg-slate-50 p-12 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
        </div>
      </div>
    );
  }

  // PDF Viewer
  if (fileType === 'pdf') {
    return (
      <div className="w-full">
        <div className="border border-slate-300 rounded-t-lg bg-white p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {numPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={previousPage}
                    disabled={pageNumber <= 1}
                    className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50  text-sm"
                  >
                    <ChevronRight className="h-4 w-4 text-black" />
                    Previous
                  </button>
                  <span className="text-sm text-slate-700">
                    Page {pageNumber} of {numPages}
                  </span>
                  <button
                    onClick={nextPage}
                    disabled={pageNumber >= numPages}
                    className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50  text-sm"
                  >
                    Next
                    <ChevronLeft className="h-4 w-4 text-black" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={zoomOut}
                className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm"
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4 text-black" />
              </button>
              <span className="text-sm text-slate-700">{Math.round(scale * 100)}%</span>
              <button
                onClick={zoomIn}
                className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm"
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4 text-black" />
              </button>
              <button
                onClick={rotate}
                className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm"
                title="Rotate"
              >
                <RotateCw className="h-4 w-4 text-black" />
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm"
                title="הדפסת מסמך"
              >
                <Printer className="h-4 w-4 text-black" />
                הדפסת מסמך
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-3 py-1 bg-slate-800 text-white rounded hover:bg-slate-700 text-sm"
                title="הורדת מסמך"
              >
                <Download className="h-4 w-4" />
                הורדת מסמך
              </button>
            </div>
          </div>
        </div>

        <div className="border border-t-0 border-slate-300 rounded-b-lg bg-slate-50 p-4 overflow-auto max-h-[600px]">
          <div className="flex justify-center">
            {isPreparingUrl ? (
              <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
              </div>
            ) : actualFileUrl ? (
              <Document
                file={actualFileUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex items-center justify-center p-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
                  </div>
                }
                error={
                  <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                    <p className="text-red-800 font-semibold mb-2">Failed to load PDF file.</p>
                    {pdfLoadError && (
                      <p className="text-red-700 text-sm mb-2">{pdfLoadError}</p>
                    )}
                    <p className="text-red-700 text-sm mb-3">
                      Possible causes:
                    </p>
                    <ul className="text-red-700 text-sm list-disc list-inside space-y-1">
                      <li>The file may be corrupted</li>
                      <li>The file URL may be incorrect</li>
                      <li>CORS or authentication issues</li>
                      <li>The storage bucket may not exist</li>
                    </ul>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 text-sm"
                        title="הדפסת מסמך"
                      >
                        <Printer className="h-4 w-4" />
                        הדפסת מסמך
                      </button>
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                        title="הורדת מסמך"
                      >
                        <Download className="h-4 w-4" />
                        הורדת מסמך
                      </button>
                    </div>
                  </div>
                }
                onLoadError={onDocumentLoadError}
                options={documentOptions}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  rotate={rotation}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </Document>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <p className="text-red-800 font-semibold mb-2">Failed to prepare PDF URL.</p>
                {pdfLoadError && (
                  <p className="text-red-700 text-sm mb-2">{pdfLoadError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Image Viewer
  if (fileType === 'image') {
    return (
      <div className="w-full">
        <div className="border border-slate-300 rounded-t-lg bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={zoomOut}
                className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm"
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4 text-black" />
              </button>
              <span className="text-sm text-slate-700">{Math.round(scale * 100)}%</span>
              <button
                onClick={zoomIn}
                className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm"
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4 text-black" />
              </button>
              <button
                onClick={rotate}
                className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm"
                title="Rotate"
              >
                <RotateCw className="h-4 w-4 text-black" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm"
                title="הדפסת מסמך"
              >
                <Printer className="h-4 w-4 text-black" />
                הדפסת מסמך
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-3 py-1 bg-slate-800 text-white rounded hover:bg-slate-700 text-sm"
                title="הורדת מסמך"
              >
                <Download className="h-4 w-4" />
                הורדת מסמך
              </button>
            </div>
          </div>
        </div>

        <div className="border border-t-0 border-slate-300 rounded-b-lg bg-slate-50 p-4 overflow-auto max-h-[600px] flex justify-center">
          {isPreparingUrl ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
            </div>
          ) : imageError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-800">Failed to load image.</p>
            </div>
          ) : actualFileUrl ? (
            <img
              src={actualFileUrl}
              alt={fileName || 'Image'}
              className="max-w-full h-auto"
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                transition: 'transform 0.3s ease'
              }}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-800">Failed to prepare image URL.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Video Viewer
  if (fileType === 'video') {
    return (
      <div className="w-full">
        <div className="border border-slate-300 rounded-t-lg bg-white p-4">
          <div className="flex items-center justify-end">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1 bg-slate-800 text-white rounded hover:bg-slate-700 text-sm"
              title="הורדת וידאו"
            >
              <Download className="h-4 w-4" />
              הורדת וידאו
            </button>
          </div>
        </div>
        <div className="border border-t-0 border-slate-300 rounded-b-lg bg-slate-50 p-4 flex justify-center">
          {isPreparingUrl ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800" />
            </div>
          ) : actualFileUrl ? (
            <video
              src={actualFileUrl}
              controls
              playsInline
              className="max-w-full max-h-[600px]"
            />
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-800">Failed to prepare video URL.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Document or other file types - show print and download option
  return (
    <div className="w-full">
      <div className="border border-slate-300 rounded-lg bg-slate-50 p-12 flex flex-col items-center justify-center">
        <FileIcon className="h-16 w-16 text-slate-400 mb-4" />
        <p className="text-slate-700 mb-4">
          {fileName || 'תצוגה מקדימה אינה זמינה לסוג קובץ זה'}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded hover:bg-slate-100"
            title="הדפסת מסמך"
          >
            <Printer className="h-5 w-5 text-slate-700" />
            הדפסת מסמך
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700"
            title="הורדת מסמך"
          >
            <Download className="h-5 w-5" />
            הורדת מסמך
          </button>
        </div>
      </div>
    </div>
  );
}

