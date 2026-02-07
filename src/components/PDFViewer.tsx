import { useState, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut, Download, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { sanitizeFilename } from '../lib/sanitize';
import { supabase } from '../lib/supabase';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  fileUrl: string;
  fileName?: string;
}

export function PDFViewer({ fileUrl, fileName }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actualFileUrl, setActualFileUrl] = useState<string | null>(null);
  const [isPreparingUrl, setIsPreparingUrl] = useState<boolean>(true);

  // Try to get signed URL if the file is from a private bucket
  useEffect(() => {
    let cancelled = false;

    const getSignedUrlIfNeeded = async () => {
      setIsPreparingUrl(true);
      setLoadError(null);

      // Check if URL is already a signed URL
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
            // Check for bucket not found error
            if (error.message?.includes('Bucket not found') || error.statusCode === '404') {
              const errorMsg = `Storage bucket "${bucket}" not found. Please create the bucket in Supabase Dashboard: Storage → New bucket → Name: "${bucket}". See CREATE_STORAGE_BUCKETS.md for detailed instructions.`;
              console.error(errorMsg);
              setLoadError(errorMsg);
              // Still try to use original URL in case bucket gets created
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

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
    setLoadError(null);
  }

  function onDocumentLoadError(error: Error) {
    console.error('PDF load error:', error);
    
    // Check if it's a bucket not found error from the error message
    const errorMessage = error.message || '';
    if (errorMessage.includes('Bucket not found') || errorMessage.includes('404')) {
      const bucketMatch = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\//);
      const bucketName = bucketMatch ? bucketMatch[1] : 'unknown';
      setLoadError(
        `Storage bucket "${bucketName}" not found. ` +
        `Please create the bucket in Supabase Dashboard: Storage → New bucket → Name: "${bucketName}". ` +
        `See CREATE_STORAGE_BUCKETS.md for detailed instructions.`
      );
    } else {
      setLoadError(error.message || 'Failed to load PDF file. The file may be corrupted or inaccessible.');
    }
  }

  const documentOptions = useMemo(() => ({
    httpHeaders: {},
    withCredentials: false,
  }), []);

  function changePage(offset: number) {
    setPageNumber(prevPageNumber => prevPageNumber + offset);
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
      if (!downloadName || downloadName === 'document.pdf') {
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
      
      link.download = sanitizeFilename(downloadName || 'document.pdf');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert(`Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    }
  }

  return (
    <div className="w-full">
      <div className="bg-slate-100 border border-slate-300 rounded-t-lg p-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="p-2 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 "
            title="Zoom Out"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[80px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= 3.0}
            className="p-2 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 "
            title="Zoom In"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            onClick={rotate}
            className="p-2 bg-white border border-slate-300 rounded hover:bg-slate-50 ml-2"
            title="Rotate"
          >
            <RotateCw className="h-5 w-5" />
          </button>
        </div>

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
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1 bg-slate-800 text-white rounded hover:bg-slate-700 text-sm"
            title="Download PDF"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
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
                  {loadError && (
                    <p className="text-red-700 text-sm mb-2">{loadError}</p>
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
                  <div className="mt-4">
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                      <Download className="h-4 w-4" />
                      Try Download Instead
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
              {loadError && (
                <p className="text-red-700 text-sm mb-2">{loadError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
