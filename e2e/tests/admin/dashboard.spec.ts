/**
 * Admin Dashboard Tests — verify the dashboard loads and shows key elements.
 *
 * Every assertion is meaningful. No soft checks that always pass.
 */

import { test, expect } from '../../fixtures/auth.fixture';
import { waitForAngularReady } from '../../helpers/wait-helpers';
import { ADMIN_ROUTES } from '../../fixtures/test-data';

test.describe('Admin Dashboard', () => {
  test('dashboard page loads after authentication', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.dashboard);
    await waitForAngularReady(adminPage);

    // Must be on dashboard — not login, not an error page
    const url = adminPage.url();
    expect(url).toContain('/dashboard');
  });

  test('dashboard shows navigation sidebar with main sections', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.dashboard);
    await waitForAngularReady(adminPage);

    // Must be on dashboard
    expect(adminPage.url()).toContain('/dashboard');

    // Sidebar must exist and be visible
    const sidebar = adminPage.locator('aside, nav, [class*="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // Must contain key navigation items
    const requiredNavItems = ['Dashboard', 'Events'];
    for (const text of requiredNavItems) {
      const link = sidebar.locator(`text=${text}`).first();
      await expect(link).toBeVisible();
    }
  });

  test('dashboard displays header with company context', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.dashboard);
    await waitForAngularReady(adminPage);

    expect(adminPage.url()).toContain('/dashboard');

    // Header must be visible
    const header = adminPage.locator('header').first();
    await expect(header).toBeVisible();

    // Header should contain at least some text (company name, user info, etc.)
    const headerText = await header.textContent();
    expect(headerText).toBeTruthy();
    expect(headerText!.trim().length).toBeGreaterThan(0);
  });

  test('no critical JavaScript errors on dashboard', async ({ adminPage }) => {
    const errors: string[] = [];
    adminPage.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await adminPage.goto(ADMIN_ROUTES.dashboard);
    await waitForAngularReady(adminPage);

    // Filter out expected/benign errors
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('Failed to load resource') &&
        !e.includes('net::ERR') &&
        !e.includes('third-party') &&
        !e.includes('analytics') &&
        !e.includes('hotjar'),
    );

    // Zero critical errors allowed
    expect(criticalErrors).toHaveLength(0);
  });
});
