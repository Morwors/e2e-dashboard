/**
 * TicketSeat E2E Dashboard — Frontend Application
 *
 * Pure vanilla JS — no frameworks, no build step.
 * Fetches run data from the Express API and renders everything.
 */

// ── API helpers ──────────────────────────────────────────────────────

const API = '';  // Same origin

async function fetchRuns() {
  const res = await fetch(`${API}/api/runs`);
  return res.json();
}

async function fetchStatus() {
  const res = await fetch(`${API}/api/status`);
  return res.json();
}

async function triggerRunAPI() {
  const res = await fetch(`${API}/api/runs/trigger`, { method: 'POST' });
  return res.json();
}

// ── State ────────────────────────────────────────────────────────────

let runs = [];
let serverStatus = { status: 'idle', runId: null };
let pollInterval = null;

// ── DOM refs ─────────────────────────────────────────────────────────

const $statTotal  = document.getElementById('stat-total');
const $statRate   = document.getElementById('stat-rate');
const $statLast   = document.getElementById('stat-last');
const $statStatus = document.getElementById('stat-status');
const $statusDot  = document.getElementById('status-dot-inner');
const $statusPing = document.getElementById('status-ping');
const $btnRun     = document.getElementById('btn-run');
const $btnText    = document.getElementById('btn-run-text');
const $iconPlay   = document.getElementById('icon-play');
const $iconSpin   = document.getElementById('icon-spinner');
const $tbody      = document.getElementById('runs-tbody');
const $emptyState = document.getElementById('empty-state');
const $tableWrap  = document.getElementById('table-wrap');
const $mobileCards = document.getElementById('mobile-cards');

// ── Trigger a test run ───────────────────────────────────────────────

async function triggerRun() {
  if (serverStatus.status === 'running') return;
  try {
    setRunning(true);
    await triggerRunAPI();
    startPolling();
  } catch (err) {
    console.error('Failed to trigger run:', err);
    setRunning(false);
  }
}

// Expose to HTML onclick
window.triggerRun = triggerRun;

// ── Polling ──────────────────────────────────────────────────────────

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    await refresh();
    if (serverStatus.status === 'idle') {
      stopPolling();
    }
  }, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ── Refresh all data ─────────────────────────────────────────────────

async function refresh() {
  try {
    [runs, serverStatus] = await Promise.all([fetchRuns(), fetchStatus()]);
    renderStats();
    renderTable();
    renderChart();
    setRunning(serverStatus.status === 'running');
  } catch (err) {
    console.error('Refresh error:', err);
  }
}

// ── UI: Running state ────────────────────────────────────────────────

function setRunning(running) {
  $btnRun.disabled = running;
  $iconPlay.classList.toggle('hidden', running);
  $iconSpin.classList.toggle('hidden', !running);
  $btnText.textContent = running ? 'Running…' : 'Run Tests';

  if (running) {
    $statusDot.className = 'relative inline-flex rounded-full h-3 w-3 bg-warn';
    $statusPing.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-warn opacity-75';
    $statStatus.textContent = 'Running';
    $statStatus.className = 'text-xl font-semibold capitalize text-warn';
  } else {
    $statusDot.className = 'relative inline-flex rounded-full h-3 w-3 bg-pass';
    $statusPing.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-pass opacity-75 hidden';
    $statStatus.textContent = 'Idle';
    $statStatus.className = 'text-xl font-semibold capitalize text-pass';
  }
}

// ── UI: Stats bar ────────────────────────────────────────────────────

function renderStats() {
  // Total runs (exclude running)
  const completed = runs.filter(r => r.status !== 'running');
  $statTotal.textContent = runs.length;

  // Average pass rate
  if (completed.length > 0) {
    const rates = completed.map(r => {
      const total = (r.total?.passed || 0) + (r.total?.failed || 0) + (r.total?.skipped || 0);
      return total > 0 ? (r.total.passed / total) * 100 : 100;
    });
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    $statRate.textContent = avg.toFixed(1) + '%';
    $statRate.className = `text-3xl font-bold font-mono ${
      avg > 90 ? 'text-pass' : avg > 70 ? 'text-warn' : 'text-fail'
    }`;
  } else {
    $statRate.textContent = '—';
    $statRate.className = 'text-3xl font-bold font-mono text-gray-500';
  }

  // Last run
  if (runs.length > 0) {
    $statLast.textContent = timeAgo(new Date(runs[0].timestamp));
  } else {
    $statLast.textContent = '—';
  }
}

