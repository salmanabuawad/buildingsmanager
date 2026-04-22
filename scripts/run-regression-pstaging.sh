#!/usr/bin/env bash
# Run the full Playwright regression against pstaging.wavelync.com.
#
# Usage:
#   bash scripts/run-regression-pstaging.sh
#   bash scripts/run-regression-pstaging.sh --headed
#   bash scripts/run-regression-pstaging.sh --grep '24\.'
#   TEST_USER_NAME=other TEST_PASSWORD=xxx bash scripts/run-regression-pstaging.sh
#
# Requires: Node 20+, npm. First run installs deps + Playwright chromium.

set -e
cd "$(dirname "$0")/.."

: "${TEST_BASE_URL:=https://pstaging.wavelync.com/}"
: "${TEST_USER_NAME:=regression_tester}"
: "${TEST_PASSWORD:=RegressionTester2026!}"

# parse flags
HEADLESS="true"
GREP_ARG=""
CHANNEL_ARG=""
SLOWMO_MS="2000"
WORKERS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --headed) HEADLESS="false"; shift ;;
    --grep) GREP_ARG="$2"; shift 2 ;;
    --channel) CHANNEL_ARG="$2"; shift 2 ;;
    --slowmo) SLOWMO_MS="$2"; shift 2 ;;
    --workers) WORKERS="$2"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

# First-run bootstrap
if [ ! -d node_modules/@playwright ]; then
  echo "[1/2] Installing dependencies (npm ci)..."
  npm ci --no-audit --no-fund >/dev/null
fi
if [ ! -d "$HOME/.cache/ms-playwright" ] && [ ! -d "$HOME/Library/Caches/ms-playwright" ] && [ ! -d "$LOCALAPPDATA/ms-playwright" ]; then
  echo "[2/2] Installing Playwright chromium (one-time, ~140 MB)..."
  npx playwright install chromium
fi

export TEST_BASE_URL TEST_USER_NAME TEST_PASSWORD
export HEADLESS="$HEADLESS"
export CI=1

if [ "$HEADLESS" = "false" ]; then
  # System Chrome/Edge side-steps SxS failures on some Windows laptops.
  export PW_CHANNEL="${CHANNEL_ARG:-chrome}"
  export PW_SLOWMO_MS="$SLOWMO_MS"
fi

# Default: 1 worker headed (one window to watch), 2 worker headless.
if [ -z "$WORKERS" ]; then
  if [ "$HEADLESS" = "false" ]; then WORKERS=1; else WORKERS=2; fi
fi

EXTRA=""
if [ "$HEADLESS" = "false" ]; then EXTRA="$EXTRA --retries=0"; fi
if [ -n "$GREP_ARG" ]; then EXTRA="$EXTRA --grep $GREP_ARG"; fi

echo ""
echo "Running regression against $TEST_BASE_URL"
echo "User: $TEST_USER_NAME"
echo ""

npx playwright test --project=pstaging --reporter=list --workers=$WORKERS $EXTRA
rc=$?

echo ""
if [ "$rc" -eq 0 ]; then
  echo "Regression passed. Open HTML report: npx playwright show-report"
else
  echo "Regression failed. Open HTML report for traces/screenshots: npx playwright show-report"
fi
exit $rc
