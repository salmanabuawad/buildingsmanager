import { useState, useEffect, useCallback } from 'react';
import { BuildingsList } from './components/BuildingsList';
import { AssetsList } from './components/AssetsList';
import { AssetDetails } from './components/AssetDetails';
import { AdminPDFManager } from './components/AdminPDFManager';
import { AssetTypes } from './components/AssetTypes';
import { AssetSearch } from './components/AssetSearch';
import { ValidationRulesManager } from './components/ValidationRulesManager';
import { BuildingListImport } from './components/BuildingListImport';
import { AssetsFileImport } from './components/AssetsFileImport';
import { TransferAreas } from './components/TransferAreas';
import { AddressListComponent } from './components/AddressList';
import { FieldConfigManager } from './components/FieldConfigManager';
import { X, Settings, Building, Home, Tag, Search, Plus, Building2, Upload, ChevronDown, ChevronLeft, Trash2, Database, CheckCircle2, AlertCircle, Loader2, Menu, MapPin, Edit, Square, Save } from 'lucide-react';
import { api, AssetType } from './lib/api';
import { assetValidators, validateEntity } from './lib/validation';
import { usePreferences } from './contexts/PreferencesContext';

interface Tab {
  id: string;
  type: 'buildings' | 'assets' | 'admin' | 'asset-types' | 'asset-search' | 'validation-rules' | 'building-list-import' | 'assets-file-import' | 'assets-skeleton-import' | 'asset-details' | 'transfer-areas' | 'address-list' | 'field-config';
  buildingNumber?: number;
  label: string;
  refreshKey?: number;
  taxRegion?: string;
  assetId?: string;
  assetIdentifier?: string;
  selectedAssetIds?: string[];
  path?: string; // URL path for routing compatibility
}

