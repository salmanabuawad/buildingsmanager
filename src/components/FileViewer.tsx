import { useState, useEffect, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut, Download, RotateCw, ChevronLeft, ChevronRight, File as FileIcon, Printer } from 'lucide-react';
import { sanitizeFilename } from '../lib/sanitize';
import { getFileTypeCategory } from '../lib/fileCompression';
import { getApiBaseUrl } from '../lib/appConfig';
import { api, getFileApiHeaders, getFileViewUrl, toBackendFileUrl } from '../lib/apiClient';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** True if the string looks like a local filesystem or Cursor workspace path (not a loadable app URL). */
function isLocalOrCursorPath(url: string): boolean {
  const u = (url || '').trim();
  if (!u) return false;
  if (u.startsWith('file:')) return true;
  if (/^[a-zA-Z]:[\\/]/.test(u)) return true;
  if (u.startsWith('@') && /[@]?[a-zA-Z]:[\\/]/.test(u)) return true;
  if (u.includes('workspaceStorage') || u.includes('\\')) return true;
  return false;
}

/** Return a safe display/download filename (basename only), never the full path. */
function safeBasename(urlOrPath: string, fallback = 'file'): string {
  if (!urlOrPath) return fallback;
  const normalized = urlOrPath.replace(/\\/g, '/');
  const last = normalized.split('/').pop()?.split('?')[0]?.trim();
  return last || fallback;
}

interface FileViewerProps {
  fileUrl: string;
  fileName?: string;
}

