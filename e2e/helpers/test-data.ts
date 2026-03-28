/**
 * Test data constants for the full journey E2E test.
 *
 * Uses a real verified account (aleksaton@gmail.com) with Stripe connected.
 * No demo accounts — this is the real deal.
 */

export const TEST_RUN_ID = Date.now().toString(36);

// ── URLs ─────────────────────────────────────────────────────────────
export const URLS = {
  admin: process.env.BASE_URL_ADMIN || 'https://admin-dev.ticketseat.io',
  store: process.env.BASE_URL_STORE || 'https://store-dev.ticketseat.io',
  api: process.env.BASE_URL_API || 'https://backend-dev.ticketseat.io',
};

// ── Credentials ──────────────────────────────────────────────────────
export const CREDENTIALS = {
  email: process.env.TEST_ADMIN_EMAIL || 'aleksaton@gmail.com',
  password: process.env.TEST_ADMIN_PASSWORD || 'Polekaki123!',
};

// ── Stripe Test Card ─────────────────────────────────────────────────
export const STRIPE_CARD = {
  number: process.env.STRIPE_TEST_CARD || '4242424242424242',
  expiry: process.env.STRIPE_TEST_EXPIRY || '12/30',
  cvc: process.env.STRIPE_TEST_CVC || '123',
  name: 'Test User',
  email: process.env.TEST_ADMIN_EMAIL || 'aleksaton@gmail.com',
};

// ── Event Data ───────────────────────────────────────────────────────
export function generateEventData() {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() + 1);
  startDate.setHours(19, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);
  endDate.setHours(23, 0, 0, 0);

  return {
    name: `E2E Journey Event ${TEST_RUN_ID}`,
    description: 'Automated E2E test event — full journey with Stripe integration. This event tests the complete lifecycle.',
    location: 'E2E Test Venue, Berlin, Germany',
    website: 'https://e2e-test.ticketseat.io',
    category: 'music',
    startDate: startDate.toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
    endDate: endDate.toISOString().slice(0, 16),
    startDateISO: startDate.toISOString(),
    endDateISO: endDate.toISOString(),
  };
}

// ── Ticket Data ──────────────────────────────────────────────────────
export function generateTicketData() {
  return {
    name: `GA Ticket ${TEST_RUN_ID}`,
    description: 'General Admission — E2E test ticket',
    price: '10',
    capacity: '100',
  };
}

// ── Store/Shop Data ──────────────────────────────────────────────────
export function generateStoreData() {
  return {
    name: `E2E Store ${TEST_RUN_ID}`,
  };
}

// ── Admin Routes ─────────────────────────────────────────────────────
export const ADMIN_ROUTES = {
  login: '/auth/login',
  dashboard: '/dashboard',
  events: '/events',
  eventCreate: '/events/create',
  eventEdit: (id: string) => `/events/${id}/edit`,
  eventView: (id: string) => `/events/${id}`,
};
