// @ts-check
const { test, expect } = require('@playwright/test');
const bcrypt = require('bcrypt');

/**
 * Built-React End-to-End Browser Journeys (UI-GATE)
 * Verifies real browser sessions (no manual Bearer token bypasses for user/reviewer flows):
 * 1. Landing CTA (a.cta-btn-primary) -> /applications -> Login redirect preservation -> Application + portfolio submission
 * 2. Separate Admin Reviewer browser session -> /admin/applications -> Request revision -> Applicant edits & resubmits -> Reviewer accepts (free membership) -> Applicant sees admitted status
 * 3. Admin Finance Ledger tab -> Record real verified contribution & expense -> User Finance displays verified kopeck totals
 */
test.describe('Sloboda Built-React End-to-End Browser Journeys', () => {
  const uniqueSuffix = Date.now();
  const applicantEmail = `e2e.applicant.${uniqueSuffix}@sloboda.land`;
  const applicantPassword = 'ApplicantPass123!';
  const applicantName = 'Иван Строитель';

  test.beforeAll(async () => {
    if (process.env.DATABASE_URL) {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const hash = await bcrypt.hash(applicantPassword, 10);
      await pool.query(
        `INSERT INTO users (email, name, password_hash, status, membership_status, settlement_id, onboarding_completed)
         VALUES ($1, $2, $3, 'active', 'observer', 'sloboda-pilot', true)
         ON CONFLICT (email) DO NOTHING`,
        [applicantEmail, applicantName, hash]
      );
      await pool.end();
    }
  });

  test('SLB-R1-05 & 12: Landing CTA -> Applicant submit -> Reviewer requests revision -> Applicant resubmits -> Reviewer accepts free membership', async ({ browser }) => {
    test.skip(!process.env.DATABASE_URL, 'Requires real PostgreSQL (DATABASE_URL) for full persisted login + application E2E');

    const applicantContext = await browser.newContext();
    const reviewerContext = await browser.newContext();
    const applicantPage = await applicantContext.newPage();
    const reviewerPage = await reviewerContext.newPage();

    try {
      // 1. Applicant starts on Landing Page and clicks Hero CTA "Подать заявку и портфолио"
      await applicantPage.goto('/');
      const heroCta = applicantPage.locator('a.cta-btn-primary', { hasText: 'Подать заявку и портфолио' }).first();
      await expect(heroCta).toHaveAttribute('href', '/applications');
      await heroCta.click();

      // Unauthenticated user is redirected to /login?redirect=/applications
      await applicantPage.waitForURL(/\/login/, { timeout: 15000 });
      await applicantPage.fill('input[type="email"], input[name="email"]', applicantEmail);
      await applicantPage.fill('input[type="password"], input[name="password"]', applicantPassword);
      await applicantPage.click('button[type="submit"]');

      // Returned automatically to /applications
      await applicantPage.waitForURL(/\/applications/, { timeout: 15000 });

      // Fill application + portfolio form
      const textareas = applicantPage.locator('form textarea');
      await expect(textareas.first()).toBeVisible({ timeout: 15000 });
      if (await textareas.count() >= 2) {
        await textareas.nth(0).fill('Строительство каркасных домов, фундаменты');
        await textareas.nth(1).fill('Хочу строить экологичное поселение');
      }
      await applicantPage.locator('form button[type="submit"]').first().click();

      // Verify application submitted (pending)
      await expect(applicantPage.locator('body')).toContainText(/На рассмотрении|Ожидает|pending/i, { timeout: 15000 });

      // 2. Reviewer logs into React Admin Portal in a separate browser session
      await reviewerPage.goto('/admin/login');
      await reviewerPage.fill('input[type="email"], input[name="email"]', process.env.ADMIN_EMAIL || 'admin@sloboda.land');
      await reviewerPage.fill('input[type="password"], input[name="password"]', process.env.ADMIN_PASSWORD || 'testpassword123');
      await reviewerPage.click('button[type="submit"]');
      await reviewerPage.waitForURL(/\/admin/, { timeout: 15000 });

      // Navigate to Admin Applications Reviewer Workspace
      await reviewerPage.goto('/admin/applications');
      await expect(reviewerPage.locator('body')).toContainText(applicantName, { timeout: 15000 });

      // Request revision with a review note using the exact review action button
      const noteInput = reviewerPage.locator('textarea').first();
      await noteInput.fill('Пожалуйста, уточните опыт по инженерным сетям');
      await reviewerPage.getByRole('button', { name: 'Запросить доработку' }).first().click();
      await expect(reviewerPage.locator('body')).toContainText(/Нужна доработка|На доработке|revision_requested/i, { timeout: 15000 });

      // 3. Applicant reloads /applications, sees review note, edits and resubmits
      await applicantPage.reload();
      await expect(applicantPage.locator('body')).toContainText('Пожалуйста, уточните опыт по инженерным сетям', { timeout: 15000 });
      const revTextareas = applicantPage.locator('textarea');
      await expect(revTextareas.first()).toBeVisible({ timeout: 10000 });
      await revTextareas.first().fill('Каркасные дома, фундаменты, солнечная энергетика и водоснабжение');
      await applicantPage.getByRole('button', { name: /Отправить доработанную/i }).click();
      await expect(applicantPage.locator('body')).toContainText(/На рассмотрении|Ожидает|pending/i, { timeout: 15000 });

      // 4. Reviewer reloads /admin/applications and accepts applicant (free membership, 0 RUB)
      await reviewerPage.reload();
      await expect(reviewerPage.locator('body')).toContainText('солнечная энергетика', { timeout: 15000 });
      await reviewerPage.getByRole('button', { name: /Принять в участники/i }).first().click();
      await expect(reviewerPage.locator('body')).toContainText(/Принят|accepted/i, { timeout: 15000 });

      // 5. Applicant reloads /applications and verifies free admitted membership
      await applicantPage.reload();
      await expect(applicantPage.locator('body')).toContainText(/Принят|Участник/i, { timeout: 15000 });
    } finally {
      await applicantContext.close();
      await reviewerContext.close();
    }
  });

  test('SLB-R1-07: Admin Finance Ledger tab records contribution & expense visible on User Finance', async ({ browser }) => {
    test.skip(!process.env.DATABASE_URL, 'Requires real PostgreSQL (DATABASE_URL) for built-React finance E2E');

    const adminContext = await browser.newContext();
    const userContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const userPage = await userContext.newPage();

    try {
      // 1. Admin logs in and opens /admin/finance (Verified Kopeck Ledger tab)
      await adminPage.goto('/admin/login');
      await adminPage.fill('input[type="email"], input[name="email"]', process.env.ADMIN_EMAIL || 'admin@sloboda.land');
      await adminPage.fill('input[type="password"], input[name="password"]', process.env.ADMIN_PASSWORD || 'testpassword123');
      await adminPage.click('button[type="submit"]');
      await adminPage.waitForURL(/\/admin/, { timeout: 15000 });

      await adminPage.goto('/admin/finance');
      await expect(adminPage.locator('body')).toContainText(/Реестр взносов и расходов/i, { timeout: 15000 });

      // Submit a verified contribution via UI form
      const contribForm = adminPage.locator('form').first();
      await contribForm.locator('input[placeholder*="Имя"], input[type="text"]').first().fill('E2E Пайщик');
      await contribForm.locator('input[type="number"], input[inputmode="decimal"]').first().fill('5000');
      await contribForm.locator('button[type="submit"]').click();
      await expect(adminPage.locator('body')).toContainText('E2E Пайщик', { timeout: 15000 });

      // Submit a verified paid expense via UI form
      const expenseForm = adminPage.locator('form').nth(1);
      await expenseForm.locator('input[type="text"]').first().fill('E2E Щебень для дороги');
      await expenseForm.locator('input[type="number"], input[inputmode="decimal"]').first().fill('2000');
      await expenseForm.locator('button[type="submit"]').click();
      await expect(adminPage.locator('body')).toContainText('E2E Щебень для дороги', { timeout: 15000 });

      // 2. User logs in and opens /finance -> verifies the verified kopeck ledger totals are displayed
      await userPage.goto('/login?redirect=/finance');
      await userPage.fill('input[type="email"], input[name="email"]', applicantEmail);
      await userPage.fill('input[type="password"], input[name="password"]', applicantPassword);
      await userPage.click('button[type="submit"]');
      await userPage.waitForURL(/\/finance/, { timeout: 15000 });
      await expect(userPage.locator('body')).toContainText(/Верифицированный реестр в копейках/i, { timeout: 15000 });
      await expect(userPage.locator('body')).toContainText(/5[\s\u00A0]000|5000/, { timeout: 15000 });
    } finally {
      await adminContext.close();
      await userContext.close();
    }
  });
});
