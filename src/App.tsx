import { useState, useEffect } from 'react';
import { BuildingsList } from './components/BuildingsList';
import { AssetsList } from './components/AssetsList';
import { AssetDetails } from './components/AssetDetails';
import { AdminPDFManager } from './components/AdminPDFManager';
import { AssetTypes } from './components/AssetTypes';
import { AssetSearch } from './components/AssetSearch';
import { ValidationRulesManager } from './components/ValidationRulesManager';
import { CSVImport } from './components/CSVImport';
import { AssetsCSVImport } from './components/AssetsCSVImport';
import { X, Settings, Building, Home, Tag, Search, Plus, Building2, Upload, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface Tab {
  id: string;
  type: 'buildings' | 'assets' | 'admin' | 'asset-types' | 'asset-search' | 'validation-rules' | 'csv-import' | 'assets-csv-import';
  buildingNumber?: number;
  label: string;
  refreshKey?: number;
  taxZone?: string;
}

function App() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'buildings', type: 'buildings', label: 'בניינים' }
  ]);
  const [activeTabId, setActiveTabId] = useState('buildings');
  const [showCreateBuildingModal, setShowCreateBuildingModal] = useState(false);
  const [buildingsMenuOpen, setBuildingsMenuOpen] = useState(false);
  const [assetsMenuOpen, setAssetsMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<{ assetId: string; assetIdentifier: string; buildingNumber: number } | null>(null);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [sidePanelWidth, setSidePanelWidth] = useState(60); // percentage
  const [isResizing, setIsResizing] = useState(false);

  function handleSelectBuilding(buildingNumber: number, taxRegions?: string) {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
    const newTabs: Tab[] = [buildingsTab];

    if (taxRegions) {
      const zones = taxRegions.split(',').map(z => z.trim()).filter(z => z);

      if (zones.length === 1) {
        const singleZoneTabId = `assets-${buildingNumber}-zone-${zones[0]}`;
        const singleZoneTab: Tab = {
          id: singleZoneTabId,
          type: 'assets',
          buildingNumber,
          taxZone: zones[0],
          label: `בניין ${buildingNumber}`
        };
        newTabs.push(singleZoneTab);
        setTabs(newTabs);
        setActiveTabId(singleZoneTabId);
      } else {
        const allAssetsTabId = `assets-${buildingNumber}-all`;
        const allAssetsTab: Tab = {
          id: allAssetsTabId,
          type: 'assets',
          buildingNumber,
          label: `בניין ${buildingNumber} - כל הנכסים`
        };
        newTabs.push(allAssetsTab);

        zones.forEach(zone => {
          const zoneTabId = `assets-${buildingNumber}-zone-${zone}`;
          const zoneTab: Tab = {
            id: zoneTabId,
            type: 'assets',
            buildingNumber,
            taxZone: zone,
            label: `בניין ${buildingNumber} - אזור ${zone}`
          };
          newTabs.push(zoneTab);
        });

        setTabs(newTabs);
        setActiveTabId(allAssetsTabId);
      }
    } else {
      const allAssetsTabId = `assets-${buildingNumber}-all`;
      const allAssetsTab: Tab = {
        id: allAssetsTabId,
        type: 'assets',
        buildingNumber,
        label: `בניין ${buildingNumber} - כל הנכסים`
      };
      newTabs.push(allAssetsTab);
      setTabs(newTabs);
      setActiveTabId(allAssetsTabId);
    }
  }

  function handleSelectAsset(assetDbId: string | number, assetId: string, buildingNumber: number) {
    setSidePanel({ assetId: String(assetDbId), assetIdentifier: assetId, buildingNumber });
    setSidePanelCollapsed(false);
  }

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setIsResizing(true);
  }

  // Add event listeners for resize
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const windowWidth = window.innerWidth;
      const newWidth = ((windowWidth - e.clientX) / windowWidth) * 100;

      // Constrain between 20% and 80%
      if (newWidth >= 20 && newWidth <= 80) {
        setSidePanelWidth(newWidth);
      }
    };

    const handleUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing]);

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

  function openCSVImport() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
    const csvImportTabId = 'csv-import-panel';

    const newTab: Tab = {
      id: csvImportTabId,
      type: 'csv-import',
      label: 'ייבוא CSV'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(csvImportTabId);
  }

  function openAssetsCSVImport() {
    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
    const assetsCSVImportTabId = 'assets-csv-import-panel';

    const newTab: Tab = {
      id: assetsCSVImportTabId,
      type: 'assets-csv-import',
      label: 'ייבוא נכסים CSV'
    };

    setTabs([buildingsTab, newTab]);
    setActiveTabId(assetsCSVImportTabId);
  }

  function handleCloseTab(tabId: string) {
    setTabs(prevTabs => {
      const newTabs = prevTabs.filter(tab => tab.id !== tabId);
      if (newTabs.length === 0) {
        const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים' };
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 flex" dir="rtl">
      <div className="w-52 bg-white/95 backdrop-blur-sm border-r border-purple-200 shadow-xl flex flex-col shrink-0">
        <div
          className="p-2 border-b border-purple-100 bg-gradient-to-br from-purple-100 via-indigo-50 to-white cursor-pointer select-none hover:bg-gradient-to-br hover:from-purple-200 hover:via-indigo-100 hover:to-white transition-colors"
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Double click detected', { sidePanel, sidePanelCollapsed });
            if (sidePanel) {
              setSidePanelCollapsed(prev => {
                console.log('Toggling from', prev, 'to', !prev);
                return !prev;
              });
            } else {
              console.log('No side panel open');
            }
          }}
          title="לחיצה כפולה להצגה/הסתרת פאנל צד"
        >
          <h2 className="text-base font-bold bg-gradient-to-r from-purple-700 to-indigo-700 bg-clip-text text-transparent">תפריט ראשי</h2>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          <div>
            <button
              onClick={() => setBuildingsMenuOpen(!buildingsMenuOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-right bg-white hover:bg-purple-50 rounded-lg transition-all shadow-sm border border-purple-100 hover:shadow-md group"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-slate-700 group-hover:text-purple-900">בניינים</span>
                <Building2 className="h-4 w-4 text-purple-600 group-hover:text-purple-700" />
              </div>
              {buildingsMenuOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {buildingsMenuOpen && (
              <div className="mr-3 mt-1 space-y-1">
                <button
                  onClick={() => {
                    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'בניינים', refreshKey: Date.now() };
                    setTabs([buildingsTab]);
                    setActiveTabId('buildings');
                    setBuildingsMenuOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-right bg-purple-50/50 hover:bg-purple-100 rounded-lg transition-colors text-xs"
                >
                  <span className="font-medium text-slate-600">רשימת בניינים</span>
                  <Building className="h-3 w-3 text-purple-500" />
                </button>
                <button
                  onClick={() => setShowCreateBuildingModal(true)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-right bg-purple-50/50 hover:bg-purple-100 rounded-lg transition-colors text-xs"
                >
                  <span className="font-medium text-slate-600">צור בניין חדש</span>
                  <Plus className="h-3 w-3 text-purple-500" />
                </button>
                <button
                  onClick={openCSVImport}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-right bg-purple-50/50 hover:bg-purple-100 rounded-lg transition-colors text-xs"
                >
                  <span className="font-medium text-slate-600">ייבוא CSV</span>
                  <Upload className="h-3 w-3 text-purple-500" />
                </button>
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => setAssetsMenuOpen(!assetsMenuOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-right bg-white hover:bg-indigo-50 rounded-lg transition-all shadow-sm border border-purple-100 hover:shadow-md group"
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
              <div className="mr-3 mt-1 space-y-1">
                <button
                  onClick={openAssetSearch}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-right bg-indigo-50/50 hover:bg-indigo-100 rounded-lg transition-colors text-xs"
                >
                  <span className="font-medium text-slate-600">חיפוש נכס</span>
                  <Search className="h-3 w-3 text-indigo-500" />
                </button>
                <button
                  onClick={openAssetsCSVImport}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-right bg-indigo-50/50 hover:bg-indigo-100 rounded-lg transition-colors text-xs"
                >
                  <span className="font-medium text-slate-600">ייבוא CSV</span>
                  <Upload className="h-3 w-3 text-indigo-500" />
                </button>
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => setAdminMenuOpen(!adminMenuOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-right bg-white hover:bg-pink-50 rounded-lg transition-all shadow-sm border border-purple-100 hover:shadow-md group"
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
              <div className="mr-3 mt-1 space-y-1">
                <button
                  onClick={openAssetTypes}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-right bg-pink-50/50 hover:bg-pink-100 rounded-lg transition-colors text-xs"
                >
                  <span className="font-medium text-slate-600">סוגי נכסים</span>
                  <Tag className="h-3 w-3 text-pink-500" />
                </button>
                <button
                  onClick={openValidationRules}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-right bg-pink-50/50 hover:bg-pink-100 rounded-lg transition-colors text-xs"
                >
                  <span className="font-medium text-slate-600">כללי תקינות</span>
                  <Settings className="h-3 w-3 text-pink-500" />
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white/90 backdrop-blur-sm border-b border-purple-100 shadow-md">
          <div className="px-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`flex items-center gap-2 px-3 py-2 border-b-2 transition-all cursor-pointer group ${
                    activeTabId === tab.id
                      ? 'border-purple-600 bg-gradient-to-r from-purple-50 to-indigo-50'
                      : 'border-transparent hover:bg-purple-50/50'
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
                    ) : tab.type === 'csv-import' ? (
                      <Upload className="h-4 w-4 text-purple-700" />
                    ) : tab.type === 'assets-csv-import' ? (
                      <Upload className="h-4 w-4 text-purple-700" />
                    ) : tab.type === 'buildings' ? (
                      <img src="/buildings.png" alt="Buildings" className="h-4 w-4" />
                    ) : (
                      <Building className="h-4 w-4 text-purple-700" />
                    )}
                    <span className={`font-semibold whitespace-nowrap text-sm ${
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
          <div className={`flex-1 overflow-auto transition-all duration-300 ${sidePanel && !sidePanelCollapsed ? 'mr-0' : ''}`}>
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
                taxZone={activeTab.taxZone}
                onSelectAsset={handleSelectAsset}
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
            {activeTab?.type === 'csv-import' && (
              <CSVImport />
            )}
            {activeTab?.type === 'assets-csv-import' && (
              <AssetsCSVImport />
            )}
          </div>

          {/* Collapsible Side Panel */}
          {sidePanel && (
            <div
              className={`bg-white shadow-2xl border-l border-purple-200 ease-in-out flex relative ${
                sidePanelCollapsed ? 'w-12' : ''
              }`}
              style={{
                width: sidePanelCollapsed ? '48px' : `${sidePanelWidth}%`,
                transition: isResizing ? 'none' : 'width 300ms'
              }}
            >
              {/* Resize Handle */}
              {!sidePanelCollapsed && (
                <div
                  onMouseDown={handleMouseDown}
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-purple-500 bg-purple-400 z-50 transition-colors"
                  title="גרור לשינוי גודל"
                >
                  <div className="absolute inset-y-0 -left-2 -right-2" />
                </div>
              )}

              {sidePanelCollapsed ? (
                /* Collapsed View - Just Toggle Button */
                <div className="h-full flex items-center justify-center">
                  <button
                    onClick={() => setSidePanelCollapsed(false)}
                    className="p-2 hover:bg-purple-100 rounded-lg transition-colors"
                    title="הרחב פאנל"
                  >
                    <ChevronLeft className="h-5 w-5 text-purple-600" />
                  </button>
                </div>
              ) : (
                /* Expanded View - Full Panel */
                <div className="flex flex-col w-full">
                  <div className="flex items-center justify-between p-4 border-b border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 shrink-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-bold text-purple-900">נכס {sidePanel.assetIdentifier}</h2>
                      <button
                        onClick={() => setSidePanelCollapsed(true)}
                        className="p-2 hover:bg-purple-100 rounded-lg transition-colors"
                        title="כווץ פאנל"
                      >
                        <ChevronRight className="h-5 w-5 text-slate-600" />
                      </button>
                    </div>
                    <button
                      onClick={() => setSidePanel(null)}
                      className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                      title="סגור פאנל"
                    >
                      <X className="h-5 w-5 text-slate-600 hover:text-red-600" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <AssetDetails assetId={parseInt(sidePanel.assetId)} onDataUpdate={handleDataUpdate} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
