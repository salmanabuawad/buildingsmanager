import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera, Upload, Download, RefreshCw, Trash2, Eye,
  CheckCircle, XCircle, Clock, Loader2, Wifi, WifiOff,
  FileText, AlertCircle, ScanLine,
} from 'lucide-react';
import { getAccessToken } from '../lib/usersTableAuth';
import { getApiBaseUrl } from '../lib/appConfig';

// ─── API helpers ────────────────────────────────────────────────────────────

function apiBase(): string {
  const base = getApiBaseUrl();
  if (base) return base;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${apiBase()}/api/navvis${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> || {}) },
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text).detail || text; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface CameraFile {
  name: string;
  size: number;
  download_url: string;
}

interface Scan {
  scan_id: string;
  original_name: string;
  file_size?: number;
  status: 'queued' | 'downloading' | 'processing' | 'done' | 'failed';
  created_at: string;
  started_at?: string;
  finished_at?: string;
  error?: string;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL');
}

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Scan['status'] }) {
  const map: Record<Scan['status'], { label: string; className: string; icon: React.ReactNode }> = {
    queued:      { label: 'ממתין',       className: 'bg-slate-100 text-slate-600',   icon: <Clock className="h-3 w-3" /> },
    downloading: { label: 'מוריד',       className: 'bg-blue-100 text-blue-700',    icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    processing:  { label: 'מעבד',        className: 'bg-yellow-100 text-yellow-700', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    done:        { label: 'הושלם',       className: 'bg-green-100 text-green-700',  icon: <CheckCircle className="h-3 w-3" /> },
    failed:      { label: 'שגיאה',       className: 'bg-red-100 text-red-700',      icon: <XCircle className="h-3 w-3" /> },
  };
  const { label, className, icon } = map[status] || map.queued;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {icon}{label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NavVis() {
  // Camera connection
  const [cameraUrl, setCameraUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraFiles, setCameraFiles] = useState<CameraFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [uploadingFromCamera, setUploadingFromCamera] = useState(false);

  // Direct upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Scans list
  const [scans, setScans] = useState<Scan[]>([]);
  const [scansLoading, setScansLoading] = useState(false);
  const [previewScan, setPreviewScan] = useState<string | null>(null);

  // Poll for in-progress scans
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadScans = useCallback(async () => {
    try {
      setScansLoading(true);
      const data = await apiFetch('/scans');
      setScans(data.scans || []);
    } catch {
      // silent
    } finally {
      setScansLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScans();
  }, [loadScans]);

  // Auto-poll while any scan is in progress
  useEffect(() => {
    const hasActive = scans.some(s => s.status === 'queued' || s.status === 'processing' || s.status === 'downloading');
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(loadScans, 3000);
    }
    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [scans, loadScans]);

  // ── Camera connect ──────────────────────────────────────────────────────────

  const handleConnect = async () => {
    if (!cameraUrl.trim()) return;
    setConnecting(true);
    setCameraError('');
    setConnected(false);
    setCameraFiles([]);
    setSelectedFiles(new Set());
    try {
      const data = await apiFetch(`/camera/files?camera_url=${encodeURIComponent(cameraUrl.trim())}`);
      setCameraFiles(data.files || []);
      setConnected(true);
      if ((data.files || []).length === 0) {
        setCameraError('התחברות הצליחה אך לא נמצאו קבצי E57 במצלמה');
      }
    } catch (err: any) {
      setCameraError(err.message || 'שגיאה בהתחברות למצלמה');
    } finally {
      setConnecting(false);
    }
  };

  // ── Upload from camera ──────────────────────────────────────────────────────

  const handleUploadFromCamera = async () => {
    const toUpload = cameraFiles.filter(f => selectedFiles.has(f.name));
    if (!toUpload.length) return;
    setUploadingFromCamera(true);
    for (const f of toUpload) {
      try {
        await apiFetch(
          `/scans/upload-from-camera?camera_url=${encodeURIComponent(cameraUrl)}&file_url=${encodeURIComponent(f.download_url)}&filename=${encodeURIComponent(f.name)}`,
          { method: 'POST' }
        );
      } catch {
        // continue other files
      }
    }
    setSelectedFiles(new Set());
    setUploadingFromCamera(false);
    await loadScans();
  };

  // ── Direct file upload ──────────────────────────────────────────────────────

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError('');
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.e57')) {
        setUploadError('ניתן להעלות קבצי .e57 בלבד');
        continue;
      }
      const formData = new FormData();
      formData.append('file', file);
      try {
        await fetch(`${apiBase()}/api/navvis/scans/upload`, {
          method: 'POST',
          headers: { ...authHeaders() },
          body: formData,
          credentials: 'include',
        });
      } catch (err: any) {
        setUploadError(err.message || 'שגיאה בהעלאה');
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    await loadScans();
  };

  // ── Delete scan ─────────────────────────────────────────────────────────────

  const handleDelete = async (scanId: string) => {
    if (!confirm('למחוק סריקה זו?')) return;
    try {
      await apiFetch(`/scans/${scanId}`, { method: 'DELETE' });
      setScans(prev => prev.filter(s => s.scan_id !== scanId));
    } catch {}
  };

  // ── Download DXF ────────────────────────────────────────────────────────────

  const handleDownloadDxf = (scanId: string) => {
    const url = `${apiBase()}/api/navvis/scans/${scanId}/dxf`;
    const a = document.createElement('a');
    a.href = url;
    a.click();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-auto bg-app-bg p-4 space-y-4" dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <ScanLine className="h-6 w-6 text-app-accent" />
        <h1 className="text-xl font-bold text-app-text-primary">NavVis — סריקות E57 ל-DXF</h1>
      </div>

      {/* ── Camera connection ── */}
      <div className="bg-white rounded-lg border border-app-input-border p-4 space-y-3">
        <h2 className="font-semibold text-app-text-primary flex items-center gap-2">
          <Camera className="h-4 w-4" />
          התחברות למצלמה
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={cameraUrl}
            onChange={e => { setCameraUrl(e.target.value); setConnected(false); setCameraError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
            placeholder="http://192.168.1.100"
            className="flex-1 border border-app-input-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
            dir="ltr"
          />
          <button
            onClick={handleConnect}
            disabled={connecting || !cameraUrl.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-app-accent text-white rounded text-sm font-medium hover:bg-app-accent/90 disabled:opacity-50 transition-colors"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            {connecting ? 'מתחבר...' : 'התחבר'}
          </button>
        </div>

        {cameraError && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
            <WifiOff className="h-4 w-4 shrink-0 mt-0.5" />
            {cameraError}
          </div>
        )}

        {/* Camera file list */}
        {connected && cameraFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-app-text-muted">{cameraFiles.length} קבצים נמצאו</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedFiles(new Set(cameraFiles.map(f => f.name)))}
                  className="text-xs text-app-accent hover:underline"
                >
                  בחר הכל
                </button>
                <button
                  onClick={() => setSelectedFiles(new Set())}
                  className="text-xs text-app-text-muted hover:underline"
                >
                  נקה בחירה
                </button>
              </div>
            </div>
            <div className="border border-app-input-border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-app-text-muted text-xs">
                  <tr>
                    <th className="w-8 p-2"></th>
                    <th className="text-right p-2">שם קובץ</th>
                    <th className="text-right p-2">גודל</th>
                  </tr>
                </thead>
                <tbody>
                  {cameraFiles.map(f => (
                    <tr key={f.name} className="border-t border-app-input-border hover:bg-slate-50">
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(f.name)}
                          onChange={e => {
                            const next = new Set(selectedFiles);
                            e.target.checked ? next.add(f.name) : next.delete(f.name);
                            setSelectedFiles(next);
                          }}
                          className="rounded"
                        />
                      </td>
                      <td className="p-2 font-mono text-xs">{f.name}</td>
                      <td className="p-2 text-app-text-muted">{formatBytes(f.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={handleUploadFromCamera}
              disabled={selectedFiles.size === 0 || uploadingFromCamera}
              className="flex items-center gap-2 px-4 py-2 bg-app-accent text-white rounded text-sm font-medium hover:bg-app-accent/90 disabled:opacity-50 transition-colors"
            >
              {uploadingFromCamera ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploadingFromCamera ? 'מעלה...' : `העלה ${selectedFiles.size} קבצים נבחרים`}
            </button>
          </div>
        )}
      </div>

      {/* ── Direct upload ── */}
      <div className="bg-white rounded-lg border border-app-input-border p-4 space-y-3">
        <h2 className="font-semibold text-app-text-primary flex items-center gap-2">
          <Upload className="h-4 w-4" />
          העלאה ישירה
        </h2>
        <div
          className="border-2 border-dashed border-app-input-border rounded-lg p-6 text-center cursor-pointer hover:border-app-accent hover:bg-app-accent/5 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-app-accent">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">מעלה קבצים...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-app-text-muted">
              <FileText className="h-8 w-8" />
              <span className="text-sm">גרור קבצי .e57 לכאן או לחץ לבחירה</span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".e57"
          multiple
          className="hidden"
          onChange={e => handleFileUpload(e.target.files)}
        />
        {uploadError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {uploadError}
          </div>
        )}
      </div>

      {/* ── Scans list ── */}
      <div className="bg-white rounded-lg border border-app-input-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-app-text-primary flex items-center gap-2">
            <ScanLine className="h-4 w-4" />
            סריקות ({scans.length})
          </h2>
          <button
            onClick={loadScans}
            disabled={scansLoading}
            className="p-1.5 text-app-text-muted hover:text-app-accent rounded transition-colors"
            title="רענן"
          >
            <RefreshCw className={`h-4 w-4 ${scansLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {scans.length === 0 ? (
          <p className="text-sm text-app-text-muted text-center py-8">
            לא נמצאו סריקות. העלה קובץ E57 להתחלה.
          </p>
        ) : (
          <div className="border border-app-input-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-app-text-muted text-xs">
                <tr>
                  <th className="text-right p-3">שם קובץ</th>
                  <th className="text-right p-3">גודל</th>
                  <th className="text-right p-3">סטטוס</th>
                  <th className="text-right p-3">תאריך</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {scans.map(scan => (
                  <React.Fragment key={scan.scan_id}>
                    <tr className="border-t border-app-input-border hover:bg-slate-50">
                      <td className="p-3 font-medium max-w-[200px] truncate" title={scan.original_name}>
                        {scan.original_name}
                      </td>
                      <td className="p-3 text-app-text-muted">{formatBytes(scan.file_size || 0)}</td>
                      <td className="p-3">
                        <StatusBadge status={scan.status} />
                        {scan.error && (
                          <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={scan.error}>
                            {scan.error}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-app-text-muted text-xs">{formatDate(scan.created_at)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 justify-end">
                          {scan.status === 'done' && (
                            <>
                              <button
                                onClick={() => setPreviewScan(previewScan === scan.scan_id ? null : scan.scan_id)}
                                className="p-1.5 text-app-text-muted hover:text-app-accent rounded transition-colors"
                                title="תצוגה מקדימה"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDownloadDxf(scan.scan_id)}
                                className="p-1.5 text-app-text-muted hover:text-app-accent rounded transition-colors"
                                title="הורד DXF"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDelete(scan.scan_id)}
                            className="p-1.5 text-app-text-muted hover:text-red-500 rounded transition-colors"
                            title="מחק"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {previewScan === scan.scan_id && (
                      <tr className="border-t border-app-input-border bg-slate-50">
                        <td colSpan={5} className="p-3">
                          <img
                            src={`${apiBase()}/api/navvis/scans/${scan.scan_id}/preview`}
                            alt="תצוגה מקדימה"
                            className="max-h-64 rounded border border-app-input-border mx-auto"
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
