// @ts-check
const { test, expect } = require('@playwright/test');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-change-me';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sloboda.land';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'testpassword123';

function signAdminToken(id = 1, email = ADMIN_EMAIL, role = 'super_admin', name = 'Super Admin') {
  return jwt.sign({ id, email, role, name }, JWT_SECRET, { expiresIn: '2h' });
}

function trackPageErrors(page, errors, label) {
  page.on('pageerror', (err) => {
    errors.push(`[${label}] ${err?.message || String(err)}`);
  });
}

async function seedUser(pool, {
  email,
  password,
  name,
  status = 'active',
  membershipStatus = 'observer',
  settlementId = 'sloboda-pilot',
  onboardingCompleted = true,
  magicLinkToken = null,
  magicLinkExpiresSql = null,
}) {
  const hash = password ? await bcrypt.hash(password, 10) : null;
  const res = await pool.query(
    `INSERT INTO users (
       email, name, password_hash, status, membership_status, settlement_id,
       onboarding_completed_at, magic_link_token, magic_link_expires
     )
     VALUES (
       $1, $2, $3, $4, $5, $6,
       ${onboardingCompleted ? 'NOW()' : 'NULL'},
       $7,
       ${magicLinkExpiresSql || 'NULL'}
     )
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
       status = EXCLUDED.status,
       membership_status = EXCLUDED.membership_status,
       settlement_id = EXCLUDED.settlement_id,
       onboarding_completed_at = EXCLUDED.onboarding_completed_at,
       magic_link_token = EXCLUDED.magic_link_token,
       magic_link_expires = EXCLUDED.magic_link_expires
     RETURNING id, email, name, status, membership_status, settlement_id, onboarding_completed_at`,
    [email.toLowerCase(), name, hash, status, membershipStatus, settlementId, magicLinkToken]
  );
  return res.rows[0];
}

async function loginUserViaUi(page, email, password) {
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
}

async function loginAdminViaUi(page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/admin/login');
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(
    (url) => url.pathname === '/admin' || url.pathname === '/admin/dashboard',
    { timeout: 15000 }
  );
}

