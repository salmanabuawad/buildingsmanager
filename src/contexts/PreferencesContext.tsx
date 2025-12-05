import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type EditMode = 'modal' | 'inline';

interface Preferences {
  editMode: EditMode;
}

interface PreferencesContextType {
  preferences: Preferences;
  setEditMode: (mode: EditMode) => void;
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

const STORAGE_KEY = 'buildings-manager-preferences';
const DEFAULT_PREFERENCES: Preferences = {
  editMode: 'inline', // Default to inline editing
};

function loadPreferences(): Preferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch (error) {
    console.error('Error loading preferences from localStorage:', error);
  }
  return DEFAULT_PREFERENCES;
}

function savePreferences(preferences: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Error saving preferences to localStorage:', error);
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);

  // Load preferences on mount
  useEffect(() => {
    const loaded = loadPreferences();
    setPreferences(loaded);
  }, []);

  // Save preferences whenever they change
  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  const setEditMode = (mode: EditMode) => {
    setPreferences(prev => ({ ...prev, editMode: mode }));
  };

  const updatePreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  return (
    <PreferencesContext.Provider value={{ preferences, setEditMode, updatePreference }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}

