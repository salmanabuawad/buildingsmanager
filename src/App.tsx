import { useState, useEffect } from 'react';
import { BuildingsList } from './components/BuildingsList';
import { AssetsList } from './components/AssetsList';
import { AssetDetails } from './components/AssetDetails';
import { AdminPDFManager } from './components/AdminPDFManager';
import { AssetTypes } from './components/AssetTypes';
import { AssetSearch } from './components/AssetSearch';
import { ValidationRulesManager } from './components/ValidationRulesManager';
import { AssetTypeFieldsManager } from './components/AssetTypeFieldsManager';
import { BuildingListImport } from './components/BuildingListImport';
import { AssetsFileImport } from './components/AssetsFileImport';
import { TransferAreas } from './components/TransferAreas';
import { X, Settings, Building, Home, Tag, Search, Plus, Building2, Upload, ChevronDown, ChevronLeft, Trash2, Database, CheckCircle2, AlertCircle, Loader2, Menu } from 'lucide-react';
import { api } from './lib/api';
import { assetValidators, validateEntity } from './lib/validation';

interface Tab {
  id: string;
  type: 'buildings' | 'assets' | 'admin' | 'asset-types' | 'asset-search' | 'validation-rules' | 'asset-type-fields' | 'building-list-import' | 'assets-file-import' | 'asset-details' | 'transfer-areas';
  buildingNumber?: number;
  label: string;
  refreshKey?: number;
  taxRegion?: string;
  assetId?: string;
  assetIdentifier?: string;
  selectedAssetIds?: string[];
}

