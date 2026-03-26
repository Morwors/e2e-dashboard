/**
 * Admin Employees Tests — Employee management.
 *
 * Every assertion is meaningful. No `expect(x || true)` patterns.
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
  });

  test('employees list shows at least the admin user', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.employees);
    await waitForAngularReady(adminPage);

    expect(adminPage.url()).toContain('/employees');

    // There should be at least one employee entry (the admin who owns the company)
    // Look for table rows (excluding header) or card elements
    const employeeRows = adminPage.locator(
      'tbody tr, [class*="employee-row"], [class*="employee-card"]',
    );
    const count = await employeeRows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('employee entry shows role/permission info', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.employees);
    await waitForAngularReady(adminPage);

    expect(adminPage.url()).toContain('/employees');

    // Look for permission-related text — admin should have "Admin" role visible
    const permText = adminPage.locator('text=/admin/i').first();
    await expect(permText).toBeVisible({ timeout: 10_000 });
  });
});
