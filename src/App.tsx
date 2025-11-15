import { useState } from 'react';
import { BuildingsList } from './components/BuildingsList';
import { AssetsList } from './components/AssetsList';
import { AssetDetails } from './components/AssetDetails';
import { AdminPDFManager } from './components/AdminPDFManager';
import { AssetTypes } from './components/AssetTypes';
import { AssetSearch } from './components/AssetSearch';
import { AssetDataEntry } from './components/AssetDataEntry';
import { ValidationRulesManager } from './components/ValidationRulesManager';
import { X, Settings, Building, Home, Tag, Search, Plus, Building2, Upload, ChevronDown, ChevronLeft } from 'lucide-react';

interface Tab {
  id: string;
  type: 'buildings' | 'assets' | 'details' | 'admin' | 'asset-types' | 'asset-search' | 'data-entry' | 'validation-rules';
  buildingNumber?: number;
  assetId?: string;
  label: string;
  refreshKey?: number;
}

function App() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'buildings', type: 'buildings', label: 'בניינים' }
  ]);
  const [activeTabId, setActiveTabId] = useState('buildings');
  const [showCreateBuildingModal, setShowCreateBuildingModal] = useState(false);
  const [showImportCSVModal, setShowImportCSVModal] = useState(false);
  const [buildingsMenuOpen, setBuildingsMenuOpen] = useState(false);
  const [assetsMenuOpen, setAssetsMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  function handleSelectBuilding(buildingNumber: number) {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
    const newTabId = `assets-${buildingNumber}`;

    const newTab: Tab = {
      id: newTabId,
      type: 'assets',
      buildingNumber,
      label: `בניין ${buildingNumber}`
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(newTabId);
  }

  function handleSelectAsset(assetDbId: string, assetId: string, buildingNumber: number) {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
    const newTabId = `details-${assetDbId}`;

    const newTab: Tab = {
      id: newTabId,
      type: 'details',
      buildingNumber,
      assetId: assetDbId,
      label: `נכס ${assetId}`
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(newTabId);
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
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
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
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
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
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
    const assetSearchTabId = 'asset-search-panel';

    const newTab: Tab = {
      id: assetSearchTabId,
      type: 'asset-search',
      label: 'חיפוש נכס'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(assetSearchTabId);
  }

  function openDataEntry() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
    const dataEntryTabId = 'data-entry-panel';

    const newTab: Tab = {
      id: dataEntryTabId,
      type: 'data-entry',
      label: 'הוספת נכס'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(dataEntryTabId);
  }

  function openValidationRules() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
    const validationRulesTabId = 'validation-rules-panel';

    const newTab: Tab = {
      id: validationRulesTabId,
      type: 'validation-rules',
      label: 'כללי תקינות'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(validationRulesTabId);
  }

  function handleCloseTab(tabId: string) {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
    setTabs([buildingsTab]);
    setActiveTabId('buildings');
  }

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 flex" dir="rtl">
      <div className="w-64 bg-white/95 backdrop-blur-sm border-r border-purple-200 shadow-xl flex flex-col shrink-0">
        <div className="p-4 border-b border-purple-100 bg-gradient-to-br from-purple-100 via-indigo-50 to-white">
          <h2 className="text-lg font-bold bg-gradient-to-r from-purple-700 to-indigo-700 bg-clip-text text-transparent">תפריט ראשי</h2>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <div>
            <button
              onClick={() => setBuildingsMenuOpen(!buildingsMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-right bg-white hover:bg-purple-50 rounded-lg transition-all shadow-sm border border-purple-100 hover:shadow-md group"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-700 group-hover:text-purple-900">בניינים</span>
                <Building2 className="h-5 w-5 text-purple-600 group-hover:text-purple-700" />
              </div>
              {buildingsMenuOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {buildingsMenuOpen && (
              <div className="mr-4 mt-1 space-y-1">
                <button
                  onClick={() => {
                    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
                    setTabs([buildingsTab]);
                    setActiveTabId('buildings');
                    setBuildingsMenuOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-right bg-purple-50/50 hover:bg-purple-100 rounded-lg transition-colors text-sm"
                >
                  <span className="font-medium text-slate-600">רשימת בניינים</span>
                  <Building className="h-4 w-4 text-purple-500" />
                </button>
                <button
                  onClick={() => setShowCreateBuildingModal(true)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-right bg-purple-50/50 hover:bg-purple-100 rounded-lg transition-colors text-sm"
                >
                  <span className="font-medium text-slate-600">צור בניין חדש</span>
                  <Plus className="h-4 w-4 text-purple-500" />
                </button>
                <button
                  onClick={() => setShowImportCSVModal(true)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-right bg-purple-50/50 hover:bg-purple-100 rounded-lg transition-colors text-sm"
                >
                  <span className="font-medium text-slate-600">ייבוא CSV</span>
                  <Upload className="h-4 w-4 text-purple-500" />
                </button>
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => setAssetsMenuOpen(!assetsMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-right bg-white hover:bg-indigo-50 rounded-lg transition-all shadow-sm border border-purple-100 hover:shadow-md group"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-700 group-hover:text-indigo-900">נכסים</span>
                <Home className="h-5 w-5 text-indigo-600 group-hover:text-indigo-700" />
              </div>
              {assetsMenuOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {assetsMenuOpen && (
              <div className="mr-4 mt-1 space-y-1">
                <button
                  onClick={openDataEntry}
                  className="w-full flex items-center gap-3 px-4 py-2 text-right bg-indigo-50/50 hover:bg-indigo-100 rounded-lg transition-colors text-sm"
                >
                  <span className="font-medium text-slate-600">הוסף נכס חדש</span>
                  <Plus className="h-4 w-4 text-indigo-500" />
                </button>
                <button
                  onClick={openAssetSearch}
                  className="w-full flex items-center gap-3 px-4 py-2 text-right bg-indigo-50/50 hover:bg-indigo-100 rounded-lg transition-colors text-sm"
                >
                  <span className="font-medium text-slate-600">חיפוש נכס</span>
                  <Search className="h-4 w-4 text-indigo-500" />
                </button>
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => setAdminMenuOpen(!adminMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-right bg-white hover:bg-pink-50 rounded-lg transition-all shadow-sm border border-purple-100 hover:shadow-md group"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-700 group-hover:text-pink-900">ניהול</span>
                <Settings className="h-5 w-5 text-pink-600 group-hover:text-pink-700" />
              </div>
              {adminMenuOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {adminMenuOpen && (
              <div className="mr-4 mt-1 space-y-1">
                <button
                  onClick={openAssetTypes}
                  className="w-full flex items-center gap-3 px-4 py-2 text-right bg-pink-50/50 hover:bg-pink-100 rounded-lg transition-colors text-sm"
                >
                  <span className="font-medium text-slate-600">סוגי נכסים</span>
                  <Tag className="h-4 w-4 text-pink-500" />
                </button>
                <button
                  onClick={openValidationRules}
                  className="w-full flex items-center gap-3 px-4 py-2 text-right bg-pink-50/50 hover:bg-pink-100 rounded-lg transition-colors text-sm"
                >
                  <span className="font-medium text-slate-600">כללי תקינות</span>
                  <Settings className="h-4 w-4 text-pink-500" />
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white/90 backdrop-blur-sm border-b border-purple-100 shadow-md">
          <div className="px-2 sm:px-4">
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 border-b-2 transition-all cursor-pointer group ${
                    activeTabId === tab.id
                      ? 'border-purple-600 bg-gradient-to-r from-purple-50 to-indigo-50'
                      : 'border-transparent hover:bg-purple-50/50'
                  }`}
                >
                  <div
                    onClick={() => setActiveTabId(tab.id)}
                    className="flex items-center gap-1 sm:gap-2 flex-shrink-0"
                  >
                    {tab.type === 'admin' ? (
                      <Settings className="h-3 w-3 sm:h-4 sm:w-4 text-purple-700" />
                    ) : tab.type === 'asset-types' ? (
                      <Tag className="h-3 w-3 sm:h-4 sm:w-4 text-purple-700" />
                    ) : tab.type === 'asset-search' ? (
                      <Search className="h-3 w-3 sm:h-4 sm:w-4 text-purple-700" />
                    ) : tab.type === 'data-entry' ? (
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4 text-purple-700" />
                    ) : tab.type === 'validation-rules' ? (
                      <Settings className="h-3 w-3 sm:h-4 sm:w-4 text-purple-700" />
                    ) : tab.type === 'buildings' ? (
                      <img src="/buildings.png" alt="Buildings" className="h-3 w-3 sm:h-4 sm:w-4" />
                    ) : tab.type === 'assets' ? (
                      <Building className="h-3 w-3 sm:h-4 sm:w-4 text-purple-700" />
                    ) : (
                      <Home className="h-3 w-3 sm:h-4 sm:w-4 text-purple-700" />
                    )}
                    <span className={`font-medium whitespace-nowrap text-xs sm:text-sm ${
                      activeTabId === tab.id ? 'text-purple-900' : 'text-slate-700'
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
                      className="p-0.5 sm:p-1 hover:bg-red-100 rounded transition-colors"
                    >
                      <X className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-slate-600 hover:text-red-600" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {activeTab?.type === 'buildings' && (
            <BuildingsList
              key={activeTab.refreshKey}
              onSelectBuilding={handleSelectBuilding}
              onOpenAssetTypes={openAssetTypes}
              onOpenAssetSearch={openAssetSearch}
              onOpenDataEntry={openDataEntry}
              onOpenValidationRules={openValidationRules}
              showCreateModal={showCreateBuildingModal}
              setShowCreateModal={setShowCreateBuildingModal}
              showImportModal={showImportCSVModal}
              setShowImportModal={setShowImportCSVModal}
            />
          )}
          {activeTab?.type === 'assets' && activeTab.buildingNumber && (
            <AssetsList
              key={activeTab.refreshKey}
              buildingNumber={activeTab.buildingNumber}
              onSelectAsset={handleSelectAsset}
            />
          )}
          {activeTab?.type === 'details' && activeTab.assetId && (
            <AssetDetails assetId={activeTab.assetId} onDataUpdate={handleDataUpdate} />
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
          {activeTab?.type === 'data-entry' && (
            <AssetDataEntry />
          )}
          {activeTab?.type === 'validation-rules' && (
            <ValidationRulesManager />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
