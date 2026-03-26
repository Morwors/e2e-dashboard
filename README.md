# TicketSeat E2E Dashboard

Modern, beautiful web dashboard for viewing Playwright E2E test results.

## Features

- 📊 **Run History** — View all test runs with pass/fail counts, duration, timestamps
- 📋 **Detailed Reports** — Each run links to the full Playwright HTML report (screenshots, traces, videos)
- ▶️ **Run Tests** — Trigger test runs from the dashboard
- 🔄 **Live Status** — Real-time polling while tests are running
- 📈 **Trend Chart** — Pass rate sparkline for the last 20 runs

## Tech Stack

- **Backend**: Express.js
- **Frontend**: Vanilla HTML/CSS/JS + Tailwind CSS (CDN)
- **Tests**: Playwright
- **Deploy**: Docker → Coolify

## Quick Start

```bash
npm install
node server.js
# → http://localhost:3000
```

## Docker

```bash
docker build -t e2e-dashboard .
docker run -p 3000:3000 -v $(pwd)/data:/app/data e2e-dashboard
```

## API

| Method | Endpoint            | Description                    |
|--------|---------------------|--------------------------------|
| GET    | `/api/runs`         | List all test runs             |
| GET    | `/api/runs/:id`     | Get details of a specific run  |
| POST   | `/api/runs/trigger` | Trigger a new test run         |
| GET    | `/api/status`       | Current status (idle/running)  |
| GET    | `/reports/:id/*`    | Serve Playwright HTML reports  |
