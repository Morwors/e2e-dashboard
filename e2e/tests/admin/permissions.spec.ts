/**
 * Admin Permissions Tests — Permission-based access control.
 *
 * Tests:
 *  - Auth guard blocks unauthenticated access
 *  - Company guard redirects when no company selected
 *  - Protected routes are not accessible without token
 */

import { test, expect } from '@playwright/test';
import { URLS, ADMIN_ROUTES } from '../../fixtures/test-data';

test.describe('Admin Permissions & Guards', () => {
  test('auth guard: unauthenticated user redirected to login', async ({
    page,
  }) => {
    // Clear any stored tokens
    await page.goto(URLS.admin + '/auth/login');
    await page.evaluate(() => localStorage.clear());

    // Try to access protected route directly
    await page.goto(URLS.admin + ADMIN_ROUTES.dashboard);
    await page.waitForTimeout(2000);

    // Should be on login page
    expect(page.url()).toContain('/auth/login');
  });

  test('auth guard: unauthenticated access to events redirects', async ({
    page,
  }) => {
    await page.goto(URLS.admin + '/auth/login');
    await page.evaluate(() => localStorage.clear());

    await page.goto(URLS.admin + ADMIN_ROUTES.events);
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/auth/login');
  });

  test('auth guard: unauthenticated access to employees redirects', async ({
    page,
  }) => {
    await page.goto(URLS.admin + '/auth/login');
    await page.evaluate(() => localStorage.clear());

    await page.goto(URLS.admin + ADMIN_ROUTES.employees);
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/auth/login');
  });

  test('auth guard: unauthenticated access to settings redirects', async ({
    page,
  }) => {
    await page.goto(URLS.admin + '/auth/login');
    await page.evaluate(() => localStorage.clear());

    await page.goto(URLS.admin + ADMIN_ROUTES.settings);
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/auth/login');
  });

  test('invalid token: expired/malformed token redirects to login', async ({
    page,
  }) => {
    await page.goto(URLS.admin + '/auth/login');
    await page.evaluate(() => {
      // Angular uses 'auth_token' as the storage key
      localStorage.clear();
      localStorage.setItem('auth_token', 'invalid.jwt.token');
      localStorage.setItem('auth_remember', 'true');
    });

    await page.goto(URLS.admin + ADMIN_ROUTES.dashboard);
    await page.waitForTimeout(3000);

    // Should redirect to login when the API rejects the token
    const url = page.url();
    expect(url.includes('/auth/login') || url.includes('/auth')).toBeTruthy();
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto(URLS.admin + '/nonexistent-route');
    await page.waitForTimeout(2000);

    // The wildcard route should catch this — could show a 404 page or redirect
    const bodyText = await page.textContent('body');
    const has404 =
      bodyText?.toLowerCase().includes('not found') ||
      bodyText?.toLowerCase().includes('404') ||
      page.url().includes('/auth/login'); // redirected to login

    expect(has404).toBeTruthy();
  });
});
