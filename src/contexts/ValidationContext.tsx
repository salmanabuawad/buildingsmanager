import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ValidationRule, Building, AssetType, api } from '../lib/api';
import { setValidationRules, setValidationData } from '../lib/validation';

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
      const [rules, buildings, assetTypes] = await Promise.all([
        api.validationRules.getEnabled(),
        api.buildings.getAll(),
        api.assetTypes.getAll()
      ]);
      
      setValidationRulesState(rules);
      // Update global in-memory stores for validation functions
      setValidationRules(rules);
      setValidationData({ buildings, assetTypes });
      
      console.log(`[ValidationContext] Loaded into memory: ${rules.length} validation rules, ${buildings.length} buildings, ${assetTypes.length} asset types`);
    } catch (err) {
      console.error('[ValidationContext] Failed to load validation data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load validation data');
      setValidationRulesState([]);
      // Clear in-memory stores on error
      setValidationRules([]);
      setValidationData({ buildings: [], assetTypes: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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

