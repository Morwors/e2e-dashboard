import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

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
    {
      name: 'full-journey',
      testMatch: /full-journey\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.BASE_URL_ADMIN || 'https://admin-dev.ticketseat.io',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