function App() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'buildings', type: 'buildings', label: 'מבנים' }
  ]);
  const [activeTabId, setActiveTabId] = useState('buildings');
  const [showCreateBuildingModal, setShowCreateBuildingModal] = useState(false);
  const [buildingsMenuOpen, setBuildingsMenuOpen] = useState(false);
  const [assetsMenuOpen, setAssetsMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(true);
  const [showDeletePreferencesConfirm, setShowDeletePreferencesConfirm] = useState(false);
  const [deletePreferencesLoading, setDeletePreferencesLoading] = useState(false);
  const [showBatchValidationModal, setShowBatchValidationModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [batchValidationLoading, setBatchValidationLoading] = useState(false);
  const [batchValidationProgress, setBatchValidationProgress] = useState<{
    current: number;
    total: number;
    currentAssetId?: string;
  } | null>(null);
  const [batchValidationResults, setBatchValidationResults] = useState<{
    total: number;
    valid: number;
    invalid: number;
    errors: Array<{ assetId: string; buildingNumber: number; errors: string[] }>;
  } | null>(null);

  function handleSelectBuilding(buildingNumber: number, taxRegions?: string) {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים' };
    
    // Ensure buildings tab exists
    const existingBuildingsTab = tabs.find(t => t.id === 'buildings');
    if (!existingBuildingsTab) {
      setTabs(prev => [buildingsTab, ...prev]);
    }

    if (taxRegions) {
      const regions = taxRegions.split(',').map(r => r.trim()).filter(r => r);

      if (regions.length === 1) {
        const singleRegionTabId = `assets-${buildingNumber}-region-${regions[0]}`;
        const existingTab = tabs.find(t => t.id === singleRegionTabId);
        
        if (existingTab) {
          // Tab already exists, just switch to it
          setActiveTabId(singleRegionTabId);
        } else {
          // Create new tab
          const singleRegionTab: Tab = {
            id: singleRegionTabId,
            type: 'assets',
            buildingNumber,
            taxRegion: regions[0],
            label: `מבנה ${buildingNumber} - אזור מס ${regions[0]}`
          };
          setTabs(prev => [...prev, singleRegionTab]);
          setActiveTabId(singleRegionTabId);
        }
      } else {
        const allAssetsTabId = `assets-${buildingNumber}-all`;
        const existingAllAssetsTab = tabs.find(t => t.id === allAssetsTabId);
        
        if (existingAllAssetsTab) {
          // Tab already exists, just switch to it
          setActiveTabId(allAssetsTabId);
        } else {
          // Create new tabs
          const newTabs: Tab[] = [];
          const allAssetsTab: Tab = {
            id: allAssetsTabId,
            type: 'assets',
            buildingNumber,
            label: `מבנה ${buildingNumber} - כל הנכסים (אזורי מס: ${regions.join(', ')})`
          };
          newTabs.push(allAssetsTab);

          regions.forEach(region => {
            const regionTabId = `assets-${buildingNumber}-region-${region}`;
            const existingRegionTab = tabs.find(t => t.id === regionTabId);
            if (!existingRegionTab) {
              const regionTab: Tab = {
                id: regionTabId,
                type: 'assets',
                buildingNumber,
                taxRegion: region,
                label: `מבנה ${buildingNumber} - אזור מס ${region}`
              };
              newTabs.push(regionTab);
            }
          });

          setTabs(prev => [...prev, ...newTabs]);
          setActiveTabId(allAssetsTabId);
        }
      }
    } else {
      const allAssetsTabId = `assets-${buildingNumber}-all`;
      const existingTab = tabs.find(t => t.id === allAssetsTabId);
      
      if (existingTab) {
        // Tab already exists, just switch to it
        setActiveTabId(allAssetsTabId);
      } else {
        // Create new tab
        const allAssetsTab: Tab = {
          id: allAssetsTabId,
          type: 'assets',
          buildingNumber,
          label: `מבנה ${buildingNumber} - כל הנכסים`
        };
        setTabs(prev => [...prev, allAssetsTab]);
        setActiveTabId(allAssetsTabId);
      }
    }
  }

  function handleSelectAsset(assetDbId: string | number, assetId: string, buildingNumber: number) {
    const assetDetailsTabId = `asset-details-${assetDbId}`;
    const existingTab = tabs.find(t => t.id === assetDetailsTabId);

    if (existingTab) {
      setActiveTabId(assetDetailsTabId);
    } else {
      const newTab: Tab = {
        id: assetDetailsTabId,
        type: 'asset-details',
        assetId: String(assetDbId),
        assetIdentifier: assetId,
        buildingNumber,
        label: `נכס ${assetId}`
      };
      setTabs([...tabs, newTab]);
      setActiveTabId(assetDetailsTabId);
    }
  }

  function handleOpenTransferAreas(selectedAssetIds: string[], buildingNumber: number, taxRegion?: string) {
    const transferAreasTabId = `transfer-areas-${buildingNumber}-${taxRegion || 'all'}-${Date.now()}`;
    const newTab: Tab = {
      id: transferAreasTabId,
      type: 'transfer-areas',
      buildingNumber,
      taxRegion,
      selectedAssetIds,
      label: `העברת שטחים - מבנה ${buildingNumber}${taxRegion ? ` - אזור מס ${taxRegion}` : ''}`
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(transferAreasTabId);
  }


  function handleDataUpdate() {
    setTabs(prevTabs => prevTabs.map(tab => {
      if (tab.type === 'buildings' || tab.type === 'assets') {
        return { ...tab, refreshKey: Date.now() };
      }
      return tab;
    }));
  }

  function openAdminPanel() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים' };
    const adminTabId = 'admin-panel';

    const newTab: Tab = {
      id: adminTabId,
      type: 'admin',
      label: 'מנהל PDF'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(adminTabId);
  }

  function openAssetTypes() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים' };
    const assetTypesTabId = 'asset-types-panel';

    const newTab: Tab = {
      id: assetTypesTabId,
      type: 'asset-types',
      label: 'סוגי נכסים'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(assetTypesTabId);
  }

  function openAssetSearch() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים' };
    const assetSearchTabId = 'asset-search-panel';

    const newTab: Tab = {
      id: assetSearchTabId,
      type: 'asset-search',
      label: 'חיפוש נכס'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(assetSearchTabId);
  }


  function openValidationRules() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים' };
    const validationRulesTabId = 'validation-rules-panel';

    const newTab: Tab = {
      id: validationRulesTabId,
      type: 'validation-rules',
      label: 'כללי תקינות'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(validationRulesTabId);
  }

  function openAssetTypeFields() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים' };
    const assetTypeFieldsTabId = 'asset-type-fields-panel';

    const newTab: Tab = {
      id: assetTypeFieldsTabId,
      type: 'asset-type-fields',
      label: 'שדות סוגי נכסים'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(assetTypeFieldsTabId);
  }

  function openFileImport() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים' };
    const fileImportTabId = 'file-import-panel';

    const newTab: Tab = {
      id: fileImportTabId,
      type: 'building-list-import',
      label: 'ייבוא File'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(fileImportTabId);
  }

  function openAssetsFileImport() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים' };
    const assetsFileImportTabId = 'assets-file-import-panel';

    const newTab: Tab = {
      id: assetsFileImportTabId,
      type: 'assets-file-import',
      label: 'ייבוא נכסים File'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(assetsFileImportTabId);
  }

  function handleCloseTab(tabId: string) {
    setTabs(prevTabs => {
      const newTabs = prevTabs.filter(tab => tab.id !== tabId);
      if (newTabs.length === 0) {
        const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים' };
        return [buildingsTab];
      }
      return newTabs;
    });

    if (activeTabId === tabId) {
      const remainingTabs = tabs.filter(tab => tab.id !== tabId);
      if (remainingTabs.length > 0) {
        setActiveTabId(remainingTabs[remainingTabs.length - 1].id);
      } else {
        setActiveTabId('buildings');
      }
    }
  }

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  async function handleDeleteAllPreferences() {
    setDeletePreferencesLoading(true);
    try {
      const USER_ID = 'default'; // In a real app, this would come from auth
      const result = await api.userPreferences.deleteAll(USER_ID);
      console.log('Preferences deleted:', result.message);
      // Refresh all tabs to reset grid preferences
      setTabs(prevTabs => prevTabs.map(tab => ({
        ...tab,
        refreshKey: Date.now()
      })));
    } catch (error: any) {
      console.error('Failed to delete all preferences:', error);
    } finally {
      setDeletePreferencesLoading(false);
      setShowDeletePreferencesConfirm(false);
    }
  }

  async function handleBatchValidateAllAssets() {
    setShowBatchValidationModal(true);
    setBatchValidationLoading(true);
    setBatchValidationResults(null);
    setBatchValidationProgress(null);

    try {
      // Get all assets from the system
      const allAssets = await api.assets.getAll();
      console.log(`[Batch Validation] Found ${allAssets.length} assets to validate`);

      const results = {
        total: allAssets.length,
        valid: 0,
        invalid: 0,
        errors: [] as Array<{ assetId: string; buildingNumber: number; errors: string[] }>
      };

      // Validate each asset
      for (let i = 0; i < allAssets.length; i++) {
        const asset = allAssets[i];
        
        // Update progress
        setBatchValidationProgress({
          current: i + 1,
          total: allAssets.length,
          currentAssetId: String(asset.asset_id)
        });
        const assetErrors: string[] = [];

        // Validate all fields using validateEntity
        const fieldValidations = await validateEntity('asset', asset);
        for (const [fieldName, validationResults] of Object.entries(fieldValidations)) {
          const invalidResults = validationResults.filter(r => !r.valid);
          if (invalidResults.length > 0) {
            invalidResults.forEach(r => {
              if (r.error) assetErrors.push(`${fieldName}: ${r.error}`);
            });
          }
        }

        // Validate asset-specific rules
        const validations = [
          assetValidators.validateBuildingNumber(asset.building_number),
          assetValidators.validateAssetId(String(asset.asset_id)),
          assetValidators.validatePayerId(asset.payer_id),
          assetValidators.validateAssetType(asset.main_asset_type, 'main_asset_type'),
          assetValidators.validateMainAssetTypeComplete(asset.building_number, asset.main_asset_type, asset.asset_size, asset),
          assetValidators.validateOnlyComplexTypesCanHaveSubAssets(asset.main_asset_type, [
            asset.sub_asset_type_1,
            asset.sub_asset_type_2,
            asset.sub_asset_type_3,
            asset.sub_asset_type_4,
            asset.sub_asset_type_5,
            asset.sub_asset_type_6
          ]),
          assetValidators.validateComplexTypesMustHaveSubAssets(asset.main_asset_type, [
            asset.sub_asset_type_1,
            asset.sub_asset_type_2,
            asset.sub_asset_type_3,
            asset.sub_asset_type_4,
            asset.sub_asset_type_5,
            asset.sub_asset_type_6
          ]),
          assetValidators.validateSubAssetSizeMatchesMain(
            asset.asset_size,
            [
              asset.sub_asset_type_1,
              asset.sub_asset_type_2,
              asset.sub_asset_type_3,
              asset.sub_asset_type_4,
              asset.sub_asset_type_5,
              asset.sub_asset_type_6
            ],
            [
              asset.sub_asset_size_1,
              asset.sub_asset_size_2,
              asset.sub_asset_size_3,
              asset.sub_asset_size_4,
              asset.sub_asset_size_5,
              asset.sub_asset_size_6
            ]
          ),
          assetValidators.validateSubAssetsFor199Or299(
            asset.building_number,
            asset.main_asset_type,
            asset.asset_size,
            [
              asset.sub_asset_type_1,
              asset.sub_asset_type_2,
              asset.sub_asset_type_3,
              asset.sub_asset_type_4,
              asset.sub_asset_type_5,
              asset.sub_asset_type_6
            ],
            [
              asset.sub_asset_size_1,
              asset.sub_asset_size_2,
              asset.sub_asset_size_3,
              asset.sub_asset_size_4,
              asset.sub_asset_size_5,
              asset.sub_asset_size_6
            ]
          )
        ];

        // Run all validations
        for (const validation of validations) {
          const result = await validation;
          if (!result.valid && result.error) {
            assetErrors.push(result.error);
          }
        }

        // Validate sub asset types individually
        const subAssetTypes = [
          asset.sub_asset_type_1,
          asset.sub_asset_type_2,
          asset.sub_asset_type_3,
          asset.sub_asset_type_4,
          asset.sub_asset_type_5,
          asset.sub_asset_type_6
        ];
        const subAssetSizes = [
          asset.sub_asset_size_1,
          asset.sub_asset_size_2,
          asset.sub_asset_size_3,
          asset.sub_asset_size_4,
          asset.sub_asset_size_5,
          asset.sub_asset_size_6
        ];

        for (let i = 0; i < subAssetTypes.length; i++) {
          if (subAssetTypes[i]) {
            const subValidation = await assetValidators.validateSubAssetTypeComplete(
              asset.building_number,
              subAssetTypes[i],
              subAssetSizes[i]
            );
            if (!subValidation.valid && subValidation.error) {
              assetErrors.push(`נכס משנה ${i + 1}: ${subValidation.error}`);
            }
          }
        }

        if (assetErrors.length > 0) {
          results.invalid++;
          results.errors.push({
            assetId: String(asset.asset_id),
            buildingNumber: asset.building_number,
            errors: assetErrors
          });
        } else {
          results.valid++;
        }
      }

      setBatchValidationResults(results);
      console.log(`[Batch Validation] Completed: ${results.valid} valid, ${results.invalid} invalid out of ${results.total} total`);
    } catch (error) {
      console.error('Error during batch validation:', error);
      setBatchValidationResults({
        total: 0,
        valid: 0,
        invalid: 0,
        errors: [{
          assetId: 'N/A',
          buildingNumber: 0,
          errors: [`שגיאה בביצוע אימות: ${error instanceof Error ? error.message : 'Unknown error'}`]
        }]
      });
    } finally {
      setBatchValidationLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 flex flex-col md:flex-row" dir="rtl">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg border border-purple-200"
      >
        <Menu className="h-6 w-6 text-purple-700" />
      </button>

      {/* Sidebar - hidden on mobile, shown on desktop */}
      <div className={`${sidebarOpen ? 'fixed inset-0 z-40 md:relative md:z-auto' : 'hidden md:flex'} md:w-48 bg-white/95 backdrop-blur-sm border-r border-purple-200 shadow-xl flex flex-col shrink-0`}>
        {/* Mobile close button */}
        {sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden absolute top-4 right-4 p-2 bg-white rounded-lg shadow-lg border border-purple-200"
          >
            <X className="h-6 w-6 text-purple-700" />
          </button>
        )}
        <div className="p-4 border-b border-purple-100 bg-gradient-to-br from-purple-100 via-indigo-50 to-white">
          <h2 className="text-lg font-bold bg-gradient-to-r from-purple-700 to-indigo-700 bg-clip-text text-transparent">תפריט ראשי</h2>
        </div>
        <nav className="flex-1 p-3 space-y-2">
          <div>
            <button
              onClick={() => setBuildingsMenuOpen(!buildingsMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-right bg-white hover:bg-purple-50 rounded-lg transition-all shadow-sm border border-purple-100 hover:shadow-md hover:border-purple-300 group"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-slate-700 group-hover:text-purple-900">מבנים</span>
                <Building2 className="h-4 w-4 text-purple-600 group-hover:text-purple-700" />
              </div>
              {buildingsMenuOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {buildingsMenuOpen && (
              <div className="mr-2 mt-2 space-y-1.5">
                <button
                  onClick={() => {
                    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
                    setTabs([buildingsTab]);
                    setActiveTabId('buildings');
                    setBuildingsMenuOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-purple-50/50 hover:bg-purple-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700 text-xs">רשימת מבנים</span>
                  <Building className="h-3.5 w-3.5 text-purple-600" />
                </button>
                <button
                  onClick={() => setShowCreateBuildingModal(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-purple-50/50 hover:bg-purple-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700">צור מבנה חדש</span>
                  <Plus className="h-3.5 w-3.5 text-purple-600" />
                </button>
                <button
                  onClick={openFileImport}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-purple-50/50 hover:bg-purple-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700">ייבוא File</span>
                  <Upload className="h-3.5 w-3.5 text-purple-600" />
                </button>
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => setAssetsMenuOpen(!assetsMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-right bg-white hover:bg-indigo-50 rounded-lg transition-all shadow-sm border border-purple-100 hover:shadow-md hover:border-indigo-300 group"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-slate-700 group-hover:text-indigo-900">נכסים</span>
                <Home className="h-4 w-4 text-indigo-600 group-hover:text-indigo-700" />
              </div>
              {assetsMenuOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {assetsMenuOpen && (
              <div className="mr-2 mt-2 space-y-1.5">
                <button
                  onClick={openAssetSearch}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-indigo-50/50 hover:bg-indigo-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700">חיפוש נכס</span>
                  <Search className="h-3.5 w-3.5 text-indigo-600" />
                </button>
                <button
                  onClick={openAssetsFileImport}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-indigo-50/50 hover:bg-indigo-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700">ייבוא File</span>
                  <Upload className="h-3.5 w-3.5 text-indigo-600" />
                </button>
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => setAdminMenuOpen(!adminMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-right bg-white hover:bg-pink-50 rounded-lg transition-all shadow-sm border border-purple-100 hover:shadow-md hover:border-pink-300 group"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-slate-700 group-hover:text-pink-900">ניהול</span>
                <Settings className="h-4 w-4 text-pink-600 group-hover:text-pink-700" />
              </div>
              {adminMenuOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {adminMenuOpen && (
              <div className="mr-2 mt-2 space-y-1.5">
                <button
                  onClick={openAssetTypes}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-pink-50/50 hover:bg-pink-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700">סוגי נכסים</span>
                  <Tag className="h-3.5 w-3.5 text-pink-600" />
                </button>
                <button
                  onClick={openValidationRules}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-pink-50/50 hover:bg-pink-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700">כללי תקינות</span>
                  <Settings className="h-3.5 w-3.5 text-pink-600" />
                </button>
                <button
                  onClick={openAssetTypeFields}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-pink-50/50 hover:bg-pink-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700">שדות סוגי נכסים</span>
                  <Database className="h-3.5 w-3.5 text-pink-600" />
                </button>
                <button
                  onClick={() => setShowDeletePreferencesConfirm(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-red-50/50 hover:bg-red-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-red-700">מחק כל העדפות משתמש</span>
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white/95 backdrop-blur-sm border-b border-purple-200 shadow-lg">
          <div className="px-2 sm:px-4 py-2">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-all cursor-pointer group rounded-t-lg ${
                    activeTabId === tab.id
                      ? 'border-purple-600 bg-gradient-to-r from-purple-50 to-indigo-50 shadow-sm'
                      : 'border-transparent hover:bg-purple-50/50 hover:border-purple-200'
                  }`}
                >
                  <div
                    onClick={() => setActiveTabId(tab.id)}
                    className="flex items-center gap-2 flex-shrink-0"
                  >
                    {tab.type === 'admin' ? (
                      <Settings className="h-4 w-4 text-purple-700" />
                    ) : tab.type === 'asset-types' ? (
                      <Tag className="h-4 w-4 text-purple-700" />
                    ) : tab.type === 'asset-search' ? (
                      <Search className="h-4 w-4 text-purple-700" />
                    ) : tab.type === 'validation-rules' ? (
                      <Settings className="h-4 w-4 text-purple-700" />
                    ) : tab.type === 'asset-type-fields' ? (
                      <Database className="h-4 w-4 text-purple-700" />
                    ) : tab.type === 'building-list-import' ? (
                      <Upload className="h-4 w-4 text-purple-700" />
                    ) : tab.type === 'assets-file-import' ? (
                      <Upload className="h-4 w-4 text-purple-700" />
                    ) : tab.type === 'buildings' ? (
                      <img src="/buildings.png" alt="Buildings" className="h-4 w-4" />
                    ) : (
                      <Building className="h-4 w-4 text-purple-700" />
                    )}
                    <span className={`font-semibold whitespace-nowrap text-sm ${
                      activeTabId === tab.id ? 'text-purple-900' : 'text-slate-600'
                    }`}>
                      {tab.label}
                    </span>
                  </div>
                  {tab.type !== 'buildings' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTab(tab.id);
                      }}
                      className="p-0.5 hover:bg-red-100 rounded transition-colors"
                    >
                      <X className="h-2.5 w-2.5 text-slate-600 hover:text-red-600" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Main Content Area */}
          <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50/50 to-white">
            {activeTab?.type === 'buildings' && (
              <BuildingsList
                key={activeTab.refreshKey}
                onSelectBuilding={handleSelectBuilding}
                onOpenAssetTypes={openAssetTypes}
                onOpenAssetSearch={openAssetSearch}
                onOpenValidationRules={openValidationRules}
                showCreateModal={showCreateBuildingModal}
                setShowCreateModal={setShowCreateBuildingModal}
              />
            )}
            {activeTab?.type === 'assets' && activeTab.buildingNumber && (
              <AssetsList
                key={activeTab.refreshKey}
                buildingNumber={activeTab.buildingNumber}
                taxRegion={activeTab.taxRegion}
                onSelectAsset={handleSelectAsset}
                onOpenTransferAreas={handleOpenTransferAreas}
              />
            )}
            {activeTab?.type === 'transfer-areas' && activeTab.buildingNumber && activeTab.selectedAssetIds && (
              <TransferAreas
                key={activeTab.refreshKey}
                buildingNumber={activeTab.buildingNumber}
                taxRegion={activeTab.taxRegion}
                selectedAssetIds={activeTab.selectedAssetIds}
              />
            )}
            {activeTab?.type === 'admin' && (
              <AdminPDFManager />
            )}
            {activeTab?.type === 'asset-types' && (
              <AssetTypes />
            )}
            {activeTab?.type === 'asset-search' && (
              <AssetSearch onSelectAsset={handleSelectAsset} />
            )}
            {activeTab?.type === 'validation-rules' && (
              <ValidationRulesManager />
            )}
            {activeTab?.type === 'asset-type-fields' && (
              <AssetTypeFieldsManager />
            )}
            {activeTab?.type === 'building-list-import' && (
              <BuildingListImport />
            )}
            {activeTab?.type === 'assets-file-import' && (
              <AssetsFileImport />
            )}
            {activeTab?.type === 'asset-details' && activeTab.assetId && (
              <AssetDetails assetId={parseInt(activeTab.assetId)} onDataUpdate={handleDataUpdate} />
            )}
          </div>
        </div>
      </div>

      {/* Delete All Preferences Confirmation Modal */}
      {showDeletePreferencesConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4">מחיקת כל העדפות המשתמש</h3>
            <p className="text-sm text-slate-600 mb-6">
              האם אתה בטוח שברצונך למחוק את כל העדפות המשתמש? פעולה זו תמחק את כל הגדרות העמודות (רוחב, מיקום, מיון) בכל הטבלאות. פעולה זו אינה הפיכה.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeletePreferencesConfirm(false)}
                disabled={deletePreferencesLoading}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={handleDeleteAllPreferences}
                disabled={deletePreferencesLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deletePreferencesLoading ? (
                  <>
                    <span>מוחק...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>מחק הכל</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBatchValidationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">אימות כל הנכסים במערכת</h3>
              <button
                onClick={() => setShowBatchValidationModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {batchValidationLoading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <div className="text-center w-full max-w-md">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-4" />
                  <p className="text-slate-600 mb-4">מאמת את כל הנכסים במערכת...</p>
                  {batchValidationProgress && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                        <span>נכס {batchValidationProgress.current} מתוך {batchValidationProgress.total}</span>
                        <span>{Math.round((batchValidationProgress.current / batchValidationProgress.total) * 100)}%</span>
                      </div>
                      {batchValidationProgress.currentAssetId && (
                        <p className="text-xs text-slate-500 mb-3">
                          מאמת נכס: {batchValidationProgress.currentAssetId}
                        </p>
                      )}
                      <div className="w-full bg-slate-200 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${(batchValidationProgress.current / batchValidationProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : batchValidationResults ? (
              <div className="flex-1 overflow-y-auto">
                <div className="mb-6 grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-700">{batchValidationResults.total}</div>
                    <div className="text-sm text-blue-600 mt-1">סה"כ נכסים</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-700">{batchValidationResults.valid}</div>
                    <div className="text-sm text-green-600 mt-1">תקינים</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-700">{batchValidationResults.invalid}</div>
                    <div className="text-sm text-red-600 mt-1">לא תקינים</div>
                  </div>
                </div>

                {batchValidationResults.errors.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-slate-700 mb-3">נכסים עם שגיאות:</h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {batchValidationResults.errors.map((error, idx) => (
                        <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <div className="flex items-start gap-2 mb-2">
                            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <div className="font-semibold text-red-900">
                                נכס {error.assetId} (מבנה {error.buildingNumber})
                              </div>
                              <ul className="mt-2 space-y-1">
                                {error.errors.map((err, errIdx) => (
                                  <li key={errIdx} className="text-sm text-red-700 flex items-start gap-2">
                                    <span className="text-red-500">•</span>
                                    <span>{err}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                    <p className="text-lg font-semibold text-green-700">כל הנכסים תקינים!</p>
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button
                onClick={() => setShowBatchValidationModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
