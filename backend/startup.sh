#!/bin/bash

# Startup script for FastAPI

echo "Starting AssetFlow API..."

# Install dependencies if needed
pip install -r requirements.txt

# Run database migrations (if using Alembic)
# alembic upgrade head

# Start Uvicorn server
gunicorn app.main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
