/**
 * Global setup — runs once before admin / store / e2e projects.
 *
 * Steps:
 *  1. Get a demo account (verified, with company)
 *  2. Fetch user info and company data
 *  3. Save auth state for browser-based tests
 *  4. Write setup-state.json for fixture consumption
 */

import { test as setup, request } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import {
  URLS,
  TEST_ADMIN,
  TEST_COMPANY,
  uniqueEmail,
} from '../fixtures/test-data';
import path from 'path';
import fs from 'fs';

const AUTH_DIR = path.resolve(__dirname, '../auth');
const STATE_PATH = path.join(AUTH_DIR, 'setup-state.json');
const ADMIN_STORAGE = path.join(AUTH_DIR, 'admin.json');

setup('authenticate and seed test data', async ({ }) => {
  // Ensure auth directory exists
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const ctx = await request.newContext({ baseURL: URLS.api });
  const api = new ApiClient(ctx, URLS.api);

  // 1. Get demo account (pre-verified, with company and permissions)
  console.log('[setup] Creating demo account...');
  const demo = await api.createDemo();
  if (demo.status !== 200 || !demo.body?.token) {
    throw new Error(`Demo account creation failed: ${JSON.stringify(demo.body)}`);
  }
  const token = demo.body.token;
  console.log('[setup] Demo token obtained');

  // 2. Get user info
  const meResult = await api.me();
  const user = meResult.body?.user;
  if (!user) {
    throw new Error(`Failed to get user info: ${JSON.stringify(meResult.body)}`);
  }
  console.log(`[setup] User: ${user.firstName} ${user.lastName} (${user.email})`);

  // 3. Get company data (demo endpoint creates a company automatically)
  const companiesResult = await api.getCompanies();
  let company = null;
  let companyId = '';

  // The API returns { data: [...] } or { companies: [...] } or just [...]
  const companiesList =
    companiesResult.body?.data ||
    companiesResult.body?.companies ||
    (Array.isArray(companiesResult.body) ? companiesResult.body : []);

  if (companiesList.length > 0) {
    company = companiesList[0];
    companyId = company._id;
    console.log(`[setup] Company: ${company.name} (${companyId})`);
  } else {
    console.warn('[setup] No company found for demo account');
  }

  // 4. Save state (includes full company object for localStorage injection)
  const state = {
    token,
    email: user.email,
    companyId,
    userId: user._id,
    company, // Full company object for selected_company localStorage
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  await saveAdminStorageState(token, company);

  console.log('[setup] ✅ Setup complete');
  await ctx.dispose();
});

/**
 * Save storage state file that sets:
 * - auth_token: JWT token (Angular's AuthService key)
 * - auth_remember: "true" (use localStorage not sessionStorage)
 * - selected_company: JSON company object (Angular's CompanyStore key)
 */
async function saveAdminStorageState(token: string, company: any) {
  const localStorage: Array<{ name: string; value: string }> = [
    { name: 'auth_token', value: token },
    { name: 'auth_remember', value: 'true' },
  ];

  if (company) {
    localStorage.push({
      name: 'selected_company',
      value: JSON.stringify(company),
    });
  }

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: URLS.admin,
        localStorage,
      },
    ],
  };
  fs.writeFileSync(ADMIN_STORAGE, JSON.stringify(storageState, null, 2));
}
