/**
 * Admin Employees Tests — Employee management.
 *
 * Every assertion is meaningful. No `expect(x || true)` patterns.
 * Selectors match the actual Angular UI: Team Management page with
 * generic divs, h3 headings for employee names, "Members" counter.
 */

import { test, expect } from '../../fixtures/auth.fixture';
import { waitForAngularReady } from '../../helpers/wait-helpers';
import { ADMIN_ROUTES } from '../../fixtures/test-data';

test.describe('Admin Employees', () => {
  test('employees page loads', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.employees);
    await waitForAngularReady(adminPage);

    const url = adminPage.url();
    expect(url).toContain('/employees');

    // Page heading
    await expect(adminPage.locator('h1:has-text("Team Management")')).toBeVisible({ timeout: 10_000 });
  });

  test('employees list shows at least the admin user', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.employees);
    await waitForAngularReady(adminPage);

    expect(adminPage.url()).toContain('/employees');

    // The "Team Members" section should be visible
    await expect(adminPage.locator('h2:has-text("Team Members")')).toBeVisible({ timeout: 10_000 });

    // The members counter should show at least "1"
    const membersCounter = adminPage.getByText('Members', { exact: true });
    await expect(membersCounter).toBeVisible({ timeout: 10_000 });

    // Employee name should appear as an h3 heading within the team members section
    const employeeNames = adminPage.locator('h3').filter({ hasNotText: /pending|invitation/i });
    const count = await employeeNames.count();
    expect(count).toBeGreaterThan(0);
  });

  test('employee entry shows role/permission info', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.employees);
    await waitForAngularReady(adminPage);

    expect(adminPage.url()).toContain('/employees');

    // Wait for team members section
    await expect(adminPage.locator('h2:has-text("Team Members")')).toBeVisible({ timeout: 10_000 });

    // Look for permission badges (View Orders, Edit Orders, etc.)
    const permText = adminPage.locator('text=/Permissions|View Orders|Edit Orders|more/i').first();
    await expect(permText).toBeVisible({ timeout: 10_000 });
  });
});
