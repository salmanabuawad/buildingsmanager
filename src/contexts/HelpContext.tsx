import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { HelpContextId, HELP_CONTENT, getHelpContextForTabType } from '../lib/helpContent';

interface HelpContextType {
  /** Current help context (e.g. from active tab) */
  currentContextId: HelpContextId | null;
  /** Set the current context (called when tab changes) */
  setCurrentContextId: (id: HelpContextId | null) => void;
  /** Set context from tab type string */
  setContextFromTabType: (tabType: string) => void;
  /** Whether the help modal is open */
  helpOpen: boolean;
  /** Open help for current context, or specific context */
  openHelp: (contextId?: HelpContextId) => void;
  /** Close help modal */
  closeHelp: () => void;
  /** Get help entry for a context */
  getHelp: (contextId: HelpContextId) => { title: string; content: string };
}

const HelpContext = createContext<HelpContextType | undefined>(undefined);

export function HelpProvider({ children }: { children: ReactNode }) {
  const [currentContextId, setCurrentContextId] = useState<HelpContextId | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const setContextFromTabType = useCallback((tabType: string) => {
    const id = getHelpContextForTabType(tabType);
    setCurrentContextId(id);
  }, []);

  const openHelp = useCallback((contextId?: HelpContextId) => {
    if (contextId) {
      setCurrentContextId(contextId);
    }
    setHelpOpen(true);
  }, []);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
  }, []);

  const getHelp = useCallback((contextId: HelpContextId) => {
    return HELP_CONTENT[contextId] ?? HELP_CONTENT.general;
  }, []);

  return (
    <HelpContext.Provider
      value={{
        currentContextId,
        setCurrentContextId,
        setContextFromTabType,
        helpOpen,
        openHelp,
        closeHelp,
        getHelp,
      }}
    >
      {children}
    </HelpContext.Provider>
  );
}

export function useHelp() {
  const ctx = useContext(HelpContext);
  if (!ctx) {
    throw new Error('useHelp must be used within HelpProvider');
  }
  return ctx;
}
