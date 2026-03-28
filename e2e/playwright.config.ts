import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const BASE_URL_LANDING = process.env.BASE_URL_LANDING || 'https://landing-dev.ticketseat.io';
const BASE_URL_ADMIN = process.env.BASE_URL_ADMIN || 'https://admin-dev.ticketseat.io';
const BASE_URL_STORE = process.env.BASE_URL_STORE || 'https://store-dev.ticketseat.io';
const BASE_URL_API = process.env.BASE_URL_API || 'https://backend-dev.ticketseat.io';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },

  reporter: [
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['list'],
  ],

  use: {
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
  },

  projects: [
    // ── Full Journey (Stripe checkout, real account) ─────────────────
    {
      name: 'full-journey',
      testMatch: /full-journey\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL_ADMIN,
        viewport: { width: 1440, height: 900 },
      },
    },

    // ── Setup: authenticate & seed data ──────────────────────────────
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      use: {
        baseURL: BASE_URL_API,
      },
    },

    // ── Landing (Next.js) ────────────────────────────────────────────
    {
      name: 'landing',
      testDir: './tests/landing',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL_LANDING,
      },
    },

    // ── Admin (Angular 19) ───────────────────────────────────────────
    {
      name: 'admin',
      testDir: './tests/admin',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL_ADMIN,
        storageState: path.resolve(__dirname, 'auth/admin.json'),
      },
    },

    // ── Store (Angular 19) ───────────────────────────────────────────
    {
      name: 'store',
      testDir: './tests/store',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL_STORE,
      },
    },

    // ── API (Fastify backend) ────────────────────────────────────────
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        baseURL: BASE_URL_API,
        extraHTTPHeaders: {
          'Accept': 'application/json',
        },
      },
    },

    // ── E2E (full journey across apps — legacy) ──────────────────────
    {
      name: 'e2e',
      testDir: './tests/e2e',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL_ADMIN,
        storageState: path.resolve(__dirname, 'auth/admin.json'),
      },
    },
  ],
});
