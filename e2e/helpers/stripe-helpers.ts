/**
 * Stripe test card helpers.
 *
 * Stripe Checkout is a hosted page, so we can't directly fill card details
 * in most E2E scenarios. These helpers are useful for:
 * - Direct API tests
 * - Playwright intercepting Stripe Checkout fields via iframes
 * - Reference data for manual/visual verification
 */

export const STRIPE_TEST_CARDS = {
  /** Visa – succeeds immediately */
  success: {
    number: '4242424242424242',
    expMonth: '12',
    expYear: '28',
    cvc: '123',
    zip: '12345',
  },

  /** Visa – requires 3D Secure authentication */
  threeDSecure: {
    number: '4000002760003184',
    expMonth: '12',
    expYear: '28',
    cvc: '123',
    zip: '12345',
  },

  /** Visa – declined (insufficient funds) */
  declined: {
    number: '4000000000009995',
    expMonth: '12',
    expYear: '28',
    cvc: '123',
    zip: '12345',
  },

  /** Visa – generic decline */
  genericDecline: {
    number: '4000000000000002',
    expMonth: '12',
    expYear: '28',
    cvc: '123',
    zip: '12345',
  },
};

/**
 * Fill Stripe Checkout card details inside a Stripe-hosted page.
 *
 * Because Stripe Checkout runs on checkout.stripe.com, the approach is:
 *  1. Wait for the Stripe page to load
 *  2. Fill the card number, expiry, CVC using Playwright's page object
 *
 * NOTE: Stripe Checkout fields live in iframes. The page.frameLocator
 * approach is needed for embedded Stripe Elements, but on hosted Checkout
 * the inputs are direct page elements.
 */
export async function fillStripeCheckout(
  page: import('@playwright/test').Page,
  card = STRIPE_TEST_CARDS.success,
) {
  // Wait for Stripe Checkout page to load
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

  // Card number field
  const cardInput = page.locator('#cardNumber');
  await cardInput.waitFor({ state: 'visible', timeout: 15_000 });
  await cardInput.fill(card.number);

  // Expiry
  const expiryInput = page.locator('#cardExpiry');
  await expiryInput.fill(`${card.expMonth}${card.expYear}`);

  // CVC
  const cvcInput = page.locator('#cardCvc');
  await cvcInput.fill(card.cvc);

  // Billing ZIP (if visible)
  const zipInput = page.locator('#billingPostalCode');
  if (await zipInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await zipInput.fill(card.zip);
  }
}

/**
 * Submit the Stripe Checkout form after filling card details.
 */
export async function submitStripeCheckout(
  page: import('@playwright/test').Page,
) {
  const payButton = page.getByTestId('hosted-payment-submit-button');
  // Fallback: use role-based selector
  const submitBtn = payButton.or(
    page.locator('button[type="submit"]').filter({ hasText: /pay/i }),
  );
  await submitBtn.click();
}
