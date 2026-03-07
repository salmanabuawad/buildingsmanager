#!/bin/bash
# Backend startup script. DB credentials can be provided by this script or by CREDENTIALS_FILE.
#
# Option A: Write credentials file, then start (recommended for containers)
#   export DATABASE_URL="postgresql://user:pass@host:5432/db"
#   export SECRET_KEY="your-secret"
#   ./scripts/set-credentials.sh
#   export CREDENTIALS_FILE="${CREDENTIALS_FILE:-.env.credentials}"
#
# Option B: Export vars and start (e.g. sourced from a secret manager)
#   export DATABASE_URL="..." SECRET_KEY="..."
#
echo "Starting AssetFlow API..."

# Install dependencies if needed
pip install -r requirements.txt

# Run database migrations (if using Alembic)
# alembic upgrade head

# Start Uvicorn server (credentials from CREDENTIALS_FILE or env)
exec gunicorn app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
