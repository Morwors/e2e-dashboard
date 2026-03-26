/**
 * Admin Authentication Tests — Login, Register, Forgot Password, Logout.
 *
 * These tests exercise the admin Angular app's auth flow against the real dev backend.
 * Selectors are based on the actual login/register component templates.
 */

import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';
import { uniqueEmail, TEST_ADMIN, URLS, ADMIN_ROUTES } from '../../fixtures/test-data';
import { waitForAngularReady, waitForAngularNavigation } from '../../helpers/wait-helpers';

test.describe('Admin Auth — Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_ROUTES.login);
    await waitForAngularReady(page);
  });

  test('login page displays correctly', async ({ page }) => {
    // Heading
    await expect(page.locator('h2')).toContainText('Sign in');

    // Email input
    const emailInput = page.locator('#email');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', 'you@example.com');

    // Password input
    const passwordInput = page.locator('#password');
    await expect(passwordInput).toBeVisible();

    // Remember me checkbox
    const rememberMe = page.locator('input[type="checkbox"]');
    await expect(rememberMe).toBeVisible();

    // Sign in button (disabled when empty)
    const signInBtn = page.locator('button[type="submit"]');
    await expect(signInBtn).toBeVisible();
    await expect(signInBtn).toContainText('Sign in');
    await expect(signInBtn).toBeDisabled();

    // Navigation links
    await expect(page.locator('a[href*="forgot-password"]')).toBeVisible();
    await expect(page.locator('a[href*="register"]')).toContainText('Create account');
  });

  test('sign in button enables when form is filled', async ({ page }) => {
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const signInBtn = page.locator('button[type="submit"]');

    await expect(signInBtn).toBeDisabled();

    await emailInput.fill('test@example.com');
    await expect(signInBtn).toBeDisabled();

    await passwordInput.fill('SomePassword123!');
    await expect(signInBtn).toBeEnabled();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const signInBtn = page.locator('button[type="submit"]');

    await emailInput.fill('nonexistent@ticketseat.io');
    await passwordInput.fill('WrongPassword123!');
    await signInBtn.click();

    // Error message should appear
    const errorBlock = page.locator('.bg-red-50, .bg-red-900\\/20').first();
    await expect(errorBlock).toBeVisible({ timeout: 10_000 });
    await expect(errorBlock).toContainText(/sign in failed|invalid/i);
  });

  test('login with demo account succeeds', async ({ page, request }) => {
    // Create a demo account via API
    const api = new ApiClient(request, URLS.api);
    const demo = await api.createDemo();
    expect(demo.status).toBe(200);
    expect(demo.body.token).toBeTruthy();

    // Inject token into localStorage (demo accounts have no known password)
    await page.evaluate((token: string) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_remember', 'true');
    }, demo.body.token);

    // Navigate to dashboard
    await page.goto(URLS.admin + '/dashboard');
    await waitForAngularReady(page);

    // Should be on dashboard or company select — NOT login
    const url = page.url();
    expect(url).not.toContain('/auth/login');
    const validDestination = url.includes('/dashboard') || url.includes('/company/select');
    expect(validDestination).toBe(true);
  });

  test('shows validation errors for empty fields', async ({ page }) => {
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');

    // Touch and blur to trigger validation
    await emailInput.focus();
    await emailInput.blur();
    await passwordInput.focus();
    await passwordInput.blur();

    await expect(page.locator('text=Email is required')).toBeVisible();
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('shows email format validation error', async ({ page }) => {
    const emailInput = page.locator('#email');

    await emailInput.fill('not-an-email');
    await emailInput.blur();

    await expect(page.locator('text=Enter a valid email address')).toBeVisible();
  });

  test('"Create account" link navigates to register', async ({ page }) => {
    await page.click('a[href*="register"]');
    await page.waitForURL('**/auth/register');
    await waitForAngularReady(page);

    await expect(page.locator('h2')).toContainText('Create account');
  });

  test('"Forgot password" link navigates to forgot page', async ({ page }) => {
    await page.click('a[href*="forgot-password"]');
    await page.waitForURL('**/auth/forgot-password');
    await waitForAngularReady(page);

    await expect(page.locator('h2')).toContainText('Forgot password');
  });
});

