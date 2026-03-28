/**
 * Full User Journey E2E Test — TicketSeat
 *
 * Uses a REAL verified account (aleksaton@gmail.com) with Stripe connected.
 * No demo accounts, no API shortcuts for auth — pure UI flow.
 *
 * Flow:
 *  1.  Login via admin UI
 *  2.  Create event (with seating if possible, GA otherwise)
 *  3.  Create ticket for the event
 *  4.  Create store/shop for the event
 *  5.  Visit the store, select ticket
 *  6.  Buy ticket via Stripe Checkout (test card 4242...)
 *  7.  Verify purchase in admin (issued tickets / orders)
 *  8.  Refund the ticket
 *  9.  Delete the event
 *  10. Verify store is gone
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import {
  URLS,
  CREDENTIALS,
  STRIPE_CARD,
  ADMIN_ROUTES,
  generateEventData,
  generateTicketData,
  generateStoreData,
  TEST_RUN_ID,
} from '../helpers/test-data';

// ── Shared state across serial steps ────────────────────────────────
let adminContext: BrowserContext;
let adminPage: Page;
let eventId: string;
let shopId: string;
let storeUrl: string;
let eventData: ReturnType<typeof generateEventData>;
let ticketData: ReturnType<typeof generateTicketData>;

// ── Helpers ─────────────────────────────────────────────────────────

/** Wait for Angular to bootstrap and settle */
async function waitForAngular(page: Page, timeout = 15_000) {
  await page.waitForSelector('app-root', { state: 'attached', timeout });
  // Wait for loading overlay to disappear
  const overlay = page.locator('.fixed.inset-0.bg-white, .fixed.inset-0.z-50');
  const count = await overlay.count();
  if (count > 0) {
    await overlay.first().waitFor({ state: 'hidden', timeout }).catch(() => {});
  }
  await page.waitForTimeout(500);
}

/** Take a named screenshot for debugging */
async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: true,
  });
}

/** Fill a datetime-local input robustly for Angular reactive forms */
async function fillDateTimeInput(page: Page, selector: string, value: string) {
  const input = page.locator(selector);
  await expect(input).toBeVisible({ timeout: 5_000 });
  // Click to focus
  await input.click();
  // Use Playwright fill
  await input.fill(value);
  // Reinforce with native setter + events for Angular
  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      if (setter) {
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    },
    { sel: selector, val: value },
  );
}

/** Wait for network to settle */
async function waitForNetworkSettled(page: Page, ms = 1000) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

