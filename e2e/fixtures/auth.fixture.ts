/**
 * Auth fixture — extends Playwright test with an authenticated admin page.
 *
 * Provides:
 * - `adminPage`: a Page with JWT + company in localStorage (ready for admin panel)
 * - `apiClient`: an ApiClient instance with auth token set
 * - `testState`: resolved test data from setup (token, companyId, company, etc.)
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
  company: any; // Full company object for localStorage
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
  /** Pre-authenticated admin Page (has JWT + company in localStorage) */
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
    // Create context with storageState (has auth_token + selected_company)
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

    // Navigate to admin — Angular will read auth_token + selected_company from localStorage
    await page.goto(URLS.admin + '/dashboard', { waitUntil: 'domcontentloaded' });

    // Wait for Angular to boot and process auth
    await page.waitForTimeout(2000);

    // Check if we're on login page (storageState didn't work)
    const url = page.url();
    if (url.includes('/auth/login') || url.includes('/login')) {
      // Manual fallback: inject auth via demo URL params
      await page.goto(
        `${URLS.admin}/company/select?demo=true&token=${encodeURIComponent(testState.token)}`,
        { waitUntil: 'networkidle' },
      );
      await page.waitForTimeout(2000);

      // Also set selected_company if we have it
      if (testState.company) {
        await page.evaluate((company: any) => {
          localStorage.setItem('selected_company', JSON.stringify(company));
        }, testState.company);
      }
    }

    // If on company/select, click the first company to select it
    if (page.url().includes('/company/select')) {
      // Try clicking the first company card/button
      const companyCard = page.locator('[class*="company"], [class*="card"], button, a').filter({ hasText: /select|choose|open/i }).first();
      const hasCard = await companyCard.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasCard) {
        await companyCard.click();
        await page.waitForTimeout(1000);
      } else {
        // Just inject the company and navigate
        if (testState.company) {
          await page.evaluate((company: any) => {
            localStorage.setItem('selected_company', JSON.stringify(company));
          }, testState.company);
        }
        await page.goto(URLS.admin + '/dashboard', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
      }
    }

    await use(page);
    await context.close();
  },
});

export { expect };
