import { useState } from 'react';
import { BuildingsList } from './components/BuildingsList';
import { ApartmentsList } from './components/ApartmentsList';
import { ApartmentDetails } from './components/ApartmentDetails';
import { AdminPDFManager } from './components/AdminPDFManager';
import { UnitTypes } from './components/UnitTypes';
import { UnitSearch } from './components/UnitSearch';
import { X, Settings, Building, Home, Tag, Search } from 'lucide-react';

interface Tab {
  id: string;
  type: 'buildings' | 'apartments' | 'details' | 'admin' | 'unit-types' | 'unit-search';
  buildingNumber?: number;
  apartmentId?: string;
  label: string;
  refreshKey?: number;
}

function App() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'buildings', type: 'buildings', label: 'Buildings' }
  ]);
  const [activeTabId, setActiveTabId] = useState('buildings');

  function handleSelectBuilding(buildingNumber: number) {
    const newTabId = `apartments-${buildingNumber}`;

    const existingTab = tabs.find(tab => tab.id === newTabId);
    if (existingTab) {
      setActiveTabId(newTabId);
      return;
    }

    const newTab: Tab = {
      id: newTabId,
      type: 'apartments',
      buildingNumber,
      label: `Building ${buildingNumber}`
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newTabId);
  }

  function handleSelectApartment(apartmentId: string, apartmentNumber: string, buildingNumber: number) {
    const newTabId = `details-${apartmentId}`;

    const existingTab = tabs.find(tab => tab.id === newTabId);
    if (existingTab) {
      setActiveTabId(newTabId);
      return;
    }

    const newTab: Tab = {
      id: newTabId,
      type: 'details',
      buildingNumber,
      apartmentId,
      label: `Unit ${apartmentNumber}`
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newTabId);
  }

  function handleDataUpdate() {
    setTabs(prevTabs => prevTabs.map(tab => {
      if (tab.type === 'buildings' || tab.type === 'apartments') {
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

  function openUnitTypes() {
    const unitTypesTabId = 'unit-types-panel';
    const existingTab = tabs.find(tab => tab.id === unitTypesTabId);

    if (existingTab) {
      setActiveTabId(unitTypesTabId);
      return;
    }

    const newTab: Tab = {
      id: unitTypesTabId,
      type: 'unit-types',
      label: 'Unit Types'
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(unitTypesTabId);
  }

  function openUnitSearch() {
    const unitSearchTabId = 'unit-search-panel';
    const existingTab = tabs.find(tab => tab.id === unitSearchTabId);

    if (existingTab) {
      setActiveTabId(unitSearchTabId);
      return;
    }

    const newTab: Tab = {
      id: unitSearchTabId,
      type: 'unit-search',
      label: 'Unit Search'
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(unitSearchTabId);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50" dir="rtl">
      <div className="bg-white/80 backdrop-blur-sm border-b border-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-2 sm:px-4">
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
                  ) : tab.type === 'unit-types' ? (
                    <Tag className="h-3 w-3 sm:h-4 sm:w-4 text-teal-700" />
                  ) : tab.type === 'unit-search' ? (
                    <Search className="h-3 w-3 sm:h-4 sm:w-4 text-teal-700" />
                  ) : tab.type === 'buildings' ? (
                    <img src="/buildings.png" alt="Buildings" className="h-3 w-3 sm:h-4 sm:w-4" />
                  ) : tab.type === 'apartments' ? (
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

      <div>
        {activeTab?.type === 'buildings' && (
          <BuildingsList
            key={activeTab.refreshKey}
            onSelectBuilding={handleSelectBuilding}
            onOpenUnitTypes={openUnitTypes}
            onOpenUnitSearch={openUnitSearch}
          />
        )}
        {activeTab?.type === 'apartments' && activeTab.buildingNumber && (
          <ApartmentsList
            key={activeTab.refreshKey}
            buildingNumber={activeTab.buildingNumber}
            onSelectApartment={handleSelectApartment}
          />
        )}
        {activeTab?.type === 'details' && activeTab.apartmentId && (
          <ApartmentDetails apartmentId={activeTab.apartmentId} onDataUpdate={handleDataUpdate} />
        )}
        {activeTab?.type === 'admin' && (
          <AdminPDFManager />
        )}
        {activeTab?.type === 'unit-types' && (
          <UnitTypes />
        )}
        {activeTab?.type === 'unit-search' && (
          <UnitSearch onSelectApartment={handleSelectApartment} />
        )}
      </div>
    </div>
  );
}

export default App;
