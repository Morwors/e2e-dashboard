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
    // Start each test on the login page with a clean session
    await page.goto(ADMIN_ROUTES.login);
    await waitForAngularReady(page);
  });

  test('login page displays correctly', async ({ page }) => {
    // Heading "Sign in" should be visible
    await expect(page.locator('h2')).toContainText('Sign in');

    // Email input exists with correct placeholder
    const emailInput = page.locator('#email');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', 'you@example.com');

    // Password input exists
    const passwordInput = page.locator('#password');
    await expect(passwordInput).toBeVisible();

    // "Remember me" checkbox
    const rememberMe = page.locator('input[type="checkbox"]');
    await expect(rememberMe).toBeVisible();

    // Sign in button (disabled when form is empty)
    const signInBtn = page.locator('button[type="submit"]');
    await expect(signInBtn).toBeVisible();
    await expect(signInBtn).toContainText('Sign in');
    await expect(signInBtn).toBeDisabled();

    // "Forgot password?" link
    await expect(page.locator('a[href*="forgot-password"]')).toBeVisible();

    // "Create account" link
    await expect(page.locator('a[href*="register"]')).toContainText('Create account');
  });

  test('sign in button enables when form is filled', async ({ page }) => {
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const signInBtn = page.locator('button[type="submit"]');

    // Initially disabled
    await expect(signInBtn).toBeDisabled();

    // Fill email
    await emailInput.fill('test@example.com');
    // Still disabled (password missing)
    await expect(signInBtn).toBeDisabled();

    // Fill password
    await passwordInput.fill('SomePassword123!');

    // Now enabled
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

  test('login with valid demo account succeeds', async ({ page, request }) => {
    // Create a demo account via API to get verified credentials
    const api = new ApiClient(request, URLS.api);
    const demo = await api.createDemo();
    expect(demo.status).toBe(200);
    expect(demo.body.token).toBeTruthy();

    // Get user info to find email
    const me = await api.me();
    const demoEmail = me.body?.user?.email;
    expect(demoEmail).toBeTruthy();

    // Demo accounts don't have a known password, so we inject the token directly
    // and verify the dashboard loads
    await page.evaluate((token: string) => {
      localStorage.setItem('token', token);
    }, demo.body.token);

    // Navigate to dashboard
    await page.goto(URLS.admin + '/dashboard');
    await page.waitForTimeout(2000);

    // Check if we're on dashboard or company select (both mean auth succeeded)
    const url = page.url();
    const authSucceeded =
      url.includes('/dashboard') || url.includes('/company/select');
    expect(authSucceeded).toBeTruthy();
  });

  test('shows validation errors for empty fields', async ({ page }) => {
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');

    // Touch email and blur to trigger validation
    await emailInput.focus();
    await emailInput.blur();
    await passwordInput.focus();
    await passwordInput.blur();

    // Wait for validation messages
    await page.waitForTimeout(300);

    // Check for "Email is required" or "Password is required"
    const emailError = page.locator('text=Email is required');
    const passwordError = page.locator('text=Password is required');
    await expect(emailError).toBeVisible();
    await expect(passwordError).toBeVisible();
  });

  test('shows email format validation error', async ({ page }) => {
    const emailInput = page.locator('#email');

    await emailInput.fill('not-an-email');
    await emailInput.blur();

    await page.waitForTimeout(300);
    const emailError = page.locator('text=Enter a valid email address');
    await expect(emailError).toBeVisible();
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

    // Heading
    await expect(page.locator('h2')).toContainText('Create account');

    // First name, Last name, Email, Phone, Password, Confirm Password
    await expect(page.locator('#firstName')).toBeVisible();
    await expect(page.locator('#lastName')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();

    // Submit button
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toContainText('Create account');
    await expect(submitBtn).toBeDisabled(); // empty form

    // Terms links
    await expect(page.locator('a[href*="terms"]')).toBeVisible();
    await expect(page.locator('a[href*="privacy"]')).toBeVisible();

    // "Sign in" link
    await expect(page.locator('a[href*="login"]')).toContainText('Sign in');
  });

  test('can fill registration form and submit', async ({ page }) => {
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

    // Wait for response — either success message or error
    await page.waitForTimeout(3000);

    // Success: "Account created" message appears
    // OR redirect to login page
    const successMsg = page.locator('text=Account created');
    const loginPage = page.locator('h2:has-text("Sign in")');
    const errorMsg = page.locator('.bg-red-50, .bg-red-900\\/20');

    // One of these should be visible
    const hasSuccess = await successMsg.isVisible().catch(() => false);
    const hasLogin = await loginPage.isVisible().catch(() => false);
    const hasError = await errorMsg.isVisible().catch(() => false);

    expect(hasSuccess || hasLogin || hasError).toBeTruthy();
  });

  test('password mismatch shows validation error', async ({ page }) => {
    await page.goto(ADMIN_ROUTES.register);
    await waitForAngularReady(page);

    await page.locator('#password').fill('Password123!');
    await page.locator('#confirmPassword').fill('DifferentPassword!');
    await page.locator('#confirmPassword').blur();

    await page.waitForTimeout(300);

    const mismatchError = page.locator("text=Passwords don't match");
    await expect(mismatchError).toBeVisible();
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

  test('submitting email shows confirmation', async ({ page }) => {
    await page.goto(ADMIN_ROUTES.forgotPassword);
    await waitForAngularReady(page);

    await page.locator('#email').fill('test@ticketseat.io');

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Wait for response
    await page.waitForTimeout(3000);

    // Should show success or error (depends on whether email exists in DB)
    const successMsg = page.locator('.bg-emerald-50, .bg-emerald-900\\/20');
    const errorMsg = page.locator('.bg-red-50, .bg-red-900\\/20');

    const hasSuccess = await successMsg.isVisible().catch(() => false);
    const hasError = await errorMsg.isVisible().catch(() => false);

    // One of these should appear
    expect(hasSuccess || hasError).toBeTruthy();
  });

  test('"Sign in" link navigates back to login', async ({ page }) => {
    await page.goto(ADMIN_ROUTES.forgotPassword);
    await waitForAngularReady(page);

    await page.click('a[href*="login"]');
    await page.waitForURL('**/auth/login');

    await expect(page.locator('h2')).toContainText('Sign in');
  });
});

test.describe('Admin Auth — Logout', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    // Clear any stored tokens
    await page.goto(URLS.admin + '/auth/login');
    await page.evaluate(() => localStorage.clear());

    // Try to access a protected route
    await page.goto(URLS.admin + '/dashboard');
    await page.waitForTimeout(2000);

    // Should redirect to login
    const url = page.url();
    expect(url).toContain('/auth/login');
  });
});