// ── UI: Run history table ────────────────────────────────────────────

function renderTable() {
  if (runs.length === 0) {
    $emptyState.classList.remove('hidden');
    $tableWrap.classList.add('hidden');
    return;
  }

  $emptyState.classList.add('hidden');
  $tableWrap.classList.remove('hidden');

  $tbody.innerHTML = runs.map(run => {
    const statusIcon = run.status === 'passed'
      ? `<span class="pill pill-passed">
           <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
           Passed
         </span>`
      : run.status === 'failed'
      ? `<span class="pill pill-failed">
           <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
           Failed
         </span>`
      : run.status === 'running'
      ? `<span class="pill pill-running pulse-running">
           <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
           Running
         </span>`
      : `<span class="pill pill-error">
           <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
           Error
         </span>`;

    const shortId = run.id.replace('run-', '').slice(-8);
    const date = new Date(run.timestamp);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const duration = run.duration ? formatDuration(run.duration) : '—';
    const passed = run.total?.passed ?? '—';
    const failed = run.total?.failed ?? '—';
    const skipped = run.total?.skipped ?? '—';

    const reportBtn = run.status !== 'running'
      ? `<a href="${run.reportPath}" target="_blank" rel="noopener" class="btn-report">
           <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>
           Report
         </a>`
      : '<span class="text-xs text-gray-600">—</span>';

    return `
      <tr class="cursor-default">
        <td class="px-4 py-3">${statusIcon}</td>
        <td class="px-4 py-3 font-mono text-xs text-gray-400">…${shortId}</td>
        <td class="px-4 py-3 text-gray-300">
          <span>${dateStr}</span>
          <span class="text-gray-600 ml-1">${timeStr}</span>
        </td>
        <td class="px-4 py-3 text-right font-mono text-gray-400">${duration}</td>
        <td class="px-4 py-3 text-right font-mono text-pass">${passed}</td>
        <td class="px-4 py-3 text-right font-mono ${failed > 0 ? 'text-fail' : 'text-gray-600'}">${failed}</td>
        <td class="px-4 py-3 text-right font-mono text-gray-500">${skipped}</td>
        <td class="px-4 py-3 text-right">${reportBtn}</td>
      </tr>`;
  }).join('');

  // Mobile cards
  renderMobileCards();
}

function renderMobileCards() {
  $mobileCards.innerHTML = runs.map(run => {
    const date = new Date(run.timestamp);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const duration = run.duration ? formatDuration(run.duration) : '—';
    const statusClass = `pill pill-${run.status}`;

    return `
      <div class="run-card">
        <div class="flex items-center justify-between mb-3">
          <span class="${statusClass}">${run.status}</span>
          <span class="text-xs text-gray-600 font-mono">${dateStr} ${timeStr}</span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center text-xs mb-3">
          <div>
            <p class="text-gray-500">Passed</p>
            <p class="font-mono font-bold text-pass text-lg">${run.total?.passed ?? 0}</p>
          </div>
          <div>
            <p class="text-gray-500">Failed</p>
            <p class="font-mono font-bold ${(run.total?.failed || 0) > 0 ? 'text-fail' : 'text-gray-600'} text-lg">${run.total?.failed ?? 0}</p>
          </div>
          <div>
            <p class="text-gray-500">Skipped</p>
            <p class="font-mono font-bold text-gray-500 text-lg">${run.total?.skipped ?? 0}</p>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-600">${duration}</span>
          ${run.status !== 'running' ? `<a href="${run.reportPath}" target="_blank" class="btn-report">View Report</a>` : ''}
        </div>
      </div>`;
  }).join('');

  // Show/hide based on screen size (handled via CSS classes)
  $mobileCards.classList.toggle('hidden', runs.length === 0);
}

