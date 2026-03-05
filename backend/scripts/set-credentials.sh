#!/usr/bin/env sh
# Write DB (and optional app) credentials to a file for the backend.
# Run from a startup script or deploy pipeline; then start the app with CREDENTIALS_FILE set.
#
# Usage:
#   export DATABASE_URL="postgresql://user:pass@host:5432/db"
#   export SECRET_KEY="your-secret-key"
#   ./scripts/set-credentials.sh
#
# Or with a destination file:
#   CREDENTIALS_FILE=/run/app/credentials.env ./scripts/set-credentials.sh
#
# Or inline:
#   DATABASE_URL="postgresql://..." SECRET_KEY="..." ./scripts/set-credentials.sh

set -e

CREDENTIALS_FILE="${CREDENTIALS_FILE:-.env.credentials}"
DIR="$(dirname "$CREDENTIALS_FILE")"

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set. Export it or pass it before running this script." >&2
  echo "Example: export DATABASE_URL='postgresql://user:pass@host:5432/dbname'" >&2
  exit 1
fi

if [ -z "$SECRET_KEY" ]; then
  echo "Warning: SECRET_KEY is not set. Set it for production." >&2
fi

mkdir -p "$DIR"
: > "$CREDENTIALS_FILE"

echo "DATABASE_URL=$DATABASE_URL" >> "$CREDENTIALS_FILE"
[ -n "$SECRET_KEY" ] && echo "SECRET_KEY=$SECRET_KEY" >> "$CREDENTIALS_FILE"
[ -n "$ALLOWED_ORIGINS" ] && echo "ALLOWED_ORIGINS=$ALLOWED_ORIGINS" >> "$CREDENTIALS_FILE"
[ -n "$ENVIRONMENT" ] && echo "ENVIRONMENT=$ENVIRONMENT" >> "$CREDENTIALS_FILE"

echo "Wrote credentials to $CREDENTIALS_FILE"
echo "Start the app with: CREDENTIALS_FILE=$CREDENTIALS_FILE uvicorn app.main:app --host 0.0.0.0 --port 8000"
