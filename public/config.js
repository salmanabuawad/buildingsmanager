// API base URL. Empty = same origin: requests go to current host /api/...
// Server must proxy /api to the backend (e.g. Nginx → FastAPI on port 8000).
// Override when API is on another origin: set apiBaseUrl to that origin (no trailing slash).
window.__APP_CONFIG__ = window.__APP_CONFIG__ || { apiBaseUrl: '' };
