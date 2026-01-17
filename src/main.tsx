import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import App from './App.tsx';
import './index.css';
import './i18n/i18n';
import { ValidationProvider } from './contexts/ValidationContext';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { UserRoleProvider } from './contexts/UserRoleContext';

// Suppress external script errors (from browser extensions, dev tools, etc.)
window.addEventListener('error', (event) => {
  const filename = event.filename || event.message || '';
  const errorString = String(event.error || event.message || '');
  const stack = event.error?.stack || '';
  const target = event.target as HTMLElement;
  const src = target?.getAttribute?.('src') || target?.getAttribute?.('href') || '';
  
  // Check for external scripts (chmln, messo, blitz, etc.)
  const isExternalScript = 
    filename.includes('chmln.js') || filename.includes('messo.min.js') || filename.includes('blitz') ||
    errorString.includes('chmln') || errorString.includes('messo') || errorString.includes('blitz') ||
    stack.includes('chmln') || stack.includes('messo') || stack.includes('blitz') ||
    src.includes('chmln') || src.includes('messo') || src.includes('blitz') ||
    (event.error?.message && (
      event.error.message.includes('chmln') || 
      event.error.message.includes('messo') || 
      event.error.message.includes('blitz')
    ));
  
  if (isExternalScript) {
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

// Suppress console errors and warnings from external scripts
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args: any[]) => {
  const errorString = args.map(arg => String(arg)).join(' ');
  if (errorString.includes('chmln') || errorString.includes('messo') || errorString.includes('blitz') ||
      errorString.includes('Failed to load resource') && (errorString.includes('messo') || errorString.includes('chmln'))) {
    return; // Suppress the error
  }
  originalConsoleError.apply(console, args);
};

console.warn = (...args: any[]) => {
  const warnString = args.map(arg => String(arg)).join(' ');
  if (warnString.includes('chmln') || warnString.includes('messo') || warnString.includes('blitz') ||
      warnString.includes('Contextify') || warnString.includes('preloaded using link preload')) {
    return; // Suppress the warning
  }
  originalConsoleWarn.apply(console, args);
};

ModuleRegistry.registerModules([AllCommunityModule]);

// Preload field configurations on application startup and persist in memory
import('./lib/fieldConfigUtils').then(({ loadFieldConfigurations }) => {
  loadFieldConfigurations()
    .then(() => {
      console.log('[main] Field configurations preloaded and cached in memory');
    })
    .catch(error => {
      console.warn('[main] Failed to preload field configurations:', error);
    });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserRoleProvider>
      <PreferencesProvider>
        <ValidationProvider>
          <App />
        </ValidationProvider>
      </PreferencesProvider>
    </UserRoleProvider>
  </StrictMode>
);
