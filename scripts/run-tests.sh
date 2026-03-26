#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# run-tests.sh — Execute Playwright tests and collect the HTML report
#
# Usage:  bash run-tests.sh <RUN_ID> <REPORT_DEST>
# ──────────────────────────────────────────────────────────────────────
set -uo pipefail

RUN_ID="${1:?Missing RUN_ID}"
REPORT_DEST="${2:?Missing REPORT_DEST}"

echo "▶  Starting Playwright tests for $RUN_ID …"

# Ensure we're in the e2e project directory
cd "$(dirname "$0")/../e2e"

# Clean old reports to avoid stale data
rm -rf playwright-report/ reports/html/ reports/results.json test-results/

# Run playwright tests using config file reporters (html + json + list)
# The config writes html to reports/html/ and json to reports/results.json
npx playwright test || true   # exit code 1 = test failures, not a script error

echo "▶  Copying HTML report to $REPORT_DEST …"
mkdir -p "$REPORT_DEST"

# Check multiple possible locations for the HTML report
FOUND_REPORT=0
for REPORT_SRC in "reports/html" "playwright-report"; do
  if [ -d "$REPORT_SRC" ] && [ -f "$REPORT_SRC/index.html" ]; then
    cp -r "$REPORT_SRC"/* "$REPORT_DEST/"
    echo "✓  HTML report copied from $REPORT_SRC"
    FOUND_REPORT=1
    break
  fi
done

if [ "$FOUND_REPORT" = "0" ]; then
  echo "⚠  No HTML report found. Creating placeholder."
  echo "<html><body><h1>No report generated</h1><p>Playwright may have failed to start.</p></body></html>" > "$REPORT_DEST/index.html"
fi

# Debug: show what files exist
echo "▶  Report directory contents:"
ls -la "$REPORT_DEST/" | head -10

echo "▶  Done — $RUN_ID"
