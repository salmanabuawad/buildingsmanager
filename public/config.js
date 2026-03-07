// API base URL. Empty = same origin: all requests go to current host /api/... (e.g. http://localhost/api/...).
// The app must be served behind a reverse proxy (e.g. Nginx) that proxies /api to the backend (port 8000).
// Override only when API is on another origin: set window.__APP_CONFIG__.apiBaseUrl before this script, or use set-backend-url.ps1.
//
// License modules (optional): set licenseModules to enable only specific features. Omit for full license.
// Example: licenseModules: { main: true, inspector: true, transfer: true } - enables inspector + transfer
// Modules: main (always required), inspector, distribution, transfer, validation, upload_asset_files
window.__APP_CONFIG__ = window.__APP_CONFIG__ || { apiBaseUrl: '' };