function App() {
  const { preferences, setEditMode } = usePreferences();
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'buildings', type: 'buildings', label: 'מבנים' }
  ]);
  const [activeTabId, setActiveTabId] = useState('buildings');
  const [showCreateBuildingModal, setShowCreateBuildingModal] = useState(false);
  const [buildingsMenuOpen, setBuildingsMenuOpen] = useState(false);
  const [assetsMenuOpen, setAssetsMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(true);
  const [showBatchValidationModal, setShowBatchValidationModal] = useState(false);
  const [batchValidationModalClosing, setBatchValidationModalClosing] = useState(false);
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
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);

  // Load asset types on mount
  useEffect(() => {
    async function loadAssetTypes() {
      try {
        const types = await api.assetTypes.getAll();
        setAssetTypes(types || []);
      } catch (error) {
        // Error loading asset types - silently fail
      }
    }
    loadAssetTypes();
  }, []);

  // Helper function to get area_description_for_tab from tax region number(s)
  const getAreaDescriptionForTaxRegion = useCallback((taxRegion: string | number | undefined): string => {
    if (!taxRegion || !assetTypes || assetTypes.length === 0) {
      return String(taxRegion || '');
    }
    
    const taxRegionNum = typeof taxRegion === 'string' ? parseInt(taxRegion.trim(), 10) : taxRegion;
    if (isNaN(taxRegionNum)) {
      return String(taxRegion);
    }
    
    // Find first asset type with matching tax_region that has area_description_for_tab
    const matchingAssetType = assetTypes.find(at =>
      at.tax_region === taxRegionNum && at.area_description_for_tab
    );
    
    return matchingAssetType?.area_description_for_tab || String(taxRegionNum);
  }, [assetTypes]);

  // Helper function to get area descriptions for multiple tax regions
  const getAreaDescriptionsForTaxRegions = useCallback((taxRegionsString: string | undefined): string => {
    if (!taxRegionsString || !assetTypes || assetTypes.length === 0) {
      return taxRegionsString || '';
    }
    
    const regions = taxRegionsString.split(',').map(r => r.trim()).filter(r => r);
    const descriptions = regions.map(region => {
      const regionNum = parseInt(region, 10);
      if (isNaN(regionNum)) {
        return region;
      }
      
      const matchingAssetType = assetTypes.find(at =>
        at.tax_region === regionNum && at.area_description_for_tab
      );
      
      return matchingAssetType?.area_description_for_tab || region;
    });
    
    return descriptions.join(', ');
  }, [assetTypes]);

  // Helper function to open a new tab, closing any existing tab of the same type
  // Exception: 'buildings' tab is always kept and multiple 'assets' tabs can exist (for different buildings/tax regions)
  function openTab(newTab: Tab) {
    setTabs(prev => {
      // Check if tab already exists
      const existingTab = prev.find(t => t.id === newTab.id);
      if (existingTab) {
        // Tab already exists, just activate it
        setActiveTabId(newTab.id);
        return prev;
      }
      
      // For most tab types, close existing tabs of the same type (except 'buildings' and 'assets')
      // 'assets' tabs can have multiple instances (for different buildings/tax regions)
      // 'buildings' tab should always be kept
      let filteredTabs = prev;
      if (newTab.type !== 'buildings' && newTab.type !== 'assets') {
        // Remove all existing tabs of the same type
        filteredTabs = prev.filter(t => t.type !== newTab.type);
      }
      
      // Ensure buildings tab exists
      const hasBuildings = filteredTabs.some(t => t.id === 'buildings');
      const tabsToReturn = hasBuildings ? [...filteredTabs, newTab] : [{ id: 'buildings', type: 'buildings', label: 'מבנים' }, ...filteredTabs, newTab];
      return tabsToReturn;
    });
    setActiveTabId(newTab.id);
  }

  function handleSelectBuilding(buildingNumber: number, taxRegions?: string) {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים' };
    
    // Ensure buildings tab exists
    const existingBuildingsTab = tabs.find(t => t.id === 'buildings');
    if (!existingBuildingsTab) {
      setTabs(prev => [buildingsTab, ...prev]);
    }

    if (taxRegions && taxRegions.trim() !== '') {
      const regions = taxRegions.split(',').map(r => r.trim()).filter(r => r);

      if (regions.length === 1) {
        const singleRegionTabId = `assets-${buildingNumber}-region-${regions[0]}`;
        const existingTab = tabs.find(t => t.id === singleRegionTabId);
        
        if (existingTab) {
          // Tab already exists, close all other assets tabs and switch to it
          setTabs(prev => {
            // Close all assets tabs except the one we're switching to
            const keepTabs = prev.filter(t => 
              t.id === 'buildings' || 
              t.type !== 'assets' || 
              t.id === singleRegionTabId
            );
            return keepTabs;
          });
          setActiveTabId(singleRegionTabId);
        } else {
          // Remove all other assets tabs, then create new tab
          const singleRegionTab: Tab = {
            id: singleRegionTabId,
            type: 'assets',
            buildingNumber,
            taxRegion: regions[0],
            label: `מבנה ${buildingNumber} - ${getAreaDescriptionForTaxRegion(regions[0])}`
          };
          setTabs(prev => {
            // Check if tab already exists
            const existingTab = prev.find(t => t.id === singleRegionTab.id);
            if (existingTab) {
              return prev;
            }
            // Close all assets tabs, then add new one
            const keepTabs = prev.filter(t => 
              t.id === 'buildings' || 
              t.type !== 'assets'
            );
            // Ensure buildings tab exists
            const hasBuildings = keepTabs.some(t => t.id === 'buildings');
            return hasBuildings ? [...keepTabs, singleRegionTab] : [buildingsTab, ...keepTabs, singleRegionTab];
          });
          setActiveTabId(singleRegionTabId);
        }
      } else if (regions.length > 1) {
        // Multiple tax regions - always create exactly 3 tabs: "all assets" + first 2 tax regions
        const allAssetsTabId = `assets-${buildingNumber}-all`;
        const tabsToCreate: Tab[] = [];
        
        // 1. Always create tab for all assets (no tax region filter) - FIRST TAB
        const allAssetsTab: Tab = {
          id: allAssetsTabId,
          type: 'assets',
          buildingNumber,
          label: `מבנה ${buildingNumber} - כל הנכסים`,
          path: `/buildings/${buildingNumber}/assets`
        };
        tabsToCreate.push(allAssetsTab);
        
        // 2. Create tabs for the first 2 tax regions only (tabs 2 and 3)
        const regionsToShow = regions.slice(0, 2);
        for (let i = 0; i < regionsToShow.length; i++) {
          const region = regionsToShow[i];
          const regionTabId = `assets-${buildingNumber}-region-${region}`;
          const regionTab: Tab = {
            id: regionTabId,
            type: 'assets',
            buildingNumber,
            taxRegion: region,
            label: `מבנה ${buildingNumber} - ${getAreaDescriptionForTaxRegion(region)}`
          };
          tabsToCreate.push(regionTab);
        }
        
        // Activate the "all assets" tab (first tab)
        // Update tabs: close all previous assets tabs, then add new tabs for this building
        setTabs(prev => {
          // Keep buildings tab and non-assets tabs, close all assets tabs
          const keepTabs = prev.filter(t => 
            t.id === 'buildings' || 
            t.type !== 'assets'
          );
          // Combine: keep tabs + all new tabs (this ensures we always have exactly 3 tabs for this building)
          const newTabs = [...keepTabs, ...tabsToCreate];
          return newTabs;
        });
        
        // Set active tab to "all assets" (first tab)
        setTimeout(() => {
          setActiveTabId(allAssetsTabId);
        }, 0);
      }
    } else {
      const allAssetsTabId = `assets-${buildingNumber}-all`;
      const existingTab = tabs.find(t => t.id === allAssetsTabId);
      
      if (existingTab) {
        // Tab already exists, close all other assets tabs and switch to it
        setTabs(prev => {
          // Close all assets tabs except the one we're switching to
          const keepTabs = prev.filter(t => 
            t.id === 'buildings' || 
            t.type !== 'assets' || 
            t.id === allAssetsTabId
          );
          return keepTabs;
        });
        setActiveTabId(allAssetsTabId);
      } else {
        // Remove all other assets tabs, then create new tab
        const allAssetsTab: Tab = {
          id: allAssetsTabId,
          type: 'assets',
          buildingNumber,
          label: `מבנה ${buildingNumber} - כל הנכסים`
        };
        setTabs(prev => {
          // Check if tab already exists
          const existingTab = prev.find(t => t.id === allAssetsTab.id);
          if (existingTab) {
            return prev;
          }
          // Close all assets tabs, then add new one
          const keepTabs = prev.filter(t => 
            t.id === 'buildings' || 
            t.type !== 'assets'
          );
          // Ensure buildings tab exists
          const hasBuildings = keepTabs.some(t => t.id === 'buildings');
          return hasBuildings ? [...keepTabs, allAssetsTab] : [buildingsTab, ...keepTabs, allAssetsTab];
        });
        setActiveTabId(allAssetsTabId);
      }
    }
  }

  function handleSelectAsset(assetDbId: string | number, assetId: string, buildingNumber: number, taxRegion?: string) {
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
        taxRegion, // Pass taxRegion from AssetsList tab - same as AssetsList
        label: `נכס ${assetId}`
      };
      // Remove all other asset-details tabs, then add new one
      openTab(newTab);
    }
  }

  function handleOpenNewAsset(buildingNumber: number, taxRegion?: string) {
    const newAssetTabId = `asset-details-new-${buildingNumber}-${taxRegion || 'all'}-${Date.now()}`;
    const newTab: Tab = {
      id: newAssetTabId,
      type: 'asset-details',
      buildingNumber,
      taxRegion,
      label: `נכס חדש - מבנה ${buildingNumber}${taxRegion ? ` - ${getAreaDescriptionForTaxRegion(taxRegion)}` : ''}`
    };
    // Remove all other asset-details tabs, then add new one
    openTab(newTab);
  }

  function handleOpenTransferAreas(selectedAssetIds: string[], buildingNumber: number, taxRegion?: string) {
    // Get tax regions with not_accountable = true
    const notAccountableTaxRegions = assetTypes
      .filter(at => at.not_accountable === true && at.tax_region != null)
      .map(at => String(at.tax_region))
      .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates

    // Combine original tax region with not_accountable tax regions
    let combinedTaxRegion = taxRegion || '';
    if (notAccountableTaxRegions.length > 0) {
      const existingRegions = taxRegion ? taxRegion.split(',').map(r => r.trim()).filter(r => r) : [];
      const allRegions = [...new Set([...existingRegions, ...notAccountableTaxRegions])]; // Remove duplicates
      combinedTaxRegion = allRegions.join(',');
    }

    const transferAreasTabId = `transfer-areas-${buildingNumber}-${combinedTaxRegion || 'all'}-${Date.now()}`;
    const newTab: Tab = {
      id: transferAreasTabId,
      type: 'transfer-areas',
      buildingNumber,
      taxRegion: combinedTaxRegion,
      selectedAssetIds,
      label: `העברת שטחים - מבנה ${buildingNumber}`
    };
    // Remove all other transfer-areas tabs, then add new one
    openTab(newTab);
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
    const adminTabId = 'admin-panel';

    const newTab: Tab = {
      id: adminTabId,
      type: 'admin',
      label: 'מנהל PDF'
    };

    // Remove all other admin tabs, then add new one
    openTab(newTab);
  }

  function openAssetTypes() {
    const assetTypesTabId = 'asset-types-panel';

    const newTab: Tab = {
      id: assetTypesTabId,
      type: 'asset-types',
      label: 'סוגי נכסים'
    };

    // Remove all other asset-types tabs, then add new one
    openTab(newTab);
  }

  function openAssetSearch() {
    const assetSearchTabId = 'asset-search-panel';

    const newTab: Tab = {
      id: assetSearchTabId,
      type: 'asset-search',
      label: 'חיפוש נכס'
    };

    // Remove all other asset-search tabs, then add new one
    openTab(newTab);
  }


  function openValidationRules() {
    const validationRulesTabId = 'validation-rules-panel';

    const newTab: Tab = {
      id: validationRulesTabId,
      type: 'validation-rules',
      label: 'כללי תקינות'
    };

    // Remove all other validation-rules tabs, then add new one
    openTab(newTab);
  }

  function openFieldConfig() {
    const fieldConfigTabId = 'field-config-panel';

    const newTab: Tab = {
      id: fieldConfigTabId,
      type: 'field-config',
      label: 'הגדרות שדות'
    };

    // Remove all other field-config tabs, then add new one
    openTab(newTab);
  }

  function openAddressList() {
    const addressListTabId = 'address-list-panel';

    const newTab: Tab = {
      id: addressListTabId,
      type: 'address-list',
      label: 'רשימת כתובות'
    };

    // Remove all other address-list tabs, then add new one
    openTab(newTab);
  }

  function openFileImport() {
    const fileImportTabId = 'file-import-panel';

    const newTab: Tab = {
      id: fileImportTabId,
      type: 'building-list-import',
      label: 'ייבוא File'
    };

    // Remove all other building-list-import tabs, then add new one
    openTab(newTab);
  }

  function openAssetsFileImport() {
    const assetsFileImportTabId = 'assets-file-import-panel';

    const newTab: Tab = {
      id: assetsFileImportTabId,
      type: 'assets-file-import',
      label: 'ייבוא מלא'
    };

    // Remove all other assets-file-import and assets-skeleton-import tabs, then add new one
    setTabs(prev => prev.filter(tab => tab.type !== 'assets-file-import' && tab.type !== 'assets-skeleton-import'));
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(assetsFileImportTabId);
  }

  function openAssetsSkeletonImport() {
    const assetsSkeletonImportTabId = 'assets-skeleton-import-panel';

    const newTab: Tab = {
      id: assetsSkeletonImportTabId,
      type: 'assets-skeleton-import',
      label: 'ייבוא שלד'
    };

    // Remove all other assets-file-import and assets-skeleton-import tabs, then add new one
    setTabs(prev => prev.filter(tab => tab.type !== 'assets-file-import' && tab.type !== 'assets-skeleton-import'));
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(assetsSkeletonImportTabId);
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


  async function handleBatchValidateAllAssets() {
    setShowBatchValidationModal(true);
    setBatchValidationLoading(true);
    setBatchValidationResults(null);
    setBatchValidationProgress(null);

    try {
      // Get all assets from the system
      const allAssets = await api.assets.getAll();

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
            ],
            asset.main_asset_type
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
              subAssetSizes[i],
              undefined,
              undefined,
              asset // Pass main asset data for penthouse and building-level validations
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
    } catch (error) {
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
                  <span className="font-medium text-slate-700">ייבוא מלא</span>
                  <Upload className="h-3.5 w-3.5 text-indigo-600" />
                </button>
                <button
                  onClick={openAssetsSkeletonImport}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-indigo-50/50 hover:bg-indigo-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700">ייבוא שלד</span>
                  <Upload className="h-3.5 w-3.5 text-indigo-600" />
                </button>
                <div className="w-full flex items-center justify-between px-3 py-2 bg-indigo-50/50 rounded-lg border border-indigo-200">
                  <span className="font-medium text-slate-700 text-xs">מצב עריכה</span>
                  <div className="flex items-center bg-white rounded-lg p-0.5 gap-0.5 border border-indigo-300">
                    <button
                      onClick={() => setEditMode('inline')}
                      className={`p-1 rounded transition-colors ${
                        preferences.editMode === 'inline'
                          ? 'bg-indigo-600 text-white'
                          : 'text-indigo-600 hover:bg-indigo-50'
                      }`}
                      title="עריכה ישירה בתא"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditMode('modal')}
                      className={`p-1 rounded transition-colors ${
                        preferences.editMode === 'modal'
                          ? 'bg-indigo-600 text-white'
                          : 'text-indigo-600 hover:bg-indigo-50'
                      }`}
                      title="עריכה בחלון נפרד"
                    >
                      <Square className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
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
                  onClick={openFieldConfig}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-pink-50/50 hover:bg-pink-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700">הגדרות שדות</span>
                  <Settings className="h-3.5 w-3.5 text-pink-600" />
                </button>
                <button
                  onClick={openAddressList}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right bg-pink-50/50 hover:bg-pink-100 rounded-lg transition-all text-xs shadow-sm hover:shadow"
                >
                  <span className="font-medium text-slate-700">רשימת כתובות</span>
                  <MapPin className="h-3.5 w-3.5 text-pink-600" />
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
                    ) : tab.type === 'field-config' ? (
                      <Settings className="h-4 w-4 text-purple-700" />
                    ) : tab.type === 'address-list' ? (
                      <MapPin className="h-4 w-4 text-purple-700" />
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
                  onOpenNewAsset={handleOpenNewAsset}
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
            {activeTab?.type === 'address-list' && (
              <AddressListComponent />
            )}
            {activeTab?.type === 'field-config' && (
              <FieldConfigManager />
            )}
            {activeTab?.type === 'building-list-import' && (
              <BuildingListImport />
            )}
            {activeTab?.type === 'assets-file-import' && (
              <AssetsFileImport mode="regular" />
            )}
            {activeTab?.type === 'assets-skeleton-import' && (
              <AssetsFileImport mode="skeleton" />
            )}
            {activeTab?.type === 'asset-details' && (
              <AssetDetails 
                assetId={activeTab.assetId ? parseInt(activeTab.assetId) : undefined}
                buildingNumber={activeTab.buildingNumber}
                taxRegion={activeTab.taxRegion}
                onDataUpdate={handleDataUpdate}
                onAssetCreated={(assetDbId, assetIdentifier) => {
                  // Update the current tab to show the newly created asset
                  setTabs(prev => prev.map(tab => {
                    if (tab.id === activeTab?.id && tab.type === 'asset-details') {
                      return {
                        ...tab,
                        assetId: String(assetDbId),
                        assetIdentifier: assetIdentifier,
                        label: `נכס ${assetIdentifier}`
                      };
                    }
                    return tab;
                  }));
                }}
              />
            )}
          </div>
        </div>
      </div>


      {showBatchValidationModal && (
        <div 
          className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ${
            batchValidationModalClosing ? 'opacity-0' : 'opacity-100'
          }`}
          dir="rtl"
        >
          <div 
            className={`bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col transition-all duration-300 ${
              batchValidationModalClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">אימות כל הנכסים במערכת</h3>
              <button
                onClick={() => {
                  setBatchValidationModalClosing(true);
                  setTimeout(() => {
                    setShowBatchValidationModal(false);
                    setBatchValidationModalClosing(false);
                  }, 300);
                }}
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
                onClick={() => {
                  setBatchValidationModalClosing(true);
                  setTimeout(() => {
                    setShowBatchValidationModal(false);
                    setBatchValidationModalClosing(false);
                  }, 300);
                }}
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
