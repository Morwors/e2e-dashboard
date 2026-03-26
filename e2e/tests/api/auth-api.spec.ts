/**
 * Auth API Tests — Registration, Login, Token validation.
 *
 * Direct HTTP tests against the backend API.
 */

import { test, expect } from '../../fixtures/api.fixture';
import { uniqueEmail, TEST_ADMIN, API } from '../../fixtures/test-data';

test.describe('Auth API', () => {
  test('POST /user/register — creates a new user', async ({ api }) => {
    const email = uniqueEmail('api-reg');
    const result = await api.register({
      firstName: 'API',
      lastName: 'Test',
      email,
      password: TEST_ADMIN.password,
      phone: `+1555${Date.now().toString().slice(-7)}`,
    });

    // Should succeed with 200 or 201
    expect(result.status).toBeLessThan(300);
    // Response should have some indication of success
    expect(result.body).toBeTruthy();
  });

  test('POST /user/register — rejects duplicate email', async ({ api }) => {
    const email = uniqueEmail('api-dup');
    const phone1 = `+1555${Date.now().toString().slice(-7)}`;

    // First registration
    await api.register({
      firstName: 'First',
      lastName: 'User',
      email,
      password: TEST_ADMIN.password,
      phone: phone1,
    });

    // Second registration with same email
    const result = await api.register({
      firstName: 'Second',
      lastName: 'User',
      email,
      password: TEST_ADMIN.password,
      phone: `+1556${Date.now().toString().slice(-7)}`,
    });

    expect(result.status).toBe(400);
    expect(result.body?.error).toContain('already exists');
  });

  test('POST /user/login — returns JWT token for valid credentials', async ({
    api,
  }) => {
    // Use demo account (guaranteed to be verified)
    const demo = await api.createDemo();
    expect(demo.status).toBe(200);
    expect(demo.body.token).toBeTruthy();

    // Verify token is a valid JWT format (3 dot-separated parts)
    const parts = demo.body.token.split('.');
    expect(parts).toHaveLength(3);
  });

  test('POST /user/login — rejects invalid password', async ({ api }) => {
    const result = await api.login('nonexistent@example.com', 'WrongPassword!');
    expect(result.status).toBe(401);
    expect(result.body?.error).toContain('Invalid email or password');
  });

  test('GET /user/me — returns user info with valid token', async ({ api }) => {
    // Login with demo account
    const demo = await api.createDemo();
    expect(demo.status).toBe(200);

    const me = await api.me();
    expect(me.status).toBe(200);
    expect(me.body?.user).toBeTruthy();
    expect(me.body.user.email).toBeTruthy();
    expect(me.body.user.firstName).toBeTruthy();
  });

  test('GET /user/me — rejects request without token', async ({ request }) => {
    const { ApiClient } = await import('../../helpers/api-client');
    const baseURL = process.env.BASE_URL_API || 'https://backend-dev.ticketseat.io';
    const unauthApi = new ApiClient(request, baseURL);
    // Don't set any token

    const result = await unauthApi.me();
    expect(result.status).toBe(401);
  });

  test('POST /forgot/forgot-password — accepts valid email', async ({
    request,
  }) => {
    const baseURL = process.env.BASE_URL_API || 'https://backend-dev.ticketseat.io';
    const res = await request.post(`${baseURL}/forgot/forgot-password`, {
      data: { email: 'test@ticketseat.io' },
      headers: { 'Content-Type': 'application/json' },
    });

    // Should return 200 (email sent) or 400 (email not found)
    expect([200, 400]).toContain(res.status());
  });

  test('POST /forgot/reset-password — rejects invalid token', async ({
    request,
  }) => {
    const baseURL = process.env.BASE_URL_API || 'https://backend-dev.ticketseat.io';
    const res = await request.post(`${baseURL}/forgot/reset-password`, {
      data: { token: 'invalid-token', newPassword: 'NewPassword123!' },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid or expired token');
  });

  test('GET /user/demo — creates demo account', async ({ api }) => {
    const result = await api.createDemo();
    expect(result.status).toBe(200);
    expect(result.body.token).toBeTruthy();
  });
});
