import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Eye, FileText, Image as ImageIcon, File, AlertTriangle } from 'lucide-react';
import { api, AssetFile } from '../lib/api';
import { FileViewer } from './FileViewer';

interface AssetFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: number;
  measurementDate?: string | null; // If provided, show only files for this measurement; if null, show shared files; if undefined, show all files
  onFilesDeleted?: (assetId: number, hasFiles: boolean) => void;
  isUploading?: boolean; // Whether a file is currently being uploaded
}

export function AssetFilesModal({ isOpen, onClose, assetId, measurementDate, onFilesDeleted, isUploading = false }: AssetFilesModalProps) {
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [viewingFile, setViewingFile] = useState<AssetFile | null>(null);
  const [viewingAllFiles, setViewingAllFiles] = useState<AssetFile[]>([]);
  const [currentViewingIndex, setCurrentViewingIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && assetId) {
      fetchFiles();
    } else {
      setFiles([]);
      setSelectedFiles(new Set());
      setViewingFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, assetId, measurementDate]);

  const fetchFiles = async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const assetFiles = await api.assets.files.getAll(assetId, measurementDate);
      setFiles(assetFiles);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (fileId: number) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  };

  const handleDeleteClick = () => {
    if (selectedFiles.size === 0) return;
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (selectedFiles.size === 0) return;
    
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      const result = await api.assets.files.delete(Array.from(selectedFiles));
      if (result.success) {
        await fetchFiles();
        setSelectedFiles(new Set());
        
        // Notify parent if callback is provided - check files after fetch
        if (onFilesDeleted) {
          // Re-fetch to get updated file count
          const updatedFiles = await api.assets.files.getAll(assetId, measurementDate);
          onFilesDeleted(assetId, updatedFiles.length > 0);
        }
      } else {
        alert(`שגיאה במחיקה: ${result.error}`);
      }
    } catch (error) {
      console.error('Error deleting files:', error);
      alert('שגיאה במחיקת קבצים');
    } finally {
      setDeleting(false);
    }
  };

  const handleViewFile = (file: AssetFile) => {
    setViewingFile(file);
  };

  const handleViewAll = () => {
    // View only selected files - button is disabled when nothing is selected
    if (selectedFiles.size === 0) return;
    
    const filesToView = files.filter(f => selectedFiles.has(f.id));
    
    if (filesToView.length === 0) return;
    
    setViewingAllFiles(filesToView);
    setCurrentViewingIndex(0);
    setViewingFile(filesToView[0]);
  };

  const handleNextFile = () => {
    if (viewingAllFiles.length === 0) return;
    const nextIndex = (currentViewingIndex + 1) % viewingAllFiles.length;
    setCurrentViewingIndex(nextIndex);
    setViewingFile(viewingAllFiles[nextIndex]);
  };

  const handlePrevFile = () => {
    if (viewingAllFiles.length === 0) return;
    const prevIndex = (currentViewingIndex - 1 + viewingAllFiles.length) % viewingAllFiles.length;
    setCurrentViewingIndex(prevIndex);
    setViewingFile(viewingAllFiles[prevIndex]);
  };

  const handleCloseViewAll = () => {
    setViewingFile(null);
    setViewingAllFiles([]);
    setCurrentViewingIndex(0);
  };

  const getFileIcon = (fileType?: string) => {
    if (!fileType) return <FileText className="h-8 w-8" />;
    if (fileType.startsWith('image/')) return <ImageIcon className="h-8 w-8" />;
    if (fileType === 'application/pdf') return <FileText className="h-8 w-8" />;
    return <File className="h-8 w-8" />;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 opacity-100"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', cursor: isUploading ? 'wait' : 'default' }}
        onClick={() => {
          if (!viewingFile) {
            onClose();
          }
        }}
      >
        <div 
          className="bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col transition-all duration-300 scale-100 opacity-100"
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: isUploading ? 'wait' : 'default' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-slate-800">קבצים - נכס {assetId}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleViewAll}
                disabled={selectedFiles.size === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye className="h-4 w-4" />
                צפה בנבחרים{selectedFiles.size > 0 ? ` (${selectedFiles.size})` : ''}
              </button>
              <button
                onClick={handleDeleteClick}
                disabled={selectedFiles.size === 0 || deleting}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
                מחק נבחרים{selectedFiles.size > 0 ? ` (${selectedFiles.size})` : ''}
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors font-bold"
              >
                <X className="h-4 w-4" />
                סגור
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">טוען קבצים...</div>
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <FileText className="h-16 w-16 mb-4 opacity-50" />
                <p>אין קבצים עבור נכס זה</p>
              </div>
            ) : (
              <>
                {/* Select All Checkbox */}
                <div className="mb-4 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedFiles.size === files.length && files.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <label className="text-sm text-gray-700 cursor-pointer">
                    בחר הכל ({selectedFiles.size}/{files.length})
                  </label>
                </div>

                {/* Files Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-lg ${
                        selectedFiles.has(file.id)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handleViewFile(file)}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(file.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-center mb-2 text-gray-600">
                            {getFileIcon(file.file_type)}
                          </div>
                          <div className="text-xs font-medium text-gray-800 truncate" title={file.file_name || 'ללא שם'}>
                            {file.file_name || 'ללא שם קובץ'}
                          </div>
                          {file.file_size && (
                            <div className="text-xs text-gray-500 mt-1">
                              {formatFileSize(file.file_size)}
                            </div>
                          )}
                          {file.uploaded_at && (
                            <div className="text-xs text-gray-400 mt-1">
                              {new Date(file.uploaded_at).toLocaleDateString('he-IL')}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-center mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewFile(file);
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                        >
                          <Eye className="h-3 w-3" />
                          צפה
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* File Viewer Modal */}
      {viewingFile && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-300 opacity-100"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
          onClick={handleCloseViewAll}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col transition-all duration-300 scale-100 opacity-100 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-slate-800">{viewingFile.file_name || 'קובץ'}</h3>
                {viewingAllFiles.length > 1 && (
                  <span className="text-sm text-gray-600">
                    {currentViewingIndex + 1} / {viewingAllFiles.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {viewingAllFiles.length > 1 && (
                  <>
                    <button
                      onClick={handlePrevFile}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                      title="קובץ קודם"
                    >
                      ← קודם
                    </button>
                    <button
                      onClick={handleNextFile}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                      title="קובץ הבא"
                    >
                      הבא →
                    </button>
                  </>
                )}
                <button
                  onClick={handleCloseViewAll}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors font-bold"
                >
                  <X className="h-4 w-4" />
                  סגור
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <FileViewer
                fileUrl={viewingFile.file_url}
                fileName={viewingFile.file_name || `file-${viewingFile.id}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && createPortal(
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center transition-opacity duration-300 opacity-100"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">מחיקת קבצים</h3>
            </div>
            
            <p className="text-slate-600 mb-6">
              האם אתה בטוח שברצונך למחוק {selectedFiles.size} {selectedFiles.size === 1 ? 'קובץ' : 'קבצים'}? פעולה זו לא ניתנת לביטול.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'מוחק...' : 'מחק'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

