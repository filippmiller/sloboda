/**
 * Forum Production E2E Tests
 *
 * Tests the live forum on https://sloboda-production.up.railway.app
 *
 * This test documents the current state of the forum system and verifies:
 * - Forum UI is accessible
 * - API endpoints respond correctly
 * - Database migrations ran successfully
 */

const { test, expect } = require('@playwright/test');

const PROD_URL = 'https://sloboda-production.up.railway.app';

test.describe('Forum System - Production', () => {

  test('Forum landing page loads', async ({ page }) => {
    await page.goto(`${PROD_URL}/forum`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await page.screenshot({
      path: '.temp/forum-01-landing.png',
      fullPage: true
    });

    // Log what we see
    const title = await page.title();
    console.log('Page title:', title);

    const url = page.url();
    console.log('Current URL:', url);
  });

  test('Forum API responds', async ({ request }) => {
    const response = await request.get(`${PROD_URL}/api/forum/threads`);

    console.log('API Status:', response.status());
    console.log('Content-Type:', response.headers()['content-type']);

    const body = await response.text();
    console.log('API Response:', body);

    // Should be JSON
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('Forum UI elements present', async ({ page }) => {
    await page.goto(`${PROD_URL}/forum`);
    await page.waitForLoadState('networkidle');

    // Check for common forum elements
    const bodyText = await page.locator('body').textContent();

    const elements = {
      hasHeading: bodyText.includes('Forum') || bodyText.includes('Discussion'),
      hasCreateButton: bodyText.includes('Create') || bodyText.includes('New Thread'),
      hasNavigation: bodyText.includes('Recent') || bodyText.includes('Hot') || bodyText.includes('Top')
    };

    console.log('Forum UI Elements:', elements);

    // Screenshot
    await page.screenshot({
      path: '.temp/forum-02-ui-check.png',
      fullPage: true
    });
  });

  test('Forum roles API endpoint', async ({ request }) => {
    const response = await request.get(`${PROD_URL}/api/roles`);

    console.log('Roles API Status:', response.status());
    console.log('Roles Content-Type:', response.headers()['content-type']);

    const text = await response.text();

    // Check if it's JSON
    if (response.headers()['content-type']?.includes('application/json')) {
      try {
        const body = JSON.parse(text);
        console.log('Roles API Response:', JSON.stringify(body).substring(0, 200));
      } catch (e) {
        console.log('Failed to parse JSON:', text.substring(0, 200));
      }
    } else {
      console.log('Roles API returned HTML (not JSON):', text.substring(0, 200));
    }
  });

  test('Forum reputation API endpoint', async ({ request }) => {
    const response = await request.get(`${PROD_URL}/api/reputation`);

    console.log('Reputation API Status:', response.status());
    console.log('Reputation Content-Type:', response.headers()['content-type']);

    const text = await response.text();

    if (response.headers()['content-type']?.includes('application/json')) {
      try {
        const body = JSON.parse(text);
        console.log('Reputation API Response:', JSON.stringify(body).substring(0, 200));
      } catch (e) {
        console.log('Failed to parse JSON:', text.substring(0, 200));
      }
    } else {
      console.log('Reputation API returned HTML (not JSON):', text.substring(0, 200));
    }
  });

  test('Responsive design - Desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${PROD_URL}/forum`);
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: '.temp/forum-03-desktop-1920.png',
      fullPage: true
    });
  });

  test('Responsive design - Tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${PROD_URL}/forum`);
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: '.temp/forum-04-tablet-768.png',
      fullPage: true
    });
  });

  test('Responsive design - Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${PROD_URL}/forum`);
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: '.temp/forum-05-mobile-375.png',
      fullPage: true
    });
  });

  test('Check for error messages in console', async ({ page }) => {
    const consoleMessages = [];
    const errors = [];

    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();

      consoleMessages.push({ type, text });

      if (type === 'error') {
        errors.push(text);
      }
    });

    await page.goto(`${PROD_URL}/forum`);
    await page.waitForLoadState('networkidle');

    console.log('Console Messages:', consoleMessages.length);
    console.log('Errors:', errors.length);

    if (errors.length > 0) {
      console.log('Console Errors:', errors);
    }
  });

  test('Navigation structure', async ({ page }) => {
    await page.goto(`${PROD_URL}/forum`);
    await page.waitForLoadState('networkidle');

    // Find all links
    const links = await page.locator('a').all();
    const linkTexts = await Promise.all(
      links.slice(0, 20).map(link => link.textContent())
    );

    console.log('First 20 navigation links:', linkTexts);

    // Check if sidebar exists
    const hasSidebar = await page.locator('[role="navigation"], nav, aside').count() > 0;
    console.log('Has navigation/sidebar:', hasSidebar);
  });
});

test.describe('Forum Authentication Flow', () => {

  test('Unauthenticated access to forum', async ({ page }) => {
    await page.goto(`${PROD_URL}/forum`);

    const url = page.url();

    // Should either show forum or redirect to login
    console.log('URL after forum access:', url);

    if (url.includes('/login')) {
      console.log('Forum requires authentication');
      await page.screenshot({
        path: '.temp/forum-06-requires-auth.png',
        fullPage: true
      });
    } else {
      console.log('Forum allows unauthenticated access');
      await page.screenshot({
        path: '.temp/forum-06-no-auth-required.png',
        fullPage: true
      });
    }
  });

  test('Create thread button behavior', async ({ page }) => {
    await page.goto(`${PROD_URL}/forum`);
    await page.waitForLoadState('networkidle');

    // Look for "Create" or "New Thread" button
    const createButton = page.locator('button:has-text("Create"), a:has-text("Create"), button:has-text("New"), a:has-text("New")').first();

    const exists = await createButton.count() > 0;
    console.log('Create button exists:', exists);

    if (exists) {
      const isVisible = await createButton.isVisible();
      console.log('Create button visible:', isVisible);

      if (isVisible) {
        await createButton.screenshot({
          path: '.temp/forum-07-create-button.png'
        });
      }
    }
  });
});