// ── UI: Trend chart (SVG sparkline) ──────────────────────────────────

function renderChart() {
  const svg = document.getElementById('trend-chart');
  const completed = runs
    .filter(r => r.status !== 'running')
    .slice(0, 20)
    .reverse(); // oldest first for left-to-right

  if (completed.length < 2) {
    svg.innerHTML = `
      <text x="50%" y="50%" text-anchor="middle" fill="#404040" font-size="12" font-family="system-ui">
        Need at least 2 completed runs to show trend
      </text>`;
    return;
  }

  const W = 1000;
  const H = 128;
  const pad = 8;

  const rates = completed.map(r => {
    const total = (r.total?.passed || 0) + (r.total?.failed || 0) + (r.total?.skipped || 0);
    return total > 0 ? (r.total.passed / total) * 100 : 100;
  });

  const failRates = completed.map(r => {
    const total = (r.total?.passed || 0) + (r.total?.failed || 0) + (r.total?.skipped || 0);
    return total > 0 ? (r.total.failed / total) * 100 : 0;
  });

  const xStep = (W - pad * 2) / (rates.length - 1);
  const yScale = (v) => H - pad - ((v / 100) * (H - pad * 2));

  const passPoints = rates.map((v, i) => `${pad + i * xStep},${yScale(v)}`);
  const failPoints = failRates.map((v, i) => `${pad + i * xStep},${yScale(v)}`);

  // Area path (pass)
  const areaPath = `M${passPoints[0]} ${passPoints.map(p => `L${p}`).join(' ')} L${pad + (rates.length - 1) * xStep},${H - pad} L${pad},${H - pad} Z`;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="grad-pass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#22c55e" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#22c55e" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <!-- Grid lines -->
    <line x1="${pad}" y1="${yScale(100)}" x2="${W - pad}" y2="${yScale(100)}" stroke="#262626" stroke-width="1"/>
    <line x1="${pad}" y1="${yScale(75)}" x2="${W - pad}" y2="${yScale(75)}" stroke="#262626" stroke-width="1" stroke-dasharray="4 4"/>
    <line x1="${pad}" y1="${yScale(50)}" x2="${W - pad}" y2="${yScale(50)}" stroke="#262626" stroke-width="1" stroke-dasharray="4 4"/>
    <!-- Labels -->
    <text x="2" y="${yScale(100) + 4}" fill="#404040" font-size="10" font-family="monospace">100%</text>
    <text x="2" y="${yScale(75) + 4}" fill="#404040" font-size="10" font-family="monospace">75%</text>
    <text x="2" y="${yScale(50) + 4}" fill="#404040" font-size="10" font-family="monospace">50%</text>
    <!-- Area fill -->
    <path class="area-pass" d="${areaPath}"/>
    <!-- Pass rate line -->
    <polyline class="line-pass" points="${passPoints.join(' ')}"/>
    <!-- Fail rate line -->
    <polyline class="line-fail" points="${failPoints.join(' ')}"/>
    <!-- Dots -->
    ${passPoints.map((p, i) => {
      const [x, y] = p.split(',');
      const color = rates[i] >= 90 ? '#22c55e' : rates[i] >= 70 ? '#eab308' : '#ef4444';
      return `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="#0a0a0a" stroke-width="2"/>`;
    }).join('\n')}
  `;
}

// ── Formatters ───────────────────────────────────────────────────────

/**
 * Human-readable relative time (e.g., "2 hours ago")
 */
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Format milliseconds as "Xm Ys"
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  return `${minutes}m ${remSeconds}s`;
}

// ── Init ─────────────────────────────────────────────────────────────

(async function init() {
  await refresh();

  // If already running (e.g., page reload mid-run), start polling
  if (serverStatus.status === 'running') {
    startPolling();
  }

  // Auto-refresh every 30s even when idle
  setInterval(refresh, 30000);
})();
