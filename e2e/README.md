# TicketSeat.io — E2E Automation Tests

End-to-end test suite for TicketSeat.io using [Playwright](https://playwright.dev).

## Structure

```
tests/
├── landing/          # Landing page (Next.js) — nav, blog, FAQ, responsive
├── admin/            # Admin dashboard (Angular 19) — auth, events, employees, permissions
├── store/            # Store (Angular 19) — purchase flow, seat selection, promo codes
├── api/              # Direct API tests — auth, events, orders, multi-tenancy
├── e2e/              # Cross-app journeys — full event lifecycle
└── global.setup.ts   # Auth setup: register/login, seed test data
```

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy env template and fill in values
cp .env.example .env

# Run all tests
npx playwright test

# Run specific suite
npx playwright test --project=admin
npx playwright test --project=store
npx playwright test --project=landing
npx playwright test --project=api
npx playwright test --project=e2e
```

## Available Scripts

| Script | Description |
|---|---|
| `npm test` | Run all tests |
| `npm run test:admin` | Admin dashboard tests only |
| `npm run test:store` | Store purchase flow tests only |
| `npm run test:landing` | Landing page tests only |
| `npm run test:api` | API tests only |
| `npm run test:e2e` | Full E2E journeys |
| `npm run test:ui` | Open Playwright UI mode |
| `npm run test:headed` | Run with visible browser |
| `npm run test:debug` | Debug mode (step through) |
| `npm run report` | View HTML test report |

## Test Projects

| Project | Target | Auth Required |
|---|---|---|
| `setup` | Backend API | Creates test account & seeds data |
| `landing` | landing-dev.ticketseat.io | No |
| `admin` | admin-dev.ticketseat.io | Yes (depends on setup) |
| `store` | store-dev.ticketseat.io | Partial (seeding via API) |
| `api` | backend-dev.ticketseat.io | Yes (JWT from setup) |
| `e2e` | All apps | Yes (depends on setup) |

## Environment Variables

See `.env.example` for all available config. Key ones:

```env
BASE_URL_LANDING=https://landing-dev.ticketseat.io
BASE_URL_ADMIN=https://admin-dev.ticketseat.io
BASE_URL_STORE=https://store-dev.ticketseat.io
BASE_URL_API=https://backend-dev.ticketseat.io
TEST_ADMIN_PASSWORD=TestE2E_2026!
```

## CI/CD

GitHub Actions workflow at `.github/workflows/e2e.yml` (add manually — requires PAT with `workflow` scope).

Runs on push to `main` and PRs. Reports uploaded as artifacts.

## Test Data Strategy

- **Setup phase** registers a fresh account or falls back to demo account
- All test data uses unique IDs per run (`TEST_RUN_ID`) to avoid collisions
- Events, tickets, and shops are created via API before store tests
- No teardown needed — dev environment data is ephemeral
