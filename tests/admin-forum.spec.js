const { test, expect } = require('@playwright/test');

const RUN_PROD = process.env.RUN_PROD_TESTS === 'true';
const BASE_URL = process.env.PROD_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.PROD_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.PROD_ADMIN_PASSWORD || '';

test.describe('Admin Forum Management (Opt-in Smoke)', () => {
  test.skip(!RUN_PROD || !ADMIN_EMAIL || !ADMIN_PASSWORD, 'Set RUN_PROD_TESTS=true, PROD_ADMIN_EMAIL, PROD_ADMIN_PASSWORD to run production smoke tests');

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/admin`);
  });

  test('Admin forum navigation exists', async ({ page }) => {
    const forumLink = page.locator('nav a:has-text("Форум")');
    await expect(forumLink).toBeVisible();
  });

  test('Forum Threads page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/forum`);
    await expect(page.locator('h1:has-text("Форум")')).toBeVisible();
    await expect(page.locator('text=Темы')).toBeVisible();
  });

  test('Forum Roles page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/forum/roles`);
    await expect(page.locator('h1:has-text("Форум")')).toBeVisible();
    await expect(page.locator('text=Роли')).toBeVisible();
  });

  test('Forum Moderation page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/forum/moderation`);
    await expect(page.locator('h1:has-text("Форум")')).toBeVisible();
    await expect(page.locator('text=Модерация')).toBeVisible();
  });

  test('Tab navigation works', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/forum`);
    await page.click('text=Роли');
    await expect(page).toHaveURL(`${BASE_URL}/admin/forum/roles`);
    await page.click('text=Модерация');
    await expect(page).toHaveURL(`${BASE_URL}/admin/forum/moderation`);
    await page.click('text=Темы');
    await expect(page).toHaveURL(`${BASE_URL}/admin/forum`);
  });
});
