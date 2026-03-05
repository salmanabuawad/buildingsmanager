/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Reference palette - exact match to styling images */
        'app-header': '#2E62A2',
        'app-sidebar': '#2F4D52',
        'app-sidebar-hover': '#3D6971',
        'app-sidebar-active': '#3D6971',
        'app-sidebar-indicator': '#66CCFF',
        'app-favorite': '#6BBF56',
        'app-accent': '#2196F3',
        'app-accent-hover': '#1976D2',
        'app-accent-active': '#1565C0',
        'app-destructive': '#F44336',
        'app-tabs-bg': '#E8EDF1',
        'app-bg': '#F7F9FA',
        'app-panel': '#F0F0F0',
        'app-input-border': '#CED4DA',
        'app-text-primary': '#333333',
        'app-text-muted': '#6C757D',
      },
    },
  },
  plugins: [],
};
