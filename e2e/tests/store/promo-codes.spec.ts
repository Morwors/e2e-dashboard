/**
 * Store Promo Codes Tests — Apply valid/invalid promo codes.
 *
 * Every assertion is meaningful. No `expect(x || true)` patterns.
 */

import { test, expect, request as apiRequest } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';
import { URLS, testEventData, testTicketData, testPromoData, TEST_RUN_ID } from '../../fixtures/test-data';
import { waitForAngularReady } from '../../helpers/wait-helpers';

// Shared state
let eventId: string;
let ticketId: string;
let promoCode: string;
let companyId: string;

test.describe.serial('Store Promo Codes', () => {
  test('setup: create event, ticket, shop, and promo code', async () => {
    const ctx = await apiRequest.newContext({ baseURL: URLS.api });
    const api = new ApiClient(ctx, URLS.api);

    // Create demo account + data
    const demo = await api.createDemo();
    expect(demo.status).toBe(200);

    const companies = await api.getCompanies();
    const companiesList =
      companies.body?.data ||
      companies.body?.companies ||
      (Array.isArray(companies.body) ? companies.body : []);
    expect(companiesList.length).toBeGreaterThan(0);
    companyId = companiesList[0]._id;

    // Create event + ticket + shop + promo
    const eventResult = await api.createEvent(companyId, testEventData('promo'));
    expect(eventResult.status).toBeLessThan(300);
    eventId = eventResult.body?._id || eventResult.body?.insertedId;

    const ticketResult = await api.createTicket(companyId, testTicketData(eventId, companyId));
    expect(ticketResult.status).toBeLessThan(300);
    ticketId = ticketResult.body?._id || ticketResult.body?.insertedId;

    await api.createShop(companyId, {
      eventId,
      ticketIds: [ticketId],
      name: `E2E Promo Store ${TEST_RUN_ID}`,
    });

    const promoData = testPromoData(eventId);
    const promoResult = await api.createPromoCode(companyId, promoData);
    expect(promoResult.status).toBeLessThan(300);
    promoCode = promoData.code;

    await ctx.dispose();
  });

  test('store loads with event data for promo testing', async ({ page }) => {
    await page.goto(`${URLS.store}?storeUrl=${eventId}`);
    await waitForAngularReady(page);

    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    const hasTicketContent =
      bodyText!.includes('Ticket') || bodyText!.includes('Select');
    expect(hasTicketContent).toBe(true);
  });

  test('promo code API validation — valid code returns success', async ({ request }) => {
    const res = await request.get(
      `${URLS.api}/promo/exists?code=${promoCode}&eventId=${eventId}`,
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toBeTruthy();
    // Valid promo should return discount info
    expect(body.discount).toBe(10);
  });

  test('promo code API validation — nonexistent code returns error', async ({ request }) => {
    const res = await request.get(
      `${URLS.api}/promo/exists?code=NONEXISTENT_CODE_12345&eventId=${eventId}`,
    );

    // Nonexistent promo should return 404 or error body
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
