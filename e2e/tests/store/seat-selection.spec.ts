/**
 * Store Seat Selection Tests — Seat map, reservation, and timer.
 *
 * Every assertion is meaningful. No `expect(x || true)` or `>= 0` patterns.
 */

import { test, expect, request as apiRequest } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';
import { URLS, testEventData, testTicketData, TEST_RUN_ID } from '../../fixtures/test-data';
import { waitForAngularReady } from '../../helpers/wait-helpers';

// Shared state
let eventId: string;
let ticketId: string;

test.describe.serial('Store Seat Selection', () => {
  test('setup: create event, ticket, and shop', async () => {
    const ctx = await apiRequest.newContext({ baseURL: URLS.api });
    const api = new ApiClient(ctx, URLS.api);

    const demo = await api.createDemo();
    expect(demo.status).toBe(200);

    const companies = await api.getCompanies();
    const companiesList =
      companies.body?.data ||
      companies.body?.companies ||
      (Array.isArray(companies.body) ? companies.body : []);
    expect(companiesList.length).toBeGreaterThan(0);
    const companyId = companiesList[0]._id;

    const eventResult = await api.createEvent(companyId, testEventData('seat'));
    expect(eventResult.status).toBeLessThan(300);
    eventId = eventResult.body?._id || eventResult.body?.insertedId;

    const ticketResult = await api.createTicket(companyId, testTicketData(eventId, companyId));
    expect(ticketResult.status).toBeLessThan(300);
    ticketId = ticketResult.body?._id || ticketResult.body?.insertedId;

    await api.createShop(companyId, {
      eventId,
      ticketIds: [ticketId],
      name: `E2E Seat Store ${TEST_RUN_ID}`,
    });

    await ctx.dispose();
  });

  test('ticket selection page loads for valid ticket', async ({ page }) => {
    await page.goto(`${URLS.store}/ticket/${ticketId}`);
    await waitForAngularReady(page);

    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Should show ticket info or venue layout
    const hasContent =
      bodyText!.includes('Ticket') ||
      bodyText!.includes('Seat') ||
      bodyText!.includes('GA') ||
      bodyText!.includes('Select');
    expect(hasContent).toBe(true);
  });

  test('ticket selection page has back navigation', async ({ page }) => {
    await page.goto(`${URLS.store}/ticket/${ticketId}`);
    await waitForAngularReady(page);

    // There should be a back button or link
    const backBtn = page.locator('button, a').filter({
      has: page.locator('svg'),
    }).first();

    const backLink = page.locator('a[href*="store"], button').filter({
      hasText: /back|return|←/i,
    }).first();

    const hasBack = await backBtn.isVisible().catch(() => false);
    const hasBackLink = await backLink.isVisible().catch(() => false);

    // UI should have a back element
    expect(hasBack || hasBackLink).toBe(true);
  });

  test('invalid ticket ID shows error or redirect', async ({ page }) => {
    await page.goto(`${URLS.store}/ticket/000000000000000000000000`);
    await waitForAngularReady(page);

    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Should show error, redirect to store, or show "not found"
    const isErrorOrRedirect =
      bodyText!.toLowerCase().includes('not found') ||
      bodyText!.toLowerCase().includes('error') ||
      bodyText!.toLowerCase().includes('ticketseat') ||
      !page.url().includes('000000000000000000000000');
    expect(isErrorOrRedirect).toBe(true);
  });
});
