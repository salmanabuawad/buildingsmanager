/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'app-accent': '#2E62A2',
        'app-accent-hover': '#255a96',
        'app-accent-active': '#1e528a',
        'app-header': '#2E62A2',
        'app-input-border': '#94a3b8',
        'app-destructive': '#dc2626',
        'app-bg': '#f8fafc',
        'app-text-primary': '#1e293b',
        'app-text-muted': '#64748b',
      },
    },
  },
  plugins: [],
};
