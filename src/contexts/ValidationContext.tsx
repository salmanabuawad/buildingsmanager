import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ValidationRule, api } from '../lib/api';

interface ValidationContextType {
  validationRules: ValidationRule[];
  loading: boolean;
  error: string | null;
  refreshRules: () => Promise<void>;
}

const ValidationContext = createContext<ValidationContextType | undefined>(undefined);

export function ValidationProvider({ children }: { children: ReactNode }) {
  const [validationRules, setValidationRules] = useState<ValidationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRules = async () => {
    try {
      setLoading(true);
      setError(null);
      const rules = await api.validationRules.getEnabled();
      setValidationRules(rules);
      console.log(`[ValidationContext] Loaded ${rules.length} validation rules into memory`);
    } catch (err) {
      console.error('[ValidationContext] Failed to load validation rules:', err);
      setError(err instanceof Error ? err.message : 'Failed to load validation rules');
      setValidationRules([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  return (
    <ValidationContext.Provider value={{ validationRules, loading, error, refreshRules: loadRules }}>
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

