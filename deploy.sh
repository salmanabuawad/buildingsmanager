#!/usr/bin/env bash
# Optional: build frontend and deploy to Nginx. Application is NOT deployed by default (use npm run dev + backend).
# Stack: Frontend (Vite) + FastAPI + Postgres; Nginx is optional for production-like serving.
# Run from repo root: ./deploy.sh

set -e

echo "Optional: build + deploy to Nginx (app is not deployed by default)"
echo "=================================================================="
echo ""

echo "Building frontend..."
npm run build
echo "Build completed."
echo ""

echo "Deploy to Nginx: ./nginx/deploy-frontend.sh"
echo "Optional: WEB_ROOT=/var/www/buildingsmanager ./nginx/deploy-frontend.sh"
echo ""

read -p "Run nginx deploy now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  ./nginx/deploy-frontend.sh
fi

echo ""
echo "Ensure backend is running: cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
echo "Then open http://localhost/ (Nginx) or use npm run dev for dev server."
