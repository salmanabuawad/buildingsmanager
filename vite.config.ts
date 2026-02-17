import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Send all logger output to stdout so PowerShell doesn't treat stderr as NativeCommandError
function stdoutLog(msg: string) {
  process.stdout.write(msg + '\n');
}
const customLogger = {
  hasWarned: false,
  info: stdoutLog,
  warn: stdoutLog,
  warnOnce: stdoutLog,
  error: stdoutLog,
  clearScreen: () => {},
  hasErrorLogged: () => false,
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // API URL for FastAPI backend (Azure: set in build/deploy env)
  const apiUrl = env.VITE_API_URL ?? env.REACT_APP_API_URL ?? '';
  // Support both Vite (VITE_*) and CRA-style (REACT_APP_*) env vars for Supabase (legacy)
  const supabaseUrl = env.VITE_SUPABASE_URL ?? env.REACT_APP_SUPABASE_URL ?? '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY ?? env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? '';

  return {
    customLogger,
    plugins: [react()],
    base: '/',
    optimizeDeps: {
      exclude: ['lucide-react'],
      include: ['xlsx'],
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
  };
});
