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
  // FastAPI backend on Azure. Set VITE_API_URL in GitHub Actions / deploy if different.
  const apiUrl = env.VITE_API_URL ?? env.REACT_APP_API_URL ?? 'https://buildingsmanager-api.azurewebsites.net/api';

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
    },
  };
});
