#!/usr/bin/env bash
# Start local stack for development: backend (FastAPI) + frontend (Vite).
# Prerequisites: Postgres running, DB created (./scripts/setup_local.sh), backend/.env with DATABASE_URL.
# Run from repo root: ./scripts/start-servers.sh
# After backend or api client changes: ./scripts/restart-servers.sh to restart both.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

echo "Starting local dev stack (backend + frontend)..."
echo ""

if [ ! -f "$BACKEND_DIR/app/main.py" ]; then
  echo "Backend not found at $BACKEND_DIR. Run from repo root."
  exit 1
fi

echo "Starting FastAPI backend on http://localhost:8000 ..."
(cd "$BACKEND_DIR" && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID — Docs: http://localhost:8000/docs"
echo ""

# Allow backend to bind
sleep 2

echo "Starting Vite frontend (proxy /api -> http://localhost:8000)..."
cd "$REPO_ROOT"
npm run dev

# When frontend exits, kill backend
kill $BACKEND_PID 2>/dev/null || true
