import { useState } from 'react';
import { BuildingsList } from './components/BuildingsList';
import { AssetsList } from './components/AssetsList';
import { AssetDetails } from './components/AssetDetails';
import { AdminPDFManager } from './components/AdminPDFManager';
import { AssetTypes } from './components/AssetTypes';
import { AssetSearch } from './components/AssetSearch';
import { AssetDataEntry } from './components/AssetDataEntry';
import { ValidationRulesManager } from './components/ValidationRulesManager';
import { X, Settings, Building, Home, Tag, Search, Plus } from 'lucide-react';

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
    { id: 'buildings', type: 'buildings', label: 'Buildings' }
  ]);
  const [activeTabId, setActiveTabId] = useState('buildings');

  function handleSelectBuilding(buildingNumber: number) {
    const newTabId = `assets-${buildingNumber}`;

    const existingTab = tabs.find(tab => tab.id === newTabId);
    if (existingTab) {
      setActiveTabId(newTabId);
      return;
    }

    const newTab: Tab = {
      id: newTabId,
      type: 'assets',
      buildingNumber,
      label: `Building ${buildingNumber}`
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newTabId);
  }

  function handleSelectAsset(assetDbId: string, assetId: string, buildingNumber: number) {
    const newTabId = `details-${assetDbId}`;

    const existingTab = tabs.find(tab => tab.id === newTabId);
    if (existingTab) {
      setActiveTabId(newTabId);
      return;
    }

    const newTab: Tab = {
      id: newTabId,
      type: 'details',
      buildingNumber,
      assetId: assetDbId,
      label: `Asset ${assetId}`
    };

    setTabs([...tabs, newTab]);
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
    const adminTabId = 'admin-panel';
    const existingTab = tabs.find(tab => tab.id === adminTabId);

    if (existingTab) {
      setActiveTabId(adminTabId);
      return;
    }

    const newTab: Tab = {
      id: adminTabId,
      type: 'admin',
      label: 'PDF Manager'
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(adminTabId);
  }

  function openAssetTypes() {
    const assetTypesTabId = 'asset-types-panel';
    const existingTab = tabs.find(tab => tab.id === assetTypesTabId);

    if (existingTab) {
      setActiveTabId(assetTypesTabId);
      return;
    }

    const newTab: Tab = {
      id: assetTypesTabId,
      type: 'asset-types',
      label: 'Asset Types'
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(assetTypesTabId);
  }

  function openAssetSearch() {
    const assetSearchTabId = 'asset-search-panel';
    const existingTab = tabs.find(tab => tab.id === assetSearchTabId);

    if (existingTab) {
      setActiveTabId(assetSearchTabId);
      return;
    }

    const newTab: Tab = {
      id: assetSearchTabId,
      type: 'asset-search',
      label: 'Asset Search'
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(assetSearchTabId);
  }

  function openDataEntry() {
    const dataEntryTabId = 'data-entry-panel';
    const existingTab = tabs.find(tab => tab.id === dataEntryTabId);

    if (existingTab) {
      setActiveTabId(dataEntryTabId);
      return;
    }

    const newTab: Tab = {
      id: dataEntryTabId,
      type: 'data-entry',
      label: 'Asset Data Entry'
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(dataEntryTabId);
  }

  function openValidationRules() {
    const validationRulesTabId = 'validation-rules-panel';
    const existingTab = tabs.find(tab => tab.id === validationRulesTabId);

    if (existingTab) {
      setActiveTabId(validationRulesTabId);
      return;
    }

    const newTab: Tab = {
      id: validationRulesTabId,
      type: 'validation-rules',
      label: 'Validation Rules'
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(validationRulesTabId);
  }

  function handleCloseTab(tabId: string) {
    if (tabId === 'buildings') return;

    const newTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(newTabs);

    if (activeTabId === tabId) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  }

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50 flex flex-row-reverse" dir="rtl">
      <div className="w-64 bg-white/90 backdrop-blur-sm border-l border-blue-200 shadow-lg flex flex-col shrink-0">
        <div className="p-4 border-b border-blue-100 bg-gradient-to-b from-teal-50 to-white">
          <h2 className="text-lg font-bold text-teal-900">תפריט ראשי</h2>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={openDataEntry}
            className="w-full flex items-center gap-3 px-4 py-3 text-right bg-white hover:bg-teal-50 rounded-lg transition-colors shadow-sm border border-blue-100 group"
          >
            <span className="font-medium text-slate-700 group-hover:text-teal-900">הוסף נכס חדש</span>
            <Plus className="h-5 w-5 text-teal-600 group-hover:text-teal-700" />
          </button>
          <button
            onClick={openAssetSearch}
            className="w-full flex items-center gap-3 px-4 py-3 text-right bg-white hover:bg-blue-50 rounded-lg transition-colors shadow-sm border border-blue-100 group"
          >
            <span className="font-medium text-slate-700 group-hover:text-blue-900">חיפוש נכס</span>
            <Search className="h-5 w-5 text-blue-600 group-hover:text-blue-700" />
          </button>
          <button
            onClick={openAssetTypes}
            className="w-full flex items-center gap-3 px-4 py-3 text-right bg-white hover:bg-green-50 rounded-lg transition-colors shadow-sm border border-blue-100 group"
          >
            <span className="font-medium text-slate-700 group-hover:text-green-900">סוגי נכסים</span>
            <Tag className="h-5 w-5 text-green-600 group-hover:text-green-700" />
          </button>
          <button
            onClick={openValidationRules}
            className="w-full flex items-center gap-3 px-4 py-3 text-right bg-white hover:bg-amber-50 rounded-lg transition-colors shadow-sm border border-blue-100 group"
          >
            <span className="font-medium text-slate-700 group-hover:text-amber-900">כללי תקינות</span>
            <Settings className="h-5 w-5 text-amber-600 group-hover:text-amber-700" />
          </button>
          <button
            onClick={openAdminPanel}
            className="w-full flex items-center gap-3 px-4 py-3 text-right bg-white hover:bg-slate-50 rounded-lg transition-colors shadow-sm border border-blue-100 group"
          >
            <span className="font-medium text-slate-700 group-hover:text-slate-900">מנהל PDF</span>
            <Settings className="h-5 w-5 text-slate-600 group-hover:text-slate-700" />
          </button>
        </nav>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white/80 backdrop-blur-sm border-b border-blue-100 shadow-sm">
          <div className="px-2 sm:px-4">
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 border-b-2 transition-all cursor-pointer group ${
                    activeTabId === tab.id
                      ? 'border-teal-600 bg-gradient-to-r from-teal-50 to-blue-50'
                      : 'border-transparent hover:bg-blue-50/50'
                  }`}
                >
                  <div
                    onClick={() => setActiveTabId(tab.id)}
                    className="flex items-center gap-1 sm:gap-2 flex-shrink-0"
                  >
                    {tab.type === 'admin' ? (
                      <Settings className="h-3 w-3 sm:h-4 sm:w-4 text-teal-700" />
                    ) : tab.type === 'asset-types' ? (
                      <Tag className="h-3 w-3 sm:h-4 sm:w-4 text-teal-700" />
                    ) : tab.type === 'asset-search' ? (
                      <Search className="h-3 w-3 sm:h-4 sm:w-4 text-teal-700" />
                    ) : tab.type === 'data-entry' ? (
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4 text-teal-700" />
                    ) : tab.type === 'validation-rules' ? (
                      <Settings className="h-3 w-3 sm:h-4 sm:w-4 text-teal-700" />
                    ) : tab.type === 'buildings' ? (
                      <img src="/buildings.png" alt="Buildings" className="h-3 w-3 sm:h-4 sm:w-4" />
                    ) : tab.type === 'assets' ? (
                      <Building className="h-3 w-3 sm:h-4 sm:w-4 text-teal-700" />
                    ) : (
                      <Home className="h-3 w-3 sm:h-4 sm:w-4 text-teal-700" />
                    )}
                    <span className={`font-medium whitespace-nowrap text-xs sm:text-sm ${
                      activeTabId === tab.id ? 'text-teal-900' : 'text-slate-700'
                    }`}>
                      {tab.label}
                    </span>
                  </div>
                  {tab.id !== 'buildings' && (
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
