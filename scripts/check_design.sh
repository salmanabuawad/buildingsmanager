#!/bin/bash
# Design compliance checks for buildingsmanager
# Run: ./scripts/check_design.sh
# Exit 0 = pass, non-zero = violations found

cd "$(dirname "$0")/.."
ErrorCount=0

echo "=== Design compliance checks ==="

# 1. No db_rpc imports outside base_repo and db_rpc itself
echo ""
echo "[1] Checking db_rpc imports (only base_repo/db_rpc allowed)..."
violations=$(grep -rE "^\s*(from app\.db_rpc|import db_rpc)" backend/app --include="*.py" 2>/dev/null | grep -v "base_repo\.py\|db_rpc\.py" || true)
if [ -n "$violations" ]; then
  echo "$violations"
  ErrorCount=$((ErrorCount + 1))
else
  echo "  OK"
fi

# 2. No CREATE FUNCTION / TRIGGER in NEW migrations (after 20260251000000)
echo ""
echo "[2] Checking new migrations (no functions/triggers)..."
violations=$(find migrations -name "*.sql" 2>/dev/null | while read f; do
  bn=$(basename "$f" .sql)
  ts=$(echo "$bn" | grep -oE '^[0-9]{14}')
  if [ -n "$ts" ] && [ "$ts" -gt 20260251000000 ]; then
    grep -lE "CREATE (FUNCTION|TRIGGER|OR REPLACE FUNCTION)" "$f" 2>/dev/null
  fi
done)
if [ -n "$violations" ]; then
  echo "$violations"
  ErrorCount=$((ErrorCount + 1))
else
  echo "  OK"
fi

# 3. No direct db.execute(text) outside repos (use repo pattern)
echo ""
echo "[3] Checking no direct raw SQL outside repos..."
violations=$(grep -rE "db\.execute\s*\(\s*text\s*\(" backend/app --include="*.py" 2>/dev/null | grep -v "repos/" || true)
if [ -n "$violations" ]; then
  echo "$violations"
  ErrorCount=$((ErrorCount + 1))
else
  echo "  OK"
fi

# 4. Backend imports
echo ""
echo "[4] Verifying backend imports..."
if (cd backend && python -c "from app.main import app; print('OK')" 2>/dev/null); then
  echo "  OK"
else
  ErrorCount=$((ErrorCount + 1))
fi

echo ""
echo "=== Done ==="
echo "Design rule: No direct DB access - use repos. See .cursor/rules/no-direct-db-use-repos.mdc"
[ $ErrorCount -gt 0 ] && exit 1
exit 0
