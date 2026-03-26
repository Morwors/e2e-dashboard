/**
 * Events API Tests — CRUD operations on events via the backend API.
 */

import { test, expect } from '../../fixtures/api.fixture';
import { testEventData, TEST_RUN_ID } from '../../fixtures/test-data';

test.describe('Events API', () => {
  let companyId: string;

  test.beforeEach(async ({ api }) => {
    // Create a demo account to get authenticated
    const demo = await api.createDemo();
    expect(demo.status).toBe(200);

    // Get companies
    const companies = await api.getCompanies();
    companyId =
      companies.body?.companies?.[0]?._id || companies.body?.[0]?._id || '';
    if (!companyId) {
      // Create one
      const comp = await api.createCompany(`API Test Co ${TEST_RUN_ID}`);
      companyId = comp.body?.insertedId || comp.body?._id || '';
    }
  });

  test('POST /event — creates event', async ({ api }) => {
    test.skip(!companyId, 'No company available');

    const eventData = testEventData('api-create');
    const result = await api.createEvent(companyId, eventData);

    expect(result.status).toBeLessThan(300);
    const event = result.body;
    expect(event).toBeTruthy();
    expect(event.name || event._id || event.insertedId).toBeTruthy();
  });

  test('GET /event/:id — returns event by ID', async ({ api }) => {
    test.skip(!companyId, 'No company available');

    // Create event first
    const eventData = testEventData('api-get');
    const createResult = await api.createEvent(companyId, eventData);
    expect(createResult.status).toBeLessThan(300);

    const eventId = createResult.body?._id || createResult.body?.insertedId;
    expect(eventId).toBeTruthy();

    // Get it
    const getResult = await api.getEvent(eventId);
    expect(getResult.status).toBe(200);
    expect(getResult.body.name).toBe(eventData.name);
    expect(getResult.body.companyId).toBeTruthy();
  });

  test('GET /event/:id — returns 404 for nonexistent ID', async ({ api }) => {
    const result = await api.getEvent('000000000000000000000000');
    expect(result.status).toBe(404);
  });

  test('PUT /event/:id — updates event', async ({ api }) => {
    test.skip(!companyId, 'No company available');

    // Create event
    const eventData = testEventData('api-update');
    const createResult = await api.createEvent(companyId, eventData);
    const eventId = createResult.body?._id || createResult.body?.insertedId;
    expect(eventId).toBeTruthy();

    // Update it
    const updateResult = await api.updateEvent(eventId, {
      name: 'Updated Event Name',
      description: 'Updated description',
    }, companyId);

    // Should succeed
    expect(updateResult.status).toBeLessThan(300);

    // Verify update
    const getResult = await api.getEvent(eventId);
    expect(getResult.body.name).toBe('Updated Event Name');
  });

  test('DELETE /event/:id — deletes event', async ({ api }) => {
    test.skip(!companyId, 'No company available');

    // Create event
    const eventData = testEventData('api-delete');
    const createResult = await api.createEvent(companyId, eventData);
    const eventId = createResult.body?._id || createResult.body?.insertedId;
    expect(eventId).toBeTruthy();

    // Delete it
    const deleteResult = await api.deleteEvent(eventId, companyId);
    expect(deleteResult.status).toBeLessThan(300);
  });

  test('POST /event — requires authentication', async ({ request }) => {
    const baseURL = process.env.BASE_URL_API || 'https://backend-dev.ticketseat.io';
    const res = await request.post(
      `${baseURL}/event?companyId=000000000000000000000000`,
      {
        data: { name: 'Unauthorized Event', dates: [] },
        headers: { 'Content-Type': 'application/json' },
      },
    );

    // Should be rejected (401 or 403)
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
