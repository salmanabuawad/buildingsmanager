import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ValidationRule, Building, AssetType, api } from '../lib/api';
import { setValidationRules, setValidationData } from '../lib/validation';
import { getSession } from '../lib/usersTableAuth';

interface ValidationContextType {
  validationRules: ValidationRule[];
  loading: boolean;
  error: string | null;
  refreshRules: () => Promise<void>;
}

const ValidationContext = createContext<ValidationContextType | undefined>(undefined);

export function ValidationProvider({ children }: { children: ReactNode }) {
  const [validationRules, setValidationRulesState] = useState<ValidationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load all required data in parallel
      const [rules, buildings, assetTypes, assets] = await Promise.all([
        api.validationRules.getEnabled(),
        api.buildings.getAll(),
        api.assetTypes.getAll(),
        api.assets.getAll() // Load all assets for uniqueness validation
      ]);
      
      setValidationRulesState(rules);
      // Update global in-memory stores for validation functions
      const { setValidationRules, setValidationData, setAllAssets } = await import('../lib/validation');
      setValidationRules(rules);
      setValidationData({ buildings, assetTypes, assets });
      setAllAssets(assets);
      
      if (process.env.NODE_ENV === 'development') {
      }
    } catch (err) {
      console.error('[ValidationContext] Failed to load validation data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load validation data');
      setValidationRulesState([]);
      // Clear in-memory stores on error
      const { setValidationRules, setValidationData, setAllAssets } = await import('../lib/validation');
      setValidationRules([]);
      setValidationData({ buildings: [], assetTypes: [], assets: [] });
      setAllAssets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getSession()) return; // not logged in yet — App.tsx calls refreshRules() after login
    loadAllData();
  }, []);

  return (
    <ValidationContext.Provider value={{ validationRules, loading, error, refreshRules: loadAllData }}>
      {children}
    </ValidationContext.Provider>
  );
}

export function useValidationRules() {
  const context = useContext(ValidationContext);
  if (context === undefined) {
    throw new Error('useValidationRules must be used within a ValidationProvider');
  }
  return context;
}

