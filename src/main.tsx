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
  
  if (filename.includes('chmln.js') || filename.includes('messo.min.js') ||
      errorString.includes('chmln') || errorString.includes('messo') ||
      stack.includes('chmln') || stack.includes('messo') ||
      (event.error?.message && (event.error.message.includes('chmln') || event.error.message.includes('messo')))) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
}, true);

// Also suppress unhandled promise rejections from external scripts
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const reasonString = reason && typeof reason === 'object' 
    ? (reason.message || reason.stack || JSON.stringify(reason))
    : String(reason || '');
  const stack = reason?.stack || '';
  
  if (reasonString.includes('chmln') || reasonString.includes('messo') ||
      stack.includes('chmln') || stack.includes('messo')) {
    event.preventDefault();
    event.stopPropagation();
  }
});

// Suppress console errors from external scripts
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const errorString = args.map(arg => String(arg)).join(' ');
  if (errorString.includes('chmln') || errorString.includes('messo')) {
    return; // Suppress the error
  }
  originalConsoleError.apply(console, args);
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
