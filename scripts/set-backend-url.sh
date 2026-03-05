#!/usr/bin/env sh
# Override API base URL for the frontend (default is same origin: /api on current host).
# Run when the API is on a different origin (e.g. Docker entrypoint or systemd).
# Usage: ./scripts/set-backend-url.sh "https://api.example.com"
#        BACKEND_URL=https://api.example.com ./scripts/set-backend-url.sh

BACKEND_URL="${1:-$BACKEND_URL}"
CONFIG_FILE="${CONFIG_FILE:-public/config.js}"

if [ -z "$BACKEND_URL" ]; then
  echo "Usage: $0 <backend_url>   or   BACKEND_URL=<url> $0"
  echo "Example: $0 https://api.myapp.com"
  exit 1
fi

# Remove trailing slash
BACKEND_URL="${BACKEND_URL%/}"

mkdir -p "$(dirname "$CONFIG_FILE")"
printf '%s\n' "window.__APP_CONFIG__ = { apiBaseUrl: \"$BACKEND_URL\" };" > "$CONFIG_FILE"
echo "Wrote $CONFIG_FILE with apiBaseUrl=$BACKEND_URL"
