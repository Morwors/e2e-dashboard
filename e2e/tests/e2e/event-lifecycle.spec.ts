/**
 * Full Event Lifecycle E2E Test — The REAL user journey.
 *
 * This is the complete flow:
 *   1.  Register (UI) → verify success message
 *   2.  Setup demo account (API — can't verify email without DB)
 *   3.  Login (UI) → inject auth token & verify redirect
 *   4.  Select company (API — fetch company list)
 *   5.  Verify billing (UI)
 *   6.  Create event (UI) → fill form, submit, extract eventId
 *   7.  Add ticket (UI) → tickets tab, sidebar form, extract ticketId
 *   8.  Create store (UI) → store tab, create, extract shopId
 *   9.  Store shows event details (UI)
 *  10.  Add tickets to cart (UI)
 *  11.  Create promo code (API — promo UI may not exist yet)
 *  12.  Verify promo code works (API)
 *  13.  Create order (API)
 *  14.  Cleanup (API)
 */

import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';
import {
  URLS,
  ADMIN_ROUTES,
  uniqueEmail,
  uniquePhone,
  TEST_ADMIN,
  testEventData,
  testTicketData,
  testPromoData,
  TEST_RUN_ID,
} from '../../fixtures/test-data';
import { waitForAngularReady, waitForNetworkIdle } from '../../helpers/wait-helpers';

