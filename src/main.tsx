import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import App from './App.tsx';
import './index.css';
import './i18n/i18n';
import { ValidationProvider } from './contexts/ValidationContext';
import { PreferencesProvider } from './contexts/PreferencesContext';

// Suppress external script errors (from browser extensions, dev tools, etc.)
window.addEventListener('error', (event) => {
  if (event.filename && (event.filename.includes('chmln.js') || event.filename.includes('messo.min.js'))) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
}, true);

// Also suppress unhandled promise rejections from external scripts
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && typeof event.reason === 'string' && 
      (event.reason.includes('chmln') || event.reason.includes('messo'))) {
    event.preventDefault();
    event.stopPropagation();
  }
});

ModuleRegistry.registerModules([AllCommunityModule]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <ValidationProvider>
        <App />
      </ValidationProvider>
    </PreferencesProvider>
  </StrictMode>
);
