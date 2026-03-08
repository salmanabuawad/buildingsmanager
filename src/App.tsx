/**
 * Copyright (c) 2025 Kortex Digital. All rights reserved. Proprietary.
 * Contact: info@kortexd.com
 * NO REVERSE ENGINEERING. Use by AI/ML tools (e.g. LLMs, code assistants,
 * training data, or automated analysis) is prohibited. See COPYRIGHT.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { BuildingsList, BuildingsListRef } from './components/BuildingsList';
import { AssetsList, AssetsListRef } from './components/AssetsList';
import { AssetDetails, AssetDetailsRef } from './components/AssetDetails';
import { AssetTypes } from './components/AssetTypes';
import { AssetSearch } from './components/AssetSearch';
import { ValidationRulesManager } from './components/ValidationRulesManager';
import { BuildingListImport } from './components/BuildingListImport';
import { AssetsFileImport } from './components/AssetsFileImport';
import { TransferAreas, TransferAreasRef } from './components/TransferAreas';
import { AddressListComponent } from './components/AddressList';
import { FieldConfigManager } from './components/FieldConfigManager';
import { AssetDataEntry, AssetDataEntryRef } from './components/AssetDataEntry';
import { AuditLog } from './components/AuditLog';
import { UserManagement } from './components/UserManagement';
import { SystemConfigurationManager } from './components/SystemConfiguration';
import { OperatorsManager } from './components/OperatorsManager';
import { ManagersManager } from './components/ManagersManager';
import { MeasuredNotExportedAssets } from './components/MeasuredNotExportedAssets';
import { MeasurementProgressDashboard } from './components/MeasurementProgressDashboard';
import { X, Settings, Building, Home, Tag, Search, Plus, Building2, Upload, ChevronDown, ChevronLeft, Trash2, Database, CheckCircle2, AlertCircle, Loader2, Menu, MapPin, Edit, Save, FileText, RefreshCw, Download, LogOut, Users, UserCog, BarChart3, Mail, ClipboardList, HelpCircle, User, Sun, SlidersHorizontal } from 'lucide-react';
import { api, AssetType } from './lib/api';
import { getSession, logoutUsersTable, loginByTaskToken } from './lib/usersTableAuth';
import { assetValidators, validateEntity, getAssetTypes, getLatestExportDate as getCachedLatestExportDate } from './lib/validation';
import { useUserRole } from './contexts/UserRoleContext';
import { useUIConfig } from './contexts/UIConfigContext';
import { useHelp } from './contexts/HelpContext';
import { useValidationRules } from './contexts/ValidationContext';
import { Login } from './components/Login';
import { HelpModal } from './components/HelpModal';
import { MobileTasksAndUpload } from './components/MobileTasksAndUpload';
import { InspectionTasksManager } from './components/InspectionTasksManager';
import { useIsMobile } from './hooks/useIsMobile';
import { FontSizeProvider } from './contexts/FontSizeContext';
import { setFontSizeStore } from './lib/fontSizeStore';

interface Tab {
  id: string;
  type: 'buildings' | 'assets' | 'admin' | 'asset-types' | 'asset-search' | 'validation-rules' | 'building-list-import' | 'assets-file-import' | 'assets-skeleton-import' | 'asset-details' | 'transfer-areas' | 'address-list' | 'field-config' | 'asset-data-entry' | 'audit-log' | 'user-management' | 'system-configuration' | 'operators' | 'managers' | 'measured-not-exported-assets' | 'measurement-progress-dashboard' | 'mobile-tasks-upload' | 'inspection-tasks';
  buildingNumber?: number;
  label: string;
  refreshKey?: number;
  taxRegion?: string;
  assetId?: string;
  assetIdentifier?: string;
  selectedAssetIds?: string[];
  isErrorFixingMode?: boolean; // For assets tabs: hide all buttons except Validate, Save, Save as new, and Cancel
  path?: string; // URL path for routing compatibility
  initialAssetType?: string; // For asset-details tabs: initial asset type when creating new asset
}

function App() {
  const { isLoading: roleLoading, isReadOnly, isAdmin, isInspector, isDev, userRole, refreshRole } = useUserRole();
  const roleLabel = userRole === 'admin' ? 'מנהל' : userRole === 'inspector' ? 'פקח' : 'משתמש';
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [tabs, setTabs] = useState<Tab[]>(() => {
    const s = getSession();
    const isDevEnv = process.env.NODE_ENV === 'development';
    if (s?.user_role === 'inspector') {
      return [{ id: 'inspection-tasks', type: 'inspection-tasks', label: 'משימות ביקורת', refreshKey: Date.now() }];
    }
    const defaultTabs = [
      { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() },
      ...(isDevEnv ? [{ id: 'inspection-tasks', type: 'inspection-tasks' as const, label: 'משימות ביקורת', refreshKey: Date.now() }] : []),
      { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() },
    ];
    return defaultTabs;
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    const s = getSession();
    return s?.user_role === 'inspector' ? 'inspection-tasks' : 'measurement-progress-dashboard';
  });
  const [showCreateBuildingModal, setShowCreateBuildingModal] = useState(false);
  const [buildingsMenuOpen, setBuildingsMenuOpen] = useState(false);
  const [assetsMenuOpen, setAssetsMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [systemConfigSubmenuOpen, setSystemConfigSubmenuOpen] = useState(false);
  const [managerActionsSubmenuOpen, setManagerActionsSubmenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  type Brightness = 'light' | 'normal' | 'dark' | 'contrast';
  type FontSize = 'small' | 'normal' | 'large';
  const [brightness, setBrightness] = useState<Brightness>(() => {
    const stored = localStorage.getItem('app-brightness');
    if (stored === 'gray') return 'contrast'; // migrate old gray to contrast
    return (stored as Brightness) || 'normal';
  });
  const [fontSize, setFontSize] = useState<FontSize>(() => (localStorage.getItem('app-font-size') as FontSize) || 'normal');

  useEffect(() => {
    if (brightness === 'normal') document.documentElement.removeAttribute('data-brightness');
    else document.documentElement.setAttribute('data-brightness', brightness);
    if (fontSize === 'normal') document.documentElement.removeAttribute('data-font-size');
    else document.documentElement.setAttribute('data-font-size', fontSize);
    if (brightness !== 'normal') localStorage.setItem('app-brightness', brightness);
    else localStorage.removeItem('app-brightness');
    if (fontSize !== 'normal') localStorage.setItem('app-font-size', fontSize);
    else localStorage.removeItem('app-font-size');
    setFontSizeStore(fontSize);
  }, [brightness, fontSize]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (settingsMenuOpen && settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setSettingsMenuOpen(false);
      }
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [settingsMenuOpen]);
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
  const { validation_rules_enabled: validationRulesEnabled, loadUIConfig } = useUIConfig();
  const { setContextFromTabType, openHelp } = useHelp();
  const { refreshRules } = useValidationRules();
  const isMobile = useIsMobile();
  const mobileDefaultAppliedRef = useRef(false);
  const inspectorDefaultAppliedRef = useRef(false);

  // Refs to child components for checking dirty state
  const buildingsListRef = useRef<BuildingsListRef | null>(null);
  const assetsListRef = useRef<AssetsListRef | null>(null);
  const assetDetailsRef = useRef<AssetDetailsRef | null>(null);
  const transferAreasRef = useRef<TransferAreasRef | null>(null);
  const assetDataEntryRef = useRef<AssetDataEntryRef | null>(null);
  
  // Confirmation modal state
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  
  // Reset export to automation modal state
  const [showResetExportModal, setShowResetExportModal] = useState(false);
  const [showResetExportResultModal, setShowResetExportResultModal] = useState(false);
  const [resetExportResult, setResetExportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [resetExportLoading, setResetExportLoading] = useState(false);
  const [latestExportDate, setLatestExportDate] = useState<string | null>(null);
  
  // Check authentication (users-table session only) + handle one-time task token from email link
  useEffect(() => {
    (async () => {
      const hash = window.location.hash || '';
      const tokenMatch = hash.match(/[?&]token=([^&]+)/);
      const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : new URLSearchParams(window.location.search).get('token');

      if (token && !getSession()) {
        const result = await loginByTaskToken(token);
        if (result.success) {
          setIsAuthenticated(true);
          await refreshRole();
          const cleanHash = result.taskId ? `#inspection-tasks/${result.taskId}` : '#inspection-tasks';
          window.history.replaceState(null, '', window.location.pathname + (window.location.search || '') + cleanHash);
          setTabs((prev) => {
            const has = prev.some((t) => t.type === 'inspection-tasks');
            if (!has) return [...prev, { id: 'inspection-tasks', type: 'inspection-tasks', label: 'משימות ביקורת', refreshKey: Date.now() }];
            return prev;
          });
          setActiveTabId('inspection-tasks');
          setCheckingAuth(false);
          return;
        }
      }

      setIsAuthenticated(!!getSession());
      setCheckingAuth(false);
    })();
  }, [refreshRole]);

  // Inspector: only inspection-tasks tab; hide other pages
  useEffect(() => {
    if (!roleLoading && isAuthenticated && isInspector) {
      setTabs((prev) => {
        const inspectionOnly = prev.filter((t) => t.type === 'inspection-tasks');
        return inspectionOnly.length > 0 ? inspectionOnly : [{ id: 'inspection-tasks', type: 'inspection-tasks', label: 'משימות ביקורת', refreshKey: Date.now() }];
      });
      setActiveTabId('inspection-tasks');
    }
  }, [roleLoading, isAuthenticated, isInspector]);

  // Deep link: switch to inspection-tasks tab when hash is #inspection-tasks or #inspection-tasks/123
  // Only for dev or inspector (tasks hidden for non-dev non-inspector)
  useEffect(() => {
    if (!isAuthenticated) return;
    const hash = window.location.hash || '';
    if (hash.includes('?token=')) {
      const cleanHash = hash.split('?')[0] || '#inspection-tasks';
      window.history.replaceState(null, '', window.location.pathname + (window.location.search || '') + cleanHash);
    }
    if ((isDev || isInspector) && (hash.match(/#inspection-tasks\/\d+/) || hash === '#inspection-tasks')) {
      setTabs((prev) => {
        const has = prev.some((t) => t.type === 'inspection-tasks');
        if (!has) return [...prev, { id: 'inspection-tasks', type: 'inspection-tasks', label: 'משימות ביקורת', refreshKey: Date.now() }];
        return prev;
      });
      setActiveTabId('inspection-tasks');
    }
  }, [isAuthenticated, isDev, isInspector]);

  // Load UI configuration (מתי להריץ אימות: off | before_save | online)
  useEffect(() => {
    if (isAuthenticated) {
      loadUIConfig();
    }
  }, [isAuthenticated, loadUIConfig]);

  // F1 key opens help modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        openHelp();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openHelp]);

  // Sync help context when active tab changes (or general when not authenticated)
  useEffect(() => {
    if (!isAuthenticated) {
      setContextFromTabType('general');
      return;
    }
    const activeTab = tabs.find(t => t.id === activeTabId);
    setContextFromTabType(activeTab?.type ?? 'general');
  }, [isAuthenticated, activeTabId, tabs, setContextFromTabType]);

  // On mobile: when user first opens app (or just logged in), focus on task list + upload
  useEffect(() => {
    if (!isAuthenticated || !isMobile || mobileDefaultAppliedRef.current) return;
    mobileDefaultAppliedRef.current = true;
    setTabs([
      { id: 'mobile-tasks-upload', type: 'mobile-tasks-upload', label: 'משימות והעלאות', refreshKey: Date.now() },
      { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() }
    ]);
    setActiveTabId('mobile-tasks-upload');
  }, [isAuthenticated, isMobile]);

  // Inspector: only inspection-tasks tab (aligned with ref_only)
  useEffect(() => {
    if (!isAuthenticated || !isInspector || inspectorDefaultAppliedRef.current || roleLoading) return;
    inspectorDefaultAppliedRef.current = true;
    setTabs([
      { id: 'inspection-tasks', type: 'inspection-tasks', label: 'משימות ביקורת', refreshKey: Date.now() }
    ]);
    setActiveTabId('inspection-tasks');
  }, [isAuthenticated, isInspector, roleLoading]);

  const handleLoginSuccess = async () => {
    setIsAuthenticated(true);
    await refreshRole();
    await refreshRules();
  };

  const handleLogout = () => {
    logoutUsersTable();
    setIsAuthenticated(false);
  };

  // Helper function to get area_description_for_tab from tax region number(s)
  // Uses cached asset types from ValidationContext (no API call needed)
  // NOTE: Must be defined before any early returns to comply with Rules of Hooks
  const getAreaDescriptionForTaxRegion = useCallback((taxRegion: string | number | undefined): string => {
    if (!taxRegion) {
      return String(taxRegion || '');
    }
    
    const taxRegionNum = typeof taxRegion === 'string' ? parseInt(taxRegion.trim(), 10) : taxRegion;
    if (isNaN(taxRegionNum)) {
      return String(taxRegion);
    }
    
    // Use cached asset types from validation (synchronous, no API call)
    try {
      const assetTypes = getAssetTypes();
      if (assetTypes && assetTypes.length > 0) {
        // Find first asset type with matching tax_region
        const matchingAssetType = assetTypes.find((at: AssetType) =>
          at.tax_region === taxRegionNum
        );
        
        // If found and has area_description_for_tab, use it
        if (matchingAssetType?.area_description_for_tab) {
          return matchingAssetType.area_description_for_tab;
        }
      }
    } catch (err) {
      // If validation module not available, fall back to tax region number
      if (process.env.NODE_ENV === 'development') {
        console.warn('[App] Could not get asset types from cache:', err);
      }
    }
    
    // Fallback to tax region number if no area_description_for_tab found
    return String(taxRegionNum);
  }, []);

  // Helper function to get area descriptions for multiple tax regions
  // Uses cached asset types from ValidationContext (no API call needed)
  // NOTE: Must be defined before any early returns to comply with Rules of Hooks
  const getAreaDescriptionsForTaxRegions = useCallback((taxRegionsString: string | undefined): string => {
    if (!taxRegionsString) {
      return '';
    }
    
    // Use cached asset types from validation (synchronous, no API call)
    let assetTypes: AssetType[] = [];
    try {
      assetTypes = getAssetTypes();
    } catch (err) {
      // If validation module not available, return original string
      if (process.env.NODE_ENV === 'development') {
        console.warn('[App] Could not get asset types from cache:', err);
      }
      return taxRegionsString;
    }
    
    if (assetTypes.length === 0) {
      return taxRegionsString;
    }
    
    const regions = taxRegionsString.split(',').map(r => r.trim()).filter(r => r);
    const descriptions = regions.map(region => {
      const regionNum = parseInt(region, 10);
      if (isNaN(regionNum)) {
        return region;
      }
      
      const matchingAssetType = assetTypes.find((at: AssetType) =>
        at.tax_region === regionNum && at.area_description_for_tab
      );
      
      return matchingAssetType?.area_description_for_tab || region;
    });
    
    return descriptions.join(', ');
  }, []);

  // All hooks must be defined before early returns to comply with Rules of Hooks
  // These hooks may reference functions defined later (that's fine - they're regular functions, not hooks)
  
  const handleOpenAssetsTab = useCallback((buildingNumber: number, taxRegion: string, assetIds?: string[]) => {
    // Get asset types from cache (synchronous, no API call)
    let assetTypes: AssetType[] = [];
    try {
      assetTypes = getAssetTypes();
    } catch (err) {
      // If validation module not available, continue without asset types
      if (process.env.NODE_ENV === 'development') {
        console.warn('[App] Could not get asset types from cache:', err);
      }
    }
    
    const getAreaDescriptionForTaxRegion = (taxRegionNum: string | number | null | undefined): string => {
      if (!taxRegionNum || !assetTypes || assetTypes.length === 0) {
        return String(taxRegionNum || '');
      }
      
      const taxRegionParsed = typeof taxRegionNum === 'string' ? parseInt(taxRegionNum.trim(), 10) : taxRegionNum;
      if (isNaN(taxRegionParsed)) {
        return String(taxRegionNum);
      }
      
      const matchingAssetType = assetTypes.find((at: AssetType) =>
        at.tax_region === taxRegionParsed && at.area_description_for_tab
      );
      
      return matchingAssetType?.area_description_for_tab || String(taxRegionParsed);
    };
    
    const assetsTabId = assetIds && assetIds.length > 0
      ? `assets-${buildingNumber}-region-${taxRegion}-errors-${Date.now()}`
      : `assets-${buildingNumber}-region-${taxRegion}`;
    
    const newTab: Tab = {
      id: assetsTabId,
      type: 'assets',
      buildingNumber,
      taxRegion,
      selectedAssetIds: assetIds,
      isErrorFixingMode: assetIds && assetIds.length > 0, // Enable error fixing mode when assetIds are provided
      label: assetIds && assetIds.length > 0
        ? `מבנה ${buildingNumber} - ${getAreaDescriptionForTaxRegion(taxRegion)} (תיקון שגיאות)`
        : `מבנה ${buildingNumber} - ${getAreaDescriptionForTaxRegion(taxRegion)}`,
      refreshKey: Date.now()
    };
    
    openTab(newTab);
  }, [tabs]);

  const handleSelectAsset = useCallback((assetDbId: string | number, assetId: string, buildingNumber: number, taxRegion?: string) => {
    const assetDetailsTabId = `asset-details-${assetDbId}`;
    
    setTabs(prevTabs => {
      const existingTab = prevTabs.find(t => t.id === assetDetailsTabId);

      if (existingTab) {
        // Tab already exists, refresh it and activate it
        setActiveTabId(assetDetailsTabId);
        return prevTabs.map(tab => 
          tab.id === assetDetailsTabId 
            ? { ...tab, refreshKey: Date.now() } 
            : tab
        );
      }
      
      const newTab: Tab = {
        id: assetDetailsTabId,
        type: 'asset-details',
        assetId: String(assetDbId),
        assetIdentifier: assetId,
        buildingNumber,
        taxRegion, // Pass taxRegion from AssetsList tab - same as AssetsList
        label: `נכס ${assetId}`,
        refreshKey: Date.now()
      };
      
      // Remove all other asset-details tabs (this closes the current tab if it's an asset-details tab)
      const filteredTabs = prevTabs.filter(t => t.type !== 'asset-details');
      
      // Add the new tab
      return [...filteredTabs, newTab];
    });
    
    // Activate the new tab
    setActiveTabId(assetDetailsTabId);
  }, []);

  // Listen for custom event to open asset view from audit details
  useEffect(() => {
    const handleOpenAssetView = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { assetDbId, assetId, buildingNumber, taxRegion } = customEvent.detail;
      if (assetDbId && assetId && buildingNumber) {
        handleSelectAsset(assetDbId, assetId, buildingNumber, taxRegion);
      }
    };
    
    window.addEventListener('openAssetView', handleOpenAssetView);
    return () => {
      window.removeEventListener('openAssetView', handleOpenAssetView);
    };
  }, [handleSelectAsset]);

  // Fetch latest export date (from memory cache or database)
  const fetchLatestExportDate = async () => {
    try {
      // First try to get from memory cache (synchronous, fast)
      const cachedDate = getCachedLatestExportDate();
      
      if (cachedDate !== null && cachedDate !== undefined) {
        setLatestExportDate(cachedDate);
        return;
      }
      
      // If not in cache, fetch from database and cache it
      const result = await api.assets.getLatestExportDate();
      if (result.success) {
        setLatestExportDate(result.date);
      } else {
        setLatestExportDate(null);
      }
    } catch (error) {
      console.error('Error fetching latest export date:', error);
      setLatestExportDate(null);
    }
  };

  // Fetch latest export date on component mount
  useEffect(() => {
    fetchLatestExportDate();
  }, []);

  // Sync state with cache periodically to ensure UI updates when cache changes
  // This ensures the button and modal always reflect the latest cached value
  useEffect(() => {
    const interval = setInterval(() => {
      const cachedDate = getCachedLatestExportDate();
      if (cachedDate !== latestExportDate) {
        setLatestExportDate(cachedDate);
      }
    }, 500); // Check every 500ms to sync cache with state
    
    return () => clearInterval(interval);
  }, [latestExportDate]);

  // Update "איפוס שליחת נתונים מתאריך" span immediately after export to automation
  useEffect(() => {
    const handleExportToAutomationSuccess = () => {
      setLatestExportDate(getCachedLatestExportDate());
    };
    window.addEventListener('exportToAutomationSuccess', handleExportToAutomationSuccess);
    return () => window.removeEventListener('exportToAutomationSuccess', handleExportToAutomationSuccess);
  }, []);

  // Check if current tab has unsaved changes
  const checkForUnsavedChanges = (): boolean => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (!activeTab) return false;
    
    switch (activeTab.type) {
      case 'buildings':
        return buildingsListRef.current?.hasUnsavedChanges() || false;
      case 'assets':
        return assetsListRef.current?.hasUnsavedChanges() || false;
      case 'asset-details':
        return assetDetailsRef.current?.hasUnsavedChanges() || false;
      case 'transfer-areas':
        return transferAreasRef.current?.hasUnsavedChanges() || false;
      case 'asset-data-entry':
        return assetDataEntryRef.current?.hasUnsavedChanges() || false;
      case 'mobile-tasks-upload':
      case 'inspection-tasks':
        return false;
      default:
        return false;
    }
  };

  // Handle navigation with dirty check
  const handleNavigation = (navigationAction: () => void) => {
    if (checkForUnsavedChanges()) {
      setPendingNavigation(() => navigationAction);
      setShowUnsavedChangesModal(true);
    } else {
      navigationAction();
    }
  };

  // Function to close current tab and open multi-tax tab (all assets tab)
  const handleCloseTabAndOpenMultiTax = useCallback((buildingNumber: number) => {
    handleNavigation(() => {
      const allAssetsTabId = `assets-${buildingNumber}-all`;
      
      setTabs(prev => {
        // Find or create the "all assets" tab (multi-tax tab)
        const existingTab = prev.find(t => t.id === allAssetsTabId);
        
        if (existingTab) {
          // Tab exists, close current tab and keep the multi-tax tab
          const newTabs = prev.filter(t => t.id !== activeTabId || t.id === allAssetsTabId);
          setActiveTabId(allAssetsTabId);
          return newTabs;
        } else {
          // Tab doesn't exist, create it and close current tab
          const allAssetsTab: Tab = {
            id: allAssetsTabId,
            type: 'assets',
            buildingNumber,
            label: `מבנה ${buildingNumber} - כל הנכסים`,
            path: `/buildings/${buildingNumber}/assets`,
            refreshKey: Date.now()
          };
          
          const newTabs = prev.filter(t => t.id !== activeTabId);
          setActiveTabId(allAssetsTabId);
          return [...newTabs, allAssetsTab];
        }
      });
    });
  }, [activeTabId, handleNavigation]);

  // Function to close all tabs except buildings list and regular assets list tabs (residential and business)
  const handleCloseAllTabsExceptEssential = useCallback(() => {
    handleNavigation(() => {
      setTabs(prevTabs => {
        // Keep: dashboard, buildings list tabs, and regular assets tabs (not error fixing mode)
        const dashboardTab = prevTabs.find(t => t.type === 'measurement-progress-dashboard');
        const essentialTabs = prevTabs.filter(tab => {
          // Always keep dashboard
          if (tab.type === 'measurement-progress-dashboard') return true;
          // Keep buildings list tabs
          if (tab.type === 'buildings') return true;
          // Keep assets tabs that are NOT in error fixing mode
          // Error fixing mode tabs have isErrorFixingMode: true OR selectedAssetIds set (for error fixing)
          if (tab.type === 'assets' && !tab.isErrorFixingMode && (!tab.selectedAssetIds || tab.selectedAssetIds.length === 0)) {
            return true;
          }
          // Close all other tabs (transfer-areas, asset-details, asset-types, etc.)
          return false;
        });
        
        // If no essential tabs remain, ensure dashboard and buildings tabs exist
        if (essentialTabs.length === 0) {
          const dashboardTab: Tab = { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() };
          const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
          setActiveTabId('buildings');
          return [dashboardTab, buildingsTab];
        }
        
        // Ensure dashboard is first and buildings is second
        const dashboardTabToKeep: Tab = dashboardTab || { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() };
        const buildingsTabInEssential = essentialTabs.find(t => t.type === 'buildings');
        const buildingsTabToKeep: Tab = buildingsTabInEssential || { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
        const otherTabs = essentialTabs.filter(t => 
          t.type !== 'measurement-progress-dashboard' && t.type !== 'buildings'
        );
        const orderedTabs = [dashboardTabToKeep, buildingsTabToKeep, ...otherTabs];
        
        // Set active tab to the last essential tab (or buildings if available)
        const lastAssetsTab = otherTabs.filter(t => t.type === 'assets').pop();
        if (buildingsTabInEssential) {
          setActiveTabId(buildingsTabInEssential.id);
        } else if (lastAssetsTab) {
          setActiveTabId(lastAssetsTab.id);
        } else if (otherTabs.length > 0) {
          setActiveTabId(otherTabs[otherTabs.length - 1].id);
        } else {
          setActiveTabId('buildings');
        }
        
        return orderedTabs;
      });
    });
  }, [handleNavigation]);

  const activeTab = tabs.find(tab => tab.id === activeTabId);
  const isSidebarItemActive = useCallback((tabType: Tab['type'] | Tab['type'][]) => {
    const types = Array.isArray(tabType) ? tabType : [tabType];
    return activeTab ? types.includes(activeTab.type) : false;
  }, [activeTab]);

  // Show login page if not authenticated
  // NOTE: Early returns must come AFTER all hooks to comply with Rules of Hooks
  if (checkingAuth || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-app-accent animate-spin mx-auto mb-4" />
          <p className="text-slate-600">טוען...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Helper function to open a new tab, closing any existing tab of the same type
  // Exception: 'buildings' tab is always kept and multiple 'assets' tabs can exist (for different buildings/tax regions)
  function openTab(newTab: Tab) {
    handleNavigation(() => {
      setTabs(prev => {
        // Check if tab already exists
        const existingTab = prev.find(t => t.id === newTab.id);
        if (existingTab) {
          // Tab already exists, refresh it and activate it
          setActiveTabId(newTab.id);
          return prev.map(tab => 
            tab.id === newTab.id 
              ? { ...tab, refreshKey: Date.now() } 
              : tab
          );
        }
        
        // For most tab types, close existing tabs of the same type (except 'buildings', 'assets', and 'measurement-progress-dashboard')
        // 'assets' tabs can have multiple instances (for different buildings/tax regions)
        // 'buildings' tab should always be kept
        // 'measurement-progress-dashboard' should always be kept as first tab
        let filteredTabs = prev;
        if (newTab.type !== 'buildings' && newTab.type !== 'assets' && newTab.type !== 'measurement-progress-dashboard') {
          // Remove all existing tabs of the same type
          filteredTabs = prev.filter(t => t.type !== newTab.type);
        }
        
        // Ensure dashboard tab exists and is first
        const dashboardTab = filteredTabs.find(t => t.type === 'measurement-progress-dashboard');
        const dashboardTabToKeep: Tab = dashboardTab || { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() };
        
        // Remove dashboard and buildings from filtered tabs (we'll add them back in correct order)
        const tabsWithoutEssential = filteredTabs.filter(t => 
          t.type !== 'measurement-progress-dashboard' && t.type !== 'buildings'
        );
        
        // If opening dashboard, just refresh it and keep it first
        if (newTab.type === 'measurement-progress-dashboard') {
          // Ensure buildings tab exists and is second
          const buildingsTab = filteredTabs.find(t => t.type === 'buildings');
          const buildingsTabToKeep: Tab = buildingsTab || { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
          return [dashboardTabToKeep, buildingsTabToKeep, ...tabsWithoutEssential];
        }
        
        // Ensure buildings tab exists and is second
        const buildingsTab = filteredTabs.find(t => t.type === 'buildings');
        const buildingsTabToKeep: Tab = buildingsTab || { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
        
        // If opening buildings tab, just refresh it and keep it second
        if (newTab.type === 'buildings') {
          return [dashboardTabToKeep, buildingsTabToKeep, ...tabsWithoutEssential];
        }
        
        // For other tabs: dashboard first, buildings second, then other tabs, then new tab
        const tabsToReturn = [dashboardTabToKeep, buildingsTabToKeep, ...tabsWithoutEssential, { ...newTab, refreshKey: Date.now() }];
        return tabsToReturn;
      });
      setActiveTabId(newTab.id);
    });
  }


  function handleSelectBuilding(buildingNumber: number, taxRegions?: string) {
    handleNavigation(() => {
      const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
      
      // Ensure buildings tab exists (but keep dashboard first)
      const existingBuildingsTab = tabs.find(t => t.id === 'buildings');
      if (!existingBuildingsTab) {
        setTabs(prev => {
          const dashboardTab = prev.find(t => t.type === 'measurement-progress-dashboard');
          const tabsWithoutEssential = prev.filter(t => 
            t.type !== 'measurement-progress-dashboard' && t.type !== 'buildings'
          );
          const dashboardTabToKeep: Tab = dashboardTab || { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() };
          return [dashboardTabToKeep, buildingsTab, ...tabsWithoutEssential];
        });
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
              // Keep dashboard first, buildings second
              const dashboardTab = prev.find(t => t.type === 'measurement-progress-dashboard');
              const buildingsTab = prev.find(t => t.id === 'buildings');
              const otherTabs = prev.filter(t => 
                t.type !== 'measurement-progress-dashboard' && 
                t.id !== 'buildings' && 
                (t.id === 'buildings' || t.type !== 'assets' || t.id === singleRegionTabId)
              );
              const dashboardTabToKeep: Tab = dashboardTab || { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() };
              const buildingsTabToKeep: Tab = buildingsTab || { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
              return [dashboardTabToKeep, buildingsTabToKeep, ...otherTabs];
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
              // Keep dashboard first, buildings second
              const dashboardTab = prev.find(t => t.type === 'measurement-progress-dashboard');
              const buildingsTab = prev.find(t => t.id === 'buildings');
              const otherTabs = prev.filter(t => 
                t.type !== 'measurement-progress-dashboard' && 
                t.id !== 'buildings' && 
                t.type !== 'assets'
              );
              const dashboardTabToKeep: Tab = dashboardTab || { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() };
              const buildingsTabToKeep: Tab = buildingsTab || { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
              return [dashboardTabToKeep, buildingsTabToKeep, ...otherTabs, singleRegionTab];
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
            path: `/buildings/${buildingNumber}/assets`,
            refreshKey: Date.now()
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
              label: `מבנה ${buildingNumber} - ${getAreaDescriptionForTaxRegion(region)}`,
              refreshKey: Date.now()
            };
            tabsToCreate.push(regionTab);
          }
          
          // Activate the "all assets" tab (first tab)
          // Update tabs: close all previous assets tabs, then add new tabs for this building
          setTabs(prev => {
            // Keep dashboard first, buildings second, then non-assets tabs, close all assets tabs
            const dashboardTab = prev.find(t => t.type === 'measurement-progress-dashboard');
            const buildingsTab = prev.find(t => t.id === 'buildings');
            const otherTabs = prev.filter(t => 
              t.type !== 'measurement-progress-dashboard' && 
              t.id !== 'buildings' && 
              t.type !== 'assets'
            );
            const dashboardTabToKeep: Tab = dashboardTab || { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() };
            const buildingsTabToKeep: Tab = buildingsTab || { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
            // Combine: dashboard + buildings + other tabs + all new tabs
            const newTabs = [dashboardTabToKeep, buildingsTabToKeep, ...otherTabs, ...tabsToCreate];
            return newTabs;
          });
          
          // Set active tab to "all assets" (first tab)
          setTimeout(() => {
            setActiveTabId(allAssetsTabId);
          }, 0);
        }
      }
    });
  }

  function handleOpenNewAsset(buildingNumber: number, taxRegion?: string, initialAssetType?: string) {
    const newAssetTabId = `asset-details-new-${buildingNumber}-${taxRegion || 'all'}-${Date.now()}`;
    const newTab: Tab = {
      id: newAssetTabId,
      type: 'asset-details',
      buildingNumber,
      taxRegion,
      initialAssetType,
      label: `נכס חדש - מבנה ${buildingNumber}${taxRegion ? ` - ${getAreaDescriptionForTaxRegion(taxRegion)}` : ''}`
    };
    // Remove all other asset-details tabs, then add new one
    openTab(newTab);
  }

  function handleOpenTransferAreas(selectedAssetIds: string[], buildingNumber: number, taxRegion?: string) {
    // Get tax regions with not_accountable = true (use cached asset types)
    let notAccountableTaxRegions: string[] = [];
    try {
      const cachedAssetTypes = getAssetTypes();
      notAccountableTaxRegions = cachedAssetTypes
        .filter((at: AssetType) => at.non_accountable_for_total_area === true && at.tax_region != null)
        .map((at: AssetType) => String(at.tax_region))
        .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index); // Remove duplicates
    } catch (err) {
      // If validation module not available, skip not_accountable tax regions
      if (process.env.NODE_ENV === 'development') {
        console.warn('[App] Could not get asset types from cache:', err);
      }
    }

    // Combine original tax region with not_accountable tax regions and tax region 990
    // Tax region 990 is always included as a multi-tax area in transfer areas tab
    let combinedTaxRegion = taxRegion || '';
    const existingRegions = taxRegion ? taxRegion.split(',').map(r => r.trim()).filter(r => r) : [];
    const allRegions = new Set<string>(existingRegions);
    
    // Add not_accountable tax regions
    notAccountableTaxRegions.forEach(tr => allRegions.add(tr));
    
    // Always add tax region 990 as a multi-tax area when opening transfer areas tab
    allRegions.add('990');
    
    combinedTaxRegion = Array.from(allRegions).sort().join(',');

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


  function openBuildingsList() {
    const buildingsTabId = 'buildings';

    const newTab: Tab = {
      id: buildingsTabId,
      type: 'buildings',
      label: 'מבנים'
    };

    // Open or refresh buildings tab
    openTab(newTab);
  }

  function openMeasuredNotExportedAssets() {
    const measuredNotExportedTabId = 'measured-not-exported-assets-panel';

    const newTab: Tab = {
      id: measuredNotExportedTabId,
      type: 'measured-not-exported-assets',
      label: 'נכסים שנמדדו ולא נשלחו'
    };

    // Remove all other measured-not-exported-assets tabs, then add new one
    openTab(newTab);
  }

  function openMeasurementProgressDashboard() {
    const dashboardTabId = 'measurement-progress-dashboard-panel';

    const newTab: Tab = {
      id: dashboardTabId,
      type: 'measurement-progress-dashboard',
      label: 'התקדמות פעילות מדידות'
    };

    // Remove all other measurement-progress-dashboard tabs, then add new one
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

  function openAuditLog() {
    const auditLogTabId = 'audit-log-panel';

    const newTab: Tab = {
      id: auditLogTabId,
      type: 'audit-log',
      label: 'יומן ביקורת'
    };

    // Remove all other audit-log tabs, then add new one
    openTab(newTab);
  }

  function openUserManagement() {
    const userManagementTabId = 'user-management-panel';
    const newTab: Tab = {
      id: userManagementTabId,
      type: 'user-management',
      label: 'ניהול משתמשים',
    };
    openTab(newTab);
  }

  function openSystemConfiguration() {
    const systemConfigTabId = 'system-configuration-panel';
    const newTab: Tab = {
      id: systemConfigTabId,
      type: 'system-configuration',
      label: 'הגדרות מערכת',
    };
    openTab(newTab);
  }

  function openOperators() {
    const operatorsTabId = 'operators-panel';
    const newTab: Tab = {
      id: operatorsTabId,
      type: 'operators',
      label: 'מפעילים',
    };
    openTab(newTab);
  }

  function openManagers() {
    const managersTabId = 'managers-panel';
    const newTab: Tab = {
      id: managersTabId,
      type: 'managers',
      label: 'מנהלים',
    };
    openTab(newTab);
  }

  function openInspectionTasks() {
    if (!isDev && !isInspector) return;
    const id = 'inspection-tasks-panel';
    const newTab: Tab = { id, type: 'inspection-tasks', label: 'משימות ביקורת', refreshKey: Date.now() };
    openTab(newTab);
  }

  async function exportSchemaToCSV() {
    try {
      const data = await api.schema.getTablesFieldsTypes();
      
      // Create CSV content
      const headers = ['table_name', 'field_name', 'field_type'];
      const csvRows = [
        headers.join(','),
        ...data.map(row => [
          `"${row.table_name}"`,
          `"${row.field_name}"`,
          `"${row.field_type}"`
        ].join(','))
      ];
      
      const csvContent = csvRows.join('\n');
      
      // Create blob and download
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel UTF-8 support
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tables_fields_types_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting schema:', error);
      alert('שגיאה בייצוא סכמת מסד הנתונים. אנא נסה שוב.');
    }
  }

  function openResetExportModal() {
    setShowResetExportModal(true);
  }

  function closeResetExportModal() {
    setShowResetExportModal(false);
  }

  async function handleConfirmResetExport() {
    setResetExportLoading(true);
    setShowResetExportModal(false);

    try {
      const result = await api.assets.resetExportToAutomation();
      
      if (!result.success) {
        setResetExportResult({
          success: false,
          message: `שגיאה באיפוס סימן שליחת הנתונים: ${result.error || 'שגיאה לא ידועה'}`
        });
        setShowResetExportResultModal(true);
        setResetExportLoading(false);
        return;
      }

      setResetExportResult({
        success: true,
        message: `אופס בהצלחה ${result.count} נכסים. כעת ניתן לשלוח אותם מחדש באמצעות כפתור "שליחת נתונים לעירייה".`
      });
      setShowResetExportResultModal(true);
      
      // Immediately sync latest export date from cache (cache was updated by resetExportToAutomation with next latest date)
      const cachedDate = getCachedLatestExportDate();
      setLatestExportDate(cachedDate);
      
      // Notify components to refresh "לא נשלחו לעירייה" (export count, dashboard, measured-not-exported list)
      window.dispatchEvent(new CustomEvent('resetExportToAutomationSuccess'));
      // Refresh the export count - use setTimeout to ensure state updates are processed
      // Also refresh when modal closes as backup (refresh whenever BuildingsList ref exists, not only when tab is active)
      setTimeout(async () => {
        if (buildingsListRef.current?.refreshExportCount) {
          buildingsListRef.current.refreshExportCount().catch(err => {
            console.error('[App] Error refreshing export count:', err);
          });
        }
        // Refresh latest export date after reset (cache is already updated by resetExportToAutomation with next latest date)
        const cachedDate = getCachedLatestExportDate();
        setLatestExportDate(cachedDate);
      }, 200);
    } catch (error) {
      console.error('Error resetting export to automation:', error);
      setResetExportResult({
        success: false,
        message: 'שגיאה באיפוס סימן שליחת הנתונים. אנא נסה שוב.'
      });
      setShowResetExportResultModal(true);
    } finally {
      setResetExportLoading(false);
    }
  }

  async function closeResetExportResultModal() {
    setShowResetExportResultModal(false);
    setResetExportResult(null);
    
    // Refresh the export count and latest export date when closing the result modal
    setTimeout(async () => {
      if (buildingsListRef.current?.refreshExportCount) {
        try {
          await buildingsListRef.current.refreshExportCount();
        } catch (err) {
          console.error('[App] Error refreshing export count:', err);
        }
      }
      const cachedDate = getCachedLatestExportDate();
      setLatestExportDate(cachedDate);
    }, 100);
  }

  // Get latest export date from cache (synchronous, used directly in render)
  // Always read from cache - it's updated immediately by export/reset operations
  const displayLatestExportDate = getCachedLatestExportDate() || latestExportDate;

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

  function openAssetDataEntry() {
    const assetDataEntryTabId = 'asset-data-entry-panel';

    const newTab: Tab = {
      id: assetDataEntryTabId,
      type: 'asset-data-entry',
      label: 'הזנת נתוני נכס'
    };

    // Remove all other asset-data-entry tabs, then add new one
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

  function openMobileTasksUpload() {
    handleNavigation(() => {
      const id = 'mobile-tasks-upload';
      const existing = tabs.find(t => t.id === id);
      if (existing) {
        setActiveTabId(id);
        setSidebarOpen(false);
        return;
      }
      const newTab: Tab = { id, type: 'mobile-tasks-upload', label: 'משימות והעלאות', refreshKey: Date.now() };
      openTab(newTab);
      setSidebarOpen(false);
    });
  }

  function openAssetsFileImport() {
    handleNavigation(() => {
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
    });
  }

  function openAssetsSkeletonImport() {
    handleNavigation(() => {
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
    });
  }

  // Confirm navigation (proceed anyway)
  const handleConfirmNavigation = () => {
    setShowUnsavedChangesModal(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  // Cancel navigation
  const handleCancelNavigation = () => {
    setShowUnsavedChangesModal(false);
    setPendingNavigation(null);
  };

  function handleCloseTab(tabId: string) {
    handleNavigation(() => {
      setTabs(prevTabs => {
        // Never allow closing the dashboard tab
        if (tabId === 'measurement-progress-dashboard') {
          return prevTabs;
        }
        
        // Never allow closing the buildings tab
        if (tabId === 'buildings') {
          return prevTabs;
        }
        
        const newTabs = prevTabs.filter(tab => tab.id !== tabId);
        if (newTabs.length === 0) {
          const dashboardTab: Tab = { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() };
          const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
          return [dashboardTab, buildingsTab];
        }
        
        // Ensure dashboard is always first and buildings is always second
        const dashboardTab = newTabs.find(t => t.type === 'measurement-progress-dashboard');
        const buildingsTab = newTabs.find(t => t.type === 'buildings');
        const tabsWithoutEssential = newTabs.filter(t => 
          t.type !== 'measurement-progress-dashboard' && t.type !== 'buildings'
        );
        
        const dashboardTabToKeep: Tab = dashboardTab || { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() };
        const buildingsTabToKeep: Tab = buildingsTab || { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
        
        return [dashboardTabToKeep, buildingsTabToKeep, ...tabsWithoutEssential];
      });

      if (activeTabId === tabId) {
        const remainingTabs = tabs.filter(tab => tab.id !== tabId);
        if (remainingTabs.length > 0) {
          // If closing active tab, switch to dashboard if it exists, otherwise to last tab
          const dashboardTab = remainingTabs.find(t => t.type === 'measurement-progress-dashboard');
          setActiveTabId(dashboardTab ? dashboardTab.id : remainingTabs[remainingTabs.length - 1].id);
        } else {
          setActiveTabId('measurement-progress-dashboard');
        }
      }
    });
  }

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
        
        // Skip validation for asset type 990
        if (asset.main_asset_type && (String(asset.main_asset_type).trim() === '990' || parseInt(String(asset.main_asset_type).trim(), 10) === 990)) {
          // Update progress but skip validation
          setBatchValidationProgress({
            current: i + 1,
            total: allAssets.length,
            currentAssetId: String(asset.asset_id)
          });
          continue;
        }
        
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
    <FontSizeProvider value={fontSize}>
    <div className="min-h-screen bg-app-bg flex flex-col" dir="rtl">
      {/* theme_1: Dark blue header, icon strip */}
      <header className="shrink-0 h-12 bg-app-header flex items-center justify-between px-4 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="font-semibold text-base hidden sm:inline">מערכת ניהול מבנים</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => openHelp('manual')} title="עזרה" className="p-2.5 rounded hover:bg-white/10 transition-colors">
            <HelpCircle className="h-5 w-5" />
          </button>
          <div className="relative" ref={settingsMenuRef}>
            <button
              onClick={() => { setSettingsMenuOpen((prev) => !prev); setUserMenuOpen(false); }}
              title="הגדרות"
              className={`p-2.5 rounded hover:bg-white/10 transition-colors ${settingsMenuOpen ? 'bg-white/10' : 'opacity-80'}`}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
            {settingsMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-app-sidebar border border-white/10 rounded-lg shadow-xl py-2 z-[100]">
                <div className="px-3 py-1.5 border-b border-white/10">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-white/70">
                    <Sun className="h-3.5 w-3.5" />
                    בהירות
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(['light', 'normal', 'dark', 'contrast'] as const).map((b) => (
                      <button
                        key={b}
                        onClick={() => setBrightness(b)}
                        className={`flex-1 min-w-0 py-1.5 rounded text-sm ${brightness === b ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'}`}
                      >
                        {b === 'light' ? 'בהיר' : b === 'normal' ? 'רגיל' : b === 'dark' ? 'כהה' : 'ניגודיות גבוהה'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-3 py-1.5">
                  <span className="text-xs font-medium text-white/70">גודל גופן</span>
                  <div className="flex gap-1 mt-1">
                    {(['small', 'normal', 'large'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFontSize(f)}
                        className={`flex-1 py-1.5 rounded text-sm ${fontSize === f ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'}`}
                      >
                        {f === 'small' ? 'קטן' : f === 'normal' ? 'רגיל' : 'גדול'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              title="משתמש"
              className={`p-2.5 rounded hover:bg-white/10 transition-colors ${userMenuOpen ? 'bg-white/10' : 'opacity-80'}`}
            >
              <User className="h-5 w-5" />
            </button>
            {userMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-app-sidebar border border-white/10 rounded-lg shadow-xl py-2 z-[100]">
                {(() => {
                  const session = getSession();
                  return (
                    <>
                      <div className="px-3 py-2 border-b border-white/10">
                        <p className="text-sm font-medium text-white truncate">{session?.user_name || '-'}</p>
                        <p className="text-xs text-white/80">{roleLabel}</p>
                      </div>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 text-sm text-white/90 hover:bg-app-destructive/30 hover:text-white rounded-b-lg transition-colors"
                        title="התנתק"
                      >
                        <LogOut className="h-4 w-4" />
                        התנתק
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
      {/* theme_1: Mobile menu button - touch-friendly */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed z-50 min-h-[44px] min-w-[44px] p-3 left-2 bg-app-sidebar rounded-xl shadow-lg border border-app-sidebar-hover touch-manipulation"
        style={{ top: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
        aria-label="תפריט"
      >
        <Menu className="h-6 w-6 text-white" />
      </button>

      {/* theme_1: Narrow icon-first sidebar - dark teal */}
      <div className={`${sidebarOpen ? 'fixed inset-0 z-40 md:relative md:z-auto' : 'hidden md:flex'} md:w-[72px] lg:w-20 bg-app-sidebar border-l border-white/10 flex flex-col shrink-0 overflow-visible`}>
        {sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden absolute min-h-[44px] min-w-[44px] p-3 right-2 bg-app-sidebar rounded-xl touch-manipulation"
            style={{ top: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
            aria-label="סגור תפריט"
          >
            <X className="h-6 w-6 text-white" />
          </button>
        )}
        <div className="p-2 border-b border-white/10 flex flex-col items-center gap-1">
          {!roleLoading && userRole && (
            <span className="text-[10px] font-medium text-white/80 px-1 truncate max-w-full">{roleLabel}</span>
          )}
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-visible min-h-0">
          {!isInspector && (
            <button
              onClick={openAssetSearch}
              className={`w-full flex items-center justify-center p-2.5 rounded transition-all duration-200 text-white relative mb-1 ${isSidebarItemActive('asset-search') ? 'bg-app-sidebar-active border-r-[3px] border-r-app-sidebar-indicator' : 'hover:bg-app-sidebar-hover'}`}
              title="חיפוש נכס"
            >
              <Search className="h-5 w-5 shrink-0" />
            </button>
          )}
          {isInspector && (
            <button
              onClick={openInspectionTasks}
              className={`w-full flex items-center justify-center p-2.5 rounded transition-all duration-200 text-white relative ${isSidebarItemActive('inspection-tasks') ? 'bg-app-sidebar-active border-r-[3px] border-r-app-sidebar-indicator' : 'hover:bg-app-sidebar-hover'}`}
              title="משימות ביקורת"
            >
              <ClipboardList className="h-5 w-5 shrink-0" />
            </button>
          )}
          {!isInspector && isMobile && (
            <button
              onClick={openMobileTasksUpload}
              className={`w-full flex items-center justify-center p-2.5 rounded transition-all duration-200 text-white relative ${isSidebarItemActive('mobile-tasks-upload') ? 'bg-app-sidebar-active border-r-[3px] border-r-app-sidebar-indicator' : 'hover:bg-app-sidebar-hover'}`}
              title="משימות והעלאות"
            >
              <ClipboardList className="h-5 w-5 shrink-0" />
            </button>
          )}
          {!isInspector && (
          <div className="relative">
            <button
              onClick={() => {
                setAssetsMenuOpen(false);
                setAdminMenuOpen(false);
                setManagerActionsSubmenuOpen(false);
                setSystemConfigSubmenuOpen(false);
                setBuildingsMenuOpen((prev) => !prev);
              }}
              className={`w-full flex items-center justify-center p-2.5 rounded transition-all duration-200 text-white relative ${isSidebarItemActive(['buildings', 'building-list-import', 'measurement-progress-dashboard']) ? 'bg-app-sidebar-active border-r-[3px] border-r-app-sidebar-indicator' : 'hover:bg-app-sidebar-hover'}`}
              title="מבנים"
            >
              <Building2 className="h-5 w-5 shrink-0" />
            </button>
            {buildingsMenuOpen && (
              <div className="absolute right-full top-0 mr-1 w-48 bg-app-sidebar border-l border-white/10 rounded-l-lg shadow-xl py-2 z-[100] max-h-[70vh] overflow-y-auto">
                <button
                  onClick={() => {
                    const dashboardTab: Tab = { id: 'measurement-progress-dashboard', type: 'measurement-progress-dashboard', label: 'התקדמות פעילות מדידות', refreshKey: Date.now() };
                    const buildingsTab: Tab = { id: 'buildings', type: 'buildings', label: 'מבנים', refreshKey: Date.now() };
                    setTabs([dashboardTab, buildingsTab]);
                    setActiveTabId('buildings');
                    setBuildingsMenuOpen(true);
                  }}
                  className="w-full text-right py-2 px-3 text-sm text-white/90 hover:bg-app-sidebar-hover rounded"
                >
                  רשימת מבנים
                </button>
                {!isReadOnly && (
                  <>
                    <button
                      onClick={() => setShowCreateBuildingModal(true)}
                      className="w-full text-right py-2 px-3 text-sm text-white/90 hover:bg-app-sidebar-hover rounded"
                    >
                      צור מבנה חדש
                    </button>
                    <button
                      onClick={openFileImport}
                      className="w-full text-right py-2 px-3 text-sm text-white/90 hover:bg-app-sidebar-hover rounded"
                    >
                      ייבוא File
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          )}
          {!isInspector && (
          <div className="relative">
            <button
              onClick={() => {
                setBuildingsMenuOpen(false);
                setAdminMenuOpen(false);
                setManagerActionsSubmenuOpen(false);
                setSystemConfigSubmenuOpen(false);
                setAssetsMenuOpen((prev) => !prev);
              }}
              className={`w-full flex items-center justify-center p-2.5 rounded transition-all duration-200 text-white relative ${isSidebarItemActive(['assets', 'asset-details', 'asset-search', 'measured-not-exported-assets', 'assets-file-import', 'assets-skeleton-import', 'asset-types', 'transfer-areas', 'address-list', 'field-config', 'asset-data-entry', 'audit-log']) ? 'bg-app-sidebar-active border-r-[3px] border-r-app-sidebar-indicator' : 'hover:bg-app-sidebar-hover'}`}
              title="נכסים"
            >
              <Home className="h-5 w-5 shrink-0" />
            </button>
            {assetsMenuOpen && (
              <div className="absolute right-full top-0 mr-1 w-52 bg-app-sidebar border-l border-white/10 rounded-l-lg shadow-xl py-2 z-[100] max-h-[70vh] overflow-y-auto">
                <button
                  onClick={openAssetSearch}
                  className="w-full text-right py-2 px-3 text-sm text-white/90 hover:bg-app-sidebar-hover rounded"
                >
                  חיפוש נכס
                </button>
                <button
                  onClick={openMeasuredNotExportedAssets}
                  className="w-full text-right py-2 px-3 text-sm text-white/90 hover:bg-app-sidebar-hover rounded"
                >
                  נכסים שנמדדו ולא נשלחו
                </button>
                {!isReadOnly && (
                  <>
                    <button
                      onClick={openAssetsFileImport}
                      className="w-full text-right py-2 px-3 text-sm text-white/90 hover:bg-app-sidebar-hover rounded"
                    >
                      ייבוא מלא
                    </button>
                    <button
                      onClick={openAssetsSkeletonImport}
                      className="w-full text-right py-2 px-3 text-sm text-white/90 hover:bg-app-sidebar-hover rounded"
                    >
                      ייבוא שלד
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          )}
          {!isInspector && (
          <div className="relative">
            <button
              onClick={() => {
                setBuildingsMenuOpen(false);
                setAssetsMenuOpen(false);
                setAdminMenuOpen((prev) => !prev);
              }}
              className={`w-full flex items-center justify-center p-2.5 rounded transition-all duration-200 text-white relative ${isSidebarItemActive(['user-management', 'system-configuration', 'operators', 'managers', 'validation-rules']) ? 'bg-app-sidebar-active border-r-[3px] border-r-app-sidebar-indicator' : 'hover:bg-app-sidebar-hover'}`}
              title="ניהול"
            >
              <Settings className="h-5 w-5 shrink-0" />
            </button>
            {adminMenuOpen && (
              <div className="absolute right-full top-0 mr-1 w-52 bg-app-sidebar border-l border-white/10 rounded-l-lg shadow-xl py-2 z-[100] max-h-[80vh] overflow-y-auto">
                {isAdmin && (
                  <div>
                    <button
                      onClick={() => setManagerActionsSubmenuOpen(!managerActionsSubmenuOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white/90">פעולות מנהל</span>
                        <UserCog className="h-3.5 w-3.5 text-white/70" />
                      </div>
                      {managerActionsSubmenuOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-white/70" />
                      ) : (
                        <ChevronLeft className="h-3.5 w-3.5 text-white/70" />
                      )}
                    </button>
                    {managerActionsSubmenuOpen && (
                      <div className="mr-2 mt-1 space-y-0.5 border-r-2 border-app-sidebar-indicator/50 pr-2">
                        {isDev && (
                        <button
                          onClick={openInspectionTasks}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                        >
                          <span className="text-white/90">משימות ביקורת</span>
                          <ClipboardList className="h-3 w-3 text-white/70" />
                        </button>
                        )}
                        <button
                          onClick={openResetExportModal}
                          disabled={resetExportLoading}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="text-white/90">
                            איפוס שליחת נתונים מתאריך{displayLatestExportDate ? ` ${displayLatestExportDate}` : ''}
                          </span>
                          {resetExportLoading ? (
                            <Loader2 className="h-3 w-3 text-white/70 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3 text-white/70" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {isAdmin && validationRulesEnabled && (
                  <button
                    onClick={openValidationRules}
                    className="w-full flex items-center gap-2 px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                  >
                    <span className="font-medium text-white/90">כללי תקינות</span>
                    <Settings className="h-3.5 w-3.5 text-white/70" />
                  </button>
                )}
                {isAdmin && (
                  <div>
                    <button
                      onClick={() => setSystemConfigSubmenuOpen(!systemConfigSubmenuOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white/90">הגדרות מערכת</span>
                        <Settings className="h-3.5 w-3.5 text-white/70" />
                      </div>
                      {systemConfigSubmenuOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-white/70" />
                      ) : (
                        <ChevronLeft className="h-3.5 w-3.5 text-white/70" />
                      )}
                    </button>
                    {systemConfigSubmenuOpen && (
                      <div className="mr-2 mt-1 space-y-0.5 border-r-2 border-app-sidebar-indicator/50 pr-2">
                        <button
                          onClick={openSystemConfiguration}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                        >
                          <span className="text-white/90">הגדרות כלליות</span>
                          <Settings className="h-3 w-3 text-white/70" />
                        </button>
                        <button
                          onClick={openAssetTypes}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                        >
                          <span className="text-white/90">סוגי נכסים</span>
                          <Tag className="h-3 w-3 text-white/70" />
                        </button>
                        <button
                          onClick={openAddressList}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                        >
                          <span className="text-white/90">רשימת כתובות</span>
                          <MapPin className="h-3 w-3 text-white/70" />
                        </button>
                        <button
                          onClick={openFieldConfig}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                        >
                          <span className="text-white/90">הגדרות שדות</span>
                          <Settings className="h-3 w-3 text-white/70" />
                        </button>
                        <button
                          onClick={openOperators}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                        >
                          <span className="text-white/90">מפעילים</span>
                          <Users className="h-3 w-3 text-white/70" />
                        </button>
                        <button
                          onClick={openManagers}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                        >
                          <span className="text-white/90">מנהלים</span>
                          <UserCog className="h-3 w-3 text-white/70" />
                        </button>
                        <button
                          onClick={openUserManagement}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right bg-transparent hover:bg-theme-sidebar-hover rounded-lg transition-all text-xs text-white/90"
                        >
                          <span className="text-white/90">ניהול משתמשים</span>
                          <Users className="h-3 w-3 text-white/70" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </nav>
        
        <div className="p-2 border-t border-white/10 flex flex-col items-center gap-1">
          <p className="text-[9px] text-white/50 pt-1">© Kortex</p>
        </div>
        
      </div>

      <div
        className="flex-1 flex flex-col min-w-0 pt-[52px] md:pt-0"
        onClick={() => {
          setBuildingsMenuOpen(false);
          setAssetsMenuOpen(false);
          setAdminMenuOpen(false);
          setManagerActionsSubmenuOpen(false);
          setSystemConfigSubmenuOpen(false);
          setUserMenuOpen(false);
        }}
      >
        {/* theme_1: Tabs bar - light gray */}
        <div className="bg-app-tabs-bg border-b border-app-input-border">
          <div className="px-2 sm:px-4 py-1.5">
            <div className="flex flex-row-reverse items-center justify-end gap-1 overflow-x-auto scrollbar-hide min-h-[40px]">
              {[...tabs].reverse().map((tab) => (
                <div
                  key={tab.id}
                  className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all duration-200 cursor-pointer group touch-manipulation flex-shrink-0 -mb-px ${
                    activeTabId === tab.id
                      ? 'border-app-sidebar-indicator text-app-text-primary font-semibold'
                      : 'border-transparent text-app-text-muted hover:text-app-text-primary hover:bg-white/40'
                  }`}
                >
                  <div
                    onClick={() => {
                      handleNavigation(() => {
                        // Refresh the tab when switching to it
                        setTabs(prev => prev.map(t => 
                          t.id === tab.id 
                            ? { ...t, refreshKey: Date.now() } 
                            : t
                        ));
                        setActiveTabId(tab.id);
                      });
                    }}
                    className="flex items-center gap-2 flex-shrink-0"
                  >
                    {tab.type === 'admin' ? (
                      <Settings className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'asset-types' ? (
                      <Tag className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'asset-search' ? (
                      <Search className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'measured-not-exported-assets' ? (
                      <AlertCircle className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'measurement-progress-dashboard' ? (
                      <BarChart3 className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'validation-rules' ? (
                      <Settings className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'field-config' ? (
                      <Settings className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'address-list' ? (
                      <MapPin className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'asset-data-entry' ? (
                      <Edit className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'building-list-import' ? (
                      <Upload className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'assets-file-import' ? (
                      <Upload className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'audit-log' ? (
                      <FileText className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'user-management' ? (
                      <Users className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'system-configuration' ? (
                      <Settings className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'buildings' ? (
                      <img src="/buildings.png" alt="Buildings" className="h-5 w-5 shrink-0" />
                    ) : tab.type === 'mobile-tasks-upload' ? (
                      <ClipboardList className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : tab.type === 'inspection-tasks' ? (
                      <ClipboardList className="h-5 w-5 text-slate-600 shrink-0" />
                    ) : (
                      <Building className="h-5 w-5 text-slate-600 shrink-0" />
                    )}
                    <span className={`whitespace-nowrap text-sm hidden sm:inline ${
                      activeTabId === tab.id ? 'text-app-text-primary' : 'text-app-text-muted'
                    }`}>
                      {tab.label}
                    </span>
                  </div>
                  {tab.type !== 'buildings' && tab.type !== 'measurement-progress-dashboard' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTab(tab.id);
                      }}
                      className="p-0.5 text-slate-600 hover:bg-red-100 hover:text-red-600 active:bg-red-200 rounded transition-all duration-200 hover:scale-110"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Main Content Area - no scroll; grid pages fill available space */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-app-bg">
            {activeTab?.type === 'buildings' && (
              <BuildingsList
                ref={buildingsListRef}
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
                  ref={assetsListRef}
                  key={activeTab.refreshKey}
                  buildingNumber={activeTab.buildingNumber}
                  taxRegion={activeTab.taxRegion}
                  onSelectAsset={handleSelectAsset}
                  onOpenTransferAreas={handleOpenTransferAreas}
                  onOpenNewAsset={handleOpenNewAsset}
                  selectedAssetIds={activeTab.selectedAssetIds}
                  onOpenAssetsTab={handleOpenAssetsTab}
                  onCloseTabAndOpenMultiTax={handleCloseTabAndOpenMultiTax}
                  onCloseTab={() => handleCloseTab(activeTabId)}
                  isErrorFixingMode={activeTab.isErrorFixingMode}
                />
              )}
            {activeTab?.type === 'transfer-areas' && activeTab.buildingNumber && activeTab.selectedAssetIds && (
              <TransferAreas
                ref={transferAreasRef}
                key={activeTab.refreshKey}
                buildingNumber={activeTab.buildingNumber}
                taxRegion={activeTab.taxRegion}
                selectedAssetIds={activeTab.selectedAssetIds}
                onCloseTab={() => handleCloseTab(activeTabId)}
                onOpenAssetsTab={handleOpenAssetsTab}
                onCloseAllTabsExceptEssential={handleCloseAllTabsExceptEssential}
              />
            )}
            {activeTab?.type === 'asset-types' && (
              <AssetTypes key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'asset-search' && (
              <AssetSearch key={activeTab.refreshKey} onSelectAsset={handleSelectAsset} />
            )}
            {activeTab?.type === 'validation-rules' && (
              <ValidationRulesManager key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'address-list' && (
              <AddressListComponent key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'field-config' && (
              <FieldConfigManager key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'asset-data-entry' && (
              <AssetDataEntry ref={assetDataEntryRef} key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'building-list-import' && (
              <BuildingListImport key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'assets-file-import' && (
              <AssetsFileImport key={activeTab.refreshKey} mode="regular" />
            )}
            {activeTab?.type === 'assets-skeleton-import' && (
              <AssetsFileImport key={activeTab.refreshKey} mode="skeleton" />
            )}
            {activeTab?.type === 'asset-details' && (
              <AssetDetails 
                ref={assetDetailsRef}
                key={activeTab.refreshKey}
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
            {activeTab?.type === 'audit-log' && (
              <AuditLog key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'user-management' && (
              <UserManagement key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'system-configuration' && (
              <SystemConfigurationManager key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'operators' && (
              <OperatorsManager key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'managers' && (
              <ManagersManager key={activeTab.refreshKey} />
            )}
            {activeTab?.type === 'measured-not-exported-assets' && (
              <MeasuredNotExportedAssets
                onSelectAsset={handleSelectAsset}
              />
            )}
{activeTab?.type === 'measurement-progress-dashboard' && (
              <MeasurementProgressDashboard
                onOpenBuildingsList={openBuildingsList}
                onOpenMeasuredNotExportedAssets={openMeasuredNotExportedAssets}
              />
            )}
            {activeTab?.type === 'mobile-tasks-upload' && (
              <MobileTasksAndUpload />
            )}
            {activeTab?.type === 'inspection-tasks' && (
              <InspectionTasksManager key={activeTab.refreshKey} />
            )}
          </div>
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
                  <Loader2 className="h-8 w-8 text-app-accent animate-spin mx-auto mb-4" />
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
                          className="bg-theme-tab-active h-2.5 rounded-full transition-all duration-300"
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

      {/* Unsaved Changes Confirmation Modal */}
      {showUnsavedChangesModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          dir="rtl"
          onClick={handleCancelNavigation}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-orange-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">יש שינויים שלא נשמרו</h3>
            </div>
            
            <p className="text-slate-600 mb-6">
              יש לך שינויים שלא נשמרו בלשונית הנוכחית. האם אתה בטוח שברצונך לעזוב? השינויים יאבדו.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelNavigation}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirmNavigation}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
              >
                עזוב ללא שמירה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Export to Automation Confirmation Modal */}
      {showResetExportModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          dir="rtl"
          onClick={closeResetExportModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-orange-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">
                איפוס שליחת נתונים מתאריך{displayLatestExportDate ? ` ${displayLatestExportDate}` : ''}
              </h3>
            </div>
            
            <p className="text-slate-600 mb-6">
              האם אתה בטוח שברצונך לאפס את סימן שליחת הנתונים לנכסים שנשלחו מתאריך{displayLatestExportDate ? ` ${displayLatestExportDate}` : ''}? פעולה זו תאפשר לשלוח אותם מחדש.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeResetExportModal}
                disabled={resetExportLoading}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirmResetExport}
                disabled={resetExportLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {resetExportLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    מאפס...
                  </>
                ) : (
                  'אפס'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Export Result Modal */}
      {showResetExportResultModal && resetExportResult && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          dir="rtl"
          onClick={closeResetExportResultModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              {resetExportResult.success ? (
                <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
              )}
              <h3 className={`text-lg font-bold ${resetExportResult.success ? 'text-green-900' : 'text-red-900'}`}>
                {resetExportResult.success ? 'הפעולה הושלמה בהצלחה' : 'שגיאה'}
              </h3>
            </div>
            
            <p className={`mb-6 ${resetExportResult.success ? 'text-slate-600' : 'text-red-600'}`}>
              {resetExportResult.message}
            </p>

            <div className="flex justify-end">
              <button
                onClick={closeResetExportResultModal}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                  resetExportResult.success 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpModal />
    </div>
    </FontSizeProvider>
  );
}

export default App;