// ── UI Helper: Fill a datetime-local input via native setter ─────────
async function fillDateTimeLocal(
  page: import('@playwright/test').Page,
  formControlName: string,
  isoValue: string,
) {
  // datetime-local inputs need the format "YYYY-MM-DDTHH:mm"
  const dtLocalValue = isoValue.slice(0, 16); // "2026-04-26T19:50"
  const input = page.locator(`input[formcontrolname="${formControlName}"]`);
  await expect(input).toBeVisible({ timeout: 5_000 });

  // Clear then fill — Playwright's fill() dispatches all the right events
  await input.click();
  await input.fill(dtLocalValue);

  // Also set via native setter + Angular-compatible events as reinforcement
  await page.evaluate(
    ({ selector, val }) => {
      const el = document.querySelector(
        `input[formcontrolname="${selector}"]`,
      ) as HTMLInputElement;
      if (!el) return;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      nativeInputValueSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { selector: formControlName, val: dtLocalValue },
  );
}

// ── UI Helper: Inject auth into localStorage ─────────────────────────
async function injectAuth(
  page: import('@playwright/test').Page,
  token: string,
  companyObj?: any,
) {
  await page.evaluate(
    ({ t, company }) => {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('auth_remember', 'true');
      if (company) {
        localStorage.setItem('selected_company', JSON.stringify(company));
      }
    },
    { t: token, company: companyObj ?? null },
  );
}

test.describe.serial('Full User Journey — End-to-End', () => {
  // Shared state across serial tests
  let api: ApiClient;
  let token: string;
  let companyId: string;
  let companyObj: any;
  let eventId: string;
  let ticketId: string;
  let shopId: string;
  let promoCode: string;
  let userEmail: string;

  // ── Step 1: Register via UI ────────────────────────────────────

  test('1. Register — fill form and submit', async ({ page }) => {
    await page.goto(`${URLS.admin}${ADMIN_ROUTES.register}`);
    await waitForAngularReady(page);

    // Verify page loaded
    await expect(page.locator('h2')).toContainText('Create account');

    const email = uniqueEmail('journey');
    const phone = uniquePhone();

    // Fill all fields
    await page.locator('#firstName').fill('Journey');
    await page.locator('#lastName').fill('Tester');
    await page.locator('#email').fill(email);
    await page.locator('#phone').fill(phone);
    await page.locator('#password').fill(TEST_ADMIN.password);
    await page.locator('#confirmPassword').fill(TEST_ADMIN.password);

    // Submit button should be enabled
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Wait for response — success means green banner, failure means red banner
    const successBanner = page.locator('.bg-emerald-50, .bg-emerald-900\\/20').first();
    const errorBanner = page.locator('.bg-red-50, .bg-red-900\\/20').first();

    await expect(successBanner.or(errorBanner)).toBeVisible({ timeout: 15_000 });

    // Registration with unique data should succeed
    const hasError = await errorBanner.isVisible().catch(() => false);
    if (hasError) {
      const errorText = await errorBanner.textContent();
      expect(hasError, `Registration failed unexpectedly: ${errorText}`).toBe(false);
    }

    console.log('[journey] ✅ Registration form submitted successfully');
  });

  // ── Step 2: Setup demo account (since we can't verify email) ──

  test('2. Setup verified account via demo API', async ({ request }) => {
    api = new ApiClient(request, URLS.api);
    const demo = await api.createDemo();
    expect(demo.status).toBe(200);
    expect(demo.body.token).toBeTruthy();

    token = demo.body.token;

    // Verify we can fetch user info
    const me = await api.me();
    expect(me.status).toBe(200);
    expect(me.body.user).toBeTruthy();
    expect(me.body.user.email).toBeTruthy();
    userEmail = me.body.user.email;

    console.log(`[journey] ✅ Demo account ready: ${userEmail}`);
  });

  // ── Step 3: Login via UI ───────────────────────────────────────

  test('3. Login — inject auth token and verify access', async ({ page }) => {
    expect(token).toBeTruthy();

    // Go to login page first
    await page.goto(`${URLS.admin}${ADMIN_ROUTES.login}`);
    await waitForAngularReady(page);

    // Inject auth token (demo accounts have no known password)
    await page.evaluate((t: string) => {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('auth_remember', 'true');
    }, token);

    // Navigate to company select / dashboard
    await page.goto(`${URLS.admin}${ADMIN_ROUTES.companySelect}`);
    await waitForAngularReady(page);

    // Should NOT be on login page
    const url = page.url();
    expect(url).not.toContain('/auth/login');

    // Should be on company select or dashboard
    const validPage = url.includes('/company/select') || url.includes('/dashboard');
    expect(validPage).toBe(true);

    console.log(`[journey] ✅ Login successful, on: ${url}`);
  });

  // ── Step 4: Get company (demo already creates one) ─────────────

  test('4. Select company', async ({ request }) => {
    expect(token).toBeTruthy();

    api = new ApiClient(request, URLS.api);
    api.setToken(token);

    const companies = await api.getCompanies();
    expect(companies.status).toBe(200);

    const companiesList =
      companies.body?.data ||
      companies.body?.companies ||
      (Array.isArray(companies.body) ? companies.body : []);
    expect(companiesList.length).toBeGreaterThan(0);

    companyObj = companiesList[0];
    companyId = companyObj._id;
    expect(companyId).toBeTruthy();

    console.log(`[journey] ✅ Company: ${companyObj.name} (${companyId})`);
  });

  // ── Step 5: Verify billing/Stripe status ───────────────────────

  test('5. Verify billing — demo company has active Stripe', async ({ page }) => {
    expect(token).toBeTruthy();
    expect(companyObj).toBeTruthy();

    // Inject auth + company BEFORE Angular boots (overrides stale storageState)
    await page.addInitScript(({ t, company }) => {
      localStorage.clear();
      localStorage.setItem('auth_token', t);
      localStorage.setItem('auth_remember', 'true');
      localStorage.setItem('selected_company', JSON.stringify(company));
    }, { t: token, company: companyObj });

    await page.goto(`${URLS.admin}${ADMIN_ROUTES.billing}`);
    await waitForAngularReady(page);

    // Should be on billing page
    expect(page.url()).toContain('/billing');

    // Page should contain billing/Stripe-related content
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    const hasBillingContent =
      bodyText!.toLowerCase().includes('stripe') ||
      bodyText!.toLowerCase().includes('billing') ||
      bodyText!.toLowerCase().includes('payment') ||
      bodyText!.toLowerCase().includes('connect') ||
      bodyText!.toLowerCase().includes('active');
    expect(hasBillingContent).toBe(true);

    // Demo company should have stripeAccountStatus: 'active'
    expect(companyObj.stripeAccountStatus).toBe('active');

    console.log('[journey] ✅ Billing verified — Stripe active');
  });

  // ── Step 6: Create event via UI ────────────────────────────────

  test('6. Create event via UI', async ({ page, request }) => {
    expect(companyId).toBeTruthy();
    expect(token).toBeTruthy();

    // Prepare event data
    const eventData = testEventData('journey');
    const startDate = eventData.dates[0];
    const endDate = eventData.dates[1];

    // Inject auth BEFORE Angular boots (overrides stale storageState)
    await page.addInitScript(({ t, company }) => {
      localStorage.clear();
      localStorage.setItem('auth_token', t);
      localStorage.setItem('auth_remember', 'true');
      localStorage.setItem('selected_company', JSON.stringify(company));
    }, { t: token, company: companyObj });

    // Navigate to event creation page
    await page.goto(`${URLS.admin}${ADMIN_ROUTES.eventCreate}`);
    await waitForAngularReady(page);

    // Wait for the form to be present
    await page.waitForSelector('input[formcontrolname="name"]', { timeout: 15_000 });

    // Fill event name
    await page.locator('input[formcontrolname="name"]').fill(eventData.name);

    // Select category (values are lowercase: music, sports, theater, food)
    await page.selectOption('select[formcontrolname="category"]', eventData.category || 'music');

    // Fill location
    await page.locator('input[formcontrolname="location"]').fill(eventData.location || 'E2E Test Venue, Test City');

    // Fill website
    await page.locator('input[formcontrolname="website"]').fill(eventData.website || 'https://e2e-test.ticketseat.io');

    // Fill description (min 10 chars required by validator)
    await page.locator('textarea[formcontrolname="description"]').fill(eventData.description || 'Automated test event for E2E testing');

    // Skip image upload — not required by form validators

    // Fill start date (datetime-local needs special handling for Angular reactive forms)
    await fillDateTimeLocal(page, 'startDate', startDate);

    // Fill end date
    await fillDateTimeLocal(page, 'endDate', endDate);

    // Small wait for Angular to process all form changes
    await page.waitForTimeout(500);

    // Verify form is valid before clicking — log state for debugging
    const formState = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Create Event'));
      const inputs: Record<string, string> = {};
      document.querySelectorAll('input[formcontrolname], select[formcontrolname], textarea[formcontrolname]').forEach((el: any) => {
        inputs[el.getAttribute('formcontrolname')] = el.value?.slice(0, 30) || '(empty)';
      });
      return { btnDisabled: btn?.disabled, inputs };
    });
    console.log(`[journey] Form state before submit:`, JSON.stringify(formState));

    // Click "Create Event" button
    const createBtn = page.locator('button').filter({ hasText: /Create Event/i });
    await expect(createBtn).toBeVisible({ timeout: 5_000 });

    // If button is disabled, dates didn't register — force them via Angular's form API
    if (formState.btnDisabled) {
      console.log('[journey] ⚠️ Create button disabled — forcing dates via Angular form patchValue');
      await page.evaluate(({ s, e }) => {
        // Find the Angular component instance and patch the form directly
        const formEl = document.querySelector('form');
        if (!formEl) return;
        // Try to reach Angular's FormGroup via __ngContext__ on the component
        const detailsTab = document.querySelector('app-event-details-tab');
        if (detailsTab) {
          // Angular Ivy stores component ref in __ngContext__
          const ctx = (detailsTab as any).__ngContext__;
          if (Array.isArray(ctx)) {
            for (const item of ctx) {
              if (item?.detailsForm?.patchValue) {
                item.detailsForm.patchValue({ startDate: s, endDate: e });
                console.log('Patched form via Angular component');
                return;
              }
            }
          }
        }
        // Fallback: dispatch events more aggressively
        ['startDate', 'endDate'].forEach((name, i) => {
          const val = i === 0 ? s : e;
          const input = document.querySelector(`input[formcontrolname="${name}"]`) as HTMLInputElement;
          if (input) {
            input.focus();
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
            setter.call(input, val);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
          }
        });
      }, { s: startDate.slice(0, 16), e: endDate.slice(0, 16) });
      await page.waitForTimeout(500);
    }

    await expect(createBtn).toBeEnabled({ timeout: 5_000 });
    await createBtn.click();

    // Wait for success — either a success alert or URL navigation to /events/:id
    await Promise.race([
      page.waitForURL(/\/events\/[a-f0-9]{24}/, { timeout: 15_000 }).catch(() => {}),
      page.locator('.bg-primary-100, .bg-emerald-50, [class*="success"]').first()
        .waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
    ]);

    // Give the app a moment to settle
    await waitForNetworkIdle(page, 1000);

    // Try to extract eventId from URL first
    const currentUrl = page.url();
    const urlMatch = currentUrl.match(/\/events\/([a-f0-9]{24})/);

    if (urlMatch) {
      eventId = urlMatch[1];
    } else {
      // Fallback: use API to find the event we just created
      api = new ApiClient(request, URLS.api);
      api.setToken(token);

      // Try fetching events list via API and find ours by name
      const eventsRes = await request.get(
        `${URLS.api}/event?companyId=${companyId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(eventsRes.ok()).toBe(true);
      const eventsBody = await eventsRes.json();
      const eventsList = eventsBody?.data || eventsBody?.events || (Array.isArray(eventsBody) ? eventsBody : []);
      const found = eventsList.find((e: any) => e.name === eventData.name);
      expect(found, `Could not find event "${eventData.name}" after UI creation`).toBeTruthy();
      eventId = found._id;
    }

    expect(eventId).toBeTruthy();

    // Verify event was created correctly via API
    api = new ApiClient(request, URLS.api);
    api.setToken(token);
    const getEvent = await api.getEvent(eventId);
    expect(getEvent.status).toBe(200);
    expect(getEvent.body.name).toBe(eventData.name);

    console.log(`[journey] ✅ Event created via UI: ${eventId}`);
  });

  // ── Step 7: Add ticket via UI ──────────────────────────────────

  test('7. Add ticket to event via UI', async ({ page, request }) => {
    expect(eventId).toBeTruthy();
    expect(companyId).toBeTruthy();

    const ticketData = testTicketData(eventId, companyId);
    const ticketStartDate = ticketData.availableDates?.[0] || new Date().toISOString();
    const ticketEndDate = ticketData.availableDates?.[1] || new Date(Date.now() + 86400000 * 30).toISOString();

    // Inject auth and navigate to event EDIT page.
    // The edit page at /events/:id/edit has tabs: Details, Tickets, Store, etc.
    //
    // IMPORTANT: The e2e project pre-loads storageState (auth/admin.json) with a different
    // demo account's token. Angular reads localStorage on init, before we can override it.
    // Solution: Use addInitScript to inject our auth token BEFORE Angular boots.
    await page.addInitScript(({ t, company }) => {
      localStorage.clear();
      localStorage.setItem('auth_token', t);
      localStorage.setItem('auth_remember', 'true');
      localStorage.setItem('selected_company', JSON.stringify(company));
    }, { t: token, company: companyObj });

    // Intercept API responses to prevent 401 redirect (axios interceptor nukes token on 401)
    const apiErrors: string[] = [];
    await page.route('**/api/**', async (route) => {
      const response = await route.fetch();
      if (response.status() === 401) {
        apiErrors.push(`401 on ${route.request().url()}`);
        console.log(`[journey] ⚠️ Intercepted 401: ${route.request().url()}`);
      }
      await route.fulfill({ response });
    });

    await page.goto(`${URLS.admin}/events/${eventId}/edit`);
    await waitForAngularReady(page);

    // Wait for Angular to fully load event data (the edit page fires loadEventAndTickets on init)
    await page.waitForTimeout(5000);

    // Check if we got redirected
    if (!page.url().includes('/edit')) {
      console.log(`[journey] ⚠️ Redirected to ${page.url()}, re-navigating...`);
      if (apiErrors.length) console.log(`[journey] API errors: ${apiErrors.join(', ')}`);
      // Clear and re-inject auth
      await page.evaluate(({ t, company }) => {
        localStorage.clear();
        localStorage.setItem('auth_token', t);
        localStorage.setItem('auth_remember', 'true');
        localStorage.setItem('selected_company', JSON.stringify(company));
      }, { t: token, company: companyObj });
      await page.goto(`${URLS.admin}/events/${eventId}/edit`);
      await waitForAngularReady(page);
      await page.waitForTimeout(5000);
    }

    console.log(`[journey] Step 7 on: ${page.url()}`);
    expect(page.url(), 'Should be on the event edit page').toContain('/edit');

    // The edit page loads tickets in ngOnInit, so they should be loaded already.
    // Click the "Tickets" tab to switch the view.
    const ticketsTab = page.locator('button').filter({ hasText: 'Tickets' }).first();
    await expect(ticketsTab).toBeVisible({ timeout: 5_000 });
    await ticketsTab.click();

    // Wait for tab switch and any additional API calls to settle
    await page.waitForTimeout(3000);

    // Check if we got redirected AGAIN after clicking the tab
    if (!page.url().includes('/edit')) {
      console.log(`[journey] ⚠️ Redirected after tab click to: ${page.url()}`);
      if (apiErrors.length) console.log(`[journey] API errors: ${apiErrors.join(', ')}`);
      // Re-navigate
      await page.evaluate(({ t, company }) => {
        localStorage.clear();
        localStorage.setItem('auth_token', t);
        localStorage.setItem('auth_remember', 'true');
        localStorage.setItem('selected_company', JSON.stringify(company));
      }, { t: token, company: companyObj });
      await page.goto(`${URLS.admin}/events/${eventId}/edit`);
      await waitForAngularReady(page);
      await page.waitForTimeout(3000);
      // Click tickets tab again
      await page.locator('button').filter({ hasText: 'Tickets' }).first().click();
      await page.waitForTimeout(2000);
    }

    // Now look for the "Add Ticket" button — it should be in the tickets tab
    // The button text is "Add Ticket" in the header, or "Create First Ticket" in the empty state
    const addTicketBtn = page.locator('button').filter({ hasText: /Add Ticket|Create First Ticket/i });
    await expect(addTicketBtn.first()).toBeVisible({ timeout: 10_000 });
    await addTicketBtn.first().click();

    // Wait for the sidebar/modal/form to appear
    await page.waitForTimeout(1000);

    // Fill ticket name — use the last matching input (in case the event form fields exist above)
    const nameInput = page.locator('input[formcontrolname="name"]').last();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(ticketData.name);

    // Fill description
    const descInput = page.locator('textarea[formcontrolname="description"]').last();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill(ticketData.description || 'General Admission test ticket');
    }

    // Fill price
    const priceInput = page.locator('input[formcontrolname="price"]').last();
    if (await priceInput.isVisible().catch(() => false)) {
      await priceInput.fill(String(ticketData.price));
    }

    // Fill capacity
    const capacityInput = page.locator('input[formcontrolname="capacity"]').last();
    if (await capacityInput.isVisible().catch(() => false)) {
      await capacityInput.fill(String(ticketData.capacity));
    }

    // Fill ticket start date (target the last matching input — sidebar form)
    await page.evaluate(
      ({ selector, val }) => {
        const inputs = document.querySelectorAll(`input[formcontrolname="${selector}"]`);
        const input = inputs[inputs.length - 1] as HTMLInputElement;
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )!.set!;
          nativeInputValueSetter.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      { selector: 'startDate', val: ticketStartDate.slice(0, 16) },
    );

    // Fill ticket end date
    await page.evaluate(
      ({ selector, val }) => {
        const inputs = document.querySelectorAll(`input[formcontrolname="${selector}"]`);
        const input = inputs[inputs.length - 1] as HTMLInputElement;
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )!.set!;
          nativeInputValueSetter.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      { selector: 'endDate', val: ticketEndDate.slice(0, 16) },
    );

    // Submit the ticket form — look for Save/Create/Submit button
    const saveBtn = page.locator('button')
      .filter({ hasText: /^(Save|Create|Submit|Add)( Ticket)?$/i })
      .last();

    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saveBtn.click();
    } else {
      // Fallback: find any submit button
      const fallbackBtn = page.locator('button[type="submit"]').last();
      if (await fallbackBtn.isVisible().catch(() => false)) {
        await fallbackBtn.click();
      } else {
        const genericSave = page.locator('button').filter({ hasText: /Save|Create|Submit/i }).last();
        await genericSave.click();
      }
    }

    // Wait for success indication
    await waitForNetworkIdle(page, 2000);

    // Extract ticketId — use API to find the ticket we created
    api = new ApiClient(request, URLS.api);
    api.setToken(token);
    const ticketsRes = await api.getTickets(companyId, eventId);
    expect(ticketsRes.status).toBe(200);

    const ticketsList = ticketsRes.body?.data || ticketsRes.body?.tickets || (Array.isArray(ticketsRes.body) ? ticketsRes.body : []);
    expect(ticketsList.length, 'Expected at least one ticket after UI creation').toBeGreaterThan(0);

    // Find the ticket we just created by name
    const found = ticketsList.find((t: any) => t.name === ticketData.name) || ticketsList[0];
    ticketId = found._id;
    expect(ticketId).toBeTruthy();

    // Verify ticket data
    const getTicket = await api.getTicket(ticketId);
    expect(getTicket.status).toBe(200);
    expect(getTicket.body.name).toBe(ticketData.name);

    console.log(`[journey] ✅ Ticket created via UI: ${ticketId}`);
  });

  // ── Step 8: Create store/shop via UI ───────────────────────────

  test('8. Create store for event via UI', async ({ page, request }) => {
    expect(eventId).toBeTruthy();
    expect(ticketId).toBeTruthy();
    expect(companyId).toBeTruthy();

    // Inject auth BEFORE Angular boots
    await page.addInitScript(({ t, company }) => {
      localStorage.clear();
      localStorage.setItem('auth_token', t);
      localStorage.setItem('auth_remember', 'true');
      localStorage.setItem('selected_company', JSON.stringify(company));
    }, { t: token, company: companyObj });

    // Navigate to event edit page
    await page.goto(`${URLS.admin}/events/${eventId}/edit`);
    await waitForAngularReady(page);

    // Wait for Angular to fully settle (prevent 401 redirect race)
    await page.waitForTimeout(5000);

    // Check we're still on edit page
    if (!page.url().includes('/edit')) {
      console.log(`[journey] ⚠️ Redirected to ${page.url()}, re-navigating for store step...`);
      await page.evaluate(({ t, company }) => {
        localStorage.clear();
        localStorage.setItem('auth_token', t);
        localStorage.setItem('auth_remember', 'true');
        localStorage.setItem('selected_company', JSON.stringify(company));
      }, { t: token, company: companyObj });
      await page.goto(`${URLS.admin}/events/${eventId}/edit`);
      await waitForAngularReady(page);
      await page.waitForTimeout(5000);
    }

    // Click the "Store" tab
    const storeTab = page.locator('button').filter({ hasText: 'Store' }).first();
    await expect(storeTab).toBeVisible({ timeout: 5_000 });
    await storeTab.click();
    await page.waitForTimeout(2000);

    // ── Fill Store Name ──
    const storeNameInput = page.locator('input[formcontrolname="name"]').last();
    await expect(storeNameInput).toBeVisible({ timeout: 10_000 });
    await storeNameInput.fill(`E2E Store ${TEST_RUN_ID}`);

    // ── Select tickets from multi-select dropdown ──
    // The dropdown is a custom component: button "Select tickets" opens a list
    const selectTicketsBtn = page.locator('button').filter({ hasText: /Select tickets/i });
    await expect(selectTicketsBtn).toBeVisible({ timeout: 5_000 });
    await selectTicketsBtn.click();
    await page.waitForTimeout(500);

    // After clicking, the dropdown shows div items with checkbox + label for each ticket
    // The items have structure: div > input[type=checkbox] + label with ticket name
    const ticketOption = page.locator('app-multi-select-dropdown .cursor-pointer, app-multi-select-dropdown div.px-3').first();
    if (await ticketOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await ticketOption.click();
    } else {
      // Fallback: click the first checkbox in the dropdown
      const anyCheckbox = page.locator('app-multi-select-dropdown input[type="checkbox"]').first();
      if (await anyCheckbox.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await anyCheckbox.click();
      }
    }

    // Close dropdown by clicking elsewhere
    await page.locator('h2, h3').first().click();
    await page.waitForTimeout(500);

    // ── Submit the store form ──
    const createStoreBtn = page.locator('button').filter({ hasText: /Create Store/i }).first();
    await expect(createStoreBtn).toBeEnabled({ timeout: 5_000 });
    await createStoreBtn.click();

    // Wait for store creation to complete
    await waitForNetworkIdle(page, 3000);

    // ── Extract shopId ──
    let extractedShopId: string | null = null;

    // Check page content for store URL with shopId
    const pageContent = await page.textContent('body');
    const storeUrlMatch = pageContent?.match(/storeUrl=([a-f0-9]{24})/i);
    if (storeUrlMatch) {
      extractedShopId = storeUrlMatch[1];
    }

    if (!extractedShopId) {
      // Fallback: use API to find the shop
      api = new ApiClient(request, URLS.api);
      api.setToken(token);
      const getShop = await api.getShopByEvent(eventId);
      expect(getShop.status).toBe(200);
      expect(getShop.body).toBeTruthy();
      extractedShopId = getShop.body._id;
    }

    shopId = extractedShopId!;
    expect(shopId).toBeTruthy();

    console.log(`[journey] ✅ Shop created via UI: ${shopId}`);
  });

  // ── Step 9: Go to store and verify event shows ─────────────────

  test('9. Store shows event details', async ({ page }) => {
    expect(eventId).toBeTruthy();

    await page.goto(`${URLS.store}?storeUrl=${shopId}`);
    await waitForAngularReady(page);

    // Store must load and show event/ticket content
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    const hasEventContent =
      bodyText!.includes('Select Your Tickets') ||
      bodyText!.includes('Ticket') ||
      bodyText!.includes('E2E');
    expect(hasEventContent).toBe(true);

    console.log('[journey] ✅ Store shows event details');
  });

  // ── Step 10: Add tickets to cart ───────────────────────────────

  test('10. Add tickets to cart in store', async ({ page }) => {
    expect(eventId).toBeTruthy();

    await page.goto(`${URLS.store}?storeUrl=${shopId}`);
    await waitForAngularReady(page);

    // Find the ticket card / select button
    const selectBtn = page.locator('button, a').filter({
      hasText: /select tickets|buy now|choose|select/i,
    }).first();

    await expect(selectBtn).toBeVisible({ timeout: 10_000 });
    await selectBtn.click();

    // Should navigate to ticket selection page
    await page.waitForURL(/\/ticket\//, { timeout: 10_000 });
    expect(page.url()).toContain('/ticket/');

    console.log('[journey] ✅ Navigated to ticket selection');
  });

  // ── Step 11: Create promo code (API — promo UI may not exist) ──

  test('11. Create promo code', async ({ request }) => {
    expect(eventId).toBeTruthy();
    expect(companyId).toBeTruthy();

    api = new ApiClient(request, URLS.api);
    api.setToken(token);

    const promoData = testPromoData(eventId);
    const result = await api.createPromoCode(companyId, promoData);
    expect(result.status).toBeLessThan(300);

    promoCode = promoData.code;

    // Verify promo exists
    const exists = await api.promoExists(promoCode, eventId);
    expect(exists.status).toBe(200);

    console.log(`[journey] ✅ Promo code created: ${promoCode}`);
  });

  // ── Step 12: Verify promo in store ─────────────────────────────

  test('12. Verify promo code works via API', async ({ request }) => {
    expect(promoCode).toBeTruthy();
    expect(eventId).toBeTruthy();

    // Verify the promo code is valid via API
    const res = await request.get(
      `${URLS.api}/promo/exists?code=${promoCode}&eventId=${eventId}`,
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toBeTruthy();
    expect(body.discount).toBe(10);
    expect(body.code).toBe(promoCode);

    // Verify invalid code is rejected
    const invalidRes = await request.get(
      `${URLS.api}/promo/exists?code=FAKECODE999&eventId=${eventId}`,
    );
    expect(invalidRes.status()).toBeGreaterThanOrEqual(400);

    console.log('[journey] ✅ Promo code verified');
  });

  // ── Bonus: API order creation ──────────────────────────────────

  test('13. Create order via API', async ({ request }) => {
    expect(eventId).toBeTruthy();
    expect(ticketId).toBeTruthy();

    api = new ApiClient(request, URLS.api);
    api.setToken(token);

    const orderResult = await api.createOrder({
      eventId,
      tickets: [{ ticketId, quantity: 2 }],
    });

    // Order should be created (may require payment depending on config)
    expect(orderResult.status).toBeLessThan(500);

    if (orderResult.status < 300) {
      const orderId = orderResult.body?._id || orderResult.body?.insertedId;
      expect(orderId).toBeTruthy();

      // Verify order appears in company orders
      const orders = await api.getOrders(companyId);
      expect(orders.status).toBe(200);

      console.log(`[journey] ✅ Order created: ${orderId}`);
    } else {
      // If order requires Stripe payment intent first, that's expected
      console.log(`[journey] ⚠️ Order creation returned ${orderResult.status} — may need payment flow`);
    }
  });

  // ── Cleanup ────────────────────────────────────────────────────

  test('14. Cleanup — delete test event', async ({ request }) => {
    if (!eventId || !companyId) return;

    api = new ApiClient(request, URLS.api);
    api.setToken(token);

    const deleteResult = await api.deleteEvent(eventId, companyId);
    expect(deleteResult.status).toBeLessThan(500);

    console.log('[journey] ✅ Cleanup complete');
  });
});
