import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import App from './App.tsx';
import './index.css';
import './i18n/i18n';
import { ValidationProvider } from './contexts/ValidationContext';

// Suppress external script errors (from browser extensions, dev tools, etc.)
window.addEventListener('error', (event) => {
  if (event.filename && (event.filename.includes('chmln.js') || event.filename.includes('messo.min.js'))) {
    event.preventDefault();
    return true;
  }
}, true);

ModuleRegistry.registerModules([AllCommunityModule]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ValidationProvider>
      <App />
    </ValidationProvider>
  </StrictMode>
);
