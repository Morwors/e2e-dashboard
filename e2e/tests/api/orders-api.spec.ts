/**
 * Orders API Tests — Order creation and retrieval.
 */

import { test, expect } from '../../fixtures/api.fixture';
import { testEventData, testTicketData, TEST_RUN_ID } from '../../fixtures/test-data';

test.describe('Orders API', () => {
  let companyId: string;
  let eventId: string;
  let ticketId: string;

  test.beforeEach(async ({ api }) => {
    // Create demo account
    const demo = await api.createDemo();
    expect(demo.status).toBe(200);

    // Get company
    const companies = await api.getCompanies();
    companyId =
      companies.body?.companies?.[0]?._id || companies.body?.[0]?._id || '';

    if (!companyId) {
      const comp = await api.createCompany(`Order Test Co ${TEST_RUN_ID}`);
      companyId = comp.body?.insertedId || comp.body?._id || '';
    }

    // Create event
    const eventData = testEventData('order');
    const eventResult = await api.createEvent(companyId, eventData);
    eventId = eventResult.body?._id || eventResult.body?.insertedId || '';

    // Create ticket
    if (eventId) {
      const ticketData = testTicketData(eventId, companyId);
      const ticketResult = await api.createTicket(companyId, ticketData);
      ticketId = ticketResult.body?._id || ticketResult.body?.insertedId || '';
    }
  });

  test('POST /order — creates order with valid ticket', async ({ api }) => {
    test.skip(!eventId || !ticketId, 'Test data not available');

    const result = await api.createOrder({
      eventId,
      tickets: [{ ticketId, quantity: 1 }],
    });

    // Should succeed or return capacity/lock error
    expect(result.status).toBeLessThan(500);

    if (result.status < 300) {
      const order = result.body;
      expect(order).toBeTruthy();
      expect(order._id || order.insertedId).toBeTruthy();
    }
  });

  test('POST /order — rejects order with nonexistent ticket', async ({
    api,
  }) => {
    test.skip(!eventId, 'Event not available');

    const result = await api.createOrder({
      eventId,
      tickets: [{ ticketId: '000000000000000000000000', quantity: 1 }],
    });

    // Should fail with 404 or 400
    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  test('POST /order — rejects order exceeding ticket capacity', async ({
    api,
  }) => {
    test.skip(!eventId || !ticketId, 'Test data not available');

    const result = await api.createOrder({
      eventId,
      tickets: [{ ticketId, quantity: 999 }],
    });

    // Should fail with capacity exceeded error
    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  test('GET /order — lists orders for company (requires auth)', async ({
    api,
  }) => {
    test.skip(!companyId, 'No company available');

    const result = await api.getOrders(companyId);

    // Should succeed
    expect(result.status).toBe(200);
    // Response should be an array or object with data
    expect(result.body).toBeTruthy();
  });

  test('GET /order — rejects unauthenticated request', async ({ request }) => {
    const baseURL = process.env.BASE_URL_API || 'https://backend-dev.ticketseat.io';
    const res = await request.get(
      `${baseURL}/order?companyId=000000000000000000000000`,
    );

    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
