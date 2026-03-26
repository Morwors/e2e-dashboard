/**
 * Admin Events Tests — CRUD operations on events via the admin UI.
 *
 * Every assertion is meaningful. No `expect(x || true)` patterns.
 * Tests that can't run due to data issues fail or use test.fixme().
 */

import { test, expect } from '../../fixtures/auth.fixture';
import { waitForAngularReady, waitForNetworkIdle } from '../../helpers/wait-helpers';
import { ADMIN_ROUTES, testEventData, TEST_RUN_ID } from '../../fixtures/test-data';

test.describe.serial('Admin Events', () => {
  let createdEventId: string;

  test('events list page loads', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.events);
    await waitForAngularReady(adminPage);

    const url = adminPage.url();
    // Fail hard if redirected — means auth/setup is broken
    expect(url).toContain('/events');
  });

  test('create event form loads with required fields', async ({ adminPage }) => {
    await adminPage.goto(ADMIN_ROUTES.eventCreate);
    await waitForAngularReady(adminPage);

    const url = adminPage.url();
    expect(url).toContain('/events');

    // Must have form inputs for event creation
    const inputs = adminPage.locator('input, textarea, select');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(2); // At least name, date, category
  });

  test('create event via API and verify in events list', async ({
    adminPage,
    apiClient,
    testState,
  }) => {
    const eventData = testEventData('list');
    const result = await apiClient.createEvent(testState.companyId, eventData);

    expect(result.status).toBeLessThan(300);
    createdEventId = result.body?._id || result.body?.insertedId;
    expect(createdEventId).toBeTruthy();

    // Navigate to events list and verify
    await adminPage.goto(ADMIN_ROUTES.events);
    await waitForAngularReady(adminPage);
    await adminPage.waitForTimeout(1000);

    // The event name should appear in the list
    const eventText = adminPage.locator(`text=${eventData.name}`).first();
    await expect(eventText).toBeVisible({ timeout: 10_000 });
  });

  test('view event details page shows event data', async ({
    adminPage,
    apiClient,
    testState,
  }) => {
    // Create a fresh event
    const eventData = testEventData('details');
    const result = await apiClient.createEvent(testState.companyId, eventData);
    expect(result.status).toBeLessThan(300);

    const eventId = result.body?._id || result.body?.insertedId;
    expect(eventId).toBeTruthy();

    // Navigate to details
    await adminPage.goto(ADMIN_ROUTES.eventDetails(eventId));
    await waitForAngularReady(adminPage);

    // URL must contain the event ID
    expect(adminPage.url()).toContain(eventId);

    // Event name should be visible on the details page
    const eventName = adminPage.locator(`text=${eventData.name}`).first();
    await expect(eventName).toBeVisible({ timeout: 10_000 });
  });

  test('edit event page loads with pre-filled data', async ({
    adminPage,
    apiClient,
    testState,
  }) => {
    const eventData = testEventData('edit');
    const result = await apiClient.createEvent(testState.companyId, eventData);
    expect(result.status).toBeLessThan(300);

    const eventId = result.body?._id || result.body?.insertedId;
    expect(eventId).toBeTruthy();

    await adminPage.goto(ADMIN_ROUTES.eventEdit(eventId));
    await waitForAngularReady(adminPage);

    // Page must have form inputs
    const inputs = adminPage.locator('input, textarea');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(2);

    // One input should contain the event name
    const nameInput = adminPage.locator(
      'input[formcontrolname="name"], input#name, input[placeholder*="name" i]',
    ).first();
    const nameValue = await nameInput.inputValue().catch(() => '');
    expect(nameValue).toContain('E2E Test Event');
  });

  test('delete event via API removes it', async ({ apiClient, testState }) => {
    // Create a disposable event
    const eventData = testEventData('delete');
    const result = await apiClient.createEvent(testState.companyId, eventData);
    expect(result.status).toBeLessThan(300);

    const eventId = result.body?._id || result.body?.insertedId;
    expect(eventId).toBeTruthy();

    // Delete
    const deleteResult = await apiClient.deleteEvent(eventId, testState.companyId);
    expect(deleteResult.status).toBeLessThan(300);

    // Verify it's gone or soft-deleted
    const getResult = await apiClient.getEvent(eventId);
    if (getResult.status === 200 && getResult.body) {
      // Soft delete — isDeleted flag must be true
      expect(getResult.body.isDeleted).toBe(true);
    } else {
      // Hard delete — 404 expected
      expect(getResult.status).toBe(404);
    }
  });
});
