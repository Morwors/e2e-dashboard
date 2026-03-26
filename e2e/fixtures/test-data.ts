/**
 * Test data constants used across all test suites.
 * Unique values are generated per test run to ensure isolation.
 */

/** Unique identifier for this test run (timestamp-based) */
export const TEST_RUN_ID = process.env.TEST_RUN_ID || Date.now().toString(36);

/** Generate a unique email for each test run */
export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${TEST_RUN_ID}-${Math.random().toString(36).slice(2, 7)}@ticketseat-test.io`;
}

/** Generate a unique phone number for each test invocation */
export function uniquePhone(): string {
  const rand = Math.floor(Math.random() * 9000000) + 1000000;
  return `+1555${rand}`;
}

// ── URLs ─────────────────────────────────────────────────────────────
export const URLS = {
  landing: process.env.BASE_URL_LANDING || 'https://landing-dev.ticketseat.io',
  admin: process.env.BASE_URL_ADMIN || 'https://admin-dev.ticketseat.io',
  store: process.env.BASE_URL_STORE || 'https://store-dev.ticketseat.io',
  api: process.env.BASE_URL_API || 'https://backend-dev.ticketseat.io',
};

// ── Test Admin User ──────────────────────────────────────────────────
export const TEST_ADMIN = {
  firstName: process.env.TEST_ADMIN_FIRST_NAME || 'E2E',
  lastName: process.env.TEST_ADMIN_LAST_NAME || 'Tester',
  email: '', // filled at runtime by setup
  password: process.env.TEST_ADMIN_PASSWORD || 'TestE2E_2026!',
  phone: process.env.TEST_ADMIN_PHONE || `+1555${Date.now().toString().slice(-7)}`,
};

// ── Test Company ─────────────────────────────────────────────────────
export const TEST_COMPANY = {
  name: `E2E Test Company ${TEST_RUN_ID}`,
  description: 'Automated test company created by E2E suite',
};

// ── Test Event ───────────────────────────────────────────────────────
export function testEventData(suffix = '') {
  const futureDate1 = new Date();
  futureDate1.setMonth(futureDate1.getMonth() + 1);
  const futureDate2 = new Date();
  futureDate2.setMonth(futureDate2.getMonth() + 1);
  futureDate2.setDate(futureDate2.getDate() + 1);

  return {
    name: `E2E Test Event ${suffix || TEST_RUN_ID}`,
    description: 'Automated test event for E2E testing',
    location: 'E2E Test Venue, Test City',
    website: 'https://e2e-test.ticketseat.io',
    category: 'music',
    dates: [futureDate1.toISOString(), futureDate2.toISOString()],
    room: '[[]]',
  };
}

// ── Test Ticket ──────────────────────────────────────────────────────
export function testTicketData(eventId: string, companyId: string) {
  // Ticket availableDates must not be after the event's end date
  // Use the same dates as the event (1 month from now)
  const futureDate1 = new Date();
  futureDate1.setMonth(futureDate1.getMonth() + 1);
  const futureDate2 = new Date();
  futureDate2.setMonth(futureDate2.getMonth() + 1);
  futureDate2.setDate(futureDate2.getDate() + 1);

  return {
    name: `E2E GA Ticket ${TEST_RUN_ID}`,
    description: 'General Admission test ticket',
    price: 25,
    capacity: 100,
    isPublic: true,
    eventId,
    companyId,
    availableDates: [futureDate1.toISOString(), futureDate2.toISOString()],
  };
}

// ── Test Promo Code ──────────────────────────────────────────────────
export function testPromoData(eventId: string) {
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 3);
  return {
    code: `E2EPROMO${TEST_RUN_ID.toUpperCase().slice(0, 6)}`,
    discount: 10,
    limit: 50,
    eventId,
    expirationDate: expiry.toISOString(),
  };
}

// ── Stripe Test Cards ────────────────────────────────────────────────
export const STRIPE = {
  card: process.env.STRIPE_TEST_CARD || '4242424242424242',
  card3ds: process.env.STRIPE_TEST_CARD_3DS || '4000002760003184',
  cardDeclined: process.env.STRIPE_TEST_CARD_DECLINED || '4000000000009995',
  expiry: process.env.STRIPE_TEST_EXPIRY || '12/28',
  cvc: process.env.STRIPE_TEST_CVC || '123',
  zip: process.env.STRIPE_TEST_ZIP || '12345',
};

// ── Admin Route Paths (from admin/src/app/app.routes.ts) ─────────────
export const ADMIN_ROUTES = {
  login: '/auth/login',
  register: '/auth/register',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
  verifyEmail: '/auth/verify-email',
  verify: '/auth/verify',
  companySelect: '/company/select',
  dashboard: '/dashboard',
  events: '/events',
  eventCreate: '/events/create',
  eventDetails: (id: string) => `/events/${id}`,
  eventEdit: (id: string) => `/events/${id}/edit`,
  eventSeating: (id: string) => `/events/${id}/seating`,
  employees: '/employees',
  settings: '/settings',
  settingsSubscription: '/settings/subscription',
  billing: '/billing',
  notifications: '/notifications',
};

// ── Store Route Paths ────────────────────────────────────────────────
export const STORE_ROUTES = {
  home: '/',
  ticket: (id: string) => `/ticket/${id}`,
  order: '/order',
};

// ── API Endpoints (from backend/routes/) ─────────────────────────────
export const API = {
  // Auth / User
  register: '/user/register',
  login: '/user/login',
  me: '/user/me',
  verifyToken: (token: string) => `/user/verify/${token}`,
  demo: '/user/demo',
  forgotPassword: '/forgot/forgot-password',
  resetPassword: '/forgot/reset-password',

  // Company
  company: '/company',
  companyStripe: '/company/stripe',
  companyEmployees: (companyId: string) => `/company/${companyId}/employee`,
  companyEmployee: (companyId: string, empId: string) =>
    `/company/${companyId}/employee/${empId}`,

  // Event
  event: '/event',
  eventById: (id: string) => `/event/${id}`,
  eventRoom: (id: string) => `/event/${id}/room`,

  // Ticket
  ticketCreate: '/ticket/create',
  ticketList: '/ticket',
  ticketById: (id: string) => `/ticket/${id}`,

  // Shop
  shopCreate: '/shop/create',
  shopByEvent: (eventId: string) => `/shop/event/${eventId}`,
  shopById: (id: string) => `/shop/${id}`,

  // Order
  order: '/order',
  orderById: (id: string) => `/order/${id}`,

  // Payment
  createPaymentIntent: '/payment/create-payment-intent',
  refundTicket: '/payment/refund-ticket',

  // Promo
  promo: '/promo',
  promoExists: '/promo/exists',
  promoById: (id: string) => `/promo/${id}`,

  // Reservation
  reserveSeats: '/reservation/reserve',
  releaseReservation: (id: string) => `/reservation/${id}`,
  extendReservation: (id: string) => `/reservation/extend/${id}`,
  seatAvailability: '/reservation/availability',

  // Issued Ticket
  issuedTicket: '/issuedTicket',
  issuedTicketBatch: '/issuedTicket/batch',

  // Notification
  notification: '/notification',

  // Statistics
  statistics: {
    issuedTickets: '/statistic/issuedTickets',
    storeVisits: '/statistic/storeVisits',
    orders: '/statistic/orders',
    revenue: '/statistic/revenue',
    revenueSummary: '/statistic/revenueSummary',
  },
};
