/**
 * Auth fixture — extends Playwright test with an authenticated admin page.
 *
 * Provides:
 * - `adminPage`: a Page with JWT token already in localStorage
 * - `apiClient`: an ApiClient instance with auth token set
 * - `testData`: resolved test data (email, companyId, etc.)
 */

import { test as base, expect, BrowserContext, Page } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { URLS, TEST_ADMIN, TEST_COMPANY, uniqueEmail } from './test-data';
import path from 'path';
import fs from 'fs';

/** Shared state written by global.setup.ts and read by test fixtures */
export interface SetupState {
  token: string;
  email: string;
  companyId: string;
  userId: string;
}

const STATE_PATH = path.resolve(__dirname, '../auth/setup-state.json');
const ADMIN_STORAGE_PATH = path.resolve(__dirname, '../auth/admin.json');

/**
 * Read setup state saved by global.setup.ts.
 */
function readSetupState(): SetupState | null {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

/** Custom test fixture type */
type AuthFixtures = {
  /** Pre-authenticated admin Page (has JWT in localStorage) */
  adminPage: Page;
  /** API client with token set */
  apiClient: ApiClient;
  /** Resolved test data from setup */
  testState: SetupState;
};

export const test = base.extend<AuthFixtures>({
  testState: async ({}, use) => {
    const state = readSetupState();
    if (!state) {
      throw new Error(
        'Setup state not found at auth/setup-state.json. Run the "setup" project first.',
      );
    }
    await use(state);
  },

  apiClient: async ({ request, testState }, use) => {
    const client = new ApiClient(request, URLS.api);
    client.setToken(testState.token);
    await use(client);
  },

  adminPage: async ({ browser, testState }, use) => {
    // Create a new context with stored auth state if it exists
    let context: BrowserContext;
    if (fs.existsSync(ADMIN_STORAGE_PATH)) {
      context = await browser.newContext({
        storageState: ADMIN_STORAGE_PATH,
        baseURL: URLS.admin,
      });
    } else {
      context = await browser.newContext({ baseURL: URLS.admin });
    }

    const page = await context.newPage();

    // Use the demo token URL parameter approach — Angular's checkForDemoToken()
    // reads ?demo=true&token=<jwt> from the URL and authenticates automatically.
    // This is the most reliable auth method as it goes through the app's own flow.
    await page.goto(
      `${URLS.admin}/company/select?demo=true&token=${encodeURIComponent(testState.token)}`,
      { waitUntil: 'networkidle' },
    );

    // Wait for Angular to process the demo token and redirect
    await page.waitForTimeout(2000);

    // If we're still on login, fall back to manual localStorage injection
    const url = page.url();
    if (url.includes('/auth/login') || url.includes('/login')) {
      // Angular's auth service uses 'auth_token' key (not 'token')
      await page.evaluate((token: string) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_remember', 'true');
      }, testState.token);

      // Reload so Angular picks up the token
      await page.goto(URLS.admin + '/company/select', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
    }

    await use(page);
    await context.close();
  },
});

export { expect };