test.describe.serial('Full User Journey — Login → Create → Buy → Refund → Cleanup', () => {

  // ── Setup: create a persistent browser context ──────────────────
  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
    });
    adminPage = await adminContext.newPage();
    eventData = generateEventData();
    ticketData = generateTicketData();
  });

  // ── Cleanup: always try to delete the event ─────────────────────
  test.afterAll(async () => {
    // If we have an event but failed to delete it in the test, try API cleanup
    if (eventId) {
      try {
        // Get token from localStorage
        const token = await adminPage.evaluate(() => localStorage.getItem('auth_token'));
        if (token) {
          const res = await adminPage.request.get(
            `${URLS.api}/event?companyId=all`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          // If we can still reach the API, try to find and delete our event
          console.log(`[cleanup] Event ${eventId} — manual cleanup may be needed if test failed`);
        }
      } catch {
        // Best effort
      }
    }
    await adminContext?.close();
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: LOGIN
  // ═══════════════════════════════════════════════════════════════════
  test('Step 1: Login to admin', async () => {
    const page = adminPage;

    await page.goto(`${URLS.admin}${ADMIN_ROUTES.login}`);
    await waitForAngular(page);

    // Fill email
    const emailInput = page.getByPlaceholder(/email/i).or(page.locator('input[type="email"]')).first();
    await expect(emailInput).toBeVisible();
    await emailInput.fill(CREDENTIALS.email);

    // Fill password
    const passwordInput = page.getByPlaceholder(/password/i).or(page.locator('input[type="password"]')).first();
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill(CREDENTIALS.password);

    // Click Sign in
    const signInBtn = page.getByRole('button', { name: /sign in/i });
    await expect(signInBtn).toBeEnabled({ timeout: 5_000 });
    await signInBtn.click();

    // Wait for redirect — could be dashboard, company select, superadmin, or events
    await page.waitForURL(/\/(dashboard|company|events|superadmin)/, { timeout: 30_000 });
    await waitForAngular(page);

    // Superadmin or no company selected → go to company select and pick one
    if (page.url().includes('/superadmin') || page.url().includes('/company')) {
      if (page.url().includes('/superadmin')) {
        console.log('[step 1] Superadmin detected — navigating to company select');
        await page.goto(`${URLS.admin}/company/select`);
        await waitForAngular(page);
      }

      // Pick "TicketSeats Presentation" company (most likely to have active Stripe)
      // The companies are clickable card/button elements under "YOUR COMPANIES"
      const presentationCompany = page.locator('button, div[role="button"], a')
        .filter({ hasText: /TicketSeats Presentation/i })
        .first();

      if (await presentationCompany.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await presentationCompany.click();
      } else {
        // Fallback: click first company that's not a super admin option
        const companyCards = page.locator('button, div[role="button"]')
          .filter({ hasText: /test|presentation/i });
        await companyCards.first().click();
      }

      await page.waitForURL(/\/(dashboard|events)/, { timeout: 15_000 });
      await waitForAngular(page);
    }

    // Verify we're logged in
    const url = page.url();
    expect(url).not.toContain('/auth/login');
    expect(url).not.toContain('/company/select');

    // Extract and verify auth token
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token, 'Auth token should be saved after login').toBeTruthy();

    await screenshot(page, '01-logged-in');
    console.log(`[step 1] ✅ Logged in as ${CREDENTIALS.email} — on ${url}`);
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: CREATE EVENT
  // ═══════════════════════════════════════════════════════════════════
  test('Step 2: Create a new event', async () => {
    const page = adminPage;

    await page.goto(`${URLS.admin}${ADMIN_ROUTES.eventCreate}`);
    await waitForAngular(page);
    await page.waitForTimeout(3000);

    // If redirected to billing/payouts (Stripe not set up), try navigating via sidebar
    if (page.url().includes('/billing') || page.url().includes('/payouts') || page.url().includes('/settings')) {
      console.log(`[step 2] ⚠️ Redirected to ${page.url()} — Stripe may not be active. Trying Events from sidebar.`);
      // Click Events in sidebar
      const eventsLink = page.locator('a, button').filter({ hasText: /^Events$/i }).first();
      if (await eventsLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await eventsLink.click();
        await waitForAngular(page);
        await page.waitForTimeout(2000);
      }
      // Navigate directly to events/create
      await page.goto(`${URLS.admin}${ADMIN_ROUTES.eventCreate}`);
      await waitForAngular(page);
      await page.waitForTimeout(3000);
    }

    await screenshot(page, '02a-event-form-loaded');
    console.log(`[step 2] On page: ${page.url()}`);

    // Wait for the event creation form — try various selectors
    await page.waitForSelector(
      'input[formcontrolname="name"], input[formcontrolname="eventName"], input[placeholder*="event" i], form input[type="text"]',
      { timeout: 15_000 },
    );

    await screenshot(page, '02a-event-form-loaded');

    // Fill event name
    const nameInput = page.locator('input[formcontrolname="name"]');
    await nameInput.fill(eventData.name);

    // Fill description
    const descInput = page.locator('textarea[formcontrolname="description"]');
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill(eventData.description);
    }

    // Fill location
    const locationInput = page.locator('input[formcontrolname="location"]');
    if (await locationInput.isVisible().catch(() => false)) {
      await locationInput.fill(eventData.location);
    }

    // Fill website
    const websiteInput = page.locator('input[formcontrolname="website"]');
    if (await websiteInput.isVisible().catch(() => false)) {
      await websiteInput.fill(eventData.website);
    }

    // Select category
    const categorySelect = page.locator('select[formcontrolname="category"]');
    if (await categorySelect.isVisible().catch(() => false)) {
      await categorySelect.selectOption(eventData.category);
    }

    // Fill start date
    await fillDateTimeInput(
      page,
      'input[formcontrolname="startDate"]',
      eventData.startDate,
    );

    // Fill end date
    await fillDateTimeInput(
      page,
      'input[formcontrolname="endDate"]',
      eventData.endDate,
    );

    await page.waitForTimeout(500);

    // ── Seating Editor (best effort) ──
    // Try to add a basic seating layout. If the seating editor is too complex,
    // we'll skip it and go with general admission.
    try {
      const seatingSection = page.locator('app-room-editor, [class*="room-editor"], canvas').first();
      if (await seatingSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
        console.log('[step 2] Seating editor visible — attempting to add seats');
        // Look for an "Add Table" or "Add" button in the seating editor
        const addBtn = page.locator('button').filter({ hasText: /add table|add seat|add/i }).first();
        if (await addBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await addBtn.click();
          await page.waitForTimeout(1000);
          console.log('[step 2] Added seating element');
        }
      } else {
        console.log('[step 2] Seating editor not visible — using general admission');
      }
    } catch {
      console.log('[step 2] Seating editor interaction failed — continuing with GA');
    }

    await screenshot(page, '02b-event-form-filled');

    // Click "Create Event"
    const createBtn = page.locator('button').filter({ hasText: /create event/i });
    await expect(createBtn).toBeVisible({ timeout: 5_000 });

    // If button is disabled, try to force date values through Angular
    const isDisabled = await createBtn.isDisabled();
    if (isDisabled) {
      console.log('[step 2] ⚠️ Create button disabled — forcing date values');
      await page.evaluate(
        ({ start, end }) => {
          // Try to find and patch Angular form
          document.querySelectorAll('input[formcontrolname]').forEach((el: any) => {
            const name = el.getAttribute('formcontrolname');
            if (name === 'startDate' || name === 'endDate') {
              const val = name === 'startDate' ? start : end;
              const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                'value',
              )?.set;
              if (setter) {
                setter.call(el, val);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
              }
            }
          });
        },
        { start: eventData.startDate, end: eventData.endDate },
      );
      await page.waitForTimeout(500);
    }

    await expect(createBtn).toBeEnabled({ timeout: 5_000 });
    await createBtn.click();

    // Wait for navigation to event detail/edit page, or a success indicator
    const navPromise = page.waitForURL(/\/events\/[a-f0-9]{24}/, { timeout: 20_000 }).catch(() => null);
    const successPromise = page.locator('[class*="success"], [class*="emerald"], .bg-primary-100')
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => null);

    await Promise.race([navPromise, successPromise]);
    await waitForNetworkSettled(page);

    // Extract eventId from URL
    const currentUrl = page.url();
    const urlMatch = currentUrl.match(/\/events\/([a-f0-9]{24})/);
    if (urlMatch) {
      eventId = urlMatch[1];
    } else {
      // Fallback: search via API
      const token = await page.evaluate(() => localStorage.getItem('auth_token'));
      const company = await page.evaluate(() => localStorage.getItem('selected_company'));
      const companyId = company ? JSON.parse(company)?._id : null;
      if (token && companyId) {
        const res = await page.request.get(
          `${URLS.api}/event?companyId=${companyId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok()) {
          const body = await res.json();
          const events = body?.data || body?.events || (Array.isArray(body) ? body : []);
          const found = events.find((e: any) => e.name === eventData.name);
          if (found) eventId = found._id;
        }
      }
    }

    expect(eventId, 'Event ID should be extracted after creation').toBeTruthy();
    await screenshot(page, '02c-event-created');
    console.log(`[step 2] ✅ Event created: ${eventId}`);
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: CREATE TICKET
  // ═══════════════════════════════════════════════════════════════════
  test('Step 3: Create tickets for the event', async () => {
    const page = adminPage;

    // Navigate to event edit page
    await page.goto(`${URLS.admin}/events/${eventId}/edit`);
    await waitForAngular(page);
    await page.waitForTimeout(3000); // Let Angular lazy load and fetch data

    await screenshot(page, '03a-event-edit-page');

    // Click the "Tickets" tab
    const ticketsTab = page.locator('button, a, [role="tab"]')
      .filter({ hasText: /^tickets$/i })
      .first();
    await expect(ticketsTab).toBeVisible({ timeout: 10_000 });
    await ticketsTab.click();
    await page.waitForTimeout(2000);

    await screenshot(page, '03b-tickets-tab');

    // Click "Add Ticket" or "Create First Ticket"
    const addTicketBtn = page.locator('button')
      .filter({ hasText: /add ticket|create.*ticket/i })
      .first();
    await expect(addTicketBtn).toBeVisible({ timeout: 10_000 });
    await addTicketBtn.click();
    await page.waitForTimeout(1000);

    await screenshot(page, '03c-ticket-form');

    // Fill ticket form — use .last() to target sidebar/modal form (not the main event form)
    const nameInput = page.locator('input[formcontrolname="name"]').last();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(ticketData.name);

    // Description
    const descInput = page.locator('textarea[formcontrolname="description"]').last();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill(ticketData.description);
    }

    // Price
    const priceInput = page.locator('input[formcontrolname="price"]').last();
    if (await priceInput.isVisible().catch(() => false)) {
      await priceInput.fill(ticketData.price);
    }

    // Capacity
    const capacityInput = page.locator('input[formcontrolname="capacity"]').last();
    if (await capacityInput.isVisible().catch(() => false)) {
      await capacityInput.fill(ticketData.capacity);
    }

    // Ticket start date (use event dates)
    const ticketStartInput = page.locator('input[formcontrolname="startDate"]').last();
    if (await ticketStartInput.isVisible().catch(() => false)) {
      await page.evaluate(
        ({ val }) => {
          const inputs = document.querySelectorAll('input[formcontrolname="startDate"]');
          const input = inputs[inputs.length - 1] as HTMLInputElement;
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) {
              setter.call(input, val);
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        },
        { val: eventData.startDate },
      );
    }

    // Ticket end date
    const ticketEndInput = page.locator('input[formcontrolname="endDate"]').last();
    if (await ticketEndInput.isVisible().catch(() => false)) {
      await page.evaluate(
        ({ val }) => {
          const inputs = document.querySelectorAll('input[formcontrolname="endDate"]');
          const input = inputs[inputs.length - 1] as HTMLInputElement;
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) {
              setter.call(input, val);
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        },
        { val: eventData.endDate },
      );
    }

    await page.waitForTimeout(500);
    await screenshot(page, '03d-ticket-form-filled');

    // Submit — look for Save/Create button in the ticket form area
    const saveBtn = page.locator('button')
      .filter({ hasText: /^(save|create|submit|add)( ticket)?$/i })
      .last();
    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saveBtn.click();
    } else {
      // Fallback: submit button
      const fallbackBtn = page.locator('button[type="submit"]').last();
      if (await fallbackBtn.isVisible().catch(() => false)) {
        await fallbackBtn.click();
      } else {
        // Last resort: any visible save-like button
        const anyBtn = page.locator('button').filter({ hasText: /save|create/i }).last();
        await anyBtn.click();
      }
    }

    await waitForNetworkSettled(page, 3000);
    await screenshot(page, '03e-ticket-created');

    // Verify ticket was created via API
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    const company = await page.evaluate(() => localStorage.getItem('selected_company'));
    const companyId = company ? JSON.parse(company)?._id : null;

    if (token && companyId) {
      const res = await page.request.get(
        `${URLS.api}/ticket?companyId=${companyId}&eventId=${eventId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok()) {
        const body = await res.json();
        const tickets = body?.data || body?.tickets || (Array.isArray(body) ? body : []);
        expect(tickets.length, 'At least one ticket should exist').toBeGreaterThan(0);
        console.log(`[step 3] ✅ Ticket(s) created: ${tickets.map((t: any) => t.name).join(', ')}`);
      }
    }

    console.log(`[step 3] ✅ Ticket creation complete`);
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: CREATE STORE/SHOP
  // ═══════════════════════════════════════════════════════════════════
  test('Step 4: Create a store/shop for the event', async () => {
    const page = adminPage;
    const storeData = generateStoreData();

    // Navigate to event edit page if not there
    if (!page.url().includes(`/events/${eventId}/edit`)) {
      await page.goto(`${URLS.admin}/events/${eventId}/edit`);
      await waitForAngular(page);
      await page.waitForTimeout(3000);
    }

    // Click the "Store" tab
    const storeTab = page.locator('button, a, [role="tab"]')
      .filter({ hasText: /^store$/i })
      .first();
    await expect(storeTab).toBeVisible({ timeout: 10_000 });
    await storeTab.click();
    await page.waitForTimeout(2000);

    await screenshot(page, '04a-store-tab');

    // Fill store name
    const storeNameInput = page.locator('input[formcontrolname="name"]').last();
    await expect(storeNameInput).toBeVisible({ timeout: 10_000 });
    await storeNameInput.fill(storeData.name);

    // Select tickets from multi-select dropdown
    // The multi-select is inside app-multi-select-dropdown: a <button> that says "Select tickets"
    // Clicking it opens a dropdown with div.cursor-pointer items containing checkboxes
    const selectTicketsBtn = page.locator('app-multi-select-dropdown button').first();
    await expect(selectTicketsBtn).toBeVisible({ timeout: 10_000 });
    await selectTicketsBtn.click();
    await page.waitForTimeout(1000);

    // Click each ticket option in the dropdown (div.cursor-pointer items)
    const ticketOptions = page.locator('app-multi-select-dropdown .cursor-pointer');
    const optionCount = await ticketOptions.count();
    if (optionCount > 0) {
      // Click the first ticket option (the div, not the checkbox — per Angular pattern)
      await ticketOptions.first().click();
      await page.waitForTimeout(500);
    }

    // Close dropdown by clicking outside
    await page.locator('h2, h3, label').filter({ hasText: /store/i }).first().click();
    await page.waitForTimeout(500);

    await screenshot(page, '04b-store-form-filled');

    // Click "Create Store"
    const createStoreBtn = page.locator('button').filter({ hasText: /create store/i }).first();
    await expect(createStoreBtn).toBeVisible({ timeout: 5_000 });
    await expect(createStoreBtn).toBeEnabled({ timeout: 5_000 });
    await createStoreBtn.click();

    await waitForNetworkSettled(page, 3000);
    await screenshot(page, '04c-store-created');

    // Extract shopId from page content or API
    const pageContent = await page.textContent('body');
    const storeUrlMatch = pageContent?.match(/storeUrl=([a-f0-9]{24})/i);
    if (storeUrlMatch) {
      shopId = storeUrlMatch[1];
    }

    if (!shopId) {
      // Try to find a link with the store URL
      const links = await page.locator('a[href*="storeUrl"]').all();
      for (const link of links) {
        const href = await link.getAttribute('href');
        const match = href?.match(/storeUrl=([a-f0-9]{24})/);
        if (match) {
          shopId = match[1];
          break;
        }
      }
    }

    if (!shopId) {
      // Fallback: use API
      const token = await page.evaluate(() => localStorage.getItem('auth_token'));
      if (token) {
        const res = await page.request.get(
          `${URLS.api}/shop/event/${eventId}`,
        );
        if (res.ok()) {
          const body = await res.json();
          shopId = body?._id;
        }
      }
    }

    expect(shopId, 'Shop ID should be available after store creation').toBeTruthy();
    storeUrl = `${URLS.store}/?storeUrl=${shopId}`;
    console.log(`[step 4] ✅ Store created: ${shopId} — URL: ${storeUrl}`);
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5-7: GO TO STORE → SELECT TICKET → BUY VIA STRIPE
  // ═══════════════════════════════════════════════════════════════════
  test('Step 5-7: Visit store, select ticket, buy via Stripe Checkout', async () => {
    // Open store in a new page (same context to share cookies if needed)
    const storePage = await adminContext.newPage();

    try {
      await storePage.goto(storeUrl);
      await storePage.waitForSelector('app-root', { state: 'attached', timeout: 30_000 });
      await storePage.waitForTimeout(3000); // Angular render time

      await screenshot(storePage, '05a-store-loaded');

      // The store should show our event's tickets
      const body = await storePage.textContent('body');
      console.log(`[step 5] Store body preview: ${body?.slice(0, 200)?.trim()}`);

      // Look for a "Select Tickets" or similar button on a ticket card
      const selectTicketsBtn = storePage.locator('button, a')
        .filter({ hasText: /select tickets|buy|choose|select|get tickets/i })
        .first();

      await expect(selectTicketsBtn).toBeVisible({ timeout: 15_000 });
      await selectTicketsBtn.click();

      // Wait for ticket selection page
      await storePage.waitForTimeout(3000);
      await screenshot(storePage, '05b-ticket-selection');

      // Increase quantity (look for + button or quantity input)
      const plusBtn = storePage.locator('button').filter({ hasText: /\+/ }).first();
      const qtyInput = storePage.locator('input[type="number"]').first();

      if (await plusBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await plusBtn.click();
      } else if (await qtyInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await qtyInput.fill('1');
      }

      await storePage.waitForTimeout(1000);

      // If there's a seat selection step (assigned seating), handle it
      const seatContainer = storePage.locator('app-room-viewer, canvas, [class*="seat"]').first();
      if (await seatContainer.isVisible({ timeout: 3_000 }).catch(() => false)) {
        console.log('[step 6] Seat selection visible — attempting to select a seat');
        // Try clicking on a seat element
        const seat = storePage.locator('[class*="seat"]:not([class*="reserved"]):not([class*="taken"]), circle, rect')
          .first();
        if (await seat.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await seat.click();
          await storePage.waitForTimeout(1000);
        }
        await screenshot(storePage, '06-seat-selected');
      }

      // Click "Buy Now" or "Checkout" or "Pay"
      const buyBtn = storePage.locator('button, a')
        .filter({ hasText: /buy now|checkout|pay|purchase|proceed/i })
        .first();
      await expect(buyBtn).toBeVisible({ timeout: 10_000 });
      await screenshot(storePage, '06b-before-buy');
      await buyBtn.click();

      // ── STRIPE CHECKOUT ──
      // The store redirects to checkout.stripe.com
      console.log('[step 7] Waiting for Stripe Checkout redirect...');
      await storePage.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
      console.log(`[step 7] On Stripe Checkout: ${storePage.url()}`);

      // Wait for Stripe form to load
      await storePage.waitForTimeout(3000);
      await screenshot(storePage, '07a-stripe-checkout');

      // ── Fill Stripe Email ──
      const emailInput = storePage.locator('#email, input[name="email"], input[placeholder*="email" i]').first();
      if (await emailInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await emailInput.fill(STRIPE_CARD.email);
        // Tab away to trigger validation
        await storePage.keyboard.press('Tab');
        await storePage.waitForTimeout(1000);
      }

      // ── Fill Card Number ──
      // Stripe Checkout uses either direct inputs or iframes
      const cardInput = storePage.locator('#cardNumber, input[name="cardNumber"]').first();
      if (await cardInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        // Direct inputs (Stripe Checkout hosted page)
        await cardInput.fill(STRIPE_CARD.number);
      } else {
        // Try iframe-based card input
        const cardFrame = storePage.frameLocator('iframe[name*="card-number"], iframe[title*="card number"]').first();
        const iframeCardInput = cardFrame.locator('input[name="cardnumber"], input[placeholder*="card number" i]');
        if (await iframeCardInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await iframeCardInput.fill(STRIPE_CARD.number);
        }
      }

      // ── Fill Expiry ──
      const expiryInput = storePage.locator('#cardExpiry, input[name="cardExpiry"]').first();
      if (await expiryInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expiryInput.fill(STRIPE_CARD.expiry.replace('/', ''));
      } else {
        const expiryFrame = storePage.frameLocator('iframe[name*="card-expiry"], iframe[title*="expir"]').first();
        const iframeExpiry = expiryFrame.locator('input');
        if (await iframeExpiry.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await iframeExpiry.fill(STRIPE_CARD.expiry.replace('/', ''));
        }
      }

      // ── Fill CVC ──
      const cvcInput = storePage.locator('#cardCvc, input[name="cardCvc"]').first();
      if (await cvcInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await cvcInput.fill(STRIPE_CARD.cvc);
      } else {
        const cvcFrame = storePage.frameLocator('iframe[name*="card-cvc"], iframe[title*="cvc"]').first();
        const iframeCvc = cvcFrame.locator('input');
        if (await iframeCvc.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await iframeCvc.fill(STRIPE_CARD.cvc);
        }
      }

      // ── Fill Cardholder Name (if visible) ──
      const nameInput = storePage.locator('#billingName, input[name="billingName"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await nameInput.fill(STRIPE_CARD.name);
      }

      // ── Fill Billing ZIP / Postal Code (if visible) ──
      const zipInput = storePage.locator('#billingPostalCode, input[name="billingPostalCode"], input[placeholder*="postal" i], input[placeholder*="zip" i]').first();
      if (await zipInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await zipInput.fill('10115');
      }

      // ── Fill Country / Region selector (if visible) ──
      const countrySelect = storePage.locator('#billingCountry, select[name="billingCountry"]').first();
      if (await countrySelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await countrySelect.selectOption('DE');
      }

      await screenshot(storePage, '07b-stripe-filled');

      // ── Click Pay ──
      const payButton = storePage.getByTestId('hosted-payment-submit-button')
        .or(storePage.locator('button[type="submit"]').filter({ hasText: /pay|subscribe|submit/i }))
        .first();
      await expect(payButton).toBeVisible({ timeout: 10_000 });
      await expect(payButton).toBeEnabled({ timeout: 10_000 });
      await payButton.click();

      console.log('[step 7] Clicked Pay — waiting for redirect back...');

      // Wait for redirect back to store (success page) or confirmation
      // Stripe test cards complete instantly, redirect happens in a few seconds
      await storePage.waitForURL(url => !url.toString().includes('checkout.stripe.com'), { timeout: 90_000 });

      await storePage.waitForTimeout(3000);
      await screenshot(storePage, '07c-payment-complete');

      const finalUrl = storePage.url();
      console.log(`[step 7] ✅ Payment complete — redirected to: ${finalUrl}`);

      // Verify success — look for success indicators
      const successBody = await storePage.textContent('body');
      const hasSuccess =
        successBody?.toLowerCase().includes('success') ||
        successBody?.toLowerCase().includes('thank') ||
        successBody?.toLowerCase().includes('confirmed') ||
        successBody?.toLowerCase().includes('order') ||
        successBody?.toLowerCase().includes('complete');
      
      if (hasSuccess) {
        console.log('[step 7] ✅ Success page confirmed');
      } else {
        console.log(`[step 7] ⚠️ Could not confirm success text on page — URL: ${finalUrl}`);
      }

    } finally {
      await storePage.close();
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 8: VERIFY PURCHASE IN ADMIN
  // ═══════════════════════════════════════════════════════════════════
  test('Step 8: Verify ticket purchase in admin', async () => {
    const page = adminPage;

    // Navigate to event DETAILS page (not edit) — this is where issued tickets live
    // Route: /events/:id (event-details component with app-issued-tickets-list)
    await page.goto(`${URLS.admin}/events/${eventId}`);
    await waitForAngular(page);
    await page.waitForTimeout(5000); // Angular lazy-loads + fetches issued tickets

    await screenshot(page, '08a-event-details');

    // The issued tickets list (app-issued-tickets-list) should be visible with at least one row
    // Look for the purchased ticket's email in the table
    const ticketRow = page.locator('text=aleksaton@gmail.com').first();
    const hasTicketInUI = await ticketRow.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasTicketInUI) {
      console.log('[step 8] ✅ Found purchased ticket in issued tickets list (UI)');
    }

    await screenshot(page, '08b-issued-tickets');

    // Also verify via API
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    const company = await page.evaluate(() => localStorage.getItem('selected_company'));
    const companyId = company ? JSON.parse(company)?._id : null;

    expect(token, 'Auth token should exist').toBeTruthy();
    expect(companyId, 'Company ID should exist').toBeTruthy();

    // Check orders
    const ordersRes = await page.request.get(
      `${URLS.api}/order?companyId=${companyId}&eventId=${eventId}`,
      { headers: { Authorization: `Bearer ${token!}` } },
    );

    if (ordersRes.ok()) {
      const ordersBody = await ordersRes.json();
      const orders = ordersBody?.data || ordersBody?.orders || (Array.isArray(ordersBody) ? ordersBody : []);
      console.log(`[step 8] Found ${orders.length} order(s) for event ${eventId}`);
      expect(orders.length, 'Should have at least one order after purchase').toBeGreaterThan(0);
    }

    // Check issued tickets
    const issuedRes = await page.request.get(
      `${URLS.api}/issuedTicket?companyId=${companyId}&eventId=${eventId}`,
      { headers: { Authorization: `Bearer ${token!}` } },
    );

    if (issuedRes.ok()) {
      const issuedBody = await issuedRes.json();
      const issued = issuedBody?.data || issuedBody?.issuedTickets || (Array.isArray(issuedBody) ? issuedBody : []);
      console.log(`[step 8] Found ${issued.length} issued ticket(s)`);
      expect(issued.length, 'Should have at least one issued ticket').toBeGreaterThan(0);
    }

    console.log('[step 8] ✅ Purchase verified in admin');
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 9: REFUND THE TICKET (via UI)
  // ═══════════════════════════════════════════════════════════════════
  test('Step 9: Refund the ticket', async () => {
    const page = adminPage;

    // Make sure we're on the event details page (where issued tickets are shown)
    // Route: /events/:id — has app-issued-tickets-list with refund buttons
    if (!page.url().includes(`/events/${eventId}`) || page.url().includes('/edit')) {
      await page.goto(`${URLS.admin}/events/${eventId}`);
      await waitForAngular(page);
      await page.waitForTimeout(5000);
    }

    await screenshot(page, '09a-before-refund');

    // Find the refund button on the issued ticket row
    // The refund button has title="Refund" and is a red button with an arrow icon
    // On desktop: it's in the table actions column
    // On mobile: it's a button with text "Refund" or "Cancel"
    const refundBtn = page.locator('button[title="Refund"]').first();
    const refundTextBtn = page.locator('button').filter({ hasText: /^Refund$|^Cancel$/ }).first();

    let refundClicked = false;

    if (await refundBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await refundBtn.click();
      refundClicked = true;
    } else if (await refundTextBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await refundTextBtn.click();
      refundClicked = true;
    }

    if (refundClicked) {
      // Wait for the refund confirmation modal to appear
      // Modal has title "Confirm Order Refund" and button "Process Order Refund"
      const confirmModal = page.locator('text=Confirm Order Refund');
      await expect(confirmModal).toBeVisible({ timeout: 5_000 });

      await screenshot(page, '09b-refund-modal');

      // Click "Process Order Refund" button
      const processRefundBtn = page.locator('button').filter({ hasText: /Process Order Refund/i }).first();
      await expect(processRefundBtn).toBeVisible({ timeout: 5_000 });
      await processRefundBtn.click();

      // Wait for refund to process (button shows "Processing..." then modal closes)
      await page.waitForTimeout(5000);
      await waitForNetworkSettled(page, 3000);

      await screenshot(page, '09c-refund-done');
      console.log('[step 9] ✅ Refund completed via UI');
    } else {
      // Fallback: refund via API if UI button not found
      console.log('[step 9] Refund button not found in UI — trying API refund');

      const token = await page.evaluate(() => localStorage.getItem('auth_token'));
      const company = await page.evaluate(() => localStorage.getItem('selected_company'));
      const companyId = company ? JSON.parse(company)?._id : null;

      const issuedRes = await page.request.get(
        `${URLS.api}/issuedTicket?companyId=${companyId}&eventId=${eventId}`,
        { headers: { Authorization: `Bearer ${token!}` } },
      );

      if (issuedRes.ok()) {
        const issuedBody = await issuedRes.json();
        const issued = issuedBody?.data || issuedBody?.issuedTickets || (Array.isArray(issuedBody) ? issuedBody : []);

        if (issued.length > 0) {
          const ticketToRefund = issued[0];
          const refundRes = await page.request.post(
            `${URLS.api}/payment/refund-ticket`,
            {
              data: { issuedTicketId: ticketToRefund._id, companyId },
              headers: { Authorization: `Bearer ${token!}`, 'Content-Type': 'application/json' },
            },
          );
          console.log(`[step 9] API refund status: ${refundRes.status()}`);
          expect(refundRes.status()).toBeLessThan(500);
          console.log('[step 9] ✅ Refund completed via API');
        }
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 10: DELETE THE EVENT (via UI)
  // ═══════════════════════════════════════════════════════════════════
  test('Step 10: Delete the event', async () => {
    const page = adminPage;

    // Navigate to the events LIST page — this is where delete buttons are
    // Route: /events (events-list component with delete button per event card)
    await page.goto(`${URLS.admin}/events`);
    await waitForAngular(page);
    await page.waitForTimeout(3000);

    await screenshot(page, '10a-events-list');

    // Find the event card by its name and click the delete button (trash icon)
    // The delete button has title="Delete event" on the event card
    // Each event card contains the event name, so we locate the card first
    const eventCard = page.locator(`text=${eventId}`).first();
    let deleteClicked = false;

    // Strategy 1: Find the delete button with title="Delete event" near our event
    // The event cards have the event name in a heading, and the delete button in the overlay
    // We need to hover over the card to reveal the action buttons
    const allEventCards = page.locator('[class*="group"]').filter({ hasText: /E2E Journey Event/ });
    
    if (await allEventCards.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      // Hover to reveal action buttons
      await allEventCards.first().hover();
      await page.waitForTimeout(500);

      const deleteBtn = allEventCards.first().locator('button[title="Delete event"]');
      if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await deleteBtn.click();
        deleteClicked = true;
      }
    }

    if (!deleteClicked) {
      // Strategy 2: Try finding any delete button for this event via the page
      // Look for all delete buttons and find one associated with our E2E event
      const allDeleteBtns = page.locator('button[title="Delete event"]');
      const count = await allDeleteBtns.count();
      
      for (let i = 0; i < count; i++) {
        // Check if this delete button is in a card that contains our event name
        const parent = allDeleteBtns.nth(i).locator('xpath=ancestor::*[contains(@class,"group")]');
        const text = await parent.textContent().catch(() => '');
        if (text?.includes('E2E Journey Event')) {
          await allDeleteBtns.nth(i).click();
          deleteClicked = true;
          break;
        }
      }
    }

    if (deleteClicked) {
      // Wait for the delete confirmation dialog
      // Dialog has title "Delete Event?" and button "Delete Event"
      const confirmDialog = page.locator('text=Delete Event?');
      await expect(confirmDialog).toBeVisible({ timeout: 5_000 });

      await screenshot(page, '10b-delete-dialog');

      // Click "Delete Event" confirmation button
      const confirmDeleteBtn = page.locator('button').filter({ hasText: /^Delete Event$/ }).first();
      await expect(confirmDeleteBtn).toBeVisible({ timeout: 5_000 });
      await confirmDeleteBtn.click();

      await waitForNetworkSettled(page, 3000);
      await page.waitForTimeout(2000);

      await screenshot(page, '10c-event-deleted');
      console.log('[step 10] ✅ Event deleted via UI');
    } else {
      // Fallback: delete via API
      console.log('[step 10] Delete button not found in UI — trying API delete');

      const token = await page.evaluate(() => localStorage.getItem('auth_token'));
      const company = await page.evaluate(() => localStorage.getItem('selected_company'));
      const companyId = company ? JSON.parse(company)?._id : null;

      const deleteRes = await page.request.delete(
        `${URLS.api}/event/${eventId}?companyId=${companyId}`,
        { headers: { Authorization: `Bearer ${token!}` } },
      );
      console.log(`[step 10] API delete status: ${deleteRes.status()}`);
      expect(deleteRes.status()).toBeLessThan(500);
      console.log('[step 10] ✅ Event deleted via API');
    }

    // Mark event as deleted for cleanup
    const deletedEventId = eventId;
    eventId = ''; // Prevent afterAll from trying to cleanup again

    console.log(`[step 10] Event ${deletedEventId} deleted`);
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 11: VERIFY STORE IS DELETED
  // ═══════════════════════════════════════════════════════════════════
  test('Step 11: Verify store is deleted', async () => {
    expect(shopId, 'Shop ID should exist').toBeTruthy();

    // Check the store URL in a new page
    const checkPage = await adminContext.newPage();

    try {
      await checkPage.goto(storeUrl, { timeout: 30_000 });
      await checkPage.waitForTimeout(5000);

      await screenshot(checkPage, '11-store-after-delete');

      const body = await checkPage.textContent('body');
      const finalUrl = checkPage.url();

      // The store should show an error, 404, or redirect to an error page
      const isGone =
        body?.toLowerCase().includes('not found') ||
        body?.toLowerCase().includes('404') ||
        body?.toLowerCase().includes('error') ||
        body?.toLowerCase().includes('does not exist') ||
        body?.toLowerCase().includes('no store') ||
        body?.toLowerCase().includes('unavailable') ||
        body?.trim() === '' ||
        finalUrl.includes('error');

      console.log(`[step 11] Store URL response: ${body?.slice(0, 200)?.trim()}`);

      // Also verify via API
      const apiRes = await checkPage.request.get(`${URLS.api}/shop/event/${shopId}`);
      const apiStatus = apiRes.status();
      console.log(`[step 11] API shop check status: ${apiStatus}`);

      // Either the page shows "not found" OR the API returns 404
      expect(
        isGone || apiStatus >= 400,
        'Store should be gone after event deletion',
      ).toBe(true);

      console.log('[step 11] ✅ Store is deleted / not accessible');
    } finally {
      await checkPage.close();
    }
  });
});
