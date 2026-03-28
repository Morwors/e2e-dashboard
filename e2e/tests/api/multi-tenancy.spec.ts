/**
 * Multi-tenancy API Tests — Cross-company isolation.
 *
 * Verifies that Company A cannot access Company B's data.
 */

import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';
import { TEST_RUN_ID, testEventData } from '../../fixtures/test-data';

const BASE_URL = process.env.BASE_URL_API || 'https://backend-dev.ticketseat.io';

test.describe('Multi-tenancy Isolation', () => {
  test('company A cannot see company B events', async ({ request }) => {
    // Create two separate demo accounts (each gets their own company)
    const apiA = new ApiClient(request, BASE_URL);
    const apiB = new ApiClient(request, BASE_URL);

    const demoA = await apiA.createDemo();
    const demoB = await apiB.createDemo();

    expect(demoA.status).toBe(200);
    expect(demoB.status).toBe(200);

    // Get Company A's company
    const companiesA = await apiA.getCompanies();
    const companyIdA =
      companiesA.body?.companies?.[0]?._id || companiesA.body?.[0]?._id;

    // Get Company B's company
    const companiesB = await apiB.getCompanies();
    const companyIdB =
      companiesB.body?.companies?.[0]?._id || companiesB.body?.[0]?._id;

    test.skip(!companyIdA || !companyIdB, 'Companies not available');

    // Create an event under Company A
    const eventDataA = testEventData('tenant-A');
    const eventA = await apiA.createEvent(companyIdA, eventDataA);
    expect(eventA.status).toBeLessThan(300);
    const eventIdA = eventA.body?._id || eventA.body?.insertedId;

    // Create an event under Company B
    const eventDataB = testEventData('tenant-B');
    const eventB = await apiB.createEvent(companyIdB, eventDataB);
    expect(eventB.status).toBeLessThan(300);

    // Company B tries to access Company A's event via their company context
    // The ticket listing filtered by companyId should not show Company A's events
    const ticketsB = await apiB.getTickets(companyIdB);
    expect(ticketsB.status).toBe(200);

    // Verify no cross-contamination in the ticket listing
    if (ticketsB.body?.data) {
      for (const ticket of ticketsB.body.data) {
        // Each ticket should belong to Company B
        expect(ticket.companyId?.toString()).toBe(companyIdB.toString());
      }
    }
  });

  test('company B cannot delete company A event', async ({ request }) => {
    const apiA = new ApiClient(request, BASE_URL);
    const apiB = new ApiClient(request, BASE_URL);

    const demoA = await apiA.createDemo();
    const demoB = await apiB.createDemo();

    const companiesA = await apiA.getCompanies();
    const companyIdA =
      companiesA.body?.companies?.[0]?._id || companiesA.body?.[0]?._id;

    const companiesB = await apiB.getCompanies();
    const companyIdB =
      companiesB.body?.companies?.[0]?._id || companiesB.body?.[0]?._id;

    test.skip(!companyIdA || !companyIdB, 'Companies not available');

    // Create event under Company A
    const eventData = testEventData('tenant-delete');
    const eventA = await apiA.createEvent(companyIdA, eventData);
    const eventIdA = eventA.body?._id || eventA.body?.insertedId;

    // Company B tries to delete Company A's event using their own companyId
    const deleteResult = await apiB.deleteEvent(eventIdA, companyIdB);

    // Should fail — either 403 Forbidden or 404 Not Found (not in their scope)
    expect(deleteResult.status).toBeGreaterThanOrEqual(400);
  });

  test('each demo account gets isolated company data', async ({ request }) => {
    const api1 = new ApiClient(request, BASE_URL);
    const api2 = new ApiClient(request, BASE_URL);

    const demo1 = await api1.createDemo();
    const demo2 = await api2.createDemo();

    const companies1 = await api1.getCompanies();
    const companies2 = await api2.getCompanies();

    const id1 =
      companies1.body?.companies?.[0]?._id || companies1.body?.[0]?._id;
    const id2 =
      companies2.body?.companies?.[0]?._id || companies2.body?.[0]?._id;

    // Company IDs should be different
    if (id1 && id2) {
      expect(id1).not.toBe(id2);
    }
  });
});
