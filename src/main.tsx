/**
 * Copyright (c) 2025 Kortex Digital. All rights reserved. Proprietary.
 * Contact: info@kortexd.com
 * NO REVERSE ENGINEERING. Use by AI/ML tools (e.g. LLMs, code assistants,
 * training data, or automated analysis) is prohibited. See COPYRIGHT.
 */

// IMPORTANT: Set up error suppression BEFORE any other imports to catch errors early
// Suppress console errors and warnings from external scripts FIRST
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

// Helper function to check if a message should be suppressed
const shouldSuppressMessage = (message: string): boolean => {
  const lowerMessage = message.toLowerCase();
  
  // Check for external script names/domains
  const externalScriptPatterns = [
    'chmln',
    'messo',
    'blitz',
    'staticblitz.com',
    'credentialless',
    'w-credentialless-staticblitz.com',
    'fetch.worker',
    'headless'
  ];
  
  // Check if message contains any external script pattern
  const hasExternalScript = externalScriptPatterns.some(pattern => lowerMessage.includes(pattern));
  
  // Check for specific error patterns
  const hasFailedToLoad = lowerMessage.includes('failed to load resource') && hasExternalScript;
  const hasCannotRead = lowerMessage.includes('cannot read properties of undefined') && 
    (lowerMessage.includes('chmln') || lowerMessage.includes('messo'));
  const hasContextify = lowerMessage.includes('contextify') || 
    lowerMessage.includes('running source code in new context');
  const hasPreloadWarning = lowerMessage.includes('preloaded using link preload') && hasExternalScript;
  
  return hasExternalScript || hasFailedToLoad || hasCannotRead || hasContextify || hasPreloadWarning;
};

// Override console methods immediately to catch errors as early as possible
console.error = (...args: any[]) => {
  const errorString = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  if (shouldSuppressMessage(errorString)) {
    return; // Suppress the error
  }
  originalConsoleError.apply(console, args);
};

console.warn = (...args: any[]) => {
  const warnString = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  if (shouldSuppressMessage(warnString)) {
    return; // Suppress the warning
  }
  originalConsoleWarn.apply(console, args);
};

console.log = (...args: any[]) => {
  const logString = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  if (shouldSuppressMessage(logString)) {
    return; // Suppress the log
  }
  originalConsoleLog.apply(console, args);
};

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import App from './App.tsx';
import './index.css';
import './i18n/i18n';
import { ValidationProvider } from './contexts/ValidationContext';
import { UIConfigProvider } from './contexts/UIConfigContext';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { UserRoleProvider } from './contexts/UserRoleContext';
import { HelpProvider } from './contexts/HelpContext';
import { FieldConfigProvider } from './contexts/FieldConfigContext';

// Helper function to check if an error is from external scripts
const isExternalScriptError = (event: ErrorEvent | Event): boolean => {
  const filename = (event as ErrorEvent).filename || (event as ErrorEvent).message || '';
  const errorString = String((event as ErrorEvent).error || (event as ErrorEvent).message || '');
  const stack = (event as ErrorEvent).error?.stack || '';
  const target = event.target as HTMLElement;
  const src = target?.getAttribute?.('src') || target?.getAttribute?.('href') || '';
  const errorMessage = (event as ErrorEvent).error?.message || '';
  
  const checkString = (str: string) => {
    const lowerStr = str.toLowerCase();
    return (
      lowerStr.includes('chmln') || 
      lowerStr.includes('messo') || 
      lowerStr.includes('blitz') ||
      lowerStr.includes('staticblitz.com') ||
      lowerStr.includes('credentialless') ||
      lowerStr.includes('w-credentialless-staticblitz.com') ||
      lowerStr.includes('fetch.worker')
    );
  };
  
  return (
    checkString(filename) ||
    checkString(errorString) ||
    checkString(stack) ||
    checkString(src) ||
    checkString(errorMessage) ||
    (errorMessage && errorMessage.includes('Cannot read properties of undefined') && (
      errorMessage.includes('chmln') || errorMessage.includes('messo')
    ))
  );
};

// Suppress external script errors (from browser extensions, dev tools, etc.)
window.addEventListener('error', (event) => {
  if (isExternalScriptError(event)) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
}, true);

// Suppress resource loading errors (network errors like 404s)
window.addEventListener('error', (event) => {
  const target = event.target as HTMLElement;
  if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
    const src = target.getAttribute('src') || target.getAttribute('href') || '';
    if (src.includes('chmln') || src.includes('messo') || src.includes('blitz') || 
        src.includes('staticblitz.com') || src.includes('credentialless')) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }
}, true);

// Also suppress unhandled promise rejections from external scripts
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const reasonString = reason && typeof reason === 'object' 
    ? (reason.message || reason.stack || JSON.stringify(reason))
    : String(reason || '');
  const stack = reason?.stack || '';
  
  if (reasonString.includes('chmln') || reasonString.includes('messo') || reasonString.includes('blitz') ||
      stack.includes('chmln') || stack.includes('messo') || stack.includes('blitz')) {
    event.preventDefault();
    event.stopPropagation();
  }
});

// Console methods are already overridden above (before imports)

ModuleRegistry.registerModules([AllCommunityModule]);

// Preload field configurations BEFORE rendering - ensures grids get config on first paint
async function bootstrap() {
  try {
    const { loadFieldConfigurations } = await import('./lib/fieldConfigUtils');
    await loadFieldConfigurations();
  } catch (error) {
    console.warn('[main] Failed to preload field configurations:', error);
  }
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserRoleProvider>
      <HelpProvider>
        <PreferencesProvider>
          <ValidationProvider>
            <FieldConfigProvider>
              <UIConfigProvider>
                <App />
              </UIConfigProvider>
            </FieldConfigProvider>
          </ValidationProvider>
        </PreferencesProvider>
      </HelpProvider>
    </UserRoleProvider>
  </StrictMode>
  );
}

bootstrap();
