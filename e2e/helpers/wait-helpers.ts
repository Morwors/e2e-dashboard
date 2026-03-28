/**
 * Custom waiters for Angular SPAs.
 *
 * Angular 19 with MobX state management needs extra time
 * to settle after navigation and state updates.
 */

import { Page, expect } from '@playwright/test';

/**
 * Wait for Angular app to finish initial bootstrap and hydration.
 * Checks for the absence of a loading spinner / overlay.
 */
export async function waitForAngularReady(page: Page, timeout = 15_000) {
  // Wait for the Angular root element to be present
  await page.waitForSelector('app-root', { state: 'attached', timeout });

  // Wait for any loading overlays to disappear
  const overlay = page.locator('.fixed.inset-0');
  // Only wait if the overlay is actually in the DOM
  const count = await overlay.count();
  if (count > 0) {
    await overlay.first().waitFor({ state: 'hidden', timeout }).catch(() => {
      // overlay might have already been removed
    });
  }

  // Extra settle time for MobX reactions to propagate
  await page.waitForTimeout(300);
}

/**
 * Wait for Angular navigation to complete.
 * Angular uses the router which doesn't trigger full page loads.
 */
export async function waitForAngularNavigation(
  page: Page,
  expectedPath: string,
  timeout = 15_000,
) {
  await page.waitForURL(`**${expectedPath}**`, { timeout });
  await waitForAngularReady(page, timeout);
}

/**
 * Wait for network requests to settle (no pending requests for `idleMs`).
 * Useful after form submissions or data mutations.
 */
export async function waitForNetworkIdle(page: Page, idleMs = 500) {
  await page.waitForLoadState('networkidle').catch(() => {
    // networkidle isn't always reliable for SPAs
  });
  await page.waitForTimeout(idleMs);
}

/**
 * Wait for a toast/notification to appear and optionally verify its text.
 */
export async function waitForToast(
  page: Page,
  textPattern?: string | RegExp,
  timeout = 10_000,
) {
  // TicketSeat uses various toast patterns — look for common success/error alerts
  const toastSelectors = [
    '[role="alert"]',
    '.toast',
    '.notification',
    '.snackbar',
    '[class*="toast"]',
    '[class*="alert"]',
  ];

  for (const selector of toastSelectors) {
    const el = page.locator(selector).first();
    try {
      await el.waitFor({ state: 'visible', timeout: timeout / toastSelectors.length });
      if (textPattern) {
        await expect(el).toContainText(
          typeof textPattern === 'string' ? textPattern : textPattern,
        );
      }
      return el;
    } catch {
      // try next selector
    }
  }

  // If no toast found with specific selectors, wait for any visible feedback
  if (textPattern) {
    const text = typeof textPattern === 'string' ? textPattern : textPattern.source;
    await expect(page.locator('body')).toContainText(text, { timeout });
  }
}

/**
 * Retry an async action until it succeeds or times out.
 * Useful for eventually-consistent operations (e.g. after webhooks).
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  { intervalMs = 1000, timeoutMs = 15_000, label = 'retryUntil' } = {},
): Promise<T> {
  const start = Date.now();
  let lastResult: T | undefined;

  while (Date.now() - start < timeoutMs) {
    lastResult = await fn();
    if (predicate(lastResult)) return lastResult;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `${label}: timed out after ${timeoutMs}ms. Last result: ${JSON.stringify(lastResult)}`,
  );
}

/**
 * Scroll an element into view and click it (useful for Angular lazy-loaded content).
 */
export async function scrollAndClick(page: Page, selector: string) {
  const el = page.locator(selector);
  await el.scrollIntoViewIfNeeded();
  await el.click();
}
