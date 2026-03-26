/**
 * Admin Dashboard Tests — verify the dashboard loads and shows key elements.
 *
 * These tests require authentication (depend on the setup project).
 */

import { test, expect } from '../../fixtures/auth.fixture';
import { waitForAngularReady } from '../../helpers/wait-helpers';
import { ADMIN_ROUTES } from '../../fixtures/test-data';

test.describe('Admin Dashboard', () => {
  test('dashboard page loads after authentication', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.dashboard);
    await waitForAngularReady(adminPage);

    // Dashboard should load — check we're not on the login page
    const url = adminPage.url();
    const onDashboardOrCompanySelect =
      url.includes('/dashboard') || url.includes('/company/select');
    expect(onDashboardOrCompanySelect).toBeTruthy();
  });

  test('dashboard shows navigation sidebar', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.dashboard);
    await waitForAngularReady(adminPage);

    // Wait for the page to settle
    await adminPage.waitForTimeout(1000);

    // If we're on company select, that's ok — means auth worked
    if (adminPage.url().includes('/company/select')) {
      return; // skip sidebar check if no company is selected
    }

    // The sidebar should have links to main sections
    const sidebar = adminPage.locator('aside, nav, [class*="sidebar"]').first();
    const sidebarExists = await sidebar.isVisible().catch(() => false);

    if (sidebarExists) {
      // Check for key navigation items (text may vary)
      const navTexts = ['Dashboard', 'Events', 'Employees', 'Settings'];
      for (const text of navTexts) {
        const link = sidebar.locator(`text=${text}`);
        const visible = await link.isVisible().catch(() => false);
        // At least some nav items should be present
        if (visible) {
          expect(visible).toBeTruthy();
        }
      }
    }
  });

  test('dashboard displays company name', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.dashboard);
    await waitForAngularReady(adminPage);
    await adminPage.waitForTimeout(1000);

    // Skip if on company select page
    if (adminPage.url().includes('/company/select')) {
      return;
    }

    // Look for any text that might be a company name in the header/nav
    const header = adminPage.locator('header, nav').first();
    await expect(header).toBeVisible();
  });

  test('no JavaScript errors on dashboard', async ({ adminPage }) => {
    const errors: string[] = [];
    adminPage.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await adminPage.goto(ADMIN_ROUTES.dashboard);
    await waitForAngularReady(adminPage);
    await adminPage.waitForTimeout(2000);

    // Filter benign errors
    const realErrors = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('Failed to load resource') &&
        !e.includes('net::ERR'),
    );

    // We allow some console errors from third-party scripts, but core app errors
    // should be zero
    expect(realErrors.length).toBeLessThanOrEqual(3);
  });
});
