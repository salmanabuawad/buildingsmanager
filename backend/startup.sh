#!/bin/bash
# Azure App Service: run from site root so "app" package is found
cd /home/site/wwwroot 2>/dev/null || true
exec gunicorn app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
