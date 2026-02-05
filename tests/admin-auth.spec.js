// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Admin Authentication', () => {

  test('should display login page when accessing /admin', async ({ page }) => {
    await page.goto('/admin');

    // Wait for the page to load
    await page.waitForSelector('.login-card', { timeout: 10000 });

    // Check login form elements
    await expect(page.locator('.login-logo h1')).toContainText('SLOBODA');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/admin/login');
    await page.waitForSelector('.login-card', { timeout: 10000 });

    // Fill in invalid credentials
    await page.fill('input[name="email"]', 'wrong@email.com');
    await page.fill('input[name="password"]', 'wrongpassword');

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for error message
    await page.waitForSelector('.error-message.show', { timeout: 5000 });

    // Check error is displayed
    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Invalid');
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/admin/login');
    await page.waitForSelector('.login-card', { timeout: 10000 });

    // Fill in valid credentials (created during setup)
    await page.fill('input[name="email"]', 'admin@sloboda.land');
    await page.fill('input[name="password"]', 'testpassword123');

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('**/admin/dashboard', { timeout: 10000 });

    // Verify we're on the dashboard
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.topbar-title')).toContainText('Dashboard');
  });

  test('should display dashboard stats after login', async ({ page }) => {
    // Login first
    await page.goto('/admin/login');
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await page.fill('input[name="email"]', 'admin@sloboda.land');
    await page.fill('input[name="password"]', 'testpassword123');
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL('**/admin/dashboard', { timeout: 10000 });

    // Check for stat cards
    await page.waitForSelector('.stat-card', { timeout: 10000 });
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(4);
  });

  test('should navigate to registrations page', async ({ page }) => {
    // Login
    await page.goto('/admin/login');
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await page.fill('input[name="email"]', 'admin@sloboda.land');
    await page.fill('input[name="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard', { timeout: 10000 });

    // Click on Registrations in sidebar
    await page.click('.nav-item[data-page="registrations"]');

    // Verify page changed
    await expect(page.locator('.topbar-title')).toContainText('Registrations');
    await expect(page.locator('.card-title')).toContainText('All Registrations');
  });

  test('should navigate to analytics page', async ({ page }) => {
    // Login
    await page.goto('/admin/login');
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await page.fill('input[name="email"]', 'admin@sloboda.land');
    await page.fill('input[name="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard', { timeout: 10000 });

    // Click on Analytics in sidebar
    await page.click('.nav-item[data-page="analytics"]');

    // Verify page changed
    await expect(page.locator('.topbar-title')).toContainText('Analytics');
  });

  test('should navigate to settings page', async ({ page }) => {
    // Login
    await page.goto('/admin/login');
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await page.fill('input[name="email"]', 'admin@sloboda.land');
    await page.fill('input[name="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard', { timeout: 10000 });

    // Click on Settings in sidebar
    await page.click('.nav-item[data-page="settings"]');

    // Verify page changed
    await expect(page.locator('.topbar-title')).toContainText('Settings');
    await expect(page.locator('.form-section-title').first()).toContainText('General');
  });

  test('should navigate to admin users page (super admin)', async ({ page }) => {
    // Login as super admin
    await page.goto('/admin/login');
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await page.fill('input[name="email"]', 'admin@sloboda.land');
    await page.fill('input[name="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard', { timeout: 10000 });

    // Click on Admin Users in sidebar
    await page.click('.nav-item[data-page="admins"]');

    // Verify page changed
    await expect(page.locator('.topbar-title')).toContainText('Admin Users');
    await expect(page.locator('#invite-admin-btn')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login
    await page.goto('/admin/login');
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await page.fill('input[name="email"]', 'admin@sloboda.land');
    await page.fill('input[name="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard', { timeout: 10000 });

    // Click logout
    await page.click('#logout-btn');

    // Verify redirect to login
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await expect(page.locator('.login-card')).toBeVisible();
  });

  test('should invite new admin and show invite link', async ({ page }) => {
    // Login as super admin
    await page.goto('/admin/login');
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await page.fill('input[name="email"]', 'admin@sloboda.land');
    await page.fill('input[name="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard', { timeout: 10000 });

    // Go to Admin Users
    await page.click('.nav-item[data-page="admins"]');
    await expect(page.locator('.topbar-title')).toContainText('Admin Users');

    // Click invite button
    await page.click('#invite-admin-btn');

    // Wait for modal
    await page.waitForSelector('#invite-modal.show', { timeout: 5000 });

    // Fill invite form
    await page.fill('#invite-email', 'newadmin@test.com');
    await page.fill('#invite-name', 'New Admin');

    // Send invite
    await page.click('#send-invite-btn');

    // Wait for success message with invite link
    await page.waitForSelector('#invite-result.show', { timeout: 5000 });
    await expect(page.locator('#invite-result')).toContainText('Invitation created');
    await expect(page.locator('#invite-result')).toContainText('accept-invite');
  });

});

test.describe('Accept Invite Flow', () => {

  test('should show error for invalid invite token', async ({ page }) => {
    await page.goto('/admin/accept-invite?token=invalid-token');

    // Wait for error
    await page.waitForSelector('.error-message.show', { timeout: 10000 });
    await expect(page.locator('.error-message')).toContainText('Invalid');
  });

});

test.describe('Admin Protected Routes', () => {

  test('should redirect to login when accessing dashboard without auth', async ({ page }) => {
    // Clear cookies
    await page.context().clearCookies();

    // Try to access dashboard directly
    await page.goto('/admin/dashboard');

    // Should show login page
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await expect(page.locator('.login-card')).toBeVisible();
  });

});
