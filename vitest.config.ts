import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(() => {
  // Load .env.test file for test environment
  // Load all environment variables (including VITE_ prefixed and others like TEST_DB_URL)
  const env = loadEnv('test', process.cwd(), '');
  
  // Extract VITE_ prefixed vars for import.meta.env
  const viteEnv = {
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || '',
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || '',
    VITE_USE_LOCAL_DB: env.VITE_USE_LOCAL_DB || 'false',
    VITE_LOCAL_DB_URL: env.VITE_LOCAL_DB_URL || '',
  };
  
  // Debug: Log if env vars are loaded (remove in production)
  if (!viteEnv.VITE_SUPABASE_URL || !viteEnv.VITE_SUPABASE_ANON_KEY) {
    console.warn('⚠️ Warning: Supabase environment variables not found in .env.test');
  }
  
  return {
    plugins: [react()],
    define: {
      // Make VITE_ prefixed env vars available as import.meta.env in tests
      // Note: These are string replacements done at build time
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(viteEnv.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(viteEnv.VITE_SUPABASE_ANON_KEY),
      'import.meta.env.VITE_USE_LOCAL_DB': JSON.stringify(viteEnv.VITE_USE_LOCAL_DB),
      'import.meta.env.VITE_LOCAL_DB_URL': JSON.stringify(viteEnv.VITE_LOCAL_DB_URL),
      'import.meta.env.MODE': JSON.stringify('test'),
      'import.meta.env.PROD': JSON.stringify(false),
      'import.meta.env.DEV': JSON.stringify(true),
    },
    test: {
      globals: true,
      environment: 'node',
      setupFiles: ['./tests/setup.ts'],
      testTimeout: 30000,
      hookTimeout: 30000,
      env: {
        // Make environment variables available to tests as process.env
        ...env,
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
  };
});

