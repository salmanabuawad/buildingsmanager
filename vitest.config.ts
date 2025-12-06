import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Load .env.test if it exists, otherwise fall back to .env
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    test: {
      globals: true,
      environment: 'node',
      setupFiles: ['./tests/setup.ts'],
      testTimeout: 30000,
      hookTimeout: 30000,
      env: {
        // Make environment variables available to tests
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

