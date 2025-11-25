import { useState } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Download, Building as BuildingIcon } from 'lucide-react';

export interface SingleAssetValidationResult {
  valid: boolean;
  errors: string[];
  passed?: string[];
  matchedAssetTypeRecord?: string;
}

export interface BatchValidationError {
  assetId: string;
  assetDbId?: string;
  buildingNumber: number;
  errors: string[];
  passed?: string[];
  matchedAssetTypeRecord?: string;
}

export interface BatchValidationResults {
  total: number;
  valid: number;
  invalid: number;
  errors: BatchValidationError[];
}

export interface ValidationProgress {
  current: number;
  total: number;
  currentStep?: string;
  currentAssetId?: string;
}

export type ValidationContext = 'single' | 'building' | 'import';

interface ValidationResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
  progress?: ValidationProgress | null;
  context?: ValidationContext; // Explicit context for better differentiation
  // Single asset validation
  singleResult?: SingleAssetValidationResult | null;
  singleAssetTitle?: string;
  assetId?: string; // Asset ID for single asset validation context
  // Batch validation
  batchResults?: BatchValidationResults | null;
  batchTitle?: string;
  buildingNumber?: number; // Building number for building validation context
  onExportInvalid?: () => void;
}

export function ValidationResultModal({
  isOpen,
  onClose,
  isLoading = false,
  progress = null,
  context,
  singleResult = null,
  singleAssetTitle,
  assetId,
  batchResults = null,
  batchTitle,
  buildingNumber,
  onExportInvalid
}: ValidationResultModalProps) {
  const [validationFilter, setValidationFilter] = useState<'all' | 'valid' | 'invalid'>('all');

  if (!isOpen) return null;

  // Determine context automatically if not provided
  const isBatch = batchResults !== null;
  const isSingle = singleResult !== null;
  const actualContext: ValidationContext = context || (isSingle ? 'single' : isBatch ? (batchTitle?.includes('ייבוא') || batchTitle?.includes('import') ? 'import' : 'building') : 'single');

  // Reset filter when modal opens with new batch results
  if (isBatch && validationFilter === 'all' && batchResults) {
    // Filter will be managed by user clicks
  }

  // Context-specific configurations
  const contextConfig = {
    single: {
      title: singleAssetTitle || 'תוצאות אימות נכס',
      loadingTitle: assetId ? `מאמת נכס ${assetId}` : 'מאמת נכס',
      loadingMessage: assetId ? `מאמת את הנכס ${assetId}` : 'מאמת את הנכס',
      progressLabel: (current: number, total: number) => `שלב ${current} מתוך ${total}`,
      showExport: false,
      icon: 'single'
    },
    building: {
      title: batchTitle || 'תוצאות אימות נכסי מבנה',
      loadingTitle: buildingNumber ? `מאמת נכסי מבנה ${buildingNumber}` : 'מאמת נכסי מבנה',
      loadingMessage: buildingNumber ? `מאמת את נכסי המבנה ${buildingNumber}` : 'מאמת את נכסי המבנה',
      progressLabel: (current: number, total: number) => `נכס ${current} מתוך ${total}`,
      showExport: true,
      icon: 'building'
    },
    import: {
      title: batchTitle || 'תוצאות אימות ייבוא',
      loadingTitle: 'מאמת נכסים מיובאים',
      loadingMessage: 'מאמת את הנכסים המיובאים',
      progressLabel: (current: number, total: number) => `שורה ${current} מתוך ${total}`,
      showExport: false,
      icon: 'import'
    }
  };

  const config = contextConfig[actualContext];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className={`bg-white rounded-lg shadow-xl p-4 sm:p-6 ${
        actualContext === 'single' ? 'max-w-2xl' : 
        actualContext === 'building' ? 'max-w-4xl' : 
        'max-w-4xl'
      } w-full max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between mb-4 px-4 py-3 rounded-t-lg ${
          actualContext === 'single' 
            ? (singleResult?.valid ? 'bg-green-50 border-b border-green-200' : singleResult ? 'bg-red-50 border-b border-red-200' : 'bg-blue-50 border-b border-blue-200')
            : actualContext === 'building'
            ? 'bg-blue-50 border-b border-blue-200'
            : 'bg-purple-50 border-b border-purple-200'
        }`}>
          <div className="flex items-center gap-2">
            {actualContext === 'single' && !isLoading && singleResult && (
              <div className={`p-2 rounded-full ${
                singleResult.valid ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {singleResult.valid ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
              </div>
            )}
            {actualContext === 'building' && (
              <div className="p-2 rounded-full bg-blue-100">
                <BuildingIcon className="h-5 w-5 text-blue-600" />
              </div>
            )}
            {actualContext === 'import' && (
              <div className="p-2 rounded-full bg-purple-100">
                <Download className="h-5 w-5 text-purple-600" />
              </div>
            )}
            <h3 className="text-lg font-bold text-slate-900">
              {isLoading ? config.loadingTitle : config.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center w-full max-w-md">
              <Loader2 className={`h-8 w-8 animate-spin mx-auto mb-4 ${
                actualContext === 'single' ? 'text-blue-600' :
                actualContext === 'building' ? 'text-blue-600' :
                'text-purple-600'
              }`} />
              <p className="text-slate-600 mb-4">
                {config.loadingMessage}
              </p>
              {progress && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                    <span>{config.progressLabel(progress.current, progress.total)}</span>
                    <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                  </div>
                  {(progress.currentStep || progress.currentAssetId) && (
                    <p className="text-xs text-slate-500 mb-3">
                      {progress.currentStep || 
                        (actualContext === 'import' 
                          ? `מאמת שורה: ${progress.currentAssetId}`
                          : `מאמת נכס: ${progress.currentAssetId}`)}
                    </p>
                  )}
                  <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-300 ${
                        actualContext === 'single' ? 'bg-blue-600' :
                        actualContext === 'building' ? 'bg-blue-600' :
                        'bg-purple-600'
                      }`}
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isBatch && batchResults ? (
          /* Batch Validation Results */
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <button
                  onClick={() => setValidationFilter('all')}
                  className={`rounded-lg p-4 text-center transition-all cursor-pointer ${
                    validationFilter === 'all' 
                      ? 'bg-blue-200 border-2 border-blue-500 shadow-md' 
                      : 'bg-blue-50 hover:bg-blue-100'
                  }`}
                >
                  <div className={`text-2xl font-bold ${validationFilter === 'all' ? 'text-blue-900' : 'text-blue-700'}`}>
                    {batchResults.total}
                  </div>
                  <div className={`text-sm mt-1 ${validationFilter === 'all' ? 'text-blue-900 font-semibold' : 'text-blue-600'}`}>
                    סה"כ נכסים
                  </div>
                </button>
                <button
                  onClick={() => setValidationFilter('valid')}
                  className={`rounded-lg p-4 text-center transition-all cursor-pointer ${
                    validationFilter === 'valid' 
                      ? 'bg-green-200 border-2 border-green-500 shadow-md' 
                      : 'bg-green-50 hover:bg-green-100'
                  }`}
                >
                  <div className={`text-2xl font-bold ${validationFilter === 'valid' ? 'text-green-900' : 'text-green-700'}`}>
                    {batchResults.valid}
                  </div>
                  <div className={`text-sm mt-1 ${validationFilter === 'valid' ? 'text-green-900 font-semibold' : 'text-green-600'}`}>
                    תקינים
                  </div>
                </button>
                <button
                  onClick={() => setValidationFilter('invalid')}
                  className={`rounded-lg p-4 text-center transition-all cursor-pointer ${
                    validationFilter === 'invalid' 
                      ? 'bg-red-200 border-2 border-red-500 shadow-md' 
                      : 'bg-red-50 hover:bg-red-100'
                  }`}
                >
                  <div className={`text-2xl font-bold ${validationFilter === 'invalid' ? 'text-red-900' : 'text-red-700'}`}>
                    {batchResults.invalid}
                  </div>
                  <div className={`text-sm mt-1 ${validationFilter === 'invalid' ? 'text-red-900 font-semibold' : 'text-red-600'}`}>
                    לא תקינים
                  </div>
                </button>
              </div>

              {(() => {
                // Filter errors based on selected filter
                let filteredErrors = batchResults.errors;
                if (validationFilter === 'valid') {
                  filteredErrors = batchResults.errors.filter(e => e.errors.length === 0);
                } else if (validationFilter === 'invalid') {
                  filteredErrors = batchResults.errors.filter(e => e.errors.length > 0);
                }

                return filteredErrors.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-slate-700 mb-3">
                      {validationFilter === 'all' 
                        ? (actualContext === 'import' ? 'תוצאות אימות ייבוא:' : 'תוצאות אימות:')
                        : validationFilter === 'valid'
                        ? (actualContext === 'import' ? 'שורות תקינות:' : 'נכסים תקינים:')
                        : (actualContext === 'import' ? 'שורות עם שגיאות:' : 'נכסים עם שגיאות:')}
                    </h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {filteredErrors.map((error, idx) => (
                        <div key={idx} className={`${error.errors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} border rounded-lg p-4`}>
                          <div className="flex items-start gap-2 mb-2">
                            {error.errors.length > 0 ? (
                              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <div className={`font-semibold ${error.errors.length > 0 ? 'text-red-900' : 'text-green-900'}`}>
                                {actualContext === 'import' 
                                  ? `שורה: ${error.assetId}${error.buildingNumber ? ` (מבנה ${error.buildingNumber})` : ''}`
                                  : `נכס ${error.assetId} (מבנה ${error.buildingNumber})`}
                              </div>
                              {error.matchedAssetTypeRecord && (
                                <div className="mt-2 mb-2 p-2 bg-blue-50 border border-blue-200 rounded">
                                  <p className="text-xs font-semibold text-blue-900 mb-1">רישום מסוג נכס שתואם:</p>
                                  <p className="text-xs text-blue-700">{error.matchedAssetTypeRecord}</p>
                                </div>
                              )}
                              {error.errors.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                  {error.errors.map((err, errIdx) => (
                                    <li key={errIdx} className="text-sm text-red-700 flex items-start gap-2">
                                      <span className="text-red-500">•</span>
                                      <span>{err}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    {validationFilter === 'valid' ? (
                      <>
                        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                        <p className="text-lg font-semibold text-green-700">
                          {actualContext === 'import' ? 'אין שורות תקינות להצגה' : 'אין נכסים תקינים להצגה'}
                        </p>
                      </>
                    ) : validationFilter === 'invalid' ? (
                      <>
                        <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
                        <p className="text-lg font-semibold text-red-700">
                          {actualContext === 'import' ? 'אין שורות לא תקינות להצגה' : 'אין נכסים לא תקינים להצגה'}
                        </p>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                        <p className="text-lg font-semibold text-green-700">
                          {actualContext === 'import' ? 'כל השורות תקינות!' : 'כל הנכסים תקינים!'}
                        </p>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer with export and close buttons */}
            <div className="mt-6 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 border-t pt-4">
              {config.showExport && batchResults.errors.some(e => e.errors.length > 0) && onExportInvalid && (
                <button
                  onClick={onExportInvalid}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <Download className="h-4 w-4" />
                  ייצא ל-File
                </button>
              )}
              <button
                onClick={onClose}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors w-full sm:w-auto ${
                  actualContext === 'import'
                    ? 'text-white bg-purple-600 hover:bg-purple-700'
                    : actualContext === 'building'
                    ? 'text-white bg-blue-600 hover:bg-blue-700'
                    : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                סגור
              </button>
            </div>
          </>
        ) : isSingle && singleResult ? (
          /* Single Asset Validation Results */
          <>
            <div className={`${singleResult.valid ? 'bg-green-500' : 'bg-red-500'} px-6 py-4 flex items-center justify-between`}>
              <h2 className="text-2xl font-bold text-white">
                {singleResult.valid ? 'אימות הצליח' : 'שגיאות אימות'}
              </h2>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {singleResult.valid ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                  <p className="text-xl font-semibold text-green-700 mb-2">הנכס תקין</p>
                  <p className="text-slate-600 mb-4">כל האימותים עברו בהצלחה</p>
                  {singleResult.matchedAssetTypeRecord && (
                    <div className="w-full mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-semibold text-blue-900 mb-1">רישום מסוג נכס שתואם:</p>
                      <p className="text-xs text-blue-700">{singleResult.matchedAssetTypeRecord}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {singleResult.matchedAssetTypeRecord && (
                    <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-semibold text-blue-900 mb-1">רישום מסוג נכס שתואם:</p>
                      <p className="text-xs text-blue-700">{singleResult.matchedAssetTypeRecord}</p>
                    </div>
                  )}
                  <p className="text-lg font-semibold text-slate-800 mb-4">
                    נמצאו {singleResult.errors.length} שגיאות:
                  </p>
                  <ul className="space-y-2">
                    {singleResult.errors.map((error, index) => (
                      <li key={index} className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <span className="text-red-800 flex-1">{error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                סגור
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