async function ensureForumSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forum_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS forum_threads (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      body TEXT,
      type VARCHAR(50) DEFAULT 'discussion',
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      category_id INTEGER,
      view_count INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      is_pinned BOOLEAN DEFAULT FALSE,
      is_locked BOOLEAN DEFAULT FALSE,
      is_deleted BOOLEAN DEFAULT FALSE,
      deleted_by INTEGER REFERENCES admins(id),
      deleted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS forum_comments (
      id SERIAL PRIMARY KEY,
      body TEXT NOT NULL,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      thread_id INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
      parent_id INTEGER,
      parent_comment_id INTEGER,
      depth INTEGER DEFAULT 0,
      upvote_count INTEGER DEFAULT 0,
      downvote_count INTEGER DEFAULT 0,
      is_deleted BOOLEAN DEFAULT FALSE,
      deleted_by INTEGER REFERENCES admins(id),
      deleted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS forum_votes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      comment_id INTEGER NOT NULL REFERENCES forum_comments(id) ON DELETE CASCADE,
      vote_type VARCHAR(16),
      vote_value INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, comment_id)
    );

    CREATE TABLE IF NOT EXISTS forum_reputation (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total_points INTEGER DEFAULT 0,
      posts_created INTEGER DEFAULT 0,
      threads_created INTEGER DEFAULT 0,
      comments_made INTEGER DEFAULT 0,
      upvotes_received INTEGER DEFAULT 0,
      downvotes_received INTEGER DEFAULT 0,
      days_since_registration INTEGER DEFAULT 0,
      last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE forum_comments ADD COLUMN IF NOT EXISTS parent_id INTEGER;
    ALTER TABLE forum_votes ADD COLUMN IF NOT EXISTS vote_type VARCHAR(16);
  `);
}

test.describe('Sloboda Built-React + PG17 End-to-End UI Gate', () => {
  /** @type {import('pg').Pool | null} */
  let pool = null;

  test.beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    const { assertSafeDisposablePgConfig, assertConnectedDisposablePg } = require('../server/utils/pgTestGuard');
    const guardLabel = 'UI E2E test suite (tests/sloboda-ui-e2e.spec.js)';
    const { dbName: expectedDbName } = assertSafeDisposablePgConfig(process.env.DATABASE_URL, process.env, guardLabel);
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await assertConnectedDisposablePg(pool, expectedDbName, guardLabel);
    } catch (err) {
      await pool.end();
      pool = null;
      throw err;
    }
    // server/index.js RESET_ADMIN_PASSWORD=true marks existing admins must_change_password=TRUE
    await pool.query(
      'UPDATE admins SET must_change_password = FALSE WHERE LOWER(email) = LOWER($1)',
      [ADMIN_EMAIL]
    );
  });

  test.afterAll(async () => {
    if (pool) {
      await pool.end();
      pool = null;
    }
  });

  test('1. Admission + Non-Empty Portfolio + Revision Draft (401/Reload & 409) + Free Admission + Error Negative Control', async ({ browser }) => {
    test.skip(!process.env.DATABASE_URL, 'Requires real PostgreSQL (DATABASE_URL)');

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const applicantEmail = `e2e.app.${suffix}@sloboda.land`;
    const applicantPassword = 'ApplicantPass123!';
    const applicantName = `Анна Инженер ${suffix}`;
    const portfolioTitle = `Автономная СЭС 15 кВт (${suffix})`;
    const portfolioUrl = `https://example.com/portfolio/${suffix}`;
    const reviewNote = `Уточните расчёт кабеля и опыт СЭС (${suffix})`;
    const uniqueRevMotivation = `Уникальная мотивация для проверки черновика и 409 (${suffix})`;

    const applicant = await seedUser(pool, {
      email: applicantEmail,
      password: applicantPassword,
      name: applicantName,
      membershipStatus: 'observer',
      onboardingCompleted: true,
    });

    const applicantContext = await browser.newContext();
    const reviewerContext = await browser.newContext();
    const applicantPage = await applicantContext.newPage();
    const reviewerPage = await reviewerContext.newPage();
    const pageErrors = [];
    trackPageErrors(applicantPage, pageErrors, 'applicant');
    trackPageErrors(reviewerPage, pageErrors, 'reviewer');

    try {
      // 1. Landing / -> click hero join/apply CTA -> redirected to /login?redirect=%2Fapplications
      await applicantPage.goto('/');
      const heroCta = applicantPage.locator('a.cta-btn-primary[href="/applications"]').first();
      await expect(heroCta).toBeVisible({ timeout: 15000 });
      await heroCta.click();

      await applicantPage.waitForURL(/\/login\?redirect=%2Fapplications/, { timeout: 15000 });
      expect(new URL(applicantPage.url()).searchParams.get('redirect')).toBe('/applications');

      // 2. Applicant logs in via UI -> submits application with NON-EMPTY portfolio item
      await loginUserViaUi(applicantPage, applicantEmail, applicantPassword);
      await applicantPage.waitForURL(/\/applications$/, { timeout: 15000 });

      await expect(applicantPage.getByLabel('ФИО *')).toBeVisible({ timeout: 15000 });
      await applicantPage.getByLabel('Город / регион').fill('Калуга');
      await applicantPage.getByLabel('Навыки и компетенции').fill('Солнечные электростанции, инверторы');
      await applicantPage.getByLabel('Мотивация участия').fill('Развитие автономной энергетики поселения');
      await applicantPage.getByLabel('Название проекта / кейса').fill(portfolioTitle);
      await applicantPage.getByLabel('Описание результата').fill('Смонтировано 15 кВт, автономность 99%');
      await applicantPage.getByLabel('Ссылка на артефакт (репозиторий, чертежи, фото)').fill(portfolioUrl);

      await applicantPage.getByRole('button', { name: 'Отправить заявку' }).click();

      const appCard = applicantPage.locator('div.rounded-xl', {
        has: applicantPage.locator('h2', { hasText: /^Заявка #\d+/ }),
      }).first();
      await expect(appCard).toContainText('На рассмотрении', { timeout: 15000 });
      await expect(applicantPage.locator('body')).toContainText(portfolioTitle, { timeout: 15000 });

      // 3. Reviewer logs into /admin/login -> opens /admin/applications -> verifies portfolio -> requests revision
      await loginAdminViaUi(reviewerPage);
      await reviewerPage.goto('/admin/applications');

      const reviewerCard = reviewerPage.locator('div.rounded-xl', { hasText: applicantEmail }).first();
      await expect(reviewerCard).toBeVisible({ timeout: 15000 });
      await expect(reviewerCard).toContainText(applicantName);
      await expect(reviewerCard).toContainText(portfolioTitle);

      await reviewerCard.locator('textarea').fill(reviewNote);
      await reviewerCard.getByRole('button', { name: 'Запросить доработку' }).click();
      await expect(reviewerCard).toContainText('Нужна доработка', { timeout: 15000 });

      // 4. Applicant reloads /applications -> sees revision_requested -> types unique revision motivation
      await applicantPage.reload();
      await expect(appCard).toContainText('Нужна доработка', { timeout: 15000 });
      await expect(appCard).toContainText(reviewNote);

      const revMotivationInput = applicantPage.getByLabel('Мотивация участия');
      await revMotivationInput.fill(uniqueRevMotivation);

      // Simulate 401 on actual PATCH /api/applications/my: clear cookies AFTER typing, click submit -> 401 -> /login?redirect=%2Fapplications -> relogin
      await applicantContext.clearCookies();
      const patch401Promise = applicantPage.waitForResponse(
        (resp) => resp.url().includes('/api/applications/my') && resp.request().method() === 'PATCH'
      );
      await applicantPage.getByRole('button', { name: /Отправить доработанную заявку/i }).click();
      const patch401Resp = await patch401Promise;
      expect(patch401Resp.status()).toBe(401);

      await applicantPage.waitForURL(/\/login\?redirect=%2Fapplications/, { timeout: 15000 });

      await loginUserViaUi(applicantPage, applicantEmail, applicantPassword);
      await applicantPage.waitForURL(/\/applications$/, { timeout: 15000 });
      await expect(applicantPage.getByLabel('Мотивация участия')).toHaveValue(uniqueRevMotivation, { timeout: 15000 });

      // 5. Simulate 409 conflict: bump version directly in PG while applicant holds stale version
      await pool.query(
        `UPDATE member_applications SET version = version + 1 WHERE user_id = $1 AND status = 'revision_requested'`,
        [applicant.id]
      );

      await applicantPage.getByRole('button', { name: /Отправить доработанную заявку/i }).click();

      // Assert conflict banner appears AND local revision text is NOT wiped
      await expect(appCard).toContainText(/Обнаружено изменение заявки на сервере/i, { timeout: 15000 });
      await expect(applicantPage.getByLabel('Мотивация участия')).toHaveValue(uniqueRevMotivation);

      // Click reconciliation button "Сохранить мои правки для версии #..." and resubmit
      await appCard.getByRole('button', { name: /Сохранить мои правки для версии/i }).click();
      await applicantPage.getByRole('button', { name: /Отправить доработанную заявку/i }).click();
      await expect(appCard).toContainText('На рассмотрении', { timeout: 15000 });

      // 6. Reviewer accepts applicant WITHOUT any contribution (scoped to exact applicant card)
      await reviewerPage.reload();
      const reviewerCardReloaded = reviewerPage.locator('div.rounded-xl', { hasText: applicantEmail }).first();
      await expect(reviewerCardReloaded).toContainText(uniqueRevMotivation, { timeout: 15000 });
      await reviewerCardReloaded.getByRole('button', { name: /Принять в участники/i }).click();
      await expect(reviewerCardReloaded).toContainText('Принята', { timeout: 15000 });

      // Verify DB rows: member_applications.status === 'accepted' and users.membership_status === 'accepted' (free member)
      const dbAppRes = await pool.query(
        `SELECT status FROM member_applications WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
        [applicant.id]
      );
      expect(dbAppRes.rows[0]?.status).toBe('accepted');

      const dbUserRes = await pool.query(
        `SELECT membership_status FROM users WHERE id = $1`,
        [applicant.id]
      );
      expect(dbUserRes.rows[0]?.membership_status).toBe('accepted');

      // 7. Applicant reloads /applications -> scoped accepted status badges (not matching static tab text)
      await applicantPage.reload();
      const membershipBanner = applicantPage.locator('div.rounded-xl', { hasText: 'Статус членства:' }).first();
      await expect(membershipBanner).toContainText('Принятый участник (accepted)', { timeout: 15000 });
      await expect(appCard).toContainText('Одобрена', { timeout: 15000 });

      // 8. Negative control: intercept /api/applications/my with 500 -> error banner + Retry, NO fake observer banner
      await applicantPage.route('**/api/applications/my*', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Simulated 500 error' }),
        })
      );
      await applicantPage.reload();
      await expect(applicantPage.getByRole('button', { name: 'Повторить загрузку' })).toBeVisible({ timeout: 15000 });
      await expect(applicantPage.locator('body')).toContainText(/Simulated 500 error|Не удалось загрузить данные заявки/i);
      await expect(applicantPage.getByText('Наблюдатель (observer)')).toHaveCount(0);
      await applicantPage.unroute('**/api/applications/my*');

      expect(pageErrors).toEqual([]);
    } finally {
      await applicantContext.close();
      await reviewerContext.close();
    }
  });

  test('2. Built-React Voter Journey: secret 1p1v vote + receipt + suspended voter rejection', async ({ browser, request }) => {
    test.skip(!process.env.DATABASE_URL, 'Requires real PostgreSQL (DATABASE_URL)');

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const memberEmail = `e2e.voter.${suffix}@sloboda.land`;
    const memberPassword = 'VoterPass123!';
    const memberName = `Избиратель ${suffix}`;
    const superAdminTok = signAdminToken();

    const member = await seedUser(pool, {
      email: memberEmail,
      password: memberPassword,
      name: memberName,
      status: 'active',
      membershipStatus: 'accepted',
      settlementId: 'sloboda-pilot',
      onboardingCompleted: true,
    });

    // Create and open proposal #1 (council_election, native_secret)
    const p1Title = `Выборы совета E2E #1 (${suffix})`;
    const createP1 = await request.post('/api/governance/proposals', {
      headers: { Authorization: `Bearer ${superAdminTok}` },
      data: {
        title: p1Title,
        description: 'Тайное голосование 1p1v',
        vote_type: 'council_election',
        scope_level: 'local',
        settlement_id: 'sloboda-pilot',
        authoritative_engine: 'native_secret',
        secret_ballot: true,
        options: ['Кандидат А', 'Кандидат Б', 'Воздержаться'],
        abstain_option_index: 2,
        quorum_members_pct: 50,
      },
    });
    expect(createP1.status()).toBe(201);
    const p1Id = (await createP1.json()).proposal.id;

    const openP1 = await request.post(`/api/governance/proposals/${p1Id}/open`, {
      headers: { Authorization: `Bearer ${superAdminTok}` },
    });
    expect(openP1.status()).toBe(200);
    expect((await openP1.json()).snapshot_count).toBeGreaterThanOrEqual(1);

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    const pageErrors = [];
    trackPageErrors(memberPage, pageErrors, 'voter');

    try {
      // Member logs into built React -> visits /governance
      await memberPage.goto('/login?redirect=%2Fgovernance');
      await loginUserViaUi(memberPage, memberEmail, memberPassword);
      await memberPage.waitForURL(/\/governance$/, { timeout: 15000 });

      const p1Card = memberPage.locator('div.rounded-xl', { hasText: p1Title }).first();
      await expect(p1Card).toBeVisible({ timeout: 15000 });
      await expect(p1Card).toContainText('Открыто');

      await p1Card.locator('label', { hasText: 'Кандидат А' }).click();
      await p1Card.getByRole('button', { name: 'Проголосовать' }).click();

      await expect(p1Card).toContainText('Голос учтён (Участники)', { timeout: 15000 });
      await expect(p1Card).toContainText(/Квитанция:/i);

      // Verify governance_voter_receipts row exists in PG
      const receiptRes = await pool.query(
        `SELECT id, chamber FROM governance_voter_receipts WHERE proposal_id = $1 AND user_id = $2`,
        [p1Id, member.id]
      );
      expect(receiptRes.rows).toHaveLength(1);
      expect(receiptRes.rows[0].chamber).toBe('member');

      // Create & open proposal #2 while member is still accepted (so member is in frozen snapshot), then suspend member
      const p2Title = `Выборы совета E2E #2 (${suffix})`;
      const createP2 = await request.post('/api/governance/proposals', {
        headers: { Authorization: `Bearer ${superAdminTok}` },
        data: {
          title: p2Title,
          description: 'Проверка блокировки приостановленного участника',
          vote_type: 'council_election',
          scope_level: 'local',
          settlement_id: 'sloboda-pilot',
          authoritative_engine: 'native_secret',
          secret_ballot: true,
          options: ['Поддержать', 'Отклонить'],
          quorum_members_pct: 50,
        },
      });
      expect(createP2.status()).toBe(201);
      const p2Id = (await createP2.json()).proposal.id;

      const openP2 = await request.post(`/api/governance/proposals/${p2Id}/open`, {
        headers: { Authorization: `Bearer ${superAdminTok}` },
      });
      expect(openP2.status()).toBe(200);

      await pool.query(`UPDATE users SET membership_status = 'suspended' WHERE id = $1`, [member.id]);

      await memberPage.reload();
      const p2Card = memberPage.locator('div.rounded-xl', { hasText: p2Title }).first();
      await expect(p2Card).toBeVisible({ timeout: 15000 });

      await p2Card.locator('label', { hasText: 'Поддержать' }).click();
      const voteRespPromise = memberPage.waitForResponse(
        (resp) => resp.url().includes(`/api/governance/proposals/${p2Id}/vote`) && resp.request().method() === 'POST'
      );
      await p2Card.getByRole('button', { name: 'Проголосовать' }).click();
      const voteResp = await voteRespPromise;
      expect(voteResp.status()).toBe(403);

      await expect(memberPage.locator('body')).toContainText(/приостановлена|неактивна/i, { timeout: 15000 });
      await expect(p2Card).not.toContainText('Голос учтён');

      const p2Receipts = await pool.query(
        `SELECT id FROM governance_voter_receipts WHERE proposal_id = $1`,
        [p2Id]
      );
      const p2SecretBallots = await pool.query(
        `SELECT id FROM governance_secret_ballots WHERE proposal_id = $1`,
        [p2Id]
      );
      const p2NamedBallots = await pool.query(
        `SELECT id FROM governance_ballots WHERE proposal_id = $1`,
        [p2Id]
      );
      expect(p2Receipts.rows).toHaveLength(0);
      expect(p2SecretBallots.rows).toHaveLength(0);
      expect(p2NamedBallots.rows).toHaveLength(0);

      expect(pageErrors).toEqual([]);
    } finally {
      await memberContext.close();
    }
  });

  test('3. Exact Financial Browser Control + Pagination + Multi-Settlement & Pledge Scope', async ({ browser, request }) => {
    test.skip(!process.env.DATABASE_URL, 'Requires real PostgreSQL (DATABASE_URL)');

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const userEmail = `e2e.fin.${suffix}@sloboda.land`;
    const userPassword = 'FinanceUser123!';
    const expenseTitle = `Щебень для дороги (${suffix})`;
    const oldReservedTitle = `Старый резерв страница 2 (${suffix})`;
    const superAdminTok = signAdminToken();

    if (process.env.ALLOW_DESTRUCTIVE_PG_VERIFY !== 'true') {
      throw new Error('Refusing destructive TRUNCATE without ALLOW_DESTRUCTIVE_PG_VERIFY=true');
    }
    const dbNameRes = await pool.query('SELECT current_database() AS db_name');
    const dbName = dbNameRes.rows[0]?.db_name || '';
    if (!/(^|[_-])(test|ci|local|dev)($|[_-])/i.test(dbName)) {
      throw new Error(`Refusing destructive TRUNCATE on non-disposable database "${dbName}"`);
    }

    // Reset ledger tables for deterministic exact kopeck assertions on sloboda-pilot
    await pool.query('TRUNCATE TABLE ledger_postings, expense_allocations, ledger_expenses, contributions RESTART IDENTITY CASCADE');
    await pool.query(
      `INSERT INTO sloboda_core_gates (gate_key, is_blocked, report_json, checked_at)
       VALUES ('ledger_integrity', FALSE, '{"ok":true,"discrepancies":[]}'::jsonb, NOW())
       ON CONFLICT (gate_key) DO UPDATE SET is_blocked = FALSE, report_json = EXCLUDED.report_json, checked_at = NOW()`
    );

    const finUser = await seedUser(pool, {
      email: userEmail,
      password: userPassword,
      name: `Пайщик Финансов ${suffix}`,
      membershipStatus: 'observer',
      settlementId: 'sloboda-pilot',
      onboardingCompleted: true,
    });

    // Seed second settlement (sloboda-north) and a pledge contribution on sloboda-pilot
    const northRes = await request.post('/api/admin/ledger/contributions', {
      headers: { Authorization: `Bearer ${superAdminTok}` },
      data: {
        settlement_id: 'sloboda-north',
        contributor_name: 'Северный Вкладчик',
        amount_kopecks: 700000,
        ledger_mode: 'verified_receipt',
        legal_right_type: 'cooperative_share',
        idempotency_key: `north-contrib-${suffix}`,
      },
    });
    expect(northRes.status()).toBe(201);

    const pledgeRes = await request.post('/api/admin/ledger/contributions', {
      headers: { Authorization: `Bearer ${superAdminTok}` },
      data: {
        settlement_id: 'sloboda-pilot',
        contributor_name: 'Обещание Наблюдателя',
        amount_kopecks: 9000000,
        ledger_mode: 'pledge',
        legal_right_type: 'observer_trace',
        idempotency_key: `pledge-contrib-${suffix}`,
      },
    });
    expect(pledgeRes.status()).toBe(201);

    const adminContext = await browser.newContext();
    const userContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const userPage = await userContext.newPage();
    const pageErrors = [];
    trackPageErrors(adminPage, pageErrors, 'admin-finance');
    trackPageErrors(userPage, pageErrors, 'user-finance');

    const kpiCard = (title) =>
      adminPage.locator('div.rounded-xl', {
        has: adminPage.locator('p, span', { hasText: title }),
      }).first();

    try {
      await loginAdminViaUi(adminPage);
      await adminPage.goto('/admin/finance');

      // Switch to ledger tab explicitly and verify sloboda-pilot scope
      await adminPage.getByRole('button', { name: /Реестр взносов и расходов/i }).click();
      const scopeSelect = adminPage.locator('#settlement-scope');
      await expect(scopeSelect).toBeVisible({ timeout: 15000 });
      await scopeSelect.selectOption('sloboda-pilot');
      await expect(scopeSelect.locator('option[value="sloboda-north"]')).toHaveCount(1);

      // Record verified contribution 5 000 RUB linked to finUser.id
      const contribForm = adminPage.locator('form').first();
      await contribForm.getByPlaceholder('Иван Петров').fill(`Вкладчик ${suffix}`);
      await contribForm.getByPlaceholder('1000.00').fill('5000');
      await contribForm.getByPlaceholder('Например: 42').fill(String(finUser.id));
      await contribForm.getByRole('button', { name: 'Записать взнос' }).click();

      // KPI: Available = 5000.00 RUB (NOT inflated by 90,000 RUB pledge or 7,000 RUB sloboda-north)
      await expect(kpiCard('Доступный остаток (расходуемый)')).toContainText('5000.00 ₽', { timeout: 15000 });
      await expect(kpiCard('Обещания (pledge)')).toContainText('90000.00 ₽');

      // Record expense 2 000 RUB (reserved, mark_paid unchecked)
      const expenseForm = adminPage.locator('form').nth(1);
      await expenseForm.getByPlaceholder('Закупка солнечных инверторов').fill(expenseTitle);
      await expenseForm.getByPlaceholder('5000.00').fill('2000');
      const markPaidCheckbox = expenseForm.locator('input[type="checkbox"]');
      if (await markPaidCheckbox.isChecked()) {
        await markPaidCheckbox.uncheck();
      }
      await expenseForm.getByRole('button', { name: 'Провести расход' }).click();

      await expect(kpiCard('Доступный остаток (расходуемый)')).toContainText('3000.00 ₽', { timeout: 15000 });
      await expect(kpiCard('Зарезервировано')).toContainText('2000.00 ₽');

      // Pay (paid) that exact expense row
      const expRow = adminPage.locator('tbody tr', { hasText: expenseTitle }).first();
      await expect(expRow).toBeVisible({ timeout: 15000 });
      await expRow.getByRole('button', { name: 'Оплатить' }).click();

      await expect(kpiCard('Доступный остаток (расходуемый)')).toContainText('3000.00 ₽', { timeout: 15000 });
      await expect(kpiCard('Зарезервировано')).toContainText('0.00 ₽');
      await expect(kpiCard('Оплачено по расходам')).toContainText('2000.00 ₽');

      // Open dispute (disputed) on that expense and resolve back to paid
      await expRow.getByRole('button', { name: 'Оспорить' }).click();
      await expect(expRow).toContainText('Оспорен', { timeout: 15000 });
      await expRow.getByRole('button', { name: /Закрыть спор \(оплачен\)/i }).click();
      await expect(expRow).toContainText('Оплачен', { timeout: 15000 });
      await expect(kpiCard('Оплачено по расходам')).toContainText('2000.00 ₽');
      await expect(kpiCard('Доступный остаток (расходуемый)')).toContainText('3000.00 ₽');

      // Test user logs in -> visits /finance -> personal projection tab
      await userPage.goto('/login?redirect=%2Ffinance');
      await loginUserViaUi(userPage, userEmail, userPassword);
      await userPage.waitForURL(/\/finance$/, { timeout: 15000 });

      await userPage.getByRole('button', { name: 'Мои взносы и расходы' }).click();
      await expect(userPage.locator('body')).toContainText('5000.00 ₽', { timeout: 15000 });
      await expect(userPage.locator('body')).toContainText('3000.00 ₽');
      await expect(userPage.locator('body')).toContainText('2000.00 ₽');
      await expect(userPage.locator('body')).toContainText(expenseTitle);

      // Verify public summary endpoint matches exact 500000 / 300000 / 0 / 200000 kopecks
      const pubRes = await request.get('/api/public/ledger/summary?settlement_id=sloboda-pilot');
      expect(pubRes.status()).toBe(200);
      const pubBody = await pubRes.json();
      expect(pubBody.totals.received.kopecks_str).toBe('500000');
      expect(pubBody.totals.available.kopecks_str).toBe('300000');
      expect(pubBody.totals.reserved.kopecks_str).toBe('0');
      expect(pubBody.totals.paid.kopecks_str).toBe('200000');

      // Pagination (>25 expenses): create 1 older reserved expense + 28 newer paid expenses
      const oldRes = await request.post('/api/admin/ledger/expenses', {
        headers: { Authorization: `Bearer ${superAdminTok}` },
        data: {
          settlement_id: 'sloboda-pilot',
          title: oldReservedTitle,
          category: 'equipment',
          amount_kopecks: 1000,
          allocation_rule: 'fifo',
          mark_paid: false,
          idempotency_key: `old-reserved-${suffix}`,
        },
      });
      expect(oldRes.status()).toBe(201);
      const oldExpId = (await oldRes.json()).expense.id;
      await pool.query(
        `UPDATE ledger_expenses SET created_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
        [oldExpId]
      );

      for (let i = 1; i <= 28; i += 1) {
        const batchRes = await request.post('/api/admin/ledger/expenses', {
          headers: { Authorization: `Bearer ${superAdminTok}` },
          data: {
            settlement_id: 'sloboda-pilot',
            title: `Пакетный расход #${i} (${suffix})`,
            category: 'operations',
            amount_kopecks: 100,
            allocation_rule: 'fifo',
            mark_paid: true,
            idempotency_key: `batch-paid-${suffix}-${i}`,
          },
        });
        expect(batchRes.status()).toBe(201);
      }

      // Reload /admin/finance -> verify older reserved expense is pushed to page 2 -> click Next (Вперёд) -> pay it -> reload & verify paid
      await adminPage.reload();
      await expect(adminPage.locator('body')).toContainText(/Страница 1\s*·\s*Всего:\s*30/, { timeout: 15000 });
      await expect(adminPage.locator('tbody tr', { hasText: oldReservedTitle })).toHaveCount(0);

      await adminPage.getByRole('button', { name: 'Вперёд' }).click();
      await expect(adminPage.locator('body')).toContainText(/Страница 2\s*·\s*Всего:\s*30/, { timeout: 15000 });

      const oldRowPage2 = adminPage.locator('tbody tr', { hasText: oldReservedTitle }).first();
      await expect(oldRowPage2).toBeVisible({ timeout: 15000 });
      await expect(oldRowPage2).toContainText('Резерв');
      await oldRowPage2.getByRole('button', { name: 'Оплатить' }).click();
      await expect(oldRowPage2).toContainText('Оплачен', { timeout: 15000 });

      await adminPage.reload();
      await expect(adminPage.locator('body')).toContainText(/Страница 1\s*·\s*Всего:\s*30/, { timeout: 15000 });
      await adminPage.getByRole('button', { name: 'Вперёд' }).click();
      const oldRowAfterReload = adminPage.locator('tbody tr', { hasText: oldReservedTitle }).first();
      await expect(oldRowAfterReload).toBeVisible({ timeout: 15000 });
      await expect(oldRowAfterReload).toContainText('Оплачен');

      expect(pageErrors).toEqual([]);
    } finally {
      await adminContext.close();
      await userContext.close();
    }
  });

  test('4. Moderation Built-React UI: Pin & Lock persistence + RBAC 403 + CSRF 403 enforcement', async ({ browser }) => {
    test.skip(!process.env.DATABASE_URL, 'Requires real PostgreSQL (DATABASE_URL)');

    await ensureForumSchema(pool);

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const modEmail = `e2e.mod.${suffix}@sloboda.land`;
    const modPassword = 'ModUser123!';
    const regEmail = `e2e.reg.${suffix}@sloboda.land`;
    const regPassword = 'RegUser123!';

    const modUser = await seedUser(pool, {
      email: modEmail,
      password: modPassword,
      name: `Модератор ${suffix}`,
      onboardingCompleted: true,
    });
    const regUser = await seedUser(pool, {
      email: regEmail,
      password: regPassword,
      name: `Обычный Пользователь ${suffix}`,
      onboardingCompleted: true,
    });

    await pool.query(
      `INSERT INTO forum_roles (
         user_id, role, can_pin_threads, can_lock_threads, can_warn_users,
         can_ban_users_temporary, can_delete_others_content, can_view_mod_log, can_view_user_history
       )
       VALUES ($1, 'moderator', true, true, true, true, true, true, true)
       ON CONFLICT (user_id) DO UPDATE SET
         role = 'moderator',
         can_pin_threads = true,
         can_lock_threads = true,
         can_warn_users = true,
         can_ban_users_temporary = true,
         can_delete_others_content = true,
         can_view_mod_log = true,
         can_view_user_history = true`,
      [modUser.id]
    );
    await pool.query(
      `INSERT INTO forum_roles (user_id, role)
       VALUES ($1, 'new_user')
       ON CONFLICT (user_id) DO UPDATE SET role = 'new_user', can_pin_threads = false, can_lock_threads = false`,
      [regUser.id]
    );

    const catRes = await pool.query(
      `INSERT INTO forum_categories (name, slug, description)
       VALUES ($1, $2, 'E2E category')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [`Категория E2E ${suffix}`, `e2e-cat-${suffix}`]
    );
    const categoryId = catRes.rows[0].id;

    const threadTitle = `Тема для модерации E2E (${suffix})`;
    const threadRes = await pool.query(
      `INSERT INTO forum_threads (title, body, type, author_id, category_id, is_pinned, is_locked, is_deleted)
       VALUES ($1, 'Содержимое тестовой темы для проверки закрепления и блокировки', 'discussion', $2, $3, false, false, false)
       RETURNING id`,
      [threadTitle, regUser.id, categoryId]
    );
    const threadId = threadRes.rows[0].id;

    const modContext = await browser.newContext();
    const regContext = await browser.newContext();
    const modPage = await modContext.newPage();
    const regPage = await regContext.newPage();
    const pageErrors = [];
    trackPageErrors(modPage, pageErrors, 'moderator');
    trackPageErrors(regPage, pageErrors, 'regular');

    try {
      // Moderator logs in via normal cookie session and navigates to /forum/thread/:id
      await modPage.goto(`/login?redirect=${encodeURIComponent(`/forum/thread/${threadId}`)}`);
      await loginUserViaUi(modPage, modEmail, modPassword);
      await modPage.waitForURL(new RegExp(`/forum/thread/${threadId}$`), { timeout: 15000 });

      await expect(modPage.locator('h1', { hasText: threadTitle })).toBeVisible({ timeout: 15000 });
      await expect(modPage.getByText('Действия модератора')).toBeVisible({ timeout: 15000 });

      // Click Pin button (Закрепить -> Открепить)
      const pinRespPromise = modPage.waitForResponse(
        (r) => r.url().includes(`/api/moderation/threads/${threadId}/pin`) && r.request().method() === 'POST'
      );
      await modPage.getByRole('button', { name: 'Закрепить' }).click();
      expect((await pinRespPromise).status()).toBe(200);
      await expect(modPage.getByRole('button', { name: 'Открепить' })).toBeVisible({ timeout: 15000 });

      // Click Lock button (Заблокировать -> Разблокировать)
      const lockRespPromise = modPage.waitForResponse(
        (r) => r.url().includes(`/api/moderation/threads/${threadId}/lock`) && r.request().method() === 'POST'
      );
      await modPage.getByRole('button', { name: 'Заблокировать' }).click();
      expect((await lockRespPromise).status()).toBe(200);
      await expect(modPage.getByRole('button', { name: 'Разблокировать' })).toBeVisible({ timeout: 15000 });

      // Reload page and assert pinned & locked persisted in UI and DB
      const reloadThreadRespPromise = modPage.waitForResponse(
        (r) => r.url().includes(`/api/forum/threads/${threadId}`) && r.request().method() === 'GET'
      );
      await modPage.reload();
      const reloadThreadResp = await reloadThreadRespPromise;
      expect(reloadThreadResp.status()).toBe(200);
      const reloadThreadJson = await reloadThreadResp.json();
      expect(reloadThreadJson.thread?.is_pinned).toBe(true);
      expect(reloadThreadJson.thread?.is_locked).toBe(true);

      await expect(modPage.locator('body')).toContainText('Эта тема заблокирована', { timeout: 15000 });
      await expect(modPage.locator('body')).toContainText('Заблокировано');

      // Navigate back to /forum and verify pinned + locked icons are rendered on the thread card
      await modPage.getByRole('button', { name: /Назад к форуму/i }).click();
      await modPage.waitForURL(/\/forum$/, { timeout: 15000 });
      const threadCard = modPage.locator('div.rounded-xl', { has: modPage.locator('h3', { hasText: threadTitle }) }).first();
      await expect(threadCard).toBeVisible({ timeout: 15000 });
      await expect(threadCard.locator('svg.lucide-pin')).toBeVisible();
      await expect(threadCard.locator('svg.lucide-lock')).toBeVisible();

      const dbThreadAfter = await pool.query(
        'SELECT is_pinned, is_locked FROM forum_threads WHERE id = $1',
        [threadId]
      );
      expect(dbThreadAfter.rows[0]).toEqual({ is_pinned: true, is_locked: true });

      // Regular user gets 403 on POST /api/moderation/threads/:id/pin (even with valid CSRF token)
      await regPage.goto('/login');
      await loginUserViaUi(regPage, regEmail, regPassword);
      await regPage.waitForURL(/\/dashboard$/, { timeout: 15000 });

      const csrfRes = await regContext.request.get('/api/public/csrf');
      expect(csrfRes.ok()).toBeTruthy();
      const { token: regCsrf } = await csrfRes.json();

      const regPinRes = await regContext.request.post(`/api/moderation/threads/${threadId}/pin`, {
        headers: { 'x-csrf-token': regCsrf },
        data: { pinned: false },
      });
      expect(regPinRes.status()).toBe(403);

      // Moderator cookie request WITHOUT X-CSRF-Token header gets 403 and does NOT mutate forum_threads
      const modNoCsrfRes = await modContext.request.post(`/api/moderation/threads/${threadId}/pin`, {
        data: { pinned: false },
      });
      expect(modNoCsrfRes.status()).toBe(403);

      const dbThreadUnchanged = await pool.query(
        'SELECT is_pinned, is_locked FROM forum_threads WHERE id = $1',
        [threadId]
      );
      expect(dbThreadUnchanged.rows[0]).toEqual({ is_pinned: true, is_locked: true });

      expect(pageErrors).toEqual([]);
    } finally {
      await modContext.close();
      await regContext.close();
    }
  });

  test('5. Auth Return-Target Preservation: Onboarding + Invite Registration + Magic Link + Malicious Redirect Block', async ({ browser, request }) => {
    test.skip(!process.env.DATABASE_URL, 'Requires real PostgreSQL (DATABASE_URL)');

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 5A: Onboarding redirect preservation
    const onboardEmail = `e2e.onboard.${suffix}@sloboda.land`;
    const onboardPass = 'OnboardPass123!';
    await seedUser(pool, {
      email: onboardEmail,
      password: onboardPass,
      name: `Новичок ${suffix}`,
      onboardingCompleted: false,
    });

    const onboardContext = await browser.newContext();
    const onboardPage = await onboardContext.newPage();
    const pageErrors = [];
    trackPageErrors(onboardPage, pageErrors, 'onboarding');

    try {
      await onboardPage.goto('/login?redirect=%2Fapplications');
      await loginUserViaUi(onboardPage, onboardEmail, onboardPass);
      await onboardPage.waitForURL(/\/onboarding\?redirect=%2Fapplications/, { timeout: 15000 });
      await onboardPage.getByRole('button', { name: 'Пропустить пока' }).click();
      await onboardPage.waitForURL(/\/applications$/, { timeout: 15000 });
    } finally {
      await onboardContext.close();
    }

    // 5B: Invite registration redirect preservation (user_invites)
    const inviteEmail = `e2e.invite.${suffix}@sloboda.land`;
    const inviteToken = crypto.randomBytes(24).toString('hex');
    await pool.query(
      `INSERT INTO user_invites (email, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
      [inviteEmail.toLowerCase(), inviteToken]
    );

    const inviteContext = await browser.newContext();
    const invitePage = await inviteContext.newPage();
    trackPageErrors(invitePage, pageErrors, 'invite');

    try {
      await invitePage.goto(`/register/${inviteToken}?redirect=%2Fapplications`);
      await expect(invitePage.getByText(inviteEmail.toLowerCase())).toBeVisible({ timeout: 15000 });
      await invitePage.getByLabel('Имя', { exact: true }).fill(`Приглашённый ${suffix}`);
      await invitePage.getByLabel('Пароль', { exact: true }).fill('InvitePass123!');
      await invitePage.getByLabel('Подтвердите пароль', { exact: true }).fill('InvitePass123!');
      await invitePage.getByRole('button', { name: 'Зарегистрироваться' }).click();

      // Newly invited user has onboarding_completed_at = NULL -> passes through /onboarding?redirect=%2Fapplications -> /applications
      await invitePage.waitForURL(/\/(onboarding\?redirect=%2Fapplications|applications)/, { timeout: 15000 });
      if (new URL(invitePage.url()).pathname === '/onboarding') {
        await invitePage.getByRole('button', { name: 'Пропустить пока' }).click();
      }
      await invitePage.waitForURL(/\/applications$/, { timeout: 15000 });
    } finally {
      await inviteContext.close();
    }

    // 5C: Magic link issuance (POST /api/user/auth/magic-link) + redirect preservation
    const mlEmail1 = `e2e.magic1.${suffix}@sloboda.land`;
    await seedUser(pool, {
      email: mlEmail1,
      password: 'MagicPass123!',
      name: `Магик 1 ${suffix}`,
      onboardingCompleted: true,
    });

    const mlIssueRes = await request.post('/api/user/auth/magic-link', {
      data: { email: mlEmail1, redirect: '/applications' },
    });
    expect(mlIssueRes.status()).toBe(200);
    const mlIssueBody = await mlIssueRes.json();
    expect(typeof mlIssueBody.debugMagicLink).toBe('string');
    expect(mlIssueBody.debugMagicLink).toContain('redirect=%2Fapplications');

    const mlContext1 = await browser.newContext();
    const mlPage1 = await mlContext1.newPage();
    trackPageErrors(mlPage1, pageErrors, 'magic1');

    try {
      await mlPage1.goto(mlIssueBody.debugMagicLink);
      await mlPage1.waitForURL(/\/applications$/, { timeout: 15000 });
    } finally {
      await mlContext1.close();
    }

    // 5D: Malicious external redirect blocked -> stays on localhost (/dashboard or /onboarding)
    const mlEmail2 = `e2e.magic2.${suffix}@sloboda.land`;
    const mlToken2 = crypto.randomUUID();
    await seedUser(pool, {
      email: mlEmail2,
      password: 'MagicPass123!',
      name: `Магик 2 ${suffix}`,
      onboardingCompleted: true,
      magicLinkToken: mlToken2,
      magicLinkExpiresSql: `NOW() + INTERVAL '15 minutes'`,
    });

    const mlContext2 = await browser.newContext();
    const mlPage2 = await mlContext2.newPage();
    trackPageErrors(mlPage2, pageErrors, 'magic2');

    try {
      await mlPage2.goto(`/api/user/auth/magic-link/verify?token=${encodeURIComponent(mlToken2)}&redirect=https%3A%2F%2Fevil.example`);
      await mlPage2.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15000 });
      const finalUrl = new URL(mlPage2.url());
      expect(finalUrl.hostname).toBe('localhost');
      expect(['/dashboard', '/onboarding']).toContain(finalUrl.pathname);
    } finally {
      await mlContext2.close();
    }

    // 5E: /api/* return target rejected -> redirects safely to /dashboard (NOT /api/user/auth/logout)
    const mlEmail3 = `e2e.magic3.${suffix}@sloboda.land`;
    const mlToken3 = crypto.randomUUID();
    await seedUser(pool, {
      email: mlEmail3,
      password: 'MagicPass123!',
      name: `Магик 3 ${suffix}`,
      onboardingCompleted: true,
      magicLinkToken: mlToken3,
      magicLinkExpiresSql: `NOW() + INTERVAL '15 minutes'`,
    });

    const mlContext3 = await browser.newContext();
    const mlPage3 = await mlContext3.newPage();
    trackPageErrors(mlPage3, pageErrors, 'magic3');

    try {
      await mlPage3.goto(`/api/user/auth/magic-link/verify?token=${encodeURIComponent(mlToken3)}&redirect=%2Fapi%2Fuser%2Fauth%2Flogout`);
      await mlPage3.waitForURL(/\/dashboard$/, { timeout: 15000 });
      const finalUrl3 = new URL(mlPage3.url());
      expect(finalUrl3.hostname).toBe('localhost');
      expect(finalUrl3.pathname).toBe('/dashboard');
      expect(finalUrl3.pathname).not.toContain('/api/');
    } finally {
      await mlContext3.close();
    }

    expect(pageErrors).toEqual([]);
  });

  test('6. SLB-R3-05: Session expiry (401) inside onboarding preserves nested /applications target (password + magic-link)', async ({ browser, request }) => {
    test.skip(!process.env.DATABASE_URL, 'Requires real PostgreSQL (DATABASE_URL)');

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const pageErrors = [];

    // 6A: Password re-login after 401 inside /onboarding?redirect=%2Fapplications
    const emailPw = `e2e.onb401.pw.${suffix}@sloboda.land`;
    const passwordPw = 'OnbPass123!';
    await seedUser(pool, {
      email: emailPw,
      password: passwordPw,
      name: `Онборд 401 Пароль ${suffix}`,
      onboardingCompleted: false,
    });

    const ctxPw = await browser.newContext();
    const pagePw = await ctxPw.newPage();
    trackPageErrors(pagePw, pageErrors, 'onb401-pw');
    try {
      // Login targeting /applications -> DashboardLayout redirects unonboarded user to /onboarding?redirect=%2Fapplications
      await pagePw.goto('/login?redirect=%2Fapplications');
      await loginUserViaUi(pagePw, emailPw, passwordPw);
      await pagePw.waitForURL(/\/onboarding\?redirect=%2Fapplications/, { timeout: 15000 });
      // Wait for OnboardingLayout checkAuth() to finish and render onboarding controls before expiring session
      const skipBtn = pagePw.getByRole('button', { name: 'Пропустить пока' });
      await expect(skipBtn).toBeVisible({ timeout: 15000 });

      // Expire session (clear cookies) before protected onboarding action -> 401 redirects to /login?redirect=%2Fonboarding%3Fredirect%3D%252Fapplications
      await ctxPw.clearCookies();
      const onb401Promise = pagePw.waitForResponse(
        (resp) => resp.url().includes('/api/user/onboarding/complete') && resp.request().method() === 'POST'
      );
      await skipBtn.click();
      const onb401Resp = await onb401Promise;
      expect(onb401Resp.status()).toBe(401);

      await pagePw.waitForURL(/\/login\?redirect=/, { timeout: 15000 });
      expect(pagePw.url()).toContain('onboarding');

      // Re-login with password -> must return to /onboarding?redirect=%2Fapplications, then completing onboarding lands on /applications
      await loginUserViaUi(pagePw, emailPw, passwordPw);
      await pagePw.waitForURL(/\/onboarding\?redirect=%2Fapplications/, { timeout: 15000 });
      await expect(pagePw.getByRole('button', { name: 'Пропустить пока' })).toBeVisible({ timeout: 15000 });

      await pagePw.getByRole('button', { name: 'Пропустить пока' }).click();
      await pagePw.waitForURL(/\/applications$/, { timeout: 15000 });
    } finally {
      await ctxPw.close();
    }

    // 6B: Magic-link issuance + verification preserves nested /onboarding?redirect=%2Fapplications for unonboarded user
    const emailMl = `e2e.onb401.ml.${suffix}@sloboda.land`;
    await seedUser(pool, {
      email: emailMl,
      password: 'OnbMlPass123!',
      name: `Онборд 401 Магик ${suffix}`,
      onboardingCompleted: false,
    });

    const mlNestedRes = await request.post('/api/user/auth/magic-link', {
      data: { email: emailMl, redirect: '/onboarding?redirect=%2Fapplications' },
    });
    expect(mlNestedRes.status()).toBe(200);
    const mlNestedBody = await mlNestedRes.json();
    expect(typeof mlNestedBody.debugMagicLink).toBe('string');
    expect(mlNestedBody.debugMagicLink).toContain('onboarding');

    const ctxMl = await browser.newContext();
    const pageMl = await ctxMl.newPage();
    trackPageErrors(pageMl, pageErrors, 'onb401-ml');
    try {
      await pageMl.goto(mlNestedBody.debugMagicLink);
      await pageMl.waitForURL(/\/onboarding\?redirect=%2Fapplications/, { timeout: 15000 });
      await expect(pageMl.getByRole('button', { name: 'Пропустить пока' })).toBeVisible({ timeout: 15000 });
      await pageMl.getByRole('button', { name: 'Пропустить пока' }).click();
      await pageMl.waitForURL(/\/applications$/, { timeout: 15000 });
    } finally {
      await ctxMl.close();
    }

    // 6C: Malicious nested redirect (external / /api / duplicate) rejected by server magic-link issuer -> falls back to default /dashboard (omits redirect param)
    const mlBadRes = await request.post('/api/user/auth/magic-link', {
      data: { email: emailMl, redirect: '/onboarding?redirect=https%3A%2F%2Fevil.example' },
    });
    expect(mlBadRes.status()).toBe(200);
    const mlBadBody = await mlBadRes.json();
    expect(new URL(mlBadBody.debugMagicLink).searchParams.get('redirect')).toBeNull();
    expect(mlBadBody.debugMagicLink).not.toContain('evil.example');

    const mlBadApiRes = await request.post('/api/user/auth/magic-link', {
      data: { email: emailMl, redirect: '/onboarding?redirect=%2Fapi%2Fadmin' },
    });
    expect(mlBadApiRes.status()).toBe(200);
    const mlBadApiBody = await mlBadApiRes.json();
    expect(new URL(mlBadApiBody.debugMagicLink).searchParams.get('redirect')).toBeNull();
    expect(mlBadApiBody.debugMagicLink).not.toContain('admin');

    expect(pageErrors).toEqual([]);
  });

  test('7. SLB-R3-06: Late async responses (delayed PATCH 409 & delayed portfolio POST) preserve newer revision draft after immediate reload', async ({ browser, request }) => {
    test.skip(!process.env.DATABASE_URL, 'Requires real PostgreSQL (DATABASE_URL)');

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const email = `e2e.late.${suffix}@sloboda.land`;
    const password = 'LatePass123!';
    const pageErrors = [];

    const seeded = await seedUser(pool, {
      email,
      password,
      name: `Поздний Ответ ${suffix}`,
      onboardingCompleted: true,
    });
    const appRow = (await pool.query(`
      INSERT INTO member_applications
        (user_id, full_name, email, city, primary_domain, skills, motivation, status, version, review_note)
      VALUES ($1, $2, $3, 'Казань', 'ENG', 'Initial X skills', 'Initial X motivation', 'revision_requested', 2, 'Уточните навыки')
      RETURNING id
    `, [seeded.id, `Поздний Ответ ${suffix}`, email])).rows[0];

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    trackPageErrors(page, pageErrors, 'late-draft');

    try {
      await page.goto('/login?redirect=%2Fapplications');
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/applications$/, { timeout: 15000 });

      const skillsInput = page.locator('textarea').first();
      await expect(skillsInput).toBeVisible({ timeout: 10000 });

      // 7A: Delayed portfolio POST — start with X, type Y while POST is in flight, release response, reload immediately without typing
      await skillsInput.fill(`Draft X before portfolio ${suffix}`);
      let releasePortfolio;
      let notifyPortfolioArrived;
      const portfolioArrived = new Promise((resolve) => { notifyPortfolioArrived = resolve; });
      const portfolioInFlight = new Promise((resolve) => { releasePortfolio = resolve; });
      let portfolioIntercepted = false;
      await page.route('**/api/applications/my/portfolio', async (route) => {
        if (route.request().method() === 'POST' && !portfolioIntercepted) {
          portfolioIntercepted = true;
          notifyPortfolioArrived();
          const resp = await route.fetch();
          await portfolioInFlight;
          await route.fulfill({ response: resp });
          return;
        }
        await route.continue();
      });

      await page.locator('input[placeholder*="Название проекта"]').first().fill(`Delayed Portfolio ${suffix}`);
      await page.getByRole('button', { name: /Добавить работу|Добавить в портфолио/i }).click();
      await portfolioArrived;

      // Type Y while portfolio POST is still pending!
      const textY1 = `Newer Y1 typed during portfolio POST ${suffix}`;
      await skillsInput.fill(textY1);
      releasePortfolio();
      await expect(page.getByText(`Delayed Portfolio ${suffix}`)).toBeVisible({ timeout: 10000 });

      // Immediate reload WITHOUT any additional typing -> Y1 MUST persist!
      await page.reload();
      await expect(page.locator('textarea').first()).toHaveValue(textY1, { timeout: 10000 });

      // 7B: Delayed PATCH 409 — bump version on server, delay PATCH 409, type Y2 while in flight, release 409, reload immediately without typing
      let releasePatch409;
      let notifyPatch409Arrived;
      const patch409Arrived = new Promise((resolve) => { notifyPatch409Arrived = resolve; });
      const patch409InFlight = new Promise((resolve) => { releasePatch409 = resolve; });
      let patchIntercepted = false;
      await page.route('**/api/applications/my', async (route) => {
        if (route.request().method() === 'PATCH' && !patchIntercepted) {
          patchIntercepted = true;
          notifyPatch409Arrived();
          // Advance server version so PATCH returns genuine 409
          await pool.query('UPDATE member_applications SET version = version + 1 WHERE id = $1', [appRow.id]);
          const resp = await route.fetch();
          expect(resp.status()).toBe(409);
          await patch409InFlight;
          await route.fulfill({ response: resp });
          return;
        }
        await route.continue();
      });

      await page.getByRole('button', { name: /Отправить доработанную заявку|Отправить на повторное/i }).click();
      await patch409Arrived;

      // Type Y2 while PATCH 409 is still pending!
      const textY2 = `Newer Y2 typed during PATCH 409 ${suffix}`;
      await page.locator('textarea').first().fill(textY2);
      releasePatch409();

      // Wait for persistent conflict UI banner
      await expect(page.getByText(/Обнаружено изменение заявки на сервере/i).first()).toBeVisible({ timeout: 10000 });

      // Immediate reload WITHOUT any additional typing -> Y2 MUST persist AND persistent conflict banner MUST remain!
      await page.reload();
      await expect(page.locator('textarea').first()).toHaveValue(textY2, { timeout: 10000 });
      await expect(page.getByText(/Обнаружено изменение заявки на сервере/i).first()).toBeVisible({ timeout: 10000 });

      // 7C: Resolve conflict keeping draft, then delayed PATCH 200 — type Y3 while PATCH 200 is in flight, release 200, reload -> Y3 preserved
      await page.getByRole('button', { name: /Сохранить мои правки для версии/i }).click();
      let releasePatch200;
      let notifyPatch200Arrived;
      const patch200Arrived = new Promise((resolve) => { notifyPatch200Arrived = resolve; });
      const patch200InFlight = new Promise((resolve) => { releasePatch200 = resolve; });
      let patch200Intercepted = false;
      await page.route('**/api/applications/my', async (route) => {
        if (route.request().method() === 'PATCH' && !patch200Intercepted) {
          patch200Intercepted = true;
          notifyPatch200Arrived();
          const resp = await route.fetch();
          expect(resp.status()).toBe(200);
          await patch200InFlight;
          await route.fulfill({ response: resp });
          return;
        }
        await route.continue();
      });

      await page.getByRole('button', { name: /Отправить доработанную заявку|Отправить на повторное/i }).click();
      await patch200Arrived;
      const textY3 = `Newer Y3 typed during PATCH 200 ${suffix}`;
      await page.locator('textarea').first().fill(textY3);
      releasePatch200();
      await expect(page.getByText(/Обнаружено изменение заявки на сервере/i).first()).toBeVisible({ timeout: 10000 });
      await page.reload();
      await expect(page.getByText(textY3)).toBeVisible({ timeout: 10000 });
    } finally {
      await ctx.close();
    }

    expect(pageErrors).toEqual([]);
  });

  test('8. SLB-R4-02: Two-tab & three-tab cross-tab drafts survive delayed PATCH 200, genuine PATCH 409, portfolio POST, and immediate reload', async ({ browser }) => {
    test.skip(!process.env.DATABASE_URL, 'Requires real PostgreSQL (DATABASE_URL)');

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const email = `e2e.xtab.${suffix}@sloboda.land`;
    const password = 'CrossTabPass123!';
    const pageErrors = [];

    const seeded = await seedUser(pool, {
      email,
      password,
      name: `Две Вкладки ${suffix}`,
      onboardingCompleted: true,
    });
    const appRow = (await pool.query(`
      INSERT INTO member_applications
        (user_id, full_name, email, city, primary_domain, skills, motivation, status, version, review_note)
      VALUES ($1, $2, $3, 'Казань', 'ENG', 'Initial X skills', 'Initial X motivation', 'revision_requested', 2, 'Уточните детали')
      RETURNING id
    `, [seeded.id, `Две Вкладки ${suffix}`, email])).rows[0];

    const ctx = await browser.newContext();
    const pageA = await ctx.newPage();
    const pageB = await ctx.newPage();
    trackPageErrors(pageA, pageErrors, 'xtab-A');
    trackPageErrors(pageB, pageErrors, 'xtab-B');

    try {
      // Login on pageA (shared browser context shares cookies & localStorage with pageB)
      await pageA.goto('/login?redirect=%2Fapplications');
      await pageA.locator('input[type="email"]').fill(email);
      await pageA.locator('input[type="password"]').fill(password);
      await pageA.locator('button[type="submit"]').click();
      await pageA.waitForURL(/\/applications$/, { timeout: 15000 });
      await expect(pageA.locator('textarea').first()).toBeVisible({ timeout: 10000 });

      await pageB.goto('/applications');
      await expect(pageB.locator('textarea').first()).toBeVisible({ timeout: 10000 });

      // 8A: Cross-tab delayed PATCH 409 — bump server version, pageA sends X (delayed 409),
      // pageB edits BOTH skills and motivation to Y409, release 409, immediately reload BOTH pages.
      const xSkills409 = `TabA X skills 409 ${suffix}`;
      const xMot409 = `TabA X motivation 409 ${suffix}`;
      await pageA.locator('textarea').nth(0).fill(xSkills409);
      await pageA.locator('textarea').nth(1).fill(xMot409);

      let release409;
      let notify409Arrived;
      const arrived409 = new Promise((resolve) => { notify409Arrived = resolve; });
      const hold409 = new Promise((resolve) => { release409 = resolve; });
      let intercepted409 = false;
      await pageA.route('**/api/applications/my', async (route) => {
        if (route.request().method() === 'PATCH' && !intercepted409) {
          intercepted409 = true;
          notify409Arrived();
          await pool.query('UPDATE member_applications SET version = version + 1 WHERE id = $1', [appRow.id]);
          const resp = await route.fetch();
          expect(resp.status()).toBe(409);
          await hold409;
          await route.fulfill({ response: resp });
          return;
        }
        await route.continue();
      });

      await pageA.getByRole('button', { name: /Отправить доработанную заявку|Отправить на повторное/i }).click();
      await arrived409;

      // Tab B edits BOTH skills and motivation to Y409 while Tab A's 409 is in flight
      const ySkills409 = `TabB Y skills 409 ${suffix}`;
      const yMot409 = `TabB Y motivation 409 ${suffix}`;
      await pageB.locator('textarea').nth(0).fill(ySkills409);
      await pageB.locator('textarea').nth(1).fill(yMot409);

      release409();
      await expect(pageA.getByText(/Обнаружено изменение заявки на сервере/i).first()).toBeVisible({ timeout: 10000 });

      // Immediate reload of BOTH pages WITHOUT any additional typing -> Y409 MUST persist on both!
      await pageA.reload();
      await pageB.reload();
      await expect(pageB.locator('textarea').nth(0)).toHaveValue(ySkills409, { timeout: 10000 });
      await expect(pageB.locator('textarea').nth(1)).toHaveValue(yMot409, { timeout: 10000 });
      await expect(pageB.getByText(/версия #3/i).first()).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByText(/создавался для версии #2/i).first()).toBeVisible({ timeout: 10000 });
      await expect(pageA.locator('textarea').nth(0)).toHaveValue(ySkills409, { timeout: 10000 });
      await expect(pageA.locator('textarea').nth(1)).toHaveValue(yMot409, { timeout: 10000 });

      // Clean up drafts via explicit server reload button so 8B starts cleanly on version 3
      await pageA.getByRole('button', { name: /Загрузить серверную версию/i }).click();
      await expect(pageA.getByText(/Обнаружено изменение заявки на сервере/i)).toHaveCount(0, { timeout: 10000 });

      // 8B: Cross-tab delayed portfolio POST — pageA adds portfolio item (delayed),
      // pageB edits BOTH skills and motivation, release POST, reload -> Y preserved, item not duplicated
      await pageB.reload();
      await expect(pageB.locator('textarea').nth(0)).toBeVisible({ timeout: 10000 });
      let releasePort;
      let notifyPortArrived;
      const arrivedPort = new Promise((resolve) => { notifyPortArrived = resolve; });
      const holdPort = new Promise((resolve) => { releasePort = resolve; });
      let interceptedPort = false;
      await pageA.route('**/api/applications/my/portfolio', async (route) => {
        if (route.request().method() === 'POST' && !interceptedPort) {
          interceptedPort = true;
          notifyPortArrived();
          const resp = await route.fetch();
          expect(resp.status()).toBe(201);
          await holdPort;
          await route.fulfill({ response: resp });
          return;
        }
        await route.continue();
      });

      const portTitle = `CrossTab Portfolio ${suffix}`;
      await pageA.locator('input[placeholder*="Название проекта"]').first().fill(portTitle);
      await pageA.getByRole('button', { name: /Добавить работу|Добавить в портфолио/i }).click();
      await arrivedPort;

      const ySkillsPort = `TabB Y skills portfolio ${suffix}`;
      const yMotPort = `TabB Y motivation portfolio ${suffix}`;
      await pageB.locator('textarea').nth(0).fill(ySkillsPort);
      await pageB.locator('textarea').nth(1).fill(yMotPort);

      releasePort();
      await expect(pageA.getByText(portTitle)).toBeVisible({ timeout: 10000 });

      await pageB.reload();
      await expect(pageB.locator('textarea').nth(0)).toHaveValue(ySkillsPort, { timeout: 10000 });
      await expect(pageB.locator('textarea').nth(1)).toHaveValue(yMotPort, { timeout: 10000 });
      await expect(pageB.getByText(portTitle)).toHaveCount(1, { timeout: 10000 });

      // Clear draft so 8C starts cleanly at version 4
      await pageB.getByRole('button', { name: /Загрузить серверную версию/i }).click();
      await expect(pageB.getByText(/Обнаружено изменение заявки на сервере/i)).toHaveCount(0, { timeout: 10000 });

      // 8C: Three divergent drafts across 3 tabs preserved after reload — verify all 3 texts,
      // switch between them via UI, and confirm explicit discard leaves 0 stored draft keys
      const pageC = await ctx.newPage();
      trackPageErrors(pageC, pageErrors, 'xtab-C');
      try {
        await pageA.reload();
        await pageB.reload();
        await pageC.goto('/applications');
        await expect(pageC.locator('textarea').nth(0)).toBeVisible({ timeout: 10000 });
        await pageA.locator('textarea').nth(0).fill(`Draft3A ${suffix}`);
        await pageB.locator('textarea').nth(0).fill(`Draft3B ${suffix}`);
        await pageC.locator('textarea').nth(0).fill(`Draft3C ${suffix}`);
        await pageA.reload();
        await expect(pageA.getByText(/Сохранено несколько версий черновика \(3\)/i)).toBeVisible({ timeout: 10000 });
        await expect(pageA.getByText(`Draft3A ${suffix}`).first()).toBeVisible({ timeout: 10000 });
        await expect(pageA.getByText(`Draft3B ${suffix}`).first()).toBeVisible({ timeout: 10000 });
        await expect(pageA.getByText(`Draft3C ${suffix}`).first()).toBeVisible({ timeout: 10000 });
        // Open the third entry in the recovery list and verify editor updates to its text
        await pageA.getByRole('button', { name: 'Открыть' }).nth(2).click();
        await expect(pageA.locator('textarea').nth(0)).toHaveValue(`Draft3A ${suffix}`, { timeout: 10000 });
        await pageA.getByRole('button', { name: /Загрузить серверную версию/i }).click();
        await expect(pageA.getByText(/Сохранено несколько версий черновика/i)).toHaveCount(0, { timeout: 10000 });
        const remainingKeys = await pageA.evaluate(() =>
          Object.keys(localStorage).filter((k) => k.startsWith('sloboda_revision_draft:'))
        );
        expect(remainingKeys).toEqual([]);
      } finally {
        await pageC.close();
      }

      // 8D: Cross-tab delayed PATCH 200 — pageA submits X (delayed genuine 200, moving status to pending),
      // pageB edits BOTH skills and motivation to Y200 while 200 is pending, pageA does zero more typing,
      // release 200, immediately reload BOTH pages -> Y200 MUST survive and be recoverable in UI!
      await pageA.reload();
      await pageB.reload();
      await expect(pageA.locator('textarea').nth(0)).toBeVisible({ timeout: 10000 });
      await expect(pageB.locator('textarea').nth(0)).toBeVisible({ timeout: 10000 });

      await pageA.locator('textarea').nth(0).fill(`TabA X skills 200 ${suffix}`);
      await pageA.locator('textarea').nth(1).fill(`TabA X mot 200 ${suffix}`);

      let release200;
      let notify200Arrived;
      const arrived200 = new Promise((resolve) => { notify200Arrived = resolve; });
      const hold200 = new Promise((resolve) => { release200 = resolve; });
      let intercepted200 = false;
      await pageA.route('**/api/applications/my', async (route) => {
        if (route.request().method() === 'PATCH' && !intercepted200) {
          intercepted200 = true;
          notify200Arrived();
          const resp = await route.fetch();
          expect(resp.status()).toBe(200);
          await hold200;
          await route.fulfill({ response: resp });
          return;
        }
        await route.continue();
      });

      await pageA.getByRole('button', { name: /Отправить доработанную заявку|Отправить на повторное/i }).click();
      await arrived200;

      const ySkills200 = `TabB Y skills 200 ${suffix}`;
      const yMot200 = `TabB Y motivation 200 ${suffix}`;
      await pageB.locator('textarea').nth(0).fill(ySkills200);
      await pageB.locator('textarea').nth(1).fill(yMot200);

      release200();
      await expect(pageA.getByText(/Сохранённые локальные правки/i)).toBeVisible({ timeout: 10000 });

      // Immediate reload of BOTH pages WITHOUT any additional typing -> BOTH fields of Y200 MUST persist!
      await pageA.reload();
      await pageB.reload();
      await expect(pageB.getByText(ySkills200)).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByText(yMot200)).toBeVisible({ timeout: 10000 });
      await expect(pageA.getByText(ySkills200)).toBeVisible({ timeout: 10000 });
      await expect(pageA.getByText(yMot200)).toBeVisible({ timeout: 10000 });

      // 8E: Clean submit without newer edits clears own draft cleanly and leaves no stale conflict banner
      await pageA.getByRole('button', { name: /Очистить черновик/i }).click();
      await pool.query("UPDATE member_applications SET status = 'revision_requested' WHERE id = $1", [appRow.id]);
      await pageA.reload();
      await expect(pageA.locator('textarea').nth(0)).toBeVisible({ timeout: 10000 });
      await pageA.locator('textarea').nth(0).fill(`Clean final skills ${suffix}`);
      await pageA.getByRole('button', { name: /Отправить доработанную заявку|Отправить на повторное/i }).click();
      await expect(pageA.getByText(/Clean final skills/i)).toBeVisible({ timeout: 10000 });
      await pageA.reload();
      await expect(pageA.getByText(/Сохранённые локальные правки/i)).toHaveCount(0, { timeout: 10000 });
      await expect(pageA.getByText(/Обнаружено изменение заявки на сервере/i)).toHaveCount(0, { timeout: 10000 });
    } finally {
      await ctx.close();
    }

    expect(pageErrors).toEqual([]);
  });
});
