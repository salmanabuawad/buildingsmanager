import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { api } from '../lib/api';

export type ValidationMode = 'off' | 'before_save' | 'online';

export interface UIConfigState {
  validation_rules_enabled: boolean;
  validation_mode: ValidationMode;
}

const defaultUIConfig: UIConfigState = {
  validation_rules_enabled: false,
  validation_mode: 'before_save',
};

interface UIConfigContextType extends UIConfigState {
  loadUIConfig: () => Promise<void>;
  /** Should we run validation before save? (false when mode === 'off') */
  shouldValidateBeforeSave: boolean;
  /** Should we run validation on field blur? (true only when mode === 'online') */
  shouldValidateOnBlur: boolean;
}

const UIConfigContext = createContext<UIConfigContextType | undefined>(undefined);

export function UIConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<UIConfigState>(defaultUIConfig);

  const loadUIConfig = useCallback(async () => {
    try {
      const uiConfig = await api.systemConfiguration.getUIConfig();
      const mode = uiConfig.validation_mode ?? 'before_save';
      setConfig({
        validation_rules_enabled: uiConfig.validation_rules_enabled ?? (mode !== 'off'),
        validation_mode: mode,
      });
    } catch {
      setConfig(defaultUIConfig);
    }
  }, []);

  const value: UIConfigContextType = {
    ...config,
    loadUIConfig,
    shouldValidateBeforeSave: config.validation_mode !== 'off',
    shouldValidateOnBlur: config.validation_mode === 'online',
  };

  return (
    <UIConfigContext.Provider value={value}>
      {children}
    </UIConfigContext.Provider>
  );
}

export function useUIConfig() {
  const context = useContext(UIConfigContext);
  if (context === undefined) {
    throw new Error('useUIConfig must be used within a UIConfigProvider');
  }
  return context;
}
