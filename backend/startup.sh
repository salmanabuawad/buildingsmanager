#!/bin/bash
# Azure App Service: run from site root; PYTHONPATH so gunicorn finds uvicorn from .python_packages
ROOT=/home/site/wwwroot
cd "$ROOT" 2>/dev/null || true
export PYTHONPATH="$ROOT/.python_packages"
exec gunicorn app.main:app --workers 1 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 120 --graceful-timeout 30
