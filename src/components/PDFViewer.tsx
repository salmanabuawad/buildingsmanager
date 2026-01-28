import { useState, useEffect } from 'react';
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
  const [actualFileUrl, setActualFileUrl] = useState<string>(fileUrl);

  // Try to get signed URL if the file is from a private bucket
  useEffect(() => {
    const getSignedUrlIfNeeded = async () => {
      // Check if URL is already a signed URL
      if (fileUrl.includes('.supabase.co/storage/v1/object/sign/')) {
        setActualFileUrl(fileUrl);
        return;
      }

      // Try to extract bucket and path from URL (even if it has /public/ in path)
      try {
        const urlObj = new URL(fileUrl);
        // Match both /public/ and /sign/ paths
        const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
        
        if (pathMatch) {
          const [, bucket, path] = pathMatch;
          
          // Try to get signed URL for the file (works for both public and private buckets)
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, 3600); // 1 hour expiry
          
          if (!error && data?.signedUrl) {
            console.log('Using signed URL for file:', data.signedUrl);
            setActualFileUrl(data.signedUrl);
            return;
          } else if (error) {
            console.warn('Failed to create signed URL, using original:', error);
          }
        }
      } catch (error) {
        // URL parsing failed, use original URL
        console.warn('Could not parse file URL for signed URL generation:', error);
      }
      
      // Fallback to original URL
      setActualFileUrl(fileUrl);
    };

    getSignedUrlIfNeeded();
  }, [fileUrl]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
    setLoadError(null);
  }

  function onDocumentLoadError(error: Error) {
    console.error('PDF load error:', error);
    setLoadError(error.message || 'Failed to load PDF file. The file may be corrupted or inaccessible.');
  }

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
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = sanitizeFilename(fileName || 'document.pdf');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download PDF. Please try again.');
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
            options={{
              httpHeaders: {},
              withCredentials: false,
            }}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              rotate={rotation}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>
        </div>
      </div>
    </div>
  );
}
