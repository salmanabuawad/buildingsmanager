import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api } from '../lib/api';
import type { ThemeId } from '../lib/systemConfigService';

export type ValidationMode = 'off' | 'before_save' | 'online';

export interface UIConfigState {
  validation_rules_enabled: boolean;
  validation_mode: ValidationMode;
  theme_id: ThemeId;
}

const defaultUIConfig: UIConfigState = {
  validation_rules_enabled: false,
  validation_mode: 'before_save',
  theme_id: 'ocean',
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
      const themeId = uiConfig.theme_id === 'mist' ? 'mist' : 'ocean';
      setConfig({
        validation_rules_enabled: uiConfig.validation_rules_enabled ?? (mode !== 'off'),
        validation_mode: mode,
        theme_id: themeId,
      });
    } catch {
      setConfig(defaultUIConfig);
    }
  }, []);

  // Apply theme to document (enables CSS variable overrides)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme_id);
  }, [config.theme_id]);

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
