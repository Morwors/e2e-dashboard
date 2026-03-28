/**
 * API Client helper — wraps Playwright APIRequestContext for TicketSeat backend.
 *
 * Used both in test fixtures and directly in API tests.
 * All methods use proper JWT auth headers and return typed responses.
 */

import { APIRequestContext } from '@playwright/test';
import { API } from '../fixtures/test-data';

export interface AuthTokens {
  token: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
}

export class ApiClient {
  private token: string | null = null;

  constructor(
    private request: APIRequestContext,
    private baseURL: string,
  ) {}

  // ── Auth ─────────────────────────────────────────────────────────

  /** Set the JWT token for subsequent requests */
  setToken(token: string) {
    this.token = token;
  }

  /** Get current token */
  getToken(): string | null {
    return this.token;
  }

  private authHeaders(): Record<string, string> {
    if (!this.token) return {};
    return { Authorization: `Bearer ${this.token}` };
  }

  /** Register a new user account */
  async register(data: RegisterPayload, teamToken?: string) {
    const url = teamToken
      ? `${this.baseURL}${API.register}?team_token=${teamToken}`
      : `${this.baseURL}${API.register}`;

    const res = await this.request.post(url, {
      data,
      headers: { 'Content-Type': 'application/json' },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Verify email with token */
  async verifyEmail(token: string) {
    const res = await this.request.get(
      `${this.baseURL}${API.verifyToken(token)}`,
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Login and store token for subsequent calls */
  async login(email: string, password: string) {
    const res = await this.request.post(`${this.baseURL}${API.login}`, {
      data: { email, password },
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await res.json().catch(() => null);
    if (res.ok() && body?.token) {
      this.token = body.token;
    }
    return { status: res.status(), body };
  }

  /** Get current user info */
  async me() {
    const res = await this.request.get(`${this.baseURL}${API.me}`, {
      headers: this.authHeaders(),
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Create demo account (returns token directly) */
  async createDemo() {
    const res = await this.request.get(`${this.baseURL}${API.demo}`);
    const body = await res.json().catch(() => null);
    if (res.ok() && body?.token) {
      this.token = body.token;
    }
    return { status: res.status(), body };
  }

  /** Forgot password request */
  async forgotPassword(email: string) {
    const res = await this.request.post(`${this.baseURL}${API.forgotPassword}`, {
      data: { email },
      headers: { 'Content-Type': 'application/json' },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Reset password with token */
  async resetPassword(token: string, newPassword: string) {
    const res = await this.request.post(`${this.baseURL}${API.resetPassword}`, {
      data: { token, newPassword },
      headers: { 'Content-Type': 'application/json' },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  // ── Company ──────────────────────────────────────────────────────

  /** Create a new company (current user becomes admin) */
  async createCompany(name: string, description = '') {
    const res = await this.request.post(`${this.baseURL}${API.company}`, {
      data: { name, description },
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** List companies for current user */
  async getCompanies() {
    const res = await this.request.get(`${this.baseURL}${API.company}`, {
      headers: this.authHeaders(),
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  // ── Event ────────────────────────────────────────────────────────

  /** Create a new event (JSON body, no image) */
  async createEvent(
    companyId: string,
    data: {
      name: string;
      description?: string;
      location?: string;
      website?: string;
      category?: string;
      dates: string[];
      room?: string;
    },
  ) {
    const res = await this.request.post(
      `${this.baseURL}${API.event}?companyId=${companyId}`,
      {
        data,
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      },
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Get event by ID (public endpoint — no auth needed) */
  async getEvent(eventId: string) {
    const res = await this.request.get(
      `${this.baseURL}${API.eventById(eventId)}`,
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Update event */
  async updateEvent(
    eventId: string,
    data: Record<string, unknown>,
    companyId?: string,
  ) {
    const qs = companyId ? `?companyId=${companyId}` : '';
    const res = await this.request.put(
      `${this.baseURL}${API.eventById(eventId)}${qs}`,
      {
        data,
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      },
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Delete event */
  async deleteEvent(eventId: string, companyId: string) {
    const res = await this.request.delete(
      `${this.baseURL}${API.eventById(eventId)}?companyId=${companyId}`,
      {
        headers: this.authHeaders(),
      },
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  // ── Ticket ───────────────────────────────────────────────────────

  /** Create ticket type for an event (multipart form-data — backend uses fastify multipart) */
  async createTicket(
    companyId: string,
    data: {
      name: string;
      description?: string;
      price: number;
      capacity: number;
      isPublic?: boolean;
      eventId: string;
      availableDates?: string[];
    },
  ) {
    // Backend ticket/create expects multipart/form-data (supports file upload)
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('description', data.description || '');
    formData.append('price', String(data.price));
    formData.append('capacity', String(data.capacity));
    formData.append('eventId', data.eventId);
    formData.append('companyId', companyId);
    formData.append('publicAvailability', data.isPublic !== false ? 'true' : 'false');
    formData.append('VAT', '0');
    formData.append('features', JSON.stringify([]));
    // availableDates must be JSON string; use event dates if not provided
    formData.append('availableDates', JSON.stringify(data.availableDates || []));

    // Use fetch directly since Playwright's request API handles FormData
    const res = await this.request.post(
      `${this.baseURL}${API.ticketCreate}?companyId=${companyId}`,
      {
        multipart: {
          name: data.name,
          description: data.description || '',
          price: String(data.price),
          capacity: String(data.capacity),
          eventId: data.eventId,
          companyId,
          publicAvailability: data.isPublic !== false ? 'true' : 'false',
          VAT: '0',
          features: JSON.stringify([]),
          availableDates: JSON.stringify(data.availableDates || []),
        },
        headers: this.authHeaders(),
      },
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Get ticket by ID (public) */
  async getTicket(ticketId: string) {
    const res = await this.request.get(
      `${this.baseURL}${API.ticketById(ticketId)}`,
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** List tickets for company */
  async getTickets(companyId: string, eventId?: string, page = 1, limit = 20) {
    let url = `${this.baseURL}${API.ticketList}?companyId=${companyId}&page=${page}&limit=${limit}`;
    if (eventId) url += `&eventId=${eventId}`;
    const res = await this.request.get(url, {
      headers: this.authHeaders(),
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  // ── Shop ─────────────────────────────────────────────────────────

  /** Create (or update) a shop for an event */
  async createShop(
    companyId: string,
    data: { eventId: string; ticketIds: string[]; name: string; description?: string },
  ) {
    const res = await this.request.post(
      `${this.baseURL}${API.shopCreate}?companyId=${companyId}`,
      {
        data,
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      },
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Get public shop by event ID */
  async getShopByEvent(eventId: string) {
    const res = await this.request.get(
      `${this.baseURL}${API.shopByEvent(eventId)}`,
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  // ── Order ────────────────────────────────────────────────────────

  /** Create a new order */
  async createOrder(data: {
    eventId: string;
    tickets: { ticketId: string; quantity: number; seatIds?: string[] }[];
    paid?: boolean;
    promotionalCode?: string;
    userId?: string;
  }) {
    const res = await this.request.post(`${this.baseURL}${API.order}`, {
      data,
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Get orders for a company */
  async getOrders(companyId: string, page = 1, limit = 20) {
    const res = await this.request.get(
      `${this.baseURL}${API.order}?companyId=${companyId}&page=${page}&limit=${limit}`,
      { headers: this.authHeaders() },
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  // ── Promo Code ───────────────────────────────────────────────────

  /** Create a promotional code */
  async createPromoCode(
    companyId: string,
    data: {
      code: string;
      discount: number;
      limit: number;
      eventId: string;
      expirationDate: string;
    },
  ) {
    const res = await this.request.post(
      `${this.baseURL}${API.promo}?companyId=${companyId}`,
      {
        data,
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      },
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  /** Check if a promo code exists for an event */
  async promoExists(code: string, eventId: string) {
    const res = await this.request.get(
      `${this.baseURL}${API.promoExists}?code=${code}&eventId=${eventId}`,
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  // ── Reservation ──────────────────────────────────────────────────

  /** Reserve seats for an event */
  async reserveSeats(eventId: string, seatIds: string[], userId: string) {
    const res = await this.request.post(
      `${this.baseURL}${API.reserveSeats}`,
      {
        data: { eventId, seatIds, userId },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  // ── Payment ──────────────────────────────────────────────────────

  /** Create a Stripe checkout session for an order */
  async createPaymentIntent(orderId: string) {
    const res = await this.request.post(
      `${this.baseURL}${API.createPaymentIntent}`,
      {
        data: { orderId },
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      },
    );
    return { status: res.status(), body: await res.json().catch(() => null) };
  }

  // ── Issued Tickets ───────────────────────────────────────────────

  /** List issued tickets (with optional filters) */
  async getIssuedTickets(companyId: string, orderId?: string) {
    let url = `${this.baseURL}${API.issuedTicket}?companyId=${companyId}`;
    if (orderId) url += `&orderId=${orderId}`;
    const res = await this.request.get(url, {
      headers: this.authHeaders(),
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  }
}
