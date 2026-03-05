#!/usr/bin/env bash
# Restart backend and frontend (stop ports 8000, 80, 81, 82 then start both).
# Use after backend or api client changes so the running app picks up changes.
# Run from repo root: ./scripts/restart-servers.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

echo "Stopping processes on ports 8000, 80, 81, 82..."
for port in 8000 80 81 82; do
  pid=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then kill -9 $pid 2>/dev/null || true; fi
done
sleep 2

echo "Starting backend on http://localhost:8000 ..."
(cd "$BACKEND_DIR" && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
sleep 2

echo "Starting frontend (Vite)..."
cd "$REPO_ROOT"
npm run dev