export function FileViewer({ fileUrl, fileName }: FileViewerProps) {
  const [fileType, setFileType] = useState<'pdf' | 'image' | 'document' | 'other' | 'loading'>('loading');
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [imageError, setImageError] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [actualFileUrl, setActualFileUrl] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [isPreparingUrl, setIsPreparingUrl] = useState<boolean>(true);
  const [isLocalPath, setIsLocalPath] = useState<boolean>(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Resolve display URL: ignore local/Cursor paths; for our API get view URL or blob; otherwise use fileUrl.
  useEffect(() => {
    let cancelled = false;
    setIsLocalPath(isLocalOrCursorPath(fileUrl));

    const run = async () => {
      setIsPreparingUrl(true);
      setPdfLoadError(null);
      setFileBlob(null);
      setBlobUrl(null);

      if (isLocalOrCursorPath(fileUrl)) {
        if (!cancelled) {
          setActualFileUrl(null);
          setPdfLoadError('הקובץ מצביע למיקום מקומי. פתח את הקובץ מתוך רשימת הקבצים של הנכס.');
          setIsPreparingUrl(false);
        }
        return;
      }

      let urlToUse: string;
      const backendUrl = toBackendFileUrl(fileUrl);
      if (backendUrl && backendUrl !== fileUrl) {
        urlToUse = backendUrl;
      } else if (fileUrl.startsWith('http') || fileUrl.startsWith('/')) {
        urlToUse = fileUrl;
      } else {
        const { data } = api.storage.from('structure-drawings').getPublicUrl(fileUrl);
        urlToUse = data.publicUrl;
      }

      const isOurApi = urlToUse.includes('/api/files/download') || urlToUse.includes('/download?');
      if (isOurApi) {
        try {
          const pathMatch = urlToUse.match(/[?&]path=([^&]+)/);
          const path = pathMatch ? decodeURIComponent(pathMatch[1]) : null;
          if (path) {
            const result = await getFileViewUrl(path);
            if (!cancelled && 'url' in result) {
              setActualFileUrl(result.url);
              setIsPreparingUrl(false);
              return;
            }
          }
        } catch {
          /* fallback to download URL + blob */
        }
        if (!cancelled) setActualFileUrl(urlToUse);
        try {
          const res = await fetch(urlToUse, {
            credentials: 'include',
            headers: getFileApiHeaders(),
          });
          if (!cancelled && res.ok) {
            const blob = await res.blob();
            if (!cancelled) {
              setFileBlob(blob);
              setBlobUrl(URL.createObjectURL(blob));
            }
          }
        } catch {
          /* error UI can show */
        }
      } else {
        if (!cancelled) setActualFileUrl(urlToUse);
        setBlobUrl(urlToUse);
      }

      if (!cancelled) setIsPreparingUrl(false);
    };

    run();
    return () => {
      cancelled = true;
      setBlobUrl(prev => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
      setFileBlob(null);
    };
  }, [fileUrl]);

  // Reset state when file changes (do not clear actualFileUrl — URL effect sets it)
  useEffect(() => {
    setFileType('loading');
    setNumPages(0);
    setPageNumber(1);
    setScale(1.0);
    setRotation(0);
    setImageError(false);
    setPdfLoadError(null);
  }, [fileUrl, fileName]);

  // Safe display name: never show full URL/link, only basename.
  const displayName = useMemo(() => {
    const raw = (fileName || fileUrl || '').trim();
    if (raw && !raw.startsWith('http') && !raw.includes('/api/') && !raw.includes('path=') && raw.length < 200) {
      return raw;
    }
    return safeBasename(fileName || fileUrl, 'קובץ');
  }, [fileName, fileUrl]);

  const reactToPrintFn = useReactToPrint({
    contentRef: printAreaRef,
    documentTitle: displayName || 'drawing',
  });

  // Detect file type from filename (avoid HEAD request so we don't block or require auth)
  useEffect(() => {
    const name = (displayName || fileUrl).toLowerCase();
    const category = getFileTypeCategory(name, '');
    setFileType(category);
  }, [fileUrl, displayName]);

  const documentOptions = useMemo(() => {
    const url = actualFileUrl || blobUrl || '';
    const needsAuth = typeof url === 'string' && (url.includes('/api/files/download') || url.includes('/download?'));
    return needsAuth
      ? { httpHeaders: getFileApiHeaders(), withCredentials: true as const }
      : { httpHeaders: {} as Record<string, string>, withCredentials: false as const };
  }, [actualFileUrl, blobUrl]);

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
        `Storage bucket "${bucketName}" not found. Configure backend file storage.`
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
    if (isLocalPath) {
      alert('לא ניתן להוריד קובץ ממיקום מקומי. פתח את הקובץ מתוך רשימת הקבצים של הנכס.');
      return;
    }
    try {
      const urlToDownload = actualFileUrl || (!isLocalOrCursorPath(fileUrl) ? fileUrl : null);
      if (!urlToDownload) {
        alert('כתובת הקובץ אינה זמינה. נסה שוב.');
        return;
      }
      const isOurDownloadUrl = urlToDownload.includes('/api/files/download') || urlToDownload.includes('/download?');
      const response = await fetch(urlToDownload, {
        ...(isOurDownloadUrl ? { credentials: 'include' as const, headers: getFileApiHeaders() } : {}),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      let downloadName = fileName;
      if (!downloadName || downloadName === 'file') {
        try {
          const urlObj = new URL(urlToDownload);
          const pathParts = urlObj.pathname.split('/');
          const lastPart = pathParts[pathParts.length - 1];
          const filenameFromUrl = lastPart.split('?')[0];
          if (filenameFromUrl && filenameFromUrl !== '') downloadName = filenameFromUrl;
        } catch {
          /* use default */
        }
      }
      if (!downloadName || downloadName === 'file') {
        downloadName = displayName || safeBasename(fileUrl, 'file');
      }
      link.download = sanitizeFilename(downloadName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    }
  }

  /** Print via react-to-print (prints only contentRef, with documentTitle). */
  function handlePrint() {
    if (isLocalPath) {
      alert('לא ניתן להדפיס קובץ ממיקום מקומי. פתח את הקובץ מתוך רשימת הקבצים של הנכס.');
      return;
    }
    reactToPrintFn();
  }

  // Local/Cursor path – not loadable via app
  if (isLocalPath) {
    return (
      <div className="w-full">
        <div className="border border-slate-300 rounded-lg bg-amber-50 p-8 flex flex-col items-center justify-center gap-2 text-center">
          <span className="text-amber-800 font-medium">{safeBasename(fileUrl, 'קובץ')}</span>
          <p className="text-slate-700 text-sm">הקובץ מצביע למיקום מקומי. פתח את הקובץ מתוך רשימת הקבצים של הנכס.</p>
        </div>
      </div>
    );
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
        <div className="file-viewer-no-print border border-slate-300 rounded-t-lg bg-white p-4">
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

        <div ref={printAreaRef} className="print-root file-viewer-print-area border border-t-0 border-slate-300 rounded-b-lg bg-slate-50 p-4 overflow-auto max-h-[600px]">
          <div className="flex justify-center">
            {isPreparingUrl ? (
              <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
              </div>
            ) : (fileBlob || blobUrl || actualFileUrl) ? (
              <Document
                file={fileBlob || blobUrl || actualFileUrl || ''}
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
        <div className="file-viewer-no-print border border-slate-300 rounded-t-lg bg-white p-4">
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

        <div ref={printAreaRef} className="print-root file-viewer-print-area border border-t-0 border-slate-300 rounded-b-lg bg-slate-50 p-4 overflow-auto max-h-[600px] flex justify-center">
          {isPreparingUrl ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
            </div>
          ) : imageError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-800">Failed to load image.</p>
            </div>
          ) : (blobUrl || actualFileUrl) ? (
            <img
              src={blobUrl || actualFileUrl || ''}
              alt={displayName || 'Image'}
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

  // Document or other file types - show print and download option
  return (
    <div className="w-full">
      <div ref={printAreaRef} className="print-root file-viewer-print-area border border-slate-300 rounded-lg bg-slate-50 p-12 flex flex-col items-center justify-center">
        <FileIcon className="h-16 w-16 text-slate-400 mb-4" />
        <p className="text-slate-700 mb-4">
          {displayName || 'תצוגה מקדימה אינה זמינה לסוג קובץ זה'}
        </p>
        <div className="file-viewer-no-print flex items-center gap-2">
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

