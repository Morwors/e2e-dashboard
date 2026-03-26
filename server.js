/**
 * TicketSeat E2E Dashboard — Express Server
 *
 * Serves the dashboard UI, stores run metadata in a JSON file,
 * triggers Playwright test runs, and serves generated HTML reports.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Paths ────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');

// Ensure data directories exist
fs.mkdirSync(REPORTS_DIR, { recursive: true });
if (!fs.existsSync(RUNS_FILE)) {
  fs.writeFileSync(RUNS_FILE, JSON.stringify([], null, 2));
}

// ── Middleware ────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve Playwright HTML reports (per-run) — BEFORE the dashboard static
// so /reports/* is never caught by the SPA catch-all
app.use('/reports', express.static(REPORTS_DIR, {
  index: 'index.html',
  fallthrough: false,   // return 404 instead of falling through to next middleware
}));

// Serve dashboard frontend
app.use(express.static(path.join(__dirname, 'public')));

// ── State ────────────────────────────────────────────────────────────
let currentStatus = 'idle';   // 'idle' | 'running'
let currentRunId = null;

// ── Helpers ──────────────────────────────────────────────────────────

/** Read all runs from disk */
function readRuns() {
  try {
    return JSON.parse(fs.readFileSync(RUNS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

/** Persist runs array to disk */
function writeRuns(runs) {
  fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2));
}

/** Update a single run by id */
function updateRun(id, patch) {
  const runs = readRuns();
  const idx = runs.findIndex(r => r.id === id);
  if (idx !== -1) {
    runs[idx] = { ...runs[idx], ...patch };
    writeRuns(runs);
  }
}

// ── API Routes ───────────────────────────────────────────────────────

/**
 * GET /api/runs — List all test runs (newest first)
 */
app.get('/api/runs', (_req, res) => {
  const runs = readRuns().sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  res.json(runs);
});

/**
 * GET /api/runs/:id — Get details of a specific run
 */
app.get('/api/runs/:id', (req, res) => {
  const run = readRuns().find(r => r.id === req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

/**
 * GET /api/status — Current server status
 */
app.get('/api/status', (_req, res) => {
  res.json({ status: currentStatus, runId: currentRunId });
});

/**
 * POST /api/runs/trigger — Trigger a new test run
 */
app.post('/api/runs/trigger', (_req, res) => {
  if (currentStatus === 'running') {
    return res.status(409).json({ error: 'A run is already in progress', runId: currentRunId });
  }

  const runId = `run-${Date.now()}`;
  const timestamp = new Date().toISOString();

  // Create run entry
  const run = {
    id: runId,
    timestamp,
    status: 'running',
    duration: null,
    projects: {},
    total: { passed: 0, failed: 0, skipped: 0 },
    reportPath: `/reports/${runId}/index.html`,
  };

  const runs = readRuns();
  runs.push(run);
  writeRuns(runs);

  currentStatus = 'running';
  currentRunId = runId;

  // Spawn the test runner script in the background
  const startTime = Date.now();
  const script = path.join(__dirname, 'scripts', 'run-tests.sh');
  const reportDest = path.join(REPORTS_DIR, runId);

  const child = spawn('bash', [script, runId, reportDest], {
    cwd: path.join(__dirname, 'e2e'),
    env: { ...process.env, RUN_ID: runId, REPORT_DEST: reportDest },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => (stdout += d.toString()));
  child.stderr.on('data', d => (stderr += d.toString()));

  child.on('close', (code) => {
    const duration = Date.now() - startTime;
    let patch = { duration };

    try {
      // Try to parse JSON results from the reporter output
      const resultsPath = path.join(__dirname, 'e2e', 'reports', 'results.json');
      if (fs.existsSync(resultsPath)) {
        const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
        const projects = {};
        let totalPassed = 0, totalFailed = 0, totalSkipped = 0;

        // Walk suites to aggregate per-project stats
        for (const suite of results.suites || []) {
          const projectName = extractProjectName(suite, results);
          if (!projects[projectName]) {
            projects[projectName] = { passed: 0, failed: 0, skipped: 0 };
          }
          countResults(suite, projects[projectName]);
        }

        // Also try a flat specs approach (Playwright JSON reporter v2)
        if (Object.keys(projects).length === 0 && results.suites) {
          flatCount(results.suites, projects);
        }

        for (const p of Object.values(projects)) {
          totalPassed += p.passed;
          totalFailed += p.failed;
          totalSkipped += p.skipped;
        }

        patch.projects = projects;
        patch.total = { passed: totalPassed, failed: totalFailed, skipped: totalSkipped };
        patch.status = totalFailed > 0 ? 'failed' : 'passed';
      } else {
        // No results file — mark based on exit code
        patch.status = code === 0 ? 'passed' : 'failed';
        patch.total = { passed: 0, failed: 0, skipped: 0 };
      }
    } catch (err) {
      console.error('Error parsing results:', err);
      patch.status = 'error';
      patch.error = err.message;
    }

    updateRun(runId, patch);
    currentStatus = 'idle';
    currentRunId = null;
    console.log(`Run ${runId} finished — ${patch.status} in ${duration}ms`);
    if (stderr) console.error(`[${runId} stderr]`, stderr.slice(0, 2000));
  });

  res.status(202).json({ runId, status: 'running' });
});

// ── Result parsing helpers ───────────────────────────────────────────

function extractProjectName(suite) {
  // Top-level suite title is usually the project name
  return suite.title || 'unknown';
}

function countResults(suite, acc) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const status = test.status || (test.results && test.results.length > 0
        ? test.results[test.results.length - 1].status : 'skipped');
      if (status === 'expected' || status === 'passed') acc.passed++;
      else if (status === 'skipped') acc.skipped++;
      else acc.failed++;
    }
  }
  for (const child of suite.suites || []) {
    countResults(child, acc);
  }
}

function flatCount(suites, projects) {
  for (const suite of suites) {
    const name = suite.title || 'unknown';
    if (!projects[name]) projects[name] = { passed: 0, failed: 0, skipped: 0 };
    countResults(suite, projects[name]);
    // Recurse into nested suites if they look like projects
    if (suite.suites && suite.suites.length > 0) {
      for (const child of suite.suites) {
        const childName = child.title || name;
        if (!projects[childName]) projects[childName] = { passed: 0, failed: 0, skipped: 0 };
        countResults(child, projects[childName]);
      }
    }
  }
}

// ── Catch-all: serve index.html for SPA (only non-API, non-report routes) ─
app.get('*', (req, res) => {
  // Don't serve index.html for /reports/* — those should 404 if not found
  if (req.path.startsWith('/reports/')) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ E2E Dashboard running on http://0.0.0.0:${PORT}`);
});
