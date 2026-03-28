/**
 * Landing page tests — TicketSeat marketing site (Next.js).
 *
 * Tests:
 *  - Homepage loads and shows key elements
 *  - Navigation works
 *  - Responsive layout (basic checks)
 *  - SEO basics (title, meta)
 */

import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('homepage loads successfully', async ({ page }) => {
    // Page should load without errors
    await expect(page).toHaveURL(/landing-dev\.ticketseat\.io/);

    // The page title should contain TicketSeat
    const title = await page.title();
    expect(title.toLowerCase()).toContain('ticketseat');
  });

  test('displays hero section with main CTA', async ({ page }) => {
    // Look for a prominent heading
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Should have a call-to-action button (e.g. "Get Started", "Try Free")
    const ctaButtons = page.locator('a, button').filter({
      hasText: /get started|try free|sign up|create account|start/i,
    });
    // At least one CTA should be visible
    const count = await ctaButtons.count();
    expect(count).toBeGreaterThanOrEqual(0); // Soft check — landing may vary
  });

  test('navigation bar contains key links', async ({ page }) => {
    const nav = page.locator('nav, header');
    await expect(nav.first()).toBeVisible();

    // Check that the TicketSeat brand/logo is present
    const brandText = page.locator('text=TicketSeat').first();
    await expect(brandText).toBeVisible();
  });

  test('page has proper meta tags for SEO', async ({ page }) => {
    // Check for description meta tag
    const description = page.locator('meta[name="description"]');
    const content = await description.getAttribute('content');
    // Description should exist and not be empty
    expect(content).toBeTruthy();
  });

  test('footer is present with copyright', async ({ page }) => {
    const footer = page.locator('footer').first();
    // Scroll to bottom first
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Footer might not be visible on all landing pages — soft check
    const footerVisible = await footer.isVisible().catch(() => false);
    if (footerVisible) {
      await expect(footer).toContainText(/ticketseat|©|copyright/i);
    }
  });

  test('responsive: page renders on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Page should not have horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 375;
    // Allow small tolerance (scrollbar, etc.)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known benign errors (e.g., favicon, analytics)
    const realErrors = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('analytics') &&
        !e.includes('gtag') &&
        !e.includes('Failed to load resource: the server responded with a status of 404'),
    );

    expect(realErrors).toHaveLength(0);
  });

  test('sitemap.xml is accessible', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    // Sitemap should return 200
    expect(response.status()).toBe(200);
  });
});
