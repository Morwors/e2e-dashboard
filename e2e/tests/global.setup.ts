/**
 * Global setup — runs once before admin / store / e2e projects.
 *
 * Steps:
 *  1. Register a fresh test admin account via API
 *  2. Login to get JWT token
 *  3. Create a test company
 *  4. Save auth state for browser-based tests
 *  5. Write setup-state.json for fixture consumption
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

  // 1. Register test admin
  const email = uniqueEmail('admin');
  console.log(`[setup] Registering test admin: ${email}`);

  const regResult = await api.register({
    firstName: TEST_ADMIN.firstName,
    lastName: TEST_ADMIN.lastName,
    email,
    password: TEST_ADMIN.password,
    phone: TEST_ADMIN.phone,
  });

  // If the email is already taken (re-run), try with a different one
  if (regResult.status === 400) {
    console.log('[setup] Registration conflict, trying alternate email...');
    const altEmail = uniqueEmail('admin2');
    const altReg = await api.register({
      firstName: TEST_ADMIN.firstName,
      lastName: TEST_ADMIN.lastName,
      email: altEmail,
      password: TEST_ADMIN.password,
      phone: `+1555${Date.now().toString().slice(-7)}`,
    });
    if (altReg.status >= 400) {
      // Fall back to demo account which is pre-verified
      console.log('[setup] Registration failed, falling back to demo account');
      const demo = await api.createDemo();
      if (demo.status !== 200) {
        throw new Error(`Demo account creation failed: ${JSON.stringify(demo.body)}`);
      }

      // Demo account comes with a company already
      const meResult = await api.me();
      const user = meResult.body?.user;
      const companies = await api.getCompanies();
      const companyId = companies.body?.companies?.[0]?._id || companies.body?.[0]?._id || '';

      const state = {
        token: demo.body.token,
        email: user?.email || 'demo@example.com',
        companyId,
        userId: user?._id || '',
      };

      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
      await saveAdminStorageState(state.token);
      await ctx.dispose();
      return;
    }
  }

  // 2. Login
  //    NOTE: newly registered users may not be verified. The backend
  //    returns 403 for unverified users. If that happens, fall back to demo.
  console.log('[setup] Logging in...');
  const loginResult = await api.login(
    regResult.status === 400 ? uniqueEmail('admin2') : email,
    TEST_ADMIN.password,
  );

  if (loginResult.status === 403 || loginResult.status === 401) {
    console.log('[setup] Login failed (likely unverified), falling back to demo account');
    const demo = await api.createDemo();
    if (demo.status !== 200) {
      throw new Error(`Demo account creation failed: ${JSON.stringify(demo.body)}`);
    }

    const meResult = await api.me();
    const user = meResult.body?.user;
    const companies = await api.getCompanies();
    const companyId = companies.body?.companies?.[0]?._id || companies.body?.[0]?._id || '';

    const state = {
      token: demo.body.token,
      email: user?.email || 'demo@example.com',
      companyId,
      userId: user?._id || '',
    };

    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    await saveAdminStorageState(state.token);
    await ctx.dispose();
    return;
  }

  if (loginResult.status !== 200) {
    throw new Error(`Login failed: ${JSON.stringify(loginResult.body)}`);
  }

  const token = loginResult.body.token;

  // 3. Get user info
  const meResult = await api.me();
  const user = meResult.body?.user;

  // 4. Create test company
  console.log('[setup] Creating test company...');
  const companyResult = await api.createCompany(
    TEST_COMPANY.name,
    TEST_COMPANY.description,
  );

  let companyId = '';
  if (companyResult.status === 201 || companyResult.status === 200) {
    companyId = companyResult.body?.insertedId || companyResult.body?._id || '';
  } else {
    // Company might already exist — fetch companies
    const companies = await api.getCompanies();
    companyId = companies.body?.companies?.[0]?._id || companies.body?.[0]?._id || '';
  }

  console.log(`[setup] Company ID: ${companyId}`);

  // 5. Save state
  const state = {
    token,
    email: regResult.status === 400 ? '' : email,
    companyId,
    userId: user?._id || '',
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  await saveAdminStorageState(token);

  console.log('[setup] ✅ Setup complete');
  await ctx.dispose();
});

/**
 * Save a minimal storage state file that sets the JWT token as a cookie
 * so admin/store projects can reuse it.
 */
async function saveAdminStorageState(token: string) {
  const storageState = {
    cookies: [],
    origins: [
      {
        origin: URLS.admin,
        localStorage: [
          { name: 'token', value: token },
        ],
      },
    ],
  };
  fs.writeFileSync(ADMIN_STORAGE, JSON.stringify(storageState, null, 2));
}
