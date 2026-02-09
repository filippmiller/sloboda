const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://sloboda-production.up.railway.app';
const ADMIN_EMAIL = 'admin@sloboda.land';
const ADMIN_PASSWORD = 'UShpBjvXqHwv0PaN0Rf2gg';

test.describe('Admin Forum Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login to admin panel
    await page.goto(`${BASE_URL}/admin/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/admin`);
  });

  test('Admin forum navigation exists', async ({ page }) => {
    const forumLink = page.locator('nav a:has-text("Форум")');
    await expect(forumLink).toBeVisible();
    console.log('✓ Forum link in admin sidebar');
  });

  test('Forum Threads page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/forum`);
    await expect(page.locator('h1:has-text("Форум")')).toBeVisible();
    await expect(page.locator('text=Темы')).toBeVisible();
    console.log('✓ Forum Threads page loaded');
  });

  test('Forum Roles page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/forum/roles`);
    await expect(page.locator('h1:has-text("Форум")')).toBeVisible();
    await expect(page.locator('text=Роли')).toBeVisible();
    console.log('✓ Forum Roles page loaded');
  });

  test('Forum Moderation page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/forum/moderation`);
    await expect(page.locator('h1:has-text("Форум")')).toBeVisible();
    await expect(page.locator('text=Модерация')).toBeVisible();
    console.log('✓ Forum Moderation page loaded');
  });

  test('Tab navigation works', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/forum`);
    
    // Navigate to Roles
    await page.click('text=Роли');
    await expect(page).toHaveURL(`${BASE_URL}/admin/forum/roles`);
    
    // Navigate to Moderation
    await page.click('text=Модерация');
    await expect(page).toHaveURL(`${BASE_URL}/admin/forum/moderation`);
    
    // Navigate back to Threads
    await page.click('text=Темы');
    await expect(page).toHaveURL(`${BASE_URL}/admin/forum`);
    
    console.log('✓ Tab navigation working');
  });
});
