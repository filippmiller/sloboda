// @ts-check
const { test, expect } = require('@playwright/test');
const jwt = require('jsonwebtoken');
const core = require('../server/services/slobodaCore');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-change-me';

function signUserToken(id, email, name) {
    return jwt.sign({ id, email, name, type: 'user' }, JWT_SECRET, { expiresIn: '2h' });
}

function signAdminToken(id, email, role, name) {
    return jwt.sign({ id, email, role, name }, JWT_SECRET, { expiresIn: '2h' });
}

test.describe('Sloboda Core Acceptance Suite', () => {
    test('Unit invariants: Hamilton BigInt kopeck rounding & 9007199254740993 precision', async () => {
        // 2 kopecks split across 3 equal balances -> [1n, 1n, 0n]
        const res = core.allocateProportionalBigInt(2n, [
            { id: 1, available_kopecks: 100n, legal_right_type: 'cooperative_share' },
            { id: 2, available_kopecks: 100n, legal_right_type: 'cooperative_share' },
            { id: 3, available_kopecks: 100n, legal_right_type: 'cooperative_share' },
        ]);
        expect(res.map((r) => ({ id: r.contribution_id, amt: r.amount_kopecks.toString() }))).toEqual([
            { id: 1, amt: '1' },
            { id: 2, amt: '1' },
        ]);

        // BigInt beyond Number.MAX_SAFE_INTEGER (9007199254740993)
        const big = core.toBigIntKopecks('9007199254740993');
        expect(big.toString()).toBe('9007199254740993');
        expect(core.formatKopecks(big).kopecks_str).toBe('9007199254740993');
    });

    test('Landing page renders "Проектируем Слободу вместе" with advisory-only polls & ledger panel', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('h1.hero-title')).toContainText('Проектируем Слободу вместе');
        await expect(page.locator('#ledger-panel')).toBeVisible();
        await expect(page.locator('#pollBinding')).toHaveCount(0);
        await expect(page.locator('#pollList')).not.toContainText('Решение сообщества');
    });

    test('Public polls reject kind=binding (400) and accept kind=advisory (200)', async ({ request }) => {
        const csrfRes = await request.get('/api/public/csrf');
        expect(csrfRes.ok()).toBeTruthy();
        const { token } = await csrfRes.json();

        const bindingRes = await request.post('/api/public/polls', {
            headers: { 'x-csrf-token': token },
            data: {
                title: 'Попытка выдать гостевой опрос за решение',
                options: ['Да', 'Нет'],
                kind: 'binding',
            },
        });
        expect(bindingRes.status()).toBe(400);

        const advisoryRes = await request.post('/api/public/polls', {
            headers: { 'x-csrf-token': token },
            data: {
                title: 'Какой тип фундамента сравнить первым?',
                options: ['Винтовые сваи', 'УШП'],
                kind: 'advisory',
            },
        });
        expect(advisoryRes.ok()).toBeTruthy();
        const advisoryBody = await advisoryRes.json();
        expect(advisoryBody.kind).toBe('advisory');
    });

    test('Campaign donation endpoint remains fail-closed (501)', async ({ request }) => {
        const userTok = signUserToken(501, 'u501@sloboda.local', 'Тестовый Участник');
        const res = await request.post('/api/user/campaigns/1/donate', {
            headers: { Authorization: `Bearer ${userTok}` },
            data: { amount: 1000 },
        });
        expect(res.status()).toBe(501);
    });

    test('Scenario A & B: Free membership admission -> 1p1v secret council election -> 1:1000 capital vote -> dual-consent -> Loomio tamper detection', async ({ request }) => {
        const superAdminTok = signAdminToken(1, 'admin@sloboda.land', 'super_admin', 'Super Admin');
        const freeMemberTok = signUserToken(701, 'builder@sloboda.local', 'Инженер Без Взноса');
        const wealthyMemberTok = signUserToken(702, 'investor@sloboda.local', 'Крупный Пайщик');
        const observerTok = signUserToken(703, 'observer@sloboda.local', 'Наблюдатель 100р');

        // 1. Free member & wealthy member submit applications with portfolio (zero payment required)
        const app1 = await request.post('/api/applications', {
            headers: { Authorization: `Bearer ${freeMemberTok}` },
            data: {
                full_name: 'Инженер Без Взноса',
                email: 'builder@sloboda.local',
                primary_domain: 'DOM',
                skills: 'Проектирование свайных фундаментов',
                trial_task_title: 'Сравнение 3 типов жилья на 500 домов',
                portfolio: [{ title: 'Смета мини-дома 36м2', domain_code: 'DOM', summary: 'Полный расчёт узлов' }],
            },
        });
        expect(app1.status()).toBe(201);
        const app1Data = await app1.json();

        const app2 = await request.post('/api/applications', {
            headers: { Authorization: `Bearer ${wealthyMemberTok}` },
            data: {
                full_name: 'Крупный Пайщик',
                email: 'investor@sloboda.local',
                primary_domain: 'UPR',
                skills: 'Финансовое моделирование',
            },
        });
        expect(app2.status()).toBe(201);
        const app2Data = await app2.json();

        // Missing expected_version must return 400 Bad Request
        const missingVerRev = await request.post(`/api/admin/applications/${app1Data.application.id}/review`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: { status: 'in_review' },
        });
        expect(missingVerRev.status()).toBe(400);

        // 2. Admin accepts both applications (with optimistic version check)
        const rev1 = await request.post(`/api/admin/applications/${app1Data.application.id}/review`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: { status: 'accepted', expected_version: 1, review_note: 'Отличное портфолио' },
        });
        expect(rev1.ok()).toBeTruthy();

        // Concurrent stale review must return 409 Conflict
        const staleRev = await request.post(`/api/admin/applications/${app1Data.application.id}/review`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: { status: 'rejected', expected_version: 1 },
        });
        expect(staleRev.status()).toBe(409);

        // Terminal accepted application cannot be reverted to rejected even with current version
        const terminalRev = await request.post(`/api/admin/applications/${app1Data.application.id}/review`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: { status: 'rejected', expected_version: 2 },
        });
        expect(terminalRev.status()).toBe(409);

        const rev2 = await request.post(`/api/admin/applications/${app2Data.application.id}/review`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: { status: 'accepted', expected_version: 1 },
        });
        expect(rev2.ok()).toBeTruthy();

        // 3. Record same-class shares: 1,000 RUB (user 701) vs 1,000,000 RUB (user 702) + 100 RUB observer (user 703)
        const c1 = await request.post('/api/admin/ledger/contributions', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                user_id: 701,
                contributor_name: 'Инженер Без Взноса',
                amount_kopecks: 100000, // 1,000 RUB
                share_class: 'class_a',
                legal_right_type: 'cooperative_share',
                idempotency_key: 'gov-share-701',
            },
        });
        expect(c1.status()).toBe(201);

        const c2 = await request.post('/api/admin/ledger/contributions', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                user_id: 702,
                contributor_name: 'Крупный Пайщик',
                amount_kopecks: 100000000, // 1,000,000 RUB
                share_class: 'class_a',
                legal_right_type: 'cooperative_share',
                idempotency_key: 'gov-share-702',
            },
        });
        expect(c2.status()).toBe(201);

        const cObs = await request.post('/api/admin/ledger/contributions', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                user_id: 703,
                contributor_name: 'Наблюдатель 100р',
                amount_kopecks: 10000, // 100 RUB
                share_class: null,
                legal_right_type: 'observer_trace',
                idempotency_key: 'gov-obs-703',
            },
        });
        expect(cObs.status()).toBe(201);

        // 4. Secret Council Election (1p1v): 1,000 RUB vs 1,000,000 RUB => 1:1 equal weight
        const pCouncil = await request.post('/api/governance/proposals', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                title: 'Выборы местного совета (тайное 1p1v)',
                vote_type: 'council_election',
                secret_ballot: true,
                options: ['Кандидат А', 'Кандидат Б', 'Воздержаться'],
                abstain_option_index: 2,
            },
        });
        expect(pCouncil.status()).toBe(201);
        const councilId = (await pCouncil.json()).proposal.id;

        const openCouncil = await request.post(`/api/governance/proposals/${councilId}/open`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
        });
        expect(openCouncil.ok()).toBeTruthy();

        // Observer (100 RUB, not accepted member) CANNOT vote in council election
        const obsVote = await request.post(`/api/governance/proposals/${councilId}/vote`, {
            headers: { Authorization: `Bearer ${observerTok}` },
            data: { chamber: 'member', option_index: 0 },
        });
        expect(obsVote.status()).toBe(403);

        // Both accepted members cast 1 equal vote each
        const v1 = await request.post(`/api/governance/proposals/${councilId}/vote`, {
            headers: { Authorization: `Bearer ${freeMemberTok}` },
            data: { chamber: 'member', option_index: 0 },
        });
        expect(v1.ok()).toBeTruthy();
        expect((await v1.json()).weight_applied).toBe('1');

        // Secrecy check: live tally MUST be withheld while open
        const detailOpen = await request.get(`/api/governance/proposals/${councilId}`);
        expect((await detailOpen.json()).live_tally).toBeNull();

        const v2 = await request.post(`/api/governance/proposals/${councilId}/vote`, {
            headers: { Authorization: `Bearer ${wealthyMemberTok}` },
            data: { chamber: 'member', option_index: 0 },
        });
        expect(v2.ok()).toBeTruthy();
        expect((await v2.json()).weight_applied).toBe('1');

        const closeCouncil = await request.post(`/api/governance/proposals/${councilId}/close`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
        });
        const councilResult = await closeCouncil.json();
        expect(councilResult.outcome.adopted).toBe(true);
        expect(councilResult.outcome.chambers.member.option_totals[0]).toBe('2');
        expect(councilResult.protocol_hash).toHaveLength(64);

        // 5. Capital Vote (same-class shares): 1,000 RUB vs 1,000,000 RUB => exact 1:1000 ratio
        const pCap = await request.post('/api/governance/proposals', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                title: 'Имущественное решение по паям класса A',
                vote_type: 'capital_vote',
                share_class: 'class_a',
                secret_ballot: false,
                options: ['Купить завод пенобетона', 'Арендовать'],
            },
        });
        const capId = (await pCap.json()).proposal.id;
        await request.post(`/api/governance/proposals/${capId}/open`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
        });

        const capV1 = await request.post(`/api/governance/proposals/${capId}/vote`, {
            headers: { Authorization: `Bearer ${freeMemberTok}` },
            data: { chamber: 'capital', option_index: 1 },
        });
        expect((await capV1.json()).weight_applied).toBe('100000');

        const capV2 = await request.post(`/api/governance/proposals/${capId}/vote`, {
            headers: { Authorization: `Bearer ${wealthyMemberTok}` },
            data: { chamber: 'capital', option_index: 0 },
        });
        expect((await capV2.json()).weight_applied).toBe('100000000');

        // Loomio external tamper detection: altered weight -> 409 Conflict
        const expData = (await (await request.get(`/api/governance/proposals/${capId}/export`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
        })).json()).export;

        const tamperRes = await request.post(`/api/governance/proposals/${capId}/reconcile-external`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                engine: 'loomio',
                chamber: 'capital',
                roster_hash: expData.roster_hash,
                ballots: [
                    { user_id: 701, option_index: 1, weight: '999999' }, // TAMPERED!
                    { user_id: 702, option_index: 0, weight: '100000000' },
                ],
            },
        });
        expect(tamperRes.status()).toBe(409);

        const validReconcile = await request.post(`/api/governance/proposals/${capId}/reconcile-external`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                engine: 'loomio',
                chamber: 'capital',
                roster_hash: expData.roster_hash,
                ballots: [
                    { user_id: 701, option_index: 1, weight: '100000' },
                    { user_id: 702, option_index: 0, weight: '100000000' },
                ],
            },
        });
        expect(validReconcile.ok()).toBeTruthy();
        const reconcileBody = await validReconcile.json();
        expect(reconcileBody.verification.consistency_verified).toBe(true);
        expect(reconcileBody.verification.cryptographic_election_verified).toBe(false);
        expect(reconcileBody.verification.authoritative_protocol_updated).toBe(false);

        // External authoritative_engine & multi-seat proposals must be rejected with 400
        const badExt = await request.post('/api/governance/proposals', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                title: 'Unsupported external engine',
                vote_type: 'council_election',
                authoritative_engine: 'loomio',
                options: ['A', 'B'],
            },
        });
        expect(badExt.status()).toBe(400);

        const badSeats = await request.post('/api/governance/proposals', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                title: 'Unsupported multi-seat',
                vote_type: 'council_election',
                seats_count: 3,
                options: ['A', 'B', 'C'],
            },
        });
        expect(badSeats.status()).toBe(400);

        // 6. Dual Consent: fails if Member chamber and Capital chamber choose DIFFERENT winners!
        const pDual = await request.post('/api/governance/proposals', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                title: 'Двойное согласие: капитальный объект + права жителей',
                vote_type: 'dual_consent',
                share_class: 'class_a',
                secret_ballot: false,
                options: ['Вариант A', 'Вариант B'],
            },
        });
        const dualId = (await pDual.json()).proposal.id;
        await request.post(`/api/governance/proposals/${dualId}/open`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
        });
        // Member chamber: both vote A (option 0) -> Member passes with option 0
        await request.post(`/api/governance/proposals/${dualId}/vote`, {
            headers: { Authorization: `Bearer ${freeMemberTok}` },
            data: { chamber: 'member', option_index: 0 },
        });
        await request.post(`/api/governance/proposals/${dualId}/vote`, {
            headers: { Authorization: `Bearer ${wealthyMemberTok}` },
            data: { chamber: 'member', option_index: 0 },
        });
        // Capital chamber: wealthy shareholder votes B (option 1) -> Capital passes with option 1
        await request.post(`/api/governance/proposals/${dualId}/vote`, {
            headers: { Authorization: `Bearer ${wealthyMemberTok}` },
            data: { chamber: 'capital', option_index: 1 },
        });
        const dualClosed = await (await request.post(`/api/governance/proposals/${dualId}/close`, {
            headers: { Authorization: `Bearer ${superAdminTok}` },
        })).json();
        expect(dualClosed.outcome.adopted).toBe(false);
        expect(dualClosed.outcome.reason).toBe('chamber_winner_mismatch');
    });

    test('Scenario C: Concrete Mixer (10 x 1,000 RUB -> 10,000 RUB), 100 RUB observer traceability, super_admin guard & zero double-spend', async ({ request }) => {
        const superAdminTok = signAdminToken(1, 'admin@sloboda.land', 'super_admin', 'Super Admin');
        const ordinaryAdminTok = signAdminToken(2, 'mod@sloboda.land', 'admin', 'Ordinary Admin');

        // Ordinary admin MUST be denied financial ledger writes (403)
        const deniedRes = await request.post('/api/admin/ledger/contributions', {
            headers: { Authorization: `Bearer ${ordinaryAdminTok}` },
            data: { contributor_name: 'Unauth', amount_kopecks: 100000 },
        });
        expect(deniedRes.status()).toBe(403);

        // Record 10 contributions x 1,000 RUB (100,000 kopecks each) in dedicated purpose 'mixer-pilot'
        const contribIds = [];
        for (let i = 1; i <= 10; i++) {
            const uid = 800 + i;
            const res = await request.post('/api/admin/ledger/contributions', {
                headers: { Authorization: `Bearer ${superAdminTok}` },
                data: {
                    user_id: uid,
                    purpose: 'mixer-pilot',
                    contributor_name: `Пайщик #${i}`,
                    amount_kopecks: 100000,
                    share_class: 'class_a',
                    legal_right_type: 'cooperative_share',
                    idempotency_key: `mixer-contrib-${i}`,
                },
            });
            expect(res.status()).toBe(201);
            contribIds.push((await res.json()).contribution.id);
        }

        // Idempotent replay returns 200 without duplicating money
        const replay = await request.post('/api/admin/ledger/contributions', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                user_id: 801,
                purpose: 'mixer-pilot',
                contributor_name: 'Пайщик #1',
                amount_kopecks: 100000,
                share_class: 'class_a',
                legal_right_type: 'cooperative_share',
                idempotency_key: 'mixer-contrib-1',
            },
        });
        expect(replay.status()).toBe(200);
        expect((await replay.json()).idempotent_replay).toBe(true);

        // Purchase Concrete Mixer for 10,000 RUB (1,000,000 kopecks) across the 10 contributors
        const mixerRes = await request.post('/api/admin/ledger/expenses', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                purpose: 'mixer-pilot',
                title: 'Бетономешалка 180л',
                category: 'equipment',
                amount_kopecks: 1000000,
                asset_name: 'Бетономешалка СБР-180',
                asset_location: 'Площадка №1, цех пеноблоков',
                receipt_url: 'https://sloboda.land/receipts/mixer-001.pdf',
                photo_url: 'https://sloboda.land/photos/mixer-001.jpg',
                allocation_rule: 'fifo',
                mark_paid: true,
                idempotency_key: 'expense-mixer-001',
            },
        });
        expect(mixerRes.status()).toBe(201);
        const mixer = (await mixerRes.json()).expense;
        expect(mixer.allocations).toHaveLength(10);

        // Contributor #1 checks /api/ledger/my and sees 1,000 RUB moved from unallocated -> paid on Бетономешалка
        const u801Tok = signUserToken(801, 'u801@sloboda.local', 'Пайщик #1');
        const myLedger = await (await request.get('/api/ledger/my', {
            headers: { Authorization: `Bearer ${u801Tok}` },
        })).json();
        expect(myLedger.totals.available.kopecks_str).toBe('0');
        expect(myLedger.totals.paid.kopecks_str).toBe('100000');
        expect(myLedger.contributions[0].allocations[0].asset_name).toBe('Бетономешалка СБР-180');
        expect(myLedger.contributions[0].allocations[0].financing_share_label).toContain('1/10');
        expect(myLedger.contributions[0].allocations[0].receipt_url).toContain('mixer-001.pdf');

        // Missing idempotency_key must be rejected with 400 Bad Request
        const missingKey = await request.post('/api/admin/ledger/expenses', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                purpose: 'mixer-pilot',
                title: 'Без ключа идемпотентности',
                amount_kopecks: 10000,
                allocation_rule: 'fifo',
            },
        });
        expect(missingKey.status()).toBe(400);

        // Zero double-spend: trying to spend another 100 RUB from 'mixer-pilot' with a valid key fails with 409 Conflict
        const doubleSpend = await request.post('/api/admin/ledger/expenses', {
            headers: { Authorization: `Bearer ${superAdminTok}` },
            data: {
                purpose: 'mixer-pilot',
                title: 'Повторное списание',
                amount_kopecks: 10000,
                allocation_rule: 'fifo',
                idempotency_key: 'expense-mixer-double-spend-001',
            },
        });
        expect(doubleSpend.status()).toBe(409);

        // 100 RUB observer traceability check
        const obsTok = signUserToken(703, 'observer@sloboda.local', 'Наблюдатель 100р');
        const obsLedger = await (await request.get('/api/ledger/my', {
            headers: { Authorization: `Bearer ${obsTok}` },
        })).json();
        expect(obsLedger.totals.received.rubles_str).toBe('100.00');
        expect(obsLedger.contributions[0].legal_right_type).toBe('observer_trace');

        // Public anonymized ledger summary & construction milestones MUST serialize cleanly (200 OK, no BigInt crash)
        const pubSummaryRes = await request.get('/api/public/ledger/summary');
        expect(pubSummaryRes.status()).toBe(200);
        const pubSummary = await pubSummaryRes.json();
        expect(pubSummary.success).toBe(true);
        expect(Array.isArray(pubSummary.milestones)).toBe(true);
        expect(pubSummary.milestones.length).toBeGreaterThanOrEqual(5);

        const milestonesRes = await request.get('/api/public/construction/milestones');
        expect(milestonesRes.status()).toBe(200);
    });

    test('SLB-R1-17: Moderation routes map exclusively to canonical permissions in server/config/roles.js', async () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const { ROLE_TIERS } = require('../server/config/roles');
        const allCanonicalPerms = new Set();
        for (const tier of Object.values(ROLE_TIERS)) {
            for (const key of Object.keys(tier.permissions || {})) {
                allCanonicalPerms.add(key);
            }
        }
        const modSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'moderation.js'), 'utf8');
        const matches = [...modSource.matchAll(/requirePermission\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
        expect(matches.length).toBeGreaterThanOrEqual(7);
        for (const perm of matches) {
            expect(allCanonicalPerms.has(perm)).toBe(true);
        }
        // Verify role separation: moderator has temp ban + mod log + history + delete, super_moderator also has permanent ban
        expect(ROLE_TIERS.moderator.permissions.can_ban_users_temporary).toBe(true);
        expect(ROLE_TIERS.moderator.permissions.can_ban_users_permanent).toBeFalsy();
        expect(ROLE_TIERS.moderator.permissions.can_view_mod_log).toBe(true);
        expect(ROLE_TIERS.moderator.permissions.can_view_user_history).toBe(true);
        expect(ROLE_TIERS.moderator.permissions.can_delete_others_content).toBe(true);
        expect(ROLE_TIERS.super_moderator.permissions.can_ban_users_permanent).toBe(true);
        expect(ROLE_TIERS.member.permissions.can_ban_users_temporary).toBeFalsy();
        expect(ROLE_TIERS.member.permissions.can_view_mod_log).toBeFalsy();
    });
});
