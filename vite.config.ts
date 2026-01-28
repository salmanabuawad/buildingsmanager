import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Support both Vite (VITE_*) and CRA-style (REACT_APP_*) env vars for Supabase
  const supabaseUrl = env.VITE_SUPABASE_URL ?? env.REACT_APP_SUPABASE_URL ?? '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY ?? env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? '';

  return {
    plugins: [react()],
    base: '/', // App is deployed at root: https://buildingmanager.bolt.host/
    optimizeDeps: {
      exclude: ['lucide-react'],
      include: ['xlsx'],
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
  };
});
