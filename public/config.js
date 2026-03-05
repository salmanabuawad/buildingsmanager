// API base URL. Empty = same origin: all requests go to current host /api/... (e.g. http://localhost/api/...).
// The app must be served behind a reverse proxy (e.g. Nginx) that proxies /api to the backend (port 8000).
// Override only when API is on another origin: set window.__APP_CONFIG__.apiBaseUrl before this script, or use set-backend-url.ps1.
window.__APP_CONFIG__ = window.__APP_CONFIG__ || { apiBaseUrl: '' };
