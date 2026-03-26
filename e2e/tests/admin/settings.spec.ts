/**
 * Admin Settings Tests — Company settings page.
 */

import { test, expect } from '../../fixtures/auth.fixture';
import { waitForAngularReady } from '../../helpers/wait-helpers';
import { ADMIN_ROUTES } from '../../fixtures/test-data';

test.describe('Admin Settings', () => {
  test('settings page loads', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.settings);
    await waitForAngularReady(adminPage);
    await adminPage.waitForTimeout(1000);

    const url = adminPage.url();
    if (url.includes('/company/select') || url.includes('/billing')) {
      test.skip(true, 'No company context');
      return;
    }

    expect(url).toContain('/settings');
  });

  test('settings page shows company information fields', async ({
    adminPage,
  }) => {
    await adminPage.goto(ADMIN_ROUTES.settings);
    await waitForAngularReady(adminPage);
    await adminPage.waitForTimeout(2000);

    const url = adminPage.url();
    if (url.includes('/company/select') || url.includes('/billing')) {
      test.skip(true, 'No company context');
      return;
    }

    // Settings page should have input fields for company info
    const inputs = adminPage.locator('input, textarea, select');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('billing page loads', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.billing);
    await waitForAngularReady(adminPage);
    await adminPage.waitForTimeout(1000);

    const url = adminPage.url();
    if (url.includes('/company/select')) {
      test.skip(true, 'No company context');
      return;
    }

    // Should be on billing or redirected to setup
    expect(url).toContain('/billing');
  });
});
