#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# run-tests.sh — Execute Playwright tests and collect the HTML report
#
# Usage:  bash run-tests.sh <RUN_ID> <REPORT_DEST>
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

RUN_ID="${1:?Missing RUN_ID}"
REPORT_DEST="${2:?Missing REPORT_DEST}"

echo "▶  Starting Playwright tests for $RUN_ID …"

# Ensure we're in the e2e project directory
cd "$(dirname "$0")/../e2e"

# Run playwright tests (exit code 1 = test failures, not a script error)
npx playwright test \
  --reporter=html,json \
  || true   # don't abort — we still need to collect the report

echo "▶  Copying HTML report to $REPORT_DEST …"
mkdir -p "$REPORT_DEST"

# Playwright writes HTML report to reports/html/ (configured in playwright.config.ts)
if [ -d "reports/html" ]; then
  cp -r reports/html/* "$REPORT_DEST/"
  echo "✓  HTML report copied."
else
  echo "⚠  No HTML report directory found at reports/html/"
fi

echo "▶  Done — $RUN_ID"
