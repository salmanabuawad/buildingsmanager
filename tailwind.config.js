/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* theme_1 palette - reference UI (layout, buttons, sidebar, icons) */
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
        /* Theme-aware: ocean | mist. RGB vars enable opacity modifiers */
        'theme': {
          header: 'rgb(var(--theme-header))',
          'header-border': 'rgb(var(--theme-header-border))',
          sidebar: 'rgb(var(--theme-sidebar))',
          'sidebar-hover': 'rgb(var(--theme-sidebar-hover))',
          'sidebar-active': 'rgb(var(--theme-sidebar-active))',
          'sidebar-active-stripe': 'rgb(var(--theme-sidebar-active-stripe))',
          'tab-active': 'rgb(var(--theme-tab-active) / <alpha-value>)',
          'tab-active-hover': 'rgb(var(--theme-tab-active-hover))',
          'tab-active-active': 'rgb(var(--theme-tab-active-active))',
          'nav-bg': 'rgb(var(--theme-nav-bg))',
          'tab-inactive': 'rgb(var(--theme-tab-inactive))',
          'action-accent': 'rgb(var(--theme-action-accent) / <alpha-value>)',
          'action-accent-hover': 'rgb(var(--theme-action-accent-hover))',
          'action-accent-active': 'rgb(var(--theme-action-accent-active))',
          'table-header': 'rgb(var(--theme-table-header))',
          highlight: 'rgb(var(--theme-highlight) / <alpha-value>)',
          content: 'rgb(var(--theme-content))',
          link: 'rgb(var(--theme-link) / <alpha-value>)',
          'link-hover': 'rgb(var(--theme-link-hover))',
          'text-primary': 'rgb(var(--theme-text-primary))',
          'text-muted': 'rgb(var(--theme-text-muted))',
          'card-border': 'rgb(var(--theme-card-border) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      fontSize: {
        'theme-base': ['var(--theme-font-size-base)', { lineHeight: '1.5' }],
        'theme-sm': ['var(--theme-font-size-sm)', { lineHeight: '1.4' }],
        'theme-xs': ['var(--theme-font-size-xs)', { lineHeight: '1.3' }],
      },
      width: {
        'theme-sidebar': 'var(--theme-sidebar-width)',
      },
      minWidth: {
        'theme-sidebar': 'var(--theme-sidebar-width)',
      },
      borderRadius: {
        'theme-btn': 'var(--theme-btn-radius)',
      },
      spacing: {
        'theme-icon': 'var(--theme-icon-size)',
      },
    },
  },
  plugins: [],
};
