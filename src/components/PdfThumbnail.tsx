/** Renders the first page of a PDF as a thumbnail. Falls back to icon on error. */
import { useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';

interface PdfThumbnailProps {
  src: string;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
}

export function PdfThumbnail({ src, alt = '', className = '', width = 80, height = 80 }: PdfThumbnailProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(src, { credentials: 'include' });
        if (!res.ok || cancelled || !mounted.current) return;
        const buf = await res.arrayBuffer();
        if (cancelled || !mounted.current) return;

        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        if (cancelled || !mounted.current) return;

        const page = await pdf.getPage(1);
        const scale = Math.min(width / (page.getViewport({ scale: 1 }).width), height / (page.getViewport({ scale: 1 }).height));
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled || !mounted.current) return;

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled || !mounted.current) return;

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setThumbUrl(dataUrl);
      } catch {
        if (mounted.current) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [src, width, height]);

  if (error || !thumbUrl) {
    return (
      <span className={`flex items-center justify-center bg-slate-100 text-gray-500 w-full h-full min-w-full min-h-full ${className}`}>
        <FileText className="h-8 w-8" />
      </span>
    );
  }

  return (
    <img
      src={thumbUrl}
      alt={alt}
      className={`object-cover ${className}`}
      style={{ width, height }}
    />
  );
}
