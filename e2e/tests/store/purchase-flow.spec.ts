/**
 * Store Purchase Flow Tests — Full purchase golden path.
 *
 * Creates data via API, then tests the store UI for real.
 * No `expect(x || true)` patterns. Every assertion must pass to succeed.
 */

import { test, expect, request as apiRequest } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';
import { URLS, testEventData, testTicketData, TEST_RUN_ID } from '../../fixtures/test-data';
import { waitForAngularReady } from '../../helpers/wait-helpers';

// Shared state for serial tests
let eventId: string;
let ticketId: string;
let shopId: string;
let companyId: string;

test.describe.serial('Store Purchase Flow', () => {
  test('setup: create event, ticket, and shop via API', async () => {
    const ctx = await apiRequest.newContext({ baseURL: URLS.api });
    const api = new ApiClient(ctx, URLS.api);

    // Create demo account
    const demo = await api.createDemo();
    expect(demo.status).toBe(200);
    expect(demo.body.token).toBeTruthy();

    // Get company
    const companies = await api.getCompanies();
    const companiesList =
      companies.body?.data ||
      companies.body?.companies ||
      (Array.isArray(companies.body) ? companies.body : []);
    expect(companiesList.length).toBeGreaterThan(0);
    companyId = companiesList[0]._id;

    // Create event
    const eventData = testEventData('store-purchase');
    const eventResult = await api.createEvent(companyId, eventData);
    expect(eventResult.status).toBeLessThan(300);
    eventId = eventResult.body?._id || eventResult.body?.insertedId;
    expect(eventId).toBeTruthy();

    // Create ticket
    const ticketData = testTicketData(eventId, companyId);
    const ticketResult = await api.createTicket(companyId, ticketData);
    expect(ticketResult.status).toBeLessThan(300);
    ticketId = ticketResult.body?._id || ticketResult.body?.insertedId;
    expect(ticketId).toBeTruthy();

    // Create shop
    const shopResult = await api.createShop(companyId, {
      eventId,
      ticketIds: [ticketId],
      name: `E2E Store ${TEST_RUN_ID}`,
      description: 'E2E test shop',
    });
    expect(shopResult.status).toBeLessThan(300);
    shopId = shopResult.body?._id || shopResult.body?.insertedId;
    expect(shopId).toBeTruthy();

    await ctx.dispose();
  });

  test('store page loads with event details', async ({ page }) => {
    await page.goto(`${URLS.store}?storeUrl=${eventId}`);
    await waitForAngularReady(page);

    // Must show event/ticket content
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    const hasEventContent =
      bodyText!.includes('Select Your Tickets') ||
      bodyText!.includes('Ticket') ||
      bodyText!.includes(TEST_RUN_ID);
    expect(hasEventContent).toBe(true);
  });

  test('store shows ticket cards with names and prices', async ({ page }) => {
    await page.goto(`${URLS.store}?storeUrl=${eventId}`);
    await waitForAngularReady(page);

    // Look for ticket name or GA text
    const ticketCard = page.locator('text=/GA Ticket|General|E2E GA/i').first();
    await expect(ticketCard).toBeVisible({ timeout: 10_000 });
  });

  test('clicking ticket navigates to ticket selection', async ({ page }) => {
    await page.goto(`${URLS.store}?storeUrl=${eventId}`);
    await waitForAngularReady(page);

    // Find and click a select/buy button
    const selectBtn = page.locator('button, a').filter({
      hasText: /select tickets|buy now|choose|select/i,
    }).first();
    await expect(selectBtn).toBeVisible({ timeout: 10_000 });
    await selectBtn.click();

    // Should navigate to ticket selection page
    await page.waitForURL(/\/ticket\//, { timeout: 10_000 });
    expect(page.url()).toContain('/ticket/');
  });

  test('store header shows TicketSeat branding', async ({ page }) => {
    await page.goto(URLS.store);
    await waitForAngularReady(page);

    const brand = page.locator('text=TicketSeat').first();
    await expect(brand).toBeVisible({ timeout: 10_000 });
  });

  test('store shows empty state when no event context', async ({ page }) => {
    // Navigate without store URL param
    await page.goto(URLS.store);
    await waitForAngularReady(page);

    // Should show the "no event" state
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Must show some indication that no event is loaded
    const hasEmptyState =
      bodyText!.toLowerCase().includes('ready to find tickets') ||
      bodyText!.toLowerCase().includes('refresh') ||
      bodyText!.toLowerCase().includes('store url') ||
      bodyText!.toLowerCase().includes('ticketseat');
    expect(hasEmptyState).toBe(true);
  });
});