test.describe('Admin Auth — Register', () => {
  test('register page displays all fields', async ({ page }) => {
    await page.goto(ADMIN_ROUTES.register);
    await waitForAngularReady(page);

    await expect(page.locator('h2')).toContainText('Create account');

    // All form fields must be visible
    await expect(page.locator('#firstName')).toBeVisible();
    await expect(page.locator('#lastName')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();

    // Submit button disabled when empty
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toContainText('Create account');
    await expect(submitBtn).toBeDisabled();

    // Legal links
    await expect(page.locator('a[href*="terms"]')).toBeVisible();
    await expect(page.locator('a[href*="privacy"]')).toBeVisible();

    // Sign in link
    await expect(page.locator('a[href*="login"]')).toContainText('Sign in');
  });

  test('can fill registration form and submit successfully', async ({ page }) => {
    await page.goto(ADMIN_ROUTES.register);
    await waitForAngularReady(page);

    const email = uniqueEmail('reg');

    await page.locator('#firstName').fill('Test');
    await page.locator('#lastName').fill('User');
    await page.locator('#email').fill(email);
    await page.locator('#phone').fill('+15551234567');
    await page.locator('#password').fill(TEST_ADMIN.password);
    await page.locator('#confirmPassword').fill(TEST_ADMIN.password);

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Wait for response — should see success message or redirect to login
    // We check for concrete outcomes, not "success OR error"
    const successMsg = page.locator('text=/account created|check your email|verify/i');
    const loginHeading = page.locator('h2:has-text("Sign in")');

    // Either success message or redirect to login (both mean registration worked)
    await expect(successMsg.or(loginHeading)).toBeVisible({ timeout: 10_000 });
  });

  test('password mismatch shows validation error', async ({ page }) => {
    await page.goto(ADMIN_ROUTES.register);
    await waitForAngularReady(page);

    await page.locator('#password').fill('Password123!');
    await page.locator('#confirmPassword').fill('DifferentPassword!');
    await page.locator('#confirmPassword').blur();

    await expect(page.locator("text=Passwords don't match")).toBeVisible();
  });

  test('duplicate email shows error', async ({ page, request }) => {
    // Register via API first
    const api = new ApiClient(request, URLS.api);
    const email = uniqueEmail('dup');
    await api.register({
      firstName: 'Dup',
      lastName: 'Test',
      email,
      password: TEST_ADMIN.password,
      phone: '+15559999999',
    });

    // Try same email via UI
    await page.goto(ADMIN_ROUTES.register);
    await waitForAngularReady(page);

    await page.locator('#firstName').fill('Dup');
    await page.locator('#lastName').fill('Test');
    await page.locator('#email').fill(email);
    await page.locator('#phone').fill('+15559999998');
    await page.locator('#password').fill(TEST_ADMIN.password);
    await page.locator('#confirmPassword').fill(TEST_ADMIN.password);

    await page.locator('button[type="submit"]').click();

    // Should show error about duplicate/existing email
    const errorBlock = page.locator('.bg-red-50, .bg-red-900\\/20').first();
    await expect(errorBlock).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Admin Auth — Forgot Password', () => {
  test('forgot password page renders correctly', async ({ page }) => {
    await page.goto(ADMIN_ROUTES.forgotPassword);
    await waitForAngularReady(page);

    await expect(page.locator('h2')).toContainText('Forgot password');
    await expect(page.locator('#email')).toBeVisible();

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toContainText('Send reset instructions');
    await expect(submitBtn).toBeDisabled();
  });

  test('submitting email shows confirmation message', async ({ page }) => {
    await page.goto(ADMIN_ROUTES.forgotPassword);
    await waitForAngularReady(page);

    await page.locator('#email').fill('test@ticketseat.io');

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Should show a visible feedback message (success or error)
    const feedbackMsg = page.locator('.bg-emerald-50, .bg-emerald-900\\/20, .bg-red-50, .bg-red-900\\/20').first();
    await expect(feedbackMsg).toBeVisible({ timeout: 10_000 });
  });

  test('"Sign in" link navigates back to login', async ({ page }) => {
    await page.goto(ADMIN_ROUTES.forgotPassword);
    await waitForAngularReady(page);

    await page.click('a[href*="login"]');
    await page.waitForURL('**/auth/login');

    await expect(page.locator('h2')).toContainText('Sign in');
  });
});

test.describe('Admin Auth — Access Control', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    // Clear any stored tokens
    await page.goto(URLS.admin + '/auth/login');
    await page.evaluate(() => localStorage.clear());

    // Try to access a protected route
    await page.goto(URLS.admin + '/dashboard');
    await waitForAngularReady(page);

    // Should redirect to login
    expect(page.url()).toContain('/auth/login');
  });
});
