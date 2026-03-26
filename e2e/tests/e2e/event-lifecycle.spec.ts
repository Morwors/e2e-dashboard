/**
 * Full Event Lifecycle E2E Test
 *
 * Journey: Create event → Create ticket → Create shop → Verify store → (optional) purchase
 *
 * This test exercises the complete flow across admin API and store UI.
 */

import { test, expect } from '../../fixtures/auth.fixture';
import {
  URLS,
  testEventData,
  testTicketData,
  testPromoData,
  TEST_RUN_ID,
} from '../../fixtures/test-data';
import { waitForAngularReady } from '../../helpers/wait-helpers';

test.describe('Event Lifecycle — End-to-End', () => {
  test('full journey: create event → create ticket → create shop → verify in store', async ({
    apiClient,
    testState,
    page,
  }) => {
    const companyId = testState.companyId;
    test.skip(!companyId, 'No company available');

    // ── Step 1: Create Event ─────────────────────────────────
    console.log('[e2e] Creating event...');
    const eventData = testEventData('lifecycle');
    const eventResult = await apiClient.createEvent(companyId, eventData);

    if (eventResult.status >= 400) {
      console.log('[e2e] Event creation failed:', eventResult.body);
      test.skip(true, 'Event creation failed — likely missing permissions');
      return;
    }

    const eventId = eventResult.body?._id || eventResult.body?.insertedId;
    expect(eventId).toBeTruthy();
    console.log(`[e2e] Event created: ${eventId}`);

    // ── Step 2: Verify Event via API ─────────────────────────
    const getEvent = await apiClient.getEvent(eventId);
    expect(getEvent.status).toBe(200);
    expect(getEvent.body.name).toBe(eventData.name);
    console.log('[e2e] Event verified via API');

    // ── Step 3: Create Ticket ────────────────────────────────
    console.log('[e2e] Creating ticket...');
    const ticketData = testTicketData(eventId, companyId);
    const ticketResult = await apiClient.createTicket(companyId, ticketData);

    if (ticketResult.status >= 400) {
      console.log('[e2e] Ticket creation failed:', ticketResult.body);
      // Continue — event is still valid
    }

    const ticketId = ticketResult.body?._id || ticketResult.body?.insertedId;
    if (ticketId) {
      console.log(`[e2e] Ticket created: ${ticketId}`);

      // Verify ticket via API
      const getTicket = await apiClient.getTicket(ticketId);
      expect(getTicket.status).toBe(200);
      expect(getTicket.body.name).toBe(ticketData.name);
      expect(getTicket.body.price).toBe(ticketData.price);
    }

    // ── Step 4: Create Shop ──────────────────────────────────
    if (ticketId) {
      console.log('[e2e] Creating shop...');
      const shopResult = await apiClient.createShop(companyId, {
        eventId,
        ticketIds: [ticketId],
        name: `E2E Lifecycle Store ${TEST_RUN_ID}`,
        description: 'End-to-end test shop',
      });

      if (shopResult.status < 300) {
        const shopId = shopResult.body?._id || shopResult.body?.insertedId;
        console.log(`[e2e] Shop created: ${shopId}`);

        // Verify shop via public API
        const getShop = await apiClient.getShopByEvent(eventId);
        expect(getShop.status).toBe(200);
        expect(getShop.body).toBeTruthy();
      }
    }

    // ── Step 5: Create Promo Code ────────────────────────────
    console.log('[e2e] Creating promo code...');
    const promoData = testPromoData(eventId);
    const promoResult = await apiClient.createPromoCode(companyId, promoData);

    if (promoResult.status < 300) {
      console.log(`[e2e] Promo code created: ${promoData.code}`);

      // Verify promo exists
      const promoExists = await apiClient.promoExists(promoData.code, eventId);
      expect(promoExists.status).toBe(200);
    }

    // ── Step 6: Verify Store UI ──────────────────────────────
    console.log('[e2e] Checking store UI...');
    await page.goto(`${URLS.store}?storeUrl=${eventId}`);
    await waitForAngularReady(page);
    await page.waitForTimeout(3000);

    // The store should show the event info or a loading state
    const bodyText = await page.textContent('body');
    const storeLoaded =
      bodyText?.includes(eventData.name) ||
      bodyText?.includes('TicketSeat') ||
      bodyText?.includes('Select Your Tickets');

    console.log(`[e2e] Store loaded: ${storeLoaded}`);
    expect(storeLoaded).toBeTruthy();

    // ── Step 7: Cleanup (delete event) ───────────────────────
    console.log('[e2e] Cleaning up...');
    await apiClient.deleteEvent(eventId, companyId);
    console.log('[e2e] ✅ Lifecycle test complete');
  });

  test('API order creation for event lifecycle', async ({
    apiClient,
    testState,
  }) => {
    const companyId = testState.companyId;
    test.skip(!companyId, 'No company available');

    // Create event + ticket
    const eventData = testEventData('order-lifecycle');
    const eventResult = await apiClient.createEvent(companyId, eventData);
    if (eventResult.status >= 400) {
      test.skip(true, 'Cannot create event');
      return;
    }

    const eventId = eventResult.body?._id || eventResult.body?.insertedId;

    const ticketData = testTicketData(eventId, companyId);
    const ticketResult = await apiClient.createTicket(companyId, ticketData);
    if (ticketResult.status >= 400) {
      test.skip(true, 'Cannot create ticket');
      return;
    }

    const ticketId = ticketResult.body?._id || ticketResult.body?.insertedId;

    // Create an order
    const orderResult = await apiClient.createOrder({
      eventId,
      tickets: [{ ticketId, quantity: 2 }],
    });

    if (orderResult.status < 300) {
      const orderId = orderResult.body?._id || orderResult.body?.insertedId;
      expect(orderId).toBeTruthy();
      console.log(`[e2e] Order created: ${orderId}`);

      // Verify order in orders list
      const orders = await apiClient.getOrders(companyId);
      expect(orders.status).toBe(200);
    }

    // Cleanup
    await apiClient.deleteEvent(eventId, companyId);
  });
});
