import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env.VITE_API_BASE_URL ?? ''; // '' = same origin in the app
  const backendUrl = env.VITE_API_BASE_URL || 'http://localhost:8000'; // dev server proxy target only

  const copyrightBanner =
    '/* Copyright (c) 2025 Kortex Digital. All rights reserved. Proprietary. NO REVERSE ENGINEERING. Use by AI/ML tools prohibited. See COPYRIGHT. */';

  return {
    plugins: [react()],
    base: '/',
    build: {
      rollupOptions: {
        output: {
          banner: copyrightBanner,
        },
      },
    },
    server: {
      port: 80,
      host: true,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/storage': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 80,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/storage': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
      include: ['xlsx'],
    },
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl),
    },
  };
});
