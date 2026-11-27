/**
 * Sloboda Core Storage Layer (PostgreSQL + In-Memory Parity)
 * Enforces identical invariants across production PostgreSQL and TEST_NO_DB=true:
 *  - Applications & Portfolio (free membership admission, claim_token, optimistic version)
 *  - Governance & Voting (frozen snapshots, secret ballot separation, dual-consent)
 *  - Conservation Ledger (integer kopecks BigInt, idempotency keys, append-only postings)
 *  - Construction Milestones (plan vs actual, spent derived from paid postings)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('./slobodaCore');
const upgradePreflight = require('./upgradePreflight');

const DEFAULT_SETTLEMENT = 'sloboda-pilot';
const SCHEMA_MIGRATION_LOCK_ID = 77261126;
const LEDGER_GATE_XACT_LOCK_ID = 77261127;

let dbRef = null;

function isPgMode() {
    return Boolean(dbRef && dbRef.pool && typeof dbRef.pool.connect === 'function' && process.env.TEST_NO_DB !== 'true');
}

// In-memory store used when TEST_NO_DB=true
const mem = {
    users: new Map(), // userId -> { id, email, name, status, membership_status, membership_admitted_at, settlement_id }
    nextUserId: 100,
    applications: [],
    nextAppId: 1,
    portfolio: [],
    nextPortfolioId: 1,
    proposals: [],
    nextProposalId: 1,
    snapshots: [],
    nextSnapshotId: 1,
    ballots: [],
    nextBallotId: 1,
    voterReceipts: [],
    secretBallots: [],
    nextSecretBallotId: 1,
    delegations: [],
    nextDelegationId: 1,
    contributions: [],
    nextContributionId: 1,
    milestones: [],
    nextMilestoneId: 1,
    expenses: [],
    nextExpenseId: 1,
    allocations: [],
    nextAllocationId: 1,
    postings: [],
    nextPostingId: 1,
};

function seedDefaultMilestonesMem() {
    if (mem.milestones.some((m) => m.settlement_id === DEFAULT_SETTLEMENT)) return;
    const defaults = [
        { code: 'EARTHWORKS_PITS', title: 'Котлованы под первую очередь', category: 'earthworks', unit: 'шт.', planned_qty: 20, actual_qty: 0, budget_kopecks: 200000000n, status: 'planned' },
        { code: 'SCREW_PILES', title: 'Винтовые сваи (установлено)', category: 'piles', unit: 'шт.', planned_qty: 240, actual_qty: 0, budget_kopecks: 180000000n, status: 'planned' },
        { code: 'HOUSE_KITS', title: 'Домокомплекты первой очереди', category: 'house_kits', unit: 'комплект', planned_qty: 20, actual_qty: 0, budget_kopecks: 1500000000n, status: 'planned' },
        { code: 'FOAM_PLANT', title: 'Мобильный завод пенобетона', category: 'foam_plant', unit: 'комплекс', planned_qty: 1, actual_qty: 0, budget_kopecks: 450000000n, status: 'planned' },
        { code: 'START_EQUIPMENT', title: 'Стартовый инструмент и техника', category: 'equipment', unit: 'ед.', planned_qty: 15, actual_qty: 0, budget_kopecks: 150000000n, status: 'planned' },
    ];
    for (const d of defaults) {
        mem.milestones.push({
            id: mem.nextMilestoneId++,
            settlement_id: DEFAULT_SETTLEMENT,
            photo_url: null,
            updated_at: new Date().toISOString(),
            ...d,
        });
    }
}

function setDb(database) {
    dbRef = database;
}

async function ensureCoreSchema() {
    if (!isPgMode()) {
        seedDefaultMilestonesMem();
        return;
    }
    const migrationPath = path.join(__dirname, '../migrations/2026-11-26-sloboda-core.sql');
    const migrationR2Path = path.join(__dirname, '../migrations/2026-11-26-sloboda-core-r2.sql');
    const migrationR3Path = path.join(__dirname, '../migrations/2026-11-26-sloboda-core-r3.sql');
    const client = await dbRef.pool.connect();
    let locked = false;
    try {
        await client.query(`SELECT pg_advisory_lock($1)`, [SCHEMA_MIGRATION_LOCK_ID]);
        locked = true;

        const applied = new Set();
        const tblRes = await client.query(`SELECT to_regclass('schema_migrations') AS tbl`);
        if (tblRes.rows[0]?.tbl) {
            const migRes = await client.query(
                `SELECT version FROM schema_migrations WHERE version = ANY($1)`,
                [['2026-11-26-sloboda-core', '2026-11-26-sloboda-core-r2', '2026-11-26-sloboda-core-r3']]
            );
            for (const row of migRes.rows) {
                applied.add(row.version);
            }
        }
        if (!applied.has('2026-11-26-sloboda-core')) {
            const sql = fs.readFileSync(migrationPath, 'utf8');
            await client.query(sql);
        }
        if (!applied.has('2026-11-26-sloboda-core-r2')) {
            const sqlR2 = fs.readFileSync(migrationR2Path, 'utf8');
            await client.query(sqlR2);
        }
        if (!applied.has('2026-11-26-sloboda-core-r3')) {
            const sqlR3 = fs.readFileSync(migrationR3Path, 'utf8');
            await client.query(sqlR3);
        }

        const mCount = await client.query(
            'SELECT COUNT(*)::int AS cnt FROM construction_milestones WHERE settlement_id = $1',
            [DEFAULT_SETTLEMENT]
        );
        if (mCount.rows[0].cnt === 0) {
            await client.query(`
                INSERT INTO construction_milestones (settlement_id, code, title, category, unit, planned_qty, actual_qty, budget_kopecks, status)
                VALUES
                    ($1, 'EARTHWORKS_PITS', 'Котлованы под первую очередь', 'earthworks', 'шт.', 20, 0, 200000000, 'planned'),
                    ($1, 'SCREW_PILES', 'Винтовые сваи (установлено)', 'piles', 'шт.', 240, 0, 180000000, 'planned'),
                    ($1, 'HOUSE_KITS', 'Домокомплекты первой очереди', 'house_kits', 'комплект', 20, 0, 1500000000, 'planned'),
                    ($1, 'FOAM_PLANT', 'Мобильный завод пенобетона', 'foam_plant', 'комплекс', 1, 0, 450000000, 'planned'),
                    ($1, 'START_EQUIPMENT', 'Стартовый инструмент и техника', 'equipment', 'ед.', 15, 0, 150000000, 'planned')
                ON CONFLICT (settlement_id, code) DO NOTHING
            `, [DEFAULT_SETTLEMENT]);
        }

        const report = await upgradePreflight.runFullPreflight(client);
        await upgradePreflight.persistLedgerGate(client, report);
        if (!report.financial.ok) {
            console.warn(
                '[sloboda-core] Ledger integrity gate BLOCKED (%d discrepancies). Writes are disabled until resolved.',
                report.financial.discrepancies.length
            );
        }
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        if (locked) {
            await client.query(`SELECT pg_advisory_unlock($1)`, [SCHEMA_MIGRATION_LOCK_ID]).catch(() => {});
        }
        client.release();
    }
}

async function assertLedgerWriteGateOpen(client) {
    await client.query(`SELECT pg_advisory_xact_lock_shared($1)`, [LEDGER_GATE_XACT_LOCK_ID]);
    const gateRes = await client.query(
        `SELECT is_blocked, report_json FROM sloboda_core_gates WHERE gate_key = 'ledger_integrity' FOR SHARE`
    );
    if (gateRes.rows.length === 0) {
        const err = new Error('Ledger integrity gate has not been initialized/verified');
        err.status = 503;
        err.code = 'LEDGER_INTEGRITY_GATE_BLOCKED';
        throw err;
    }
    if (gateRes.rows[0]?.is_blocked === true) {
        const err = new Error('Запись в финансовый реестр заблокирована: обнаружены расхождения целостности данных (LEDGER_INTEGRITY_GATE_BLOCKED)');
        err.status = 503;
        err.code = 'LEDGER_INTEGRITY_GATE_BLOCKED';
        err.details = gateRes.rows[0].report_json;
        throw err;
    }
}

async function getLedgerPreflightReport() {
    if (!isPgMode()) {
        const checkedAt = new Date().toISOString();
        return {
            gate_key: 'ledger_integrity',
            is_blocked: false,
            checked_at: checkedAt,
            report: {
                financial: {
                    ok: true,
                    discrepancies: [],
                    stats: {
                        contributions_count: mem.contributions.length,
                        expenses_count: mem.expenses.length,
                        allocations_count: mem.allocations.length,
                        postings_count: mem.postings.length,
                    },
                    checked_at: checkedAt,
                },
                governance: {
                    ok: true,
                    legacy_unsupported_count: mem.proposals.filter((p) => p.legacy_r1_unsupported === true).length,
                    inventory: [],
                },
                checked_at: checkedAt,
            },
        };
    }

    const client = await dbRef.pool.connect();
    try {
        const gateRes = await client.query(
            `SELECT gate_key, is_blocked, report_json, checked_at FROM sloboda_core_gates WHERE gate_key = 'ledger_integrity'`
        );
        if (gateRes.rows[0]) {
            const row = gateRes.rows[0];
            return {
                gate_key: row.gate_key,
                is_blocked: Boolean(row.is_blocked),
                checked_at: row.checked_at,
                report: row.report_json,
            };
        }
        const report = await upgradePreflight.runFullPreflight(client);
        return {
            gate_key: 'ledger_integrity',
            is_blocked: !report.financial.ok,
            checked_at: report.checked_at,
            report,
        };
    } finally {
        client.release();
    }
}

async function revalidateLedgerIntegrity() {
    if (!isPgMode()) {
        return getLedgerPreflightReport();
    }
    const client = await dbRef.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock($1)`, [LEDGER_GATE_XACT_LOCK_ID]);
        const report = await upgradePreflight.runFullPreflight(client);
        const persisted = await upgradePreflight.persistLedgerGate(client, report);
        await client.query('COMMIT');
        return {
            ...persisted,
            checked_at: report.checked_at,
        };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

// ============================================
// USER MEMBERSHIP HELPERS
// ============================================

function upsertUserRecordMem({ id, email, name, status = 'active', membership_status = 'observer', settlement_id = DEFAULT_SETTLEMENT }) {
    if (id && mem.users.has(Number(id))) {
        return { ...mem.users.get(Number(id)) };
    }
    for (const u of mem.users.values()) {
        if (email && u.email.toLowerCase() === email.toLowerCase()) return { ...u };
    }
    const uid = id ? Number(id) : mem.nextUserId++;
    const user = {
        id: uid,
        email: (email || `user${uid}@sloboda.local`).toLowerCase(),
        name: name || `Участник #${uid}`,
        status,
        membership_status,
        membership_admitted_at: membership_status === 'accepted' ? new Date().toISOString() : null,
        settlement_id,
    };
    mem.users.set(uid, user);
    return { ...user };
}

function setUserMembershipMem(userId, status, settlementId = DEFAULT_SETTLEMENT) {
    const admittedAt = status === 'accepted' ? new Date().toISOString() : null;
    let u = mem.users.get(Number(userId));
    if (!u) {
        u = {
            id: Number(userId),
            email: `user${userId}@sloboda.local`,
            name: `Участник #${userId}`,
            status: 'active',
            membership_status: status,
            membership_admitted_at: admittedAt,
            settlement_id: settlementId,
        };
        mem.users.set(Number(userId), u);
    } else {
        u.membership_status = status;
        if (status === 'accepted' && !u.membership_admitted_at) u.membership_admitted_at = admittedAt;
        if (settlementId) u.settlement_id = settlementId;
    }
    return { ...u };
}

async function upsertUserRecord({ id, email, name, status = 'active', membership_status = 'observer', settlement_id = DEFAULT_SETTLEMENT }) {
    if (isPgMode()) {
        if (id) {
            const r = await dbRef.pool.query(
                `SELECT id, email, name, status, membership_status, membership_admitted_at, settlement_id FROM users WHERE id = $1`,
                [id]
            );
            if (r.rows[0]) return r.rows[0];
        }
        const r = await dbRef.pool.query(
            `SELECT id, email, name, status, membership_status, membership_admitted_at, settlement_id FROM users WHERE LOWER(email) = LOWER($1)`,
            [email]
        );
        return r.rows[0] || null;
    }
    return upsertUserRecordMem({ id, email, name, status, membership_status, settlement_id });
}

async function getUserMembership(userId) {
    if (isPgMode()) {
        const r = await dbRef.pool.query(
            `SELECT id, email, name, status, membership_status, membership_admitted_at, settlement_id FROM users WHERE id = $1`,
            [userId]
        );
        return r.rows[0] || null;
    }
    const u = mem.users.get(Number(userId));
    return u ? { ...u } : null;
}

async function setUserMembership(userId, status, settlementId = DEFAULT_SETTLEMENT) {
    if (isPgMode()) {
        const r = await dbRef.pool.query(
            `UPDATE users
             SET membership_status = $2,
                 membership_admitted_at = CASE WHEN $2 = 'accepted' THEN COALESCE(membership_admitted_at, CURRENT_TIMESTAMP) ELSE membership_admitted_at END,
                 settlement_id = COALESCE($3, settlement_id)
             WHERE id = $1
             RETURNING id, email, name, status, membership_status, membership_admitted_at, settlement_id`,
            [userId, status, settlementId]
        );
        return r.rows[0] || null;
    }
    return setUserMembershipMem(userId, status, settlementId);
}

// ============================================
// APPLICATIONS & PORTFOLIO
// ============================================

const ACTIVE_APP_STATUSES = ['pending', 'in_review', 'revision_requested', 'accepted'];
const TERMINAL_APP_STATUSES = ['accepted', 'rejected'];
const ALLOWED_APP_REVIEW_TRANSITIONS = {
    pending: new Set(['in_review', 'revision_requested', 'accepted', 'rejected']),
    in_review: new Set(['revision_requested', 'accepted', 'rejected']),
    revision_requested: new Set(['in_review', 'rejected']),
};

function stripAppSensitive(row) {
    if (!row) return null;
    const copy = { ...row };
    delete copy.claim_token_hash;
    return copy;
}

async function createApplication(data) {
    const settlementId = data.settlement_id || DEFAULT_SETTLEMENT;
    const claimToken = data.user_id ? null : crypto.randomBytes(24).toString('hex');
    const claimTokenHash = claimToken ? core.sha256Hex(claimToken) : null;

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            if (data.user_id) {
                const uRes = await client.query(
                    `SELECT id, membership_status FROM users WHERE id = $1 FOR UPDATE`,
                    [data.user_id]
                );
                if (!uRes.rows[0]) {
                    const err = new Error('Пользователь не найден');
                    err.status = 404;
                    throw err;
                }
                const existing = await client.query(
                    `SELECT id FROM member_applications
                     WHERE user_id = $1 AND settlement_id = $2 AND status IN ('pending', 'in_review', 'revision_requested', 'accepted')`,
                    [data.user_id, settlementId]
                );
                if (existing.rows.length > 0) {
                    const err = new Error('У вас уже есть активная или одобренная заявка в этом поселении');
                    err.code = 'ACTIVE_APPLICATION_EXISTS';
                    err.status = 409;
                    throw err;
                }
            }
            const res = await client.query(
                `INSERT INTO member_applications
                 (user_id, settlement_id, full_name, email, city, primary_domain, skills, motivation, trial_task_title, trial_task_url, claim_token_hash, status, version)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',1)
                 RETURNING *`,
                [
                    data.user_id || null, settlementId, data.full_name, data.email,
                    data.city || null, data.primary_domain || 'GEN', data.skills || null,
                    data.motivation || null, data.trial_task_title || null, data.trial_task_url || null,
                    claimTokenHash,
                ]
            );
            const appRow = res.rows[0];
            const items = [];
            for (const item of (data.portfolio || [])) {
                const pr = await client.query(
                    `INSERT INTO portfolio_items (user_id, application_id, title, domain_code, summary, artifact_url)
                     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                    [data.user_id || null, appRow.id, item.title, item.domain_code || data.primary_domain || 'GEN', item.summary || null, item.artifact_url || null]
                );
                items.push(pr.rows[0]);
            }
            if (data.user_id) {
                await client.query(
                    `UPDATE users SET membership_status = 'applicant' WHERE id = $1 AND membership_status = 'observer'`,
                    [data.user_id]
                );
            }
            await client.query('COMMIT');
            return { application: stripAppSensitive(appRow), portfolio: items, claim_token: claimToken };
        } catch (err) {
            await client.query('ROLLBACK');
            if (err && err.code === '23505') {
                const conflict = new Error('У вас уже есть активная или одобренная заявка в этом поселении');
                conflict.code = 'ACTIVE_APPLICATION_EXISTS';
                conflict.status = 409;
                throw conflict;
            }
            throw err;
        } finally {
            client.release();
        }
    }

    if (data.user_id) {
        const dup = mem.applications.find(
            (a) => a.user_id === Number(data.user_id) && a.settlement_id === settlementId && ACTIVE_APP_STATUSES.includes(a.status)
        );
        if (dup) {
            const err = new Error('У вас уже есть активная или одобренная заявка в этом поселении');
            err.code = 'ACTIVE_APPLICATION_EXISTS';
            err.status = 409;
            throw err;
        }
        const u = upsertUserRecordMem({ id: data.user_id, email: data.email, name: data.full_name, settlement_id: settlementId });
        if (u.membership_status === 'observer') {
            setUserMembershipMem(u.id, 'applicant', settlementId);
        }
    }

    const appRow = {
        id: mem.nextAppId++,
        user_id: data.user_id ? Number(data.user_id) : null,
        settlement_id: settlementId,
        full_name: data.full_name,
        email: data.email,
        city: data.city || null,
        primary_domain: data.primary_domain || 'GEN',
        skills: data.skills || null,
        motivation: data.motivation || null,
        trial_task_title: data.trial_task_title || null,
        trial_task_url: data.trial_task_url || null,
        claim_token_hash: claimTokenHash,
        claim_token_used_at: null,
        status: 'pending',
        version: 1,
        reviewer_id: null,
        review_note: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    mem.applications.push(appRow);

    const items = [];
    for (const item of (data.portfolio || [])) {
        const pRow = {
            id: mem.nextPortfolioId++,
            user_id: appRow.user_id,
            application_id: appRow.id,
            title: item.title,
            domain_code: item.domain_code || appRow.primary_domain,
            summary: item.summary || null,
            artifact_url: item.artifact_url || null,
            verified: false,
            created_at: new Date().toISOString(),
        };
        mem.portfolio.push(pRow);
        items.push({ ...pRow });
    }
    return { application: stripAppSensitive(appRow), portfolio: items, claim_token: claimToken };
}

async function claimGuestApplication(userId, claimToken) {
    const hash = core.sha256Hex(claimToken);
    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            const r = await client.query(
                `SELECT * FROM member_applications WHERE claim_token_hash = $1 FOR UPDATE`,
                [hash]
            );
            const appRow = r.rows[0];
            if (!appRow || appRow.claim_token_used_at || appRow.user_id) {
                const err = new Error('Недействительный или уже использованный токен привязки заявки');
                err.status = 404;
                throw err;
            }
            if (TERMINAL_APP_STATUSES.includes(appRow.status)) {
                const err = new Error(`Нельзя привязать заявку в терминальном статусе ${appRow.status}`);
                err.status = 409;
                throw err;
            }
            const uRes = await client.query(`SELECT id, membership_status FROM users WHERE id = $1 FOR UPDATE`, [userId]);
            if (!uRes.rows[0]) {
                const err = new Error('Пользователь не найден');
                err.status = 404;
                throw err;
            }
            const activeDup = await client.query(
                `SELECT id FROM member_applications
                 WHERE user_id = $1 AND settlement_id = $2 AND status IN ('pending', 'in_review', 'revision_requested', 'accepted')`,
                [userId, appRow.settlement_id]
            );
            if (activeDup.rows.length > 0) {
                const err = new Error('У вас уже есть активная или одобренная заявка в этом поселении');
                err.code = 'ACTIVE_APPLICATION_EXISTS';
                err.status = 409;
                throw err;
            }
            const upd = await client.query(
                `UPDATE member_applications
                 SET user_id = $1, claim_token_used_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2 RETURNING *`,
                [userId, appRow.id]
            );
            await client.query(`UPDATE portfolio_items SET user_id = $1 WHERE application_id = $2`, [userId, appRow.id]);
            await client.query(
                `UPDATE users SET membership_status = 'applicant' WHERE id = $1 AND membership_status = 'observer'`,
                [userId]
            );
            await client.query('COMMIT');
            return stripAppSensitive(upd.rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            if (err && err.code === '23505') {
                const conflict = new Error('У вас уже есть активная или одобренная заявка в этом поселении');
                conflict.code = 'ACTIVE_APPLICATION_EXISTS';
                conflict.status = 409;
                throw conflict;
            }
            throw err;
        } finally {
            client.release();
        }
    }

    const appRow = mem.applications.find((a) => a.claim_token_hash === hash);
    if (!appRow || appRow.claim_token_used_at || appRow.user_id) {
        const err = new Error('Недействительный или уже использованный токен привязки заявки');
        err.status = 404;
        throw err;
    }
    if (TERMINAL_APP_STATUSES.includes(appRow.status)) {
        const err = new Error(`Нельзя привязать заявку в терминальном статусе ${appRow.status}`);
        err.status = 409;
        throw err;
    }
    const activeDup = mem.applications.find(
        (a) => a.user_id === Number(userId) && a.settlement_id === appRow.settlement_id && ACTIVE_APP_STATUSES.includes(a.status)
    );
    if (activeDup) {
        const err = new Error('У вас уже есть активная или одобренная заявка в этом поселении');
        err.code = 'ACTIVE_APPLICATION_EXISTS';
        err.status = 409;
        throw err;
    }
    appRow.user_id = Number(userId);
    appRow.claim_token_used_at = new Date().toISOString();
    appRow.version += 1;
    appRow.updated_at = new Date().toISOString();
    mem.portfolio.filter((p) => p.application_id === appRow.id).forEach((p) => { p.user_id = Number(userId); });
    const u = mem.users.get(Number(userId));
    if (u && u.membership_status === 'observer') {
        u.membership_status = 'applicant';
    }
    return stripAppSensitive(appRow);
}

async function getMyApplication(userId, settlementId) {
    if (isPgMode()) {
        const appRes = settlementId
            ? await dbRef.pool.query(
                `SELECT id, user_id, settlement_id, full_name, email, city, primary_domain, skills, motivation,
                        trial_task_title, trial_task_url, status, version, review_note, reviewed_at, created_at, updated_at
                 FROM member_applications
                 WHERE user_id = $1 AND settlement_id = $2
                 ORDER BY CASE WHEN status IN ('pending', 'in_review', 'revision_requested', 'accepted') THEN 0 ELSE 1 END,
                          created_at DESC, id DESC
                 LIMIT 1`,
                [userId, settlementId]
            )
            : await dbRef.pool.query(
                `SELECT id, user_id, settlement_id, full_name, email, city, primary_domain, skills, motivation,
                        trial_task_title, trial_task_url, status, version, review_note, reviewed_at, created_at, updated_at
                 FROM member_applications
                 WHERE user_id = $1
                 ORDER BY CASE WHEN status IN ('pending', 'in_review', 'revision_requested', 'accepted') THEN 0 ELSE 1 END,
                          created_at DESC, id DESC
                 LIMIT 1`,
                [userId]
            );
        const appRow = stripAppSensitive(appRes.rows[0] || null);
        const portfolio = appRow
            ? (await dbRef.pool.query(`SELECT * FROM portfolio_items WHERE application_id = $1 ORDER BY created_at DESC`, [appRow.id])).rows
            : [];
        const membership = await getUserMembership(userId);
        return { application: appRow, portfolio, membership };
    }
    const matching = mem.applications
        .filter((a) => a.user_id === Number(userId) && (!settlementId || a.settlement_id === settlementId))
        .sort((a, b) => {
            const aActive = ACTIVE_APP_STATUSES.includes(a.status) ? 0 : 1;
            const bActive = ACTIVE_APP_STATUSES.includes(b.status) ? 0 : 1;
            if (aActive !== bActive) return aActive - bActive;
            const dt = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            if (dt !== 0) return dt;
            return b.id - a.id;
        });
    const appRow = matching[0] || null;
    const portfolio = appRow ? mem.portfolio.filter((p) => p.application_id === appRow.id) : [];
    const membership = await getUserMembership(userId);
    return { application: stripAppSensitive(appRow), portfolio, membership };
}

async function addPortfolioItem(userId, item) {
    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            const appRes = await client.query(
                `SELECT id, primary_domain FROM member_applications
                 WHERE user_id = $1
                 ORDER BY CASE WHEN status IN ('pending', 'in_review', 'revision_requested', 'accepted') THEN 0 ELSE 1 END,
                          created_at DESC, id DESC
                 LIMIT 1
                 FOR UPDATE`,
                [userId]
            );
            const appRow = appRes.rows[0];
            if (!appRow) {
                const err = new Error('Сначала подайте заявку участника');
                err.status = 400;
                throw err;
            }
            const r = await client.query(
                `INSERT INTO portfolio_items (user_id, application_id, title, domain_code, summary, artifact_url)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                [userId, appRow.id, item.title, item.domain_code || appRow.primary_domain, item.summary || null, item.artifact_url || null]
            );
            const appUpd = await client.query(
                `UPDATE member_applications SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING version`,
                [appRow.id]
            );
            await client.query('COMMIT');
            return { item: r.rows[0], application_version: Number(appUpd.rows[0].version) };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    const my = await getMyApplication(userId);
    if (!my.application) {
        const err = new Error('Сначала подайте заявку участника');
        err.status = 400;
        throw err;
    }
    const appRow = mem.applications.find((a) => a.id === my.application.id);
    const row = {
        id: mem.nextPortfolioId++,
        user_id: Number(userId),
        application_id: my.application.id,
        title: item.title,
        domain_code: item.domain_code || my.application.primary_domain,
        summary: item.summary || null,
        artifact_url: item.artifact_url || null,
        verified: false,
        created_at: new Date().toISOString(),
    };
    mem.portfolio.push(row);
    let applicationVersion = my.application.version;
    if (appRow) {
        appRow.version += 1;
        appRow.updated_at = new Date().toISOString();
        applicationVersion = appRow.version;
    }
    return { item: { ...row }, application_version: applicationVersion };
}

async function resubmitApplication({
    userId,
    applicationId,
    full_name,
    city,
    primary_domain,
    skills,
    motivation,
    trial_task_title,
    trial_task_url,
    expectedVersion,
}) {
    if (expectedVersion !== undefined && expectedVersion !== null) {
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
            const err = new Error('expectedVersion must be a positive integer');
            err.status = 400;
            throw err;
        }
    }

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            const cur = await client.query(`SELECT * FROM member_applications WHERE id = $1 FOR UPDATE`, [applicationId]);
            const appRow = cur.rows[0];
            if (!appRow) {
                const err = new Error('Заявка не найдена');
                err.status = 404;
                throw err;
            }
            if (Number(appRow.user_id) !== Number(userId) || appRow.status !== 'revision_requested') {
                const err = new Error('Повторная подача разрешена только владельцу заявки в статусе revision_requested');
                err.status = 409;
                throw err;
            }
            if (expectedVersion !== undefined && expectedVersion !== null && Number(expectedVersion) !== Number(appRow.version)) {
                const err = new Error('Конфликт версий заявки');
                err.status = 409;
                throw err;
            }
            const upd = await client.query(
                `UPDATE member_applications
                 SET full_name = $1,
                     city = $2,
                     primary_domain = $3,
                     skills = $4,
                     motivation = $5,
                     trial_task_title = $6,
                     trial_task_url = $7,
                     status = 'pending',
                     version = version + 1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $8 RETURNING *`,
                [
                    full_name !== undefined ? full_name : appRow.full_name,
                    city !== undefined ? city : appRow.city,
                    primary_domain !== undefined ? primary_domain : appRow.primary_domain,
                    skills !== undefined ? skills : appRow.skills,
                    motivation !== undefined ? motivation : appRow.motivation,
                    trial_task_title !== undefined ? trial_task_title : appRow.trial_task_title,
                    trial_task_url !== undefined ? trial_task_url : appRow.trial_task_url,
                    applicationId,
                ]
            );
            await client.query('COMMIT');
            return stripAppSensitive(upd.rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    const appRow = mem.applications.find((a) => a.id === Number(applicationId));
    if (!appRow) {
        const err = new Error('Заявка не найдена');
        err.status = 404;
        throw err;
    }
    if (Number(appRow.user_id) !== Number(userId) || appRow.status !== 'revision_requested') {
        const err = new Error('Повторная подача разрешена только владельцу заявки в статусе revision_requested');
        err.status = 409;
        throw err;
    }
    if (expectedVersion !== undefined && expectedVersion !== null && Number(expectedVersion) !== Number(appRow.version)) {
        const err = new Error('Конфликт версий заявки');
        err.status = 409;
        throw err;
    }
    if (full_name !== undefined) appRow.full_name = full_name;
    if (city !== undefined) appRow.city = city;
    if (primary_domain !== undefined) appRow.primary_domain = primary_domain;
    if (skills !== undefined) appRow.skills = skills;
    if (motivation !== undefined) appRow.motivation = motivation;
    if (trial_task_title !== undefined) appRow.trial_task_title = trial_task_title;
    if (trial_task_url !== undefined) appRow.trial_task_url = trial_task_url;
    appRow.status = 'pending';
    appRow.version += 1;
    appRow.updated_at = new Date().toISOString();
    return stripAppSensitive(appRow);
}

async function listApplications(statusFilter) {
    if (isPgMode()) {
        const r = statusFilter
            ? await dbRef.pool.query(`SELECT * FROM member_applications WHERE status = $1 ORDER BY created_at DESC`, [statusFilter])
            : await dbRef.pool.query(`SELECT * FROM member_applications ORDER BY created_at DESC`);
        const ids = r.rows.map((a) => a.id);
        const pRes = ids.length
            ? await dbRef.pool.query(`SELECT * FROM portfolio_items WHERE application_id = ANY($1)`, [ids])
            : { rows: [] };
        return r.rows.map((a) => ({
            ...stripAppSensitive(a),
            portfolio: pRes.rows.filter((p) => p.application_id === a.id),
        }));
    }
    const rows = statusFilter ? mem.applications.filter((a) => a.status === statusFilter) : mem.applications;
    return [...rows].reverse().map((a) => ({
        ...stripAppSensitive(a),
        portfolio: mem.portfolio.filter((p) => p.application_id === a.id),
    }));
}

async function reviewApplication({ applicationId, status, reviewNote, expectedVersion, reviewerId }) {
    const valid = ['in_review', 'accepted', 'revision_requested', 'rejected'];
    if (!valid.includes(status)) {
        const err = new Error('Недопустимый статус рассмотрения');
        err.status = 400;
        throw err;
    }
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        const err = new Error('expected_version must be a positive integer');
        err.status = 400;
        throw err;
    }

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            const cur = await client.query(`SELECT * FROM member_applications WHERE id = $1 FOR UPDATE`, [applicationId]);
            const appRow = cur.rows[0];
            if (!appRow) {
                const err = new Error('Заявка не найдена');
                err.status = 404;
                throw err;
            }
            if (expectedVersion !== Number(appRow.version)) {
                const err = new Error('Конфликт версий: заявка уже была обновлена другим рецензентом');
                err.status = 409;
                throw err;
            }
            if (TERMINAL_APP_STATUSES.includes(appRow.status)) {
                const err = new Error('Application is in terminal status');
                err.status = 409;
                throw err;
            }
            const allowedTargets = ALLOWED_APP_REVIEW_TRANSITIONS[appRow.status];
            if (!allowedTargets || !allowedTargets.has(status)) {
                const err = new Error(`Переход заявки ${appRow.status} -> ${status} запрещён`);
                err.status = 409;
                throw err;
            }
            if (status === 'accepted' && !appRow.user_id) {
                const err = new Error('Нельзя принять гостевую заявку без привязанного аккаунта (user_id). Участник должен привязать заявку по claim_token.');
                err.status = 409;
                throw err;
            }
            if (status === 'accepted' && appRow.user_id) {
                const uRes = await client.query(
                    `SELECT id, status, membership_status, settlement_id FROM users WHERE id = $1 FOR UPDATE`,
                    [appRow.user_id]
                );
                const userRow = uRes.rows[0];
                if (!userRow) {
                    const err = new Error('Пользователь не найден');
                    err.status = 404;
                    throw err;
                }
                if (userRow.membership_status === 'suspended' || (userRow.status && userRow.status !== 'active')) {
                    const err = new Error('Cannot admit suspended user');
                    err.status = 409;
                    throw err;
                }
                await client.query(
                    `UPDATE users
                     SET membership_status = 'accepted',
                         membership_admitted_at = COALESCE(membership_admitted_at, CURRENT_TIMESTAMP),
                         settlement_id = CASE
                             WHEN membership_status = 'accepted' AND settlement_id IS NOT NULL THEN settlement_id
                             ELSE $2
                         END
                     WHERE id = $1`,
                    [appRow.user_id, appRow.settlement_id]
                );
            }
            const upd = await client.query(
                `UPDATE member_applications
                 SET status = $1, review_note = $2, reviewer_id = $3, reviewed_at = CURRENT_TIMESTAMP,
                     version = version + 1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4 RETURNING *`,
                [status, reviewNote || null, reviewerId || null, applicationId]
            );
            await client.query('COMMIT');
            return stripAppSensitive(upd.rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    const appRow = mem.applications.find((a) => a.id === Number(applicationId));
    if (!appRow) {
        const err = new Error('Заявка не найдена');
        err.status = 404;
        throw err;
    }
    if (expectedVersion !== Number(appRow.version)) {
        const err = new Error('Конфликт версий: заявка уже была обновлена другим рецензентом');
        err.status = 409;
        throw err;
    }
    if (TERMINAL_APP_STATUSES.includes(appRow.status)) {
        const err = new Error('Application is in terminal status');
        err.status = 409;
        throw err;
    }
    const allowedTargets = ALLOWED_APP_REVIEW_TRANSITIONS[appRow.status];
    if (!allowedTargets || !allowedTargets.has(status)) {
        const err = new Error(`Переход заявки ${appRow.status} -> ${status} запрещён`);
        err.status = 409;
        throw err;
    }
    if (status === 'accepted' && !appRow.user_id) {
        const err = new Error('Нельзя принять гостевую заявку без привязанного аккаунта (user_id). Участник должен привязать заявку по claim_token.');
        err.status = 409;
        throw err;
    }
    if (status === 'accepted' && appRow.user_id) {
        const userRow = mem.users.get(Number(appRow.user_id));
        if (userRow && (userRow.membership_status === 'suspended' || (userRow.status && userRow.status !== 'active'))) {
            const err = new Error('Cannot admit suspended user');
            err.status = 409;
            throw err;
        }
        const nextSettlement = (userRow && userRow.membership_status === 'accepted' && userRow.settlement_id)
            ? userRow.settlement_id
            : appRow.settlement_id;
        setUserMembershipMem(appRow.user_id, 'accepted', nextSettlement);
    }

    appRow.status = status;
    appRow.review_note = reviewNote || null;
    appRow.reviewer_id = reviewerId || null;
    appRow.reviewed_at = new Date().toISOString();
    appRow.version += 1;
    appRow.updated_at = new Date().toISOString();

    return stripAppSensitive(appRow);
}

// ============================================
// GOVERNANCE & VOTING CORE
// ============================================

async function createProposal(data, adminId) {
    const validTypes = ['council_election', 'capital_vote', 'dual_consent'];
    if (!validTypes.includes(data.vote_type)) {
        const err = new Error('Недопустимый тип голосования');
        err.status = 400;
        throw err;
    }
    if (!Array.isArray(data.options) || data.options.length < 2) {
        const err = new Error('Нужно минимум 2 варианта голосования');
        err.status = 400;
        throw err;
    }
    if ((data.vote_type === 'capital_vote' || data.vote_type === 'dual_consent') && !data.share_class) {
        const err = new Error('Для имущественного и двойного голосования требуется указать share_class');
        err.status = 400;
        throw err;
    }

    const seatsCount = data.seats_count !== undefined && data.seats_count !== null ? data.seats_count : 1;
    if (!Number.isInteger(seatsCount) || seatsCount !== 1) {
        const err = new Error('seats_count must be integer 1');
        err.status = 400;
        throw err;
    }

    const quorumMembersPct = data.quorum_members_pct !== undefined && data.quorum_members_pct !== null ? data.quorum_members_pct : 50;
    const quorumCapitalPct = data.quorum_capital_pct !== undefined && data.quorum_capital_pct !== null ? data.quorum_capital_pct : 50;
    if (!Number.isInteger(quorumMembersPct) || quorumMembersPct < 1 || quorumMembersPct > 100) {
        const err = new Error('quorum_members_pct must be an integer between 1 and 100');
        err.status = 400;
        throw err;
    }
    if (!Number.isInteger(quorumCapitalPct) || quorumCapitalPct < 1 || quorumCapitalPct > 100) {
        const err = new Error('quorum_capital_pct must be an integer between 1 and 100');
        err.status = 400;
        throw err;
    }

    const abstainIndex = data.abstain_option_index ?? null;
    if (abstainIndex !== null && (!Number.isInteger(abstainIndex) || abstainIndex < 0 || abstainIndex >= data.options.length)) {
        const err = new Error('abstain_option_index must be null or a valid index within options');
        err.status = 400;
        throw err;
    }

    let closesAtIso = null;
    if (data.closes_at !== undefined && data.closes_at !== null && data.closes_at !== '') {
        const closesDate = new Date(data.closes_at);
        if (Number.isNaN(closesDate.getTime()) || closesDate <= new Date()) {
            const err = new Error('closes_at must be a valid future ISO date');
            err.status = 400;
            throw err;
        }
        closesAtIso = closesDate.toISOString();
    }

    let engine;
    let secretBallot;
    if (data.authoritative_engine !== undefined && data.authoritative_engine !== null) {
        if (!['native_named', 'native_secret'].includes(data.authoritative_engine)) {
            const err = new Error('External authoritative engines are not enabled for official protocol finalization; use native_named or native_secret and auxiliary export/reconcile-external');
            err.status = 400;
            throw err;
        }
        engine = data.authoritative_engine;
        const expectedSecret = engine === 'native_secret';
        if (data.secret_ballot !== undefined && data.secret_ballot !== null) {
            if (Boolean(data.secret_ballot) !== expectedSecret) {
                const err = new Error(`authoritative_engine "${engine}" conflicts with secret_ballot=${Boolean(data.secret_ballot)}`);
                err.status = 400;
                throw err;
            }
        }
        secretBallot = expectedSecret;
    } else {
        secretBallot = data.secret_ballot !== undefined && data.secret_ballot !== null
            ? Boolean(data.secret_ballot)
            : data.vote_type === 'council_election';
        engine = secretBallot ? 'native_secret' : 'native_named';
    }

    if (isPgMode()) {
        const r = await dbRef.pool.query(
            `INSERT INTO governance_proposals
             (title, description, vote_type, scope_level, settlement_id, authoritative_engine, secret_ballot,
              share_class, terms_version, seats_count, options, abstain_option_index, status,
              quorum_members_pct, quorum_capital_pct, external_election_fingerprint, created_by, closes_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',$13,$14,$15,$16,$17)
             RETURNING *`,
            [
                data.title, data.description || null, data.vote_type, data.scope_level || 'local',
                data.settlement_id || DEFAULT_SETTLEMENT, engine, secretBallot,
                data.share_class || null, data.terms_version || 'v1', seatsCount,
                JSON.stringify(data.options), abstainIndex,
                quorumMembersPct, quorumCapitalPct,
                data.external_election_fingerprint || null, adminId || null, closesAtIso,
            ]
        );
        return r.rows[0];
    }

    const row = {
        id: mem.nextProposalId++,
        title: data.title,
        description: data.description || null,
        vote_type: data.vote_type,
        scope_level: data.scope_level || 'local',
        settlement_id: data.settlement_id || DEFAULT_SETTLEMENT,
        authoritative_engine: engine,
        secret_ballot: secretBallot,
        share_class: data.share_class || null,
        terms_version: data.terms_version || 'v1',
        seats_count: seatsCount,
        options: data.options,
        abstain_option_index: abstainIndex,
        status: 'draft',
        quorum_members_pct: quorumMembersPct,
        quorum_capital_pct: quorumCapitalPct,
        roster_hash: null,
        protocol_hash: null,
        protocol_json: null,
        adopted: null,
        winning_option_index: null,
        external_election_fingerprint: data.external_election_fingerprint || null,
        created_by: adminId || null,
        opened_at: null,
        closes_at: closesAtIso,
        closed_at: null,
        created_at: new Date().toISOString(),
    };
    mem.proposals.push(row);
    return { ...row };
}

async function openProposal(proposalId) {
    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
            const pRes = await client.query(`SELECT * FROM governance_proposals WHERE id = $1 FOR UPDATE`, [proposalId]);
            const prop = pRes.rows[0];
            if (!prop) {
                const err = new Error('Голосование не найдено');
                err.status = 404;
                throw err;
            }
            if (prop.legacy_r1_unsupported === true) {
                const err = new Error('Устаревшее предложение R1 не поддерживается и заблокировано до решения оператора');
                err.status = 409;
                err.code = 'LEGACY_UNSUPPORTED_PROPOSAL';
                throw err;
            }
            if (prop.status !== 'draft') {
                const err = new Error(`Нельзя открыть голосование в статусе ${prop.status}`);
                err.status = 409;
                throw err;
            }
            if (prop.closes_at && new Date(prop.closes_at) <= new Date()) {
                const err = new Error('Cannot open proposal whose closes_at deadline is in the past');
                err.status = 400;
                throw err;
            }

            // Build unified frozen voter snapshot from active users + verified voting share holdings
            const usersRes = await client.query(
                `SELECT id, name, status, membership_status, settlement_id
                 FROM users
                 WHERE COALESCE(status, 'active') = 'active' AND membership_status != 'suspended'
                 ORDER BY id ASC`
            );
            const holdingsRes = prop.share_class
                ? await client.query(
                    `SELECT user_id, SUM(received_kopecks - refunded_kopecks)::bigint AS effective_kopecks
                     FROM contributions
                     WHERE user_id IS NOT NULL
                       AND settlement_id = $1
                       AND share_class = $2
                       AND terms_version = $3
                       AND legal_right_type IN ('cooperative_share', 'direct_fraction')
                       AND ledger_mode = 'verified_receipt'
                       AND (received_kopecks - refunded_kopecks) > 0
                     GROUP BY user_id`,
                    [prop.settlement_id, prop.share_class, prop.terms_version || 'v1']
                )
                : { rows: [] };

            const holdingByUser = new Map(holdingsRes.rows.map((h) => [Number(h.user_id), BigInt(h.effective_kopecks)]));
            const canonicalRoster = [];

            for (const u of usersRes.rows) {
                const isAcceptedMember = u.membership_status === 'accepted' && (prop.scope_level === 'general' || u.settlement_id === prop.settlement_id);
                const canMember = (prop.vote_type === 'council_election' || prop.vote_type === 'dual_consent') && isAcceptedMember;
                const memberWeight = canMember ? 1 : 0;

                const capWeight = holdingByUser.get(Number(u.id)) || 0n;
                const canCapital = (prop.vote_type === 'capital_vote' || prop.vote_type === 'dual_consent') && capWeight > 0n;

                if (!canMember && !canCapital) continue;

                await client.query(
                    `INSERT INTO governance_voter_snapshots
                     (proposal_id, user_id, voter_label, can_vote_member, member_weight, can_vote_capital, capital_weight_kopecks, share_class, terms_version)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                    [
                        prop.id, u.id, u.name || `User #${u.id}`,
                        canMember, memberWeight, canCapital, capWeight.toString(),
                        canCapital ? prop.share_class : null, canCapital ? prop.terms_version : null,
                    ]
                );
                canonicalRoster.push({
                    user_id: Number(u.id),
                    can_vote_member: canMember,
                    member_weight: memberWeight,
                    can_vote_capital: canCapital,
                    capital_weight_kopecks: capWeight.toString(),
                });
            }

            const rosterHash = core.sha256Hex({
                proposal_id: prop.id,
                vote_type: prop.vote_type,
                settlement_id: prop.settlement_id,
                share_class: prop.share_class,
                terms_version: prop.terms_version,
                options: prop.options,
                roster: canonicalRoster,
            });

            const upd = await client.query(
                `UPDATE governance_proposals SET status = 'open', roster_hash = $1, opened_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
                [rosterHash, prop.id]
            );
            await client.query('COMMIT');
            return { proposal: upd.rows[0], snapshot_count: canonicalRoster.length, roster_hash: rosterHash };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    const prop = mem.proposals.find((p) => p.id === Number(proposalId));
    if (!prop) {
        const err = new Error('Голосование не найдено');
        err.status = 404;
        throw err;
    }
    if (prop.legacy_r1_unsupported === true) {
        const err = new Error('Устаревшее предложение R1 не поддерживается и заблокировано до решения оператора');
        err.status = 409;
        err.code = 'LEGACY_UNSUPPORTED_PROPOSAL';
        throw err;
    }
    if (prop.status !== 'draft') {
        const err = new Error(`Нельзя открыть голосование в статусе ${prop.status}`);
        err.status = 409;
        throw err;
    }
    if (prop.closes_at && new Date(prop.closes_at) <= new Date()) {
        const err = new Error('Cannot open proposal whose closes_at deadline is in the past');
        err.status = 400;
        throw err;
    }

    // Aggregate verified voting share holdings per user (excludes observer_trace & non-verified modes)
    const holdingByUser = new Map();
    if (prop.share_class) {
        for (const c of mem.contributions) {
            if (!c.user_id) continue;
            if (c.settlement_id !== prop.settlement_id) continue;
            if (c.share_class !== prop.share_class) continue;
            if ((c.terms_version || 'v1') !== (prop.terms_version || 'v1')) continue;
            if (!['cooperative_share', 'direct_fraction'].includes(c.legal_right_type)) continue;
            if (c.ledger_mode !== 'verified_receipt') continue;
            const eff = BigInt(c.received_kopecks) - BigInt(c.refunded_kopecks);
            if (eff > 0n) {
                holdingByUser.set(Number(c.user_id), (holdingByUser.get(Number(c.user_id)) || 0n) + eff);
            }
        }
    }

    const allUsers = [...mem.users.values()].sort((a, b) => a.id - b.id);
    const canonicalRoster = [];
    for (const u of allUsers) {
        if (u.membership_status === 'suspended' || (u.status && u.status !== 'active')) continue;
        const isAcceptedMember = u.membership_status === 'accepted' && (prop.scope_level === 'general' || u.settlement_id === prop.settlement_id);
        const canMember = (prop.vote_type === 'council_election' || prop.vote_type === 'dual_consent') && isAcceptedMember;
        const memberWeight = canMember ? 1 : 0;

        const capWeight = holdingByUser.get(Number(u.id)) || 0n;
        const canCapital = (prop.vote_type === 'capital_vote' || prop.vote_type === 'dual_consent') && capWeight > 0n;

        if (!canMember && !canCapital) continue;

        mem.snapshots.push({
            id: mem.nextSnapshotId++,
            proposal_id: prop.id,
            user_id: Number(u.id),
            voter_label: u.name || `User #${u.id}`,
            can_vote_member: canMember,
            member_weight: memberWeight,
            can_vote_capital: canCapital,
            capital_weight_kopecks: capWeight.toString(),
            share_class: canCapital ? prop.share_class : null,
            terms_version: canCapital ? prop.terms_version : null,
        });
        canonicalRoster.push({
            user_id: Number(u.id),
            can_vote_member: canMember,
            member_weight: memberWeight,
            can_vote_capital: canCapital,
            capital_weight_kopecks: capWeight.toString(),
        });
    }

    prop.roster_hash = core.sha256Hex({
        proposal_id: prop.id,
        vote_type: prop.vote_type,
        settlement_id: prop.settlement_id,
        share_class: prop.share_class,
        terms_version: prop.terms_version,
        options: prop.options,
        roster: canonicalRoster,
    });
    prop.status = 'open';
    prop.opened_at = new Date().toISOString();

    return { proposal: { ...prop }, snapshot_count: canonicalRoster.length, roster_hash: prop.roster_hash };
}

async function castGovernanceBallot({ proposalId, userId, chamber, optionIndex }) {
    const validChambers = ['member', 'capital'];
    if (!validChambers.includes(chamber)) {
        const err = new Error('Неверная палата голосования (member | capital)');
        err.status = 400;
        throw err;
    }

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            const uRes = await client.query(
                `SELECT id, status, membership_status FROM users WHERE id = $1 FOR SHARE`,
                [userId]
            );
            const liveUser = uRes.rows[0];
            if (!liveUser || liveUser.status !== 'active' || liveUser.membership_status === 'suspended') {
                const err = new Error('Учётная запись неактивна или приостановлена');
                err.status = 403;
                throw err;
            }
            const pRes = await client.query(`SELECT * FROM governance_proposals WHERE id = $1 FOR UPDATE`, [proposalId]);
            const prop = pRes.rows[0];
            if (!prop) { const err = new Error('Голосование не найдено'); err.status = 404; throw err; }
            if (prop.legacy_r1_unsupported === true) {
                const err = new Error('Устаревшее предложение R1 не поддерживается и заблокировано до решения оператора');
                err.status = 409;
                err.code = 'LEGACY_UNSUPPORTED_PROPOSAL';
                throw err;
            }
            if (prop.authoritative_engine === 'loomio' || prop.authoritative_engine === 'belenios') {
                const err = new Error(`Голосование привязано к внешнему движку ${prop.authoritative_engine}; прямой приём бюллетеней отключён`);
                err.status = 409;
                throw err;
            }
            if (prop.status !== 'open') { const err = new Error('Голосование закрыто или ещё не открыто'); err.status = 409; throw err; }
            if (prop.closes_at && new Date(prop.closes_at) <= new Date()) {
                const err = new Error('Proposal voting window has closed'); err.status = 409; throw err;
            }
            const opts = Array.isArray(prop.options) ? prop.options : [];
            const idx = Number(optionIndex);
            if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length) {
                const err = new Error('Некорректный вариант голосования'); err.status = 400; throw err;
            }

            const sRes = await client.query(
                `SELECT * FROM governance_voter_snapshots WHERE proposal_id = $1 AND user_id = $2`,
                [proposalId, userId]
            );
            const snap = sRes.rows[0];
            if (!snap) {
                const err = new Error('Вы не включены в замороженный список избирателей этого голосования');
                err.status = 403;
                throw err;
            }
            const eligible = chamber === 'member' ? snap.can_vote_member : snap.can_vote_capital;
            const weight = chamber === 'member' ? BigInt(snap.member_weight) : BigInt(snap.capital_weight_kopecks);
            if (!eligible || weight <= 0n) {
                const err = new Error(`Нет права голоса в палате ${chamber}`);
                err.status = 403;
                throw err;
            }

            if (prop.secret_ballot) {
                // Secret ballot: separate receipt (user_id, NO choice) from ballot (choice, NO user_id)
                const existing = await client.query(
                    `SELECT id FROM governance_voter_receipts WHERE proposal_id = $1 AND user_id = $2 AND chamber = $3`,
                    [proposalId, userId, chamber]
                );
                if (existing.rows.length > 0) {
                    const err = new Error('В тайном голосовании голос уже учтён и не может быть изменён');
                    err.status = 409;
                    throw err;
                }
                await client.query(
                    `INSERT INTO governance_voter_receipts (proposal_id, user_id, chamber) VALUES ($1,$2,$3)`,
                    [proposalId, userId, chamber]
                );
                const ballotHash = core.sha256Hex(`${proposalId}:${chamber}:${idx}:${weight.toString()}:${crypto.randomBytes(16).toString('hex')}`);
                await client.query(
                    `INSERT INTO governance_secret_ballots (proposal_id, chamber, option_index, weight_applied, ballot_hash) VALUES ($1,$2,$3,$4,$5)`,
                    [proposalId, chamber, idx, weight.toString(), ballotHash]
                );
                await client.query('COMMIT');
                return { recorded: true, secret: true, chamber, weight_applied: weight.toString(), ballot_hash: ballotHash };
            }

            await client.query(
                `INSERT INTO governance_ballots (proposal_id, snapshot_id, user_id, chamber, option_index, weight_applied)
                 VALUES ($1,$2,$3,$4,$5,$6)
                 ON CONFLICT (proposal_id, user_id, chamber) DO UPDATE SET option_index = EXCLUDED.option_index, cast_at = CURRENT_TIMESTAMP`,
                [proposalId, snap.id, userId, chamber, idx, weight.toString()]
            );
            await client.query('COMMIT');
            return { recorded: true, secret: false, chamber, option_index: idx, weight_applied: weight.toString() };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    const liveUser = mem.users.get(Number(userId));
    if (!liveUser || (liveUser.status || 'active') !== 'active' || liveUser.membership_status === 'suspended') {
        const err = new Error('Учётная запись неактивна или приостановлена');
        err.status = 403;
        throw err;
    }

    const prop = mem.proposals.find((p) => p.id === Number(proposalId));
    if (!prop) { const err = new Error('Голосование не найдено'); err.status = 404; throw err; }
    if (prop.legacy_r1_unsupported === true) {
        const err = new Error('Устаревшее предложение R1 не поддерживается и заблокировано до решения оператора');
        err.status = 409;
        err.code = 'LEGACY_UNSUPPORTED_PROPOSAL';
        throw err;
    }
    if (prop.authoritative_engine === 'loomio' || prop.authoritative_engine === 'belenios') {
        const err = new Error(`Голосование привязано к внешнему движку ${prop.authoritative_engine}; прямой приём бюллетеней отключён`);
        err.status = 409;
        throw err;
    }
    if (prop.status !== 'open') { const err = new Error('Голосование закрыто или ещё не открыто'); err.status = 409; throw err; }
    if (prop.closes_at && new Date(prop.closes_at) <= new Date()) {
        const err = new Error('Proposal voting window has closed'); err.status = 409; throw err;
    }
    const idx = Number(optionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= prop.options.length) {
        const err = new Error('Некорректный вариант голосования'); err.status = 400; throw err;
    }

    const snap = mem.snapshots.find((s) => s.proposal_id === prop.id && s.user_id === Number(userId));
    if (!snap) {
        const err = new Error('Вы не включены в замороженный список избирателей этого голосования');
        err.status = 403;
        throw err;
    }
    const eligible = chamber === 'member' ? snap.can_vote_member : snap.can_vote_capital;
    const weight = chamber === 'member' ? BigInt(snap.member_weight) : BigInt(snap.capital_weight_kopecks);
    if (!eligible || weight <= 0n) {
        const err = new Error(`Нет права голоса в палате ${chamber}`);
        err.status = 403;
        throw err;
    }

    if (prop.secret_ballot) {
        const dup = mem.voterReceipts.find((r) => r.proposal_id === prop.id && r.user_id === Number(userId) && r.chamber === chamber);
        if (dup) {
            const err = new Error('В тайном голосовании голос уже учтён и не может быть изменён');
            err.status = 409;
            throw err;
        }
        mem.voterReceipts.push({
            proposal_id: prop.id,
            user_id: Number(userId),
            chamber,
            cast_at: new Date().toISOString(),
        });
        const ballotHash = core.sha256Hex(`${prop.id}:${chamber}:${idx}:${weight.toString()}:${crypto.randomBytes(16).toString('hex')}`);
        mem.secretBallots.push({
            id: mem.nextSecretBallotId++,
            proposal_id: prop.id,
            chamber,
            option_index: idx,
            weight_applied: weight.toString(),
            ballot_hash: ballotHash,
        });
        return { recorded: true, secret: true, chamber, weight_applied: weight.toString(), ballot_hash: ballotHash };
    }

    const existing = mem.ballots.find((b) => b.proposal_id === prop.id && b.user_id === Number(userId) && b.chamber === chamber);
    if (existing) {
        existing.option_index = idx;
        existing.cast_at = new Date().toISOString();
    } else {
        mem.ballots.push({
            id: mem.nextBallotId++,
            proposal_id: prop.id,
            snapshot_id: snap.id,
            user_id: Number(userId),
            chamber,
            option_index: idx,
            weight_applied: weight.toString(),
            cast_at: new Date().toISOString(),
        });
    }
    return { recorded: true, secret: false, chamber, option_index: idx, weight_applied: weight.toString() };
}

async function closeProposal(proposalId) {
    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            const pRes = await client.query(`SELECT * FROM governance_proposals WHERE id = $1 FOR UPDATE`, [proposalId]);
            const prop = pRes.rows[0];
            if (!prop) { const err = new Error('Голосование не найдено'); err.status = 404; throw err; }
            if (prop.legacy_r1_unsupported === true) {
                const err = new Error('Устаревшее предложение R1 не поддерживается и заблокировано до решения оператора');
                err.status = 409;
                err.code = 'LEGACY_UNSUPPORTED_PROPOSAL';
                throw err;
            }
            if (prop.status !== 'open') { const err = new Error(`Нельзя закрыть голосование в статусе ${prop.status}`); err.status = 409; throw err; }

            const snaps = (await client.query(`SELECT * FROM governance_voter_snapshots WHERE proposal_id = $1 ORDER BY user_id ASC`, [proposalId])).rows;
            const ballots = prop.secret_ballot
                ? (await client.query(`SELECT chamber, option_index, weight_applied FROM governance_secret_ballots WHERE proposal_id = $1`, [proposalId])).rows
                : (await client.query(`SELECT chamber, option_index, weight_applied, user_id FROM governance_ballots WHERE proposal_id = $1`, [proposalId])).rows;

            const outcome = core.evaluateGovernanceOutcome(prop, snaps, ballots);
            const protocolObj = {
                proposal_id: prop.id,
                title: prop.title,
                vote_type: prop.vote_type,
                settlement_id: prop.settlement_id,
                secret_ballot: prop.secret_ballot,
                roster_hash: prop.roster_hash,
                outcome,
                closed_at: new Date().toISOString(),
            };
            const protocolHash = core.sha256Hex(protocolObj);

            const upd = await client.query(
                `UPDATE governance_proposals
                 SET status = 'closed', adopted = $1, winning_option_index = $2,
                     protocol_json = $3, protocol_hash = $4, closed_at = CURRENT_TIMESTAMP
                 WHERE id = $5 RETURNING *`,
                [outcome.adopted, outcome.winning_option_index, JSON.stringify(protocolObj), protocolHash, proposalId]
            );
            await client.query('COMMIT');
            return { proposal: upd.rows[0], outcome, protocol_hash: protocolHash };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    const prop = mem.proposals.find((p) => p.id === Number(proposalId));
    if (!prop) { const err = new Error('Голосование не найдено'); err.status = 404; throw err; }
    if (prop.legacy_r1_unsupported === true) {
        const err = new Error('Устаревшее предложение R1 не поддерживается и заблокировано до решения оператора');
        err.status = 409;
        err.code = 'LEGACY_UNSUPPORTED_PROPOSAL';
        throw err;
    }
    if (prop.status !== 'open') { const err = new Error(`Нельзя закрыть голосование в статусе ${prop.status}`); err.status = 409; throw err; }

    const snaps = mem.snapshots.filter((s) => s.proposal_id === prop.id).sort((a, b) => a.user_id - b.user_id);
    const ballots = prop.secret_ballot
        ? mem.secretBallots.filter((b) => b.proposal_id === prop.id)
        : mem.ballots.filter((b) => b.proposal_id === prop.id);

    const outcome = core.evaluateGovernanceOutcome(prop, snaps, ballots);
    const closedAt = new Date().toISOString();
    const protocolObj = {
        proposal_id: prop.id,
        title: prop.title,
        vote_type: prop.vote_type,
        settlement_id: prop.settlement_id,
        secret_ballot: prop.secret_ballot,
        roster_hash: prop.roster_hash,
        outcome,
        closed_at: closedAt,
    };
    const protocolHash = core.sha256Hex(protocolObj);

    prop.status = 'closed';
    prop.adopted = outcome.adopted;
    prop.winning_option_index = outcome.winning_option_index;
    prop.protocol_json = protocolObj;
    prop.protocol_hash = protocolHash;
    prop.closed_at = closedAt;

    return { proposal: { ...prop }, outcome, protocol_hash: protocolHash };
}

async function listProposals(userId) {
    if (isPgMode()) {
        const rows = (await dbRef.pool.query(`SELECT * FROM governance_proposals ORDER BY created_at DESC LIMIT 50`)).rows;
        let snapByProposal = new Map();
        if (userId && rows.length > 0) {
            const propIds = rows.map((p) => p.id);
            const snaps = (await dbRef.pool.query(
                `SELECT * FROM governance_voter_snapshots WHERE user_id = $1 AND proposal_id = ANY($2)`,
                [userId, propIds]
            )).rows;
            snapByProposal = new Map(snaps.map((s) => [Number(s.proposal_id), s]));
        }
        return rows.map((p) => sanitizeProposalForRead(p, snapByProposal.get(Number(p.id)) || null));
    }
    return [...mem.proposals].reverse().map((p) => {
        const mySnap = userId ? mem.snapshots.find((s) => s.proposal_id === p.id && s.user_id === Number(userId)) : null;
        return sanitizeProposalForRead(p, mySnap);
    });
}

function sanitizeProposalForRead(prop, mySnapshot) {
    return {
        ...prop,
        // Never leak intermediate secret ballot tallies while open
        protocol_json: prop.status === 'closed' ? prop.protocol_json : null,
        my_eligibility: mySnapshot
            ? {
                can_vote_member: mySnapshot.can_vote_member,
                member_weight: mySnapshot.member_weight,
                can_vote_capital: mySnapshot.can_vote_capital,
                capital_weight_kopecks: String(mySnapshot.capital_weight_kopecks),
            }
            : null,
    };
}

async function getProposalDetail(proposalId, userId) {
    if (isPgMode()) {
        const pRes = await dbRef.pool.query(`SELECT * FROM governance_proposals WHERE id = $1`, [proposalId]);
        const prop = pRes.rows[0];
        if (!prop) return null;
        const mySnap = userId
            ? (await dbRef.pool.query(`SELECT * FROM governance_voter_snapshots WHERE proposal_id = $1 AND user_id = $2`, [proposalId, userId])).rows[0] || null
            : null;
        const snaps = (await dbRef.pool.query(`SELECT * FROM governance_voter_snapshots WHERE proposal_id = $1 ORDER BY user_id ASC`, [proposalId])).rows;
        // Secrecy invariant: do NOT return live tallies for open secret ballots
        let liveTally = null;
        if (prop.status === 'open' && !prop.secret_ballot) {
            const ballots = (await dbRef.pool.query(`SELECT chamber, option_index, weight_applied FROM governance_ballots WHERE proposal_id = $1`, [proposalId])).rows;
            liveTally = core.evaluateGovernanceOutcome(prop, snaps, ballots);
        }
        return {
            proposal: sanitizeProposalForRead(prop, mySnap),
            eligible_voters_count: snaps.length,
            live_tally: liveTally,
        };
    }

    const prop = mem.proposals.find((p) => p.id === Number(proposalId));
    if (!prop) return null;
    const mySnap = userId ? mem.snapshots.find((s) => s.proposal_id === prop.id && s.user_id === Number(userId)) : null;
    const snaps = mem.snapshots.filter((s) => s.proposal_id === prop.id);
    let liveTally = null;
    if (prop.status === 'open' && !prop.secret_ballot) {
        const ballots = mem.ballots.filter((b) => b.proposal_id === prop.id);
        liveTally = core.evaluateGovernanceOutcome(prop, snaps, ballots);
    }
    return {
        proposal: sanitizeProposalForRead(prop, mySnap),
        eligible_voters_count: snaps.length,
        live_tally: liveTally,
    };
}

async function exportProposalRoster(proposalId) {
    if (isPgMode()) {
        const prop = (await dbRef.pool.query(`SELECT * FROM governance_proposals WHERE id = $1`, [proposalId])).rows[0];
        if (!prop) return null;
        const snaps = (await dbRef.pool.query(
            `SELECT user_id, voter_label, can_vote_member, member_weight, can_vote_capital, capital_weight_kopecks
             FROM governance_voter_snapshots WHERE proposal_id = $1 ORDER BY user_id ASC`,
            [proposalId]
        )).rows;
        return {
            proposal_id: prop.id,
            title: prop.title,
            vote_type: prop.vote_type,
            authoritative_engine: prop.authoritative_engine,
            roster_hash: prop.roster_hash,
            options: prop.options,
            roster: snaps,
        };
    }
    const prop = mem.proposals.find((p) => p.id === Number(proposalId));
    if (!prop) return null;
    const snaps = mem.snapshots
        .filter((s) => s.proposal_id === prop.id)
        .sort((a, b) => a.user_id - b.user_id)
        .map((s) => ({
            user_id: s.user_id,
            voter_label: s.voter_label,
            can_vote_member: s.can_vote_member,
            member_weight: s.member_weight,
            can_vote_capital: s.can_vote_capital,
            capital_weight_kopecks: String(s.capital_weight_kopecks),
        }));
    return {
        proposal_id: prop.id,
        title: prop.title,
        vote_type: prop.vote_type,
        authoritative_engine: prop.authoritative_engine,
        roster_hash: prop.roster_hash,
        options: prop.options,
        roster: snaps,
    };
}

async function reconcileProposalExternal(proposalId, payload) {
    const exp = await exportProposalRoster(proposalId);
    if (!exp) {
        const err = new Error('Голосование не найдено');
        err.status = 404;
        throw err;
    }
    const prop = isPgMode()
        ? (await dbRef.pool.query(`SELECT * FROM governance_proposals WHERE id = $1`, [proposalId])).rows[0]
        : mem.proposals.find((p) => p.id === Number(proposalId));
    return core.reconcileExternalTally(prop, exp.roster, payload);
}

async function listCouncilDelegations(settlementId) {
    if (isPgMode()) {
        const r = settlementId
            ? await dbRef.pool.query(`SELECT * FROM council_delegations WHERE active = true AND settlement_id = $1 ORDER BY level, id`, [settlementId])
            : await dbRef.pool.query(`SELECT * FROM council_delegations WHERE active = true ORDER BY level, id`);
        return r.rows;
    }
    return mem.delegations.filter((d) => d.active && (!settlementId || d.settlement_id === settlementId));
}

// ============================================
// CONSERVATION LEDGER & CONSTRUCTION PANEL
// ============================================

function computeContributionStatus(c) {
    const avail = BigInt(c.available_kopecks);
    const resv = BigInt(c.reserved_kopecks);
    const paid = BigInt(c.paid_kopecks);
    const ref = BigInt(c.refunded_kopecks);
    const recv = BigInt(c.received_kopecks);
    if (ref === recv) return 'refunded';
    if (paid === recv) return 'allocated';
    if (resv > 0n && paid === 0n && avail === 0n) return 'reserved';
    if (paid > 0n || resv > 0n || ref > 0n) return 'partially_allocated';
    return 'unallocated';
}

function serializeContribution(c) {
    return {
        id: c.id,
        user_id: c.user_id,
        settlement_id: c.settlement_id,
        purpose: c.purpose,
        contributor_name: c.contributor_name,
        received: core.formatKopecks(c.received_kopecks),
        available: core.formatKopecks(c.available_kopecks),
        reserved: core.formatKopecks(c.reserved_kopecks),
        paid: core.formatKopecks(c.paid_kopecks),
        refunded: core.formatKopecks(c.refunded_kopecks),
        share_class: c.share_class,
        terms_version: c.terms_version,
        legal_right_type: c.legal_right_type,
        status: c.status,
        ledger_mode: c.ledger_mode,
        payment_ref: c.payment_ref,
        note: c.note,
        created_at: c.created_at,
    };
}

function parseKopecks400(val, fieldName) {
    try {
        return core.toBigIntKopecks(val, fieldName);
    } catch (err) {
        err.status = 400;
        throw err;
    }
}

function validateIdempotencyKey(raw) {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        const err = new Error('idempotency_key is required and must be a non-empty string up to 128 characters');
        err.status = 400;
        throw err;
    }
    const trimmed = raw.trim();
    const collapsed = trimmed.replace(/\s+/g, ' ');
    if (trimmed.length > 128 && collapsed.length > 128) {
        const err = new Error('idempotency_key is required and must be a non-empty string up to 128 characters');
        err.status = 400;
        throw err;
    }
    return trimmed.length <= 128 ? trimmed : collapsed;
}

function isPositiveInt(val) {
    if (typeof val === 'number') return Number.isInteger(val) && val >= 1;
    if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
        const n = Number(val.trim());
        return Number.isInteger(n) && n >= 1;
    }
    return false;
}

function matchesContributionIdempotency(existing, fp, params) {
    if (existing.request_fingerprint) {
        return existing.request_fingerprint === fp;
    }
    return (
        Number(existing.user_id || 0) === Number(params.user_id || 0)
        && existing.settlement_id === params.settlement_id
        && (existing.contributor_name || 'Участник') === params.contributor_name
        && String(existing.received_kopecks) === params.received_kopecks
        && existing.purpose === params.purpose
        && (existing.share_class || null) === (params.share_class || null)
        && (existing.terms_version || 'v1') === (params.terms_version || 'v1')
        && existing.legal_right_type === params.legal_right_type
        && existing.ledger_mode === params.ledger_mode
        && (existing.payment_ref || null) === (params.payment_ref || null)
        && (existing.note || null) === (params.note || null)
    );
}

function matchesExpenseIdempotency(existing, existingAllocs, fp, params, existingPostings = []) {
    if (existing.request_fingerprint) {
        return { matched: existing.request_fingerprint === fp, legacy: false };
    }
    const basicMatch = (
        existing.settlement_id === params.settlement_id
        && existing.purpose === params.purpose
        && Number(existing.milestone_id || 0) === Number(params.milestone_id || 0)
        && existing.title === params.title
        && existing.category === params.category
        && String(existing.amount_kopecks) === params.amount_kopecks
        && (existing.allocation_rule || 'fifo') === params.allocation_rule
        && (existing.asset_name || null) === (params.asset_name || null)
        && (existing.asset_location || null) === (params.asset_location || null)
        && (existing.receipt_url || null) === (params.receipt_url || null)
        && (existing.photo_url || null) === (params.photo_url || null)
    );
    if (!basicMatch) return { matched: false, legacy: true };

    let legacyReplayNote = null;
    const postingTypes = new Set((existingPostings || []).map((p) => p.posting_type));
    if (postingTypes.has('reserve')) {
        if (Boolean(params.mark_paid) !== false) {
            return { matched: false, legacy: true };
        }
    } else if (postingTypes.has('pay')) {
        if (Boolean(params.mark_paid) !== true) {
            return { matched: false, legacy: true };
        }
    } else {
        legacyReplayNote = 'mark_paid_not_recorded_in_r1';
    }

    if (params.allocation_rule === 'explicit') {
        const normExisting = [...existingAllocs]
            .sort((a, b) => Number(a.contribution_id) - Number(b.contribution_id))
            .map((a) => ({ contribution_id: Number(a.contribution_id), amount_kopecks: String(a.amount_kopecks) }));
        if (core.canonicalJson(normExisting) !== core.canonicalJson(params.explicit_allocations)) {
            return { matched: false, legacy: true };
        }
    }

    return {
        matched: true,
        legacy: true,
        ...(legacyReplayNote ? { legacy_replay_note: legacyReplayNote } : {}),
    };
}

async function recordContribution(data, adminId) {
    const idempKey = validateIdempotencyKey(data.idempotency_key);
    const amountBi = parseKopecks400(data.amount_kopecks, 'amount_kopecks');
    if (amountBi <= 0n) {
        const err = new Error('Сумма взноса должна быть положительной (в копейках)');
        err.status = 400;
        throw err;
    }
    const validRightTypes = ['observer_trace', 'cooperative_share', 'direct_fraction'];
    const legalRightType = data.legal_right_type || 'observer_trace';
    if (!validRightTypes.includes(legalRightType)) {
        const err = new Error('Недопустимый legal_right_type');
        err.status = 400;
        throw err;
    }

    const validLedgerModes = ['verified_receipt', 'pledge', 'legacy_import'];
    const ledgerMode = (data.ledger_mode === undefined || data.ledger_mode === null)
        ? 'verified_receipt'
        : data.ledger_mode;
    if (!validLedgerModes.includes(ledgerMode)) {
        const err = new Error('Недопустимый ledger_mode (verified_receipt | pledge | legacy_import)');
        err.status = 400;
        throw err;
    }

    const userId = (data.user_id !== undefined && data.user_id !== null && data.user_id !== '')
        ? Number(data.user_id)
        : null;
    if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) {
        const err = new Error('user_id должен быть положительным целым числом');
        err.status = 400;
        throw err;
    }

    const settlementId = data.settlement_id || DEFAULT_SETTLEMENT;
    const purpose = data.purpose || 'general';
    const contributorName = data.contributor_name || 'Участник';
    const shareClass = data.share_class || null;
    const termsVersion = data.terms_version || 'v1';
    const paymentRef = data.payment_ref || null;
    const note = data.note || null;

    const fingerprintParams = {
        user_id: userId,
        settlement_id: settlementId,
        contributor_name: contributorName,
        received_kopecks: String(amountBi),
        purpose,
        share_class: shareClass,
        terms_version: termsVersion,
        legal_right_type: legalRightType,
        ledger_mode: ledgerMode,
        payment_ref: paymentRef,
        note,
    };
    const requestFingerprint = core.sha256Hex(fingerprintParams);

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            await assertLedgerWriteGateOpen(client);
            await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`contrib_idem:${idempKey}`]);

            const dup = await client.query(`SELECT * FROM contributions WHERE idempotency_key = $1`, [idempKey]);
            if (dup.rows[0]) {
                const existing = dup.rows[0];
                if (!matchesContributionIdempotency(existing, requestFingerprint, fingerprintParams)) {
                    const err = new Error('Idempotency key already used with different parameters');
                    err.status = 409;
                    throw err;
                }
                await client.query('COMMIT');
                return { contribution: serializeContribution(existing), idempotent_replay: true };
            }

            const r = await client.query(
                `INSERT INTO contributions
                 (user_id, settlement_id, purpose, contributor_name, received_kopecks, available_kopecks,
                  reserved_kopecks, paid_kopecks, refunded_kopecks, share_class, terms_version,
                  legal_right_type, status, ledger_mode, payment_ref, idempotency_key, request_fingerprint, note, verified_by)
                 VALUES ($1,$2,$3,$4,$5,$5,0,0,0,$6,$7,$8,'unallocated',$9,$10,$11,$12,$13,$14)
                 RETURNING *`,
                [
                    userId, settlementId, purpose, contributorName,
                    amountBi.toString(), shareClass, termsVersion,
                    legalRightType, ledgerMode, paymentRef,
                    idempKey, requestFingerprint, note, adminId || null,
                ]
            );
            const row = r.rows[0];
            await client.query(
                `INSERT INTO ledger_postings (posting_type, contribution_id, amount_kopecks, actor_admin_id, note)
                 VALUES ('receipt', $1, $2, $3, $4)`,
                [row.id, amountBi.toString(), adminId || null, note || 'Поступление взноса']
            );
            await client.query('COMMIT');
            return { contribution: serializeContribution(row), idempotent_replay: false };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    const existing = mem.contributions.find((c) => c.idempotency_key === idempKey);
    if (existing) {
        if (!matchesContributionIdempotency(existing, requestFingerprint, fingerprintParams)) {
            const err = new Error('Idempotency key already used with different parameters');
            err.status = 409;
            throw err;
        }
        return { contribution: serializeContribution(existing), idempotent_replay: true };
    }

    const row = {
        id: mem.nextContributionId++,
        user_id: userId,
        settlement_id: settlementId,
        purpose,
        contributor_name: contributorName,
        received_kopecks: amountBi,
        available_kopecks: amountBi,
        reserved_kopecks: 0n,
        paid_kopecks: 0n,
        refunded_kopecks: 0n,
        share_class: shareClass,
        terms_version: termsVersion,
        legal_right_type: legalRightType,
        status: 'unallocated',
        ledger_mode: ledgerMode,
        payment_ref: paymentRef,
        idempotency_key: idempKey,
        request_fingerprint: requestFingerprint,
        note,
        verified_by: adminId || null,
        created_at: new Date().toISOString(),
    };
    mem.contributions.push(row);
    mem.postings.push({
        id: mem.nextPostingId++,
        posting_type: 'receipt',
        contribution_id: row.id,
        expense_id: null,
        amount_kopecks: amountBi,
        actor_admin_id: adminId || null,
        note: note || 'Поступление взноса',
        created_at: new Date().toISOString(),
    });
    return { contribution: serializeContribution(row), idempotent_replay: false };
}

async function createAndAllocateExpense(data, adminId) {
    const idempKey = validateIdempotencyKey(data.idempotency_key);
    const amountBi = parseKopecks400(data.amount_kopecks, 'amount_kopecks');
    if (amountBi <= 0n) {
        const err = new Error('Сумма расхода должна быть положительной');
        err.status = 400;
        throw err;
    }
    const rule = data.allocation_rule || 'fifo';
    if (!['fifo', 'proportional', 'explicit'].includes(rule)) {
        const err = new Error('allocation_rule должен быть fifo, proportional или explicit');
        err.status = 400;
        throw err;
    }

    let milestoneId = null;
    if (data.milestone_id !== undefined && data.milestone_id !== null && data.milestone_id !== '') {
        milestoneId = Number(data.milestone_id);
        if (!Number.isInteger(milestoneId) || milestoneId <= 0) {
            const err = new Error('milestone_id должен быть положительным целым числом');
            err.status = 400;
            throw err;
        }
    }

    const explicitLines = data.explicit_allocations !== undefined ? data.explicit_allocations : data.allocations;
    let normalizedExplicit = null;
    if (rule === 'explicit') {
        if (!Array.isArray(explicitLines) || explicitLines.length === 0) {
            const err = new Error('Explicit allocation requires non-empty allocations array');
            err.status = 400;
            throw err;
        }
        const merged = new Map();
        for (const line of explicitLines) {
            const cid = Number(line.contribution_id);
            const amt = parseKopecks400(line.amount_kopecks, 'line.amount_kopecks');
            if (!Number.isInteger(cid) || cid <= 0 || amt <= 0n) {
                const err = new Error('Each explicit allocation requires positive integer contribution_id and amount_kopecks');
                err.status = 400;
                throw err;
            }
            merged.set(cid, (merged.get(cid) || 0n) + amt);
        }
        normalizedExplicit = [...merged.keys()]
            .sort((a, b) => a - b)
            .map((cid) => ({ contribution_id: cid, amount_kopecks: merged.get(cid).toString() }));
    }

    const markPaid = Boolean(data.mark_paid);
    const financialStatus = markPaid ? 'paid' : 'reserved';
    const disputeStatus = 'none';
    const initialStatus = financialStatus;
    const settlementId = data.settlement_id || DEFAULT_SETTLEMENT;
    const purpose = data.purpose || 'general';
    const category = data.category || 'equipment';
    const assetName = data.asset_name || data.title;
    const assetLocation = data.asset_location || null;
    const receiptUrl = data.receipt_url || null;
    const photoUrl = data.photo_url || null;

    const fingerprintParams = {
        settlement_id: settlementId,
        purpose,
        milestone_id: milestoneId,
        title: data.title,
        category,
        amount_kopecks: String(amountBi),
        asset_name: assetName,
        asset_location: assetLocation,
        receipt_url: receiptUrl,
        photo_url: photoUrl,
        allocation_rule: rule,
        mark_paid: markPaid,
        explicit_allocations: normalizedExplicit,
    };
    const requestFingerprint = core.sha256Hex(fingerprintParams);

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            await assertLedgerWriteGateOpen(client);
            await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`expense_idem:${idempKey}`]);

            const dup = await client.query(`SELECT * FROM ledger_expenses WHERE idempotency_key = $1`, [idempKey]);
            let dupRow = dup.rows[0] || null;
            if (!dupRow) {
                const collapsedKey = idempKey.replace(/\s+/g, ' ');
                if (collapsedKey !== idempKey) {
                    const legacyDup = await client.query(
                        `SELECT * FROM ledger_expenses WHERE idempotency_key = $1 AND request_fingerprint IS NULL`,
                        [collapsedKey]
                    );
                    dupRow = legacyDup.rows[0] || null;
                }
            }
            if (dupRow) {
                const ex = dupRow;
                const allocs = (await client.query(
                    `SELECT ea.*, c.ledger_mode AS contribution_ledger_mode
                     FROM expense_allocations ea
                     LEFT JOIN contributions c ON c.id = ea.contribution_id
                     WHERE ea.expense_id = $1
                     ORDER BY ea.contribution_id ASC`,
                    [ex.id]
                )).rows;
                const existingPostings = ex.request_fingerprint
                    ? []
                    : (await client.query(`SELECT posting_type FROM ledger_postings WHERE expense_id = $1`, [ex.id])).rows;
                const idemCheck = matchesExpenseIdempotency(ex, allocs, requestFingerprint, fingerprintParams, existingPostings);
                if (!idemCheck.matched) {
                    const err = new Error('Idempotency key already used with different parameters');
                    err.status = 409;
                    throw err;
                }
                await client.query('COMMIT');
                return {
                    expense: serializeExpense(ex, allocs),
                    idempotent_replay: true,
                    ...(idemCheck.legacy_replay_note ? { legacy_replay_note: idemCheck.legacy_replay_note } : {}),
                };
            }

            if (milestoneId !== null) {
                const mRes = await client.query(
                    `SELECT id, settlement_id FROM construction_milestones WHERE id = $1`,
                    [milestoneId]
                );
                if (!mRes.rows[0] || mRes.rows[0].settlement_id !== settlementId) {
                    const err = new Error('Milestone does not belong to settlement');
                    err.status = 400;
                    throw err;
                }
            }

            // Lock eligible verified_receipt contributions in stable id ASC order to prevent deadlocks & double-spend
            const contribRows = (await client.query(
                `SELECT * FROM contributions
                 WHERE settlement_id = $1 AND purpose = $2 AND ledger_mode = 'verified_receipt' AND available_kopecks > 0
                 ORDER BY id ASC FOR UPDATE`,
                [settlementId, purpose]
            )).rows;

            let plan;
            try {
                if (rule === 'proportional') {
                    plan = core.allocateProportionalBigInt(amountBi, contribRows);
                } else if (rule === 'fifo') {
                    plan = core.allocateFifoBigInt(amountBi, contribRows);
                } else {
                    const byId = new Map(contribRows.map((c) => [Number(c.id), c]));
                    plan = core.allocateExplicitBigInt(amountBi, explicitLines, byId);
                }
            } catch (allocErr) {
                allocErr.status = allocErr.code === 'INSUFFICIENT_FUNDS' || allocErr.code === 'ALLOCATION_SUM_MISMATCH' ? 409 : 400;
                throw allocErr;
            }

            const expRes = await client.query(
                `INSERT INTO ledger_expenses
                 (settlement_id, purpose, title, category, amount_kopecks, milestone_id, asset_name,
                  asset_location, receipt_url, photo_url, allocation_rule, status, financial_status,
                  dispute_status, version, idempotency_key, request_fingerprint, approved_by, paid_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1,$15,$16,$17,$18)
                 RETURNING *`,
                [
                    settlementId, purpose, data.title, category, amountBi.toString(),
                    milestoneId, assetName, assetLocation, receiptUrl, photoUrl,
                    rule, initialStatus, financialStatus, disputeStatus, idempKey, requestFingerprint,
                    adminId || null, financialStatus === 'paid' ? new Date().toISOString() : null,
                ]
            );
            const expense = expRes.rows[0];
            const savedAllocs = [];

            for (const item of plan) {
                const shareLabel = core.buildFinancingShareLabel(item.amount_kopecks, amountBi, item.legal_right_type);
                const ar = await client.query(
                    `INSERT INTO expense_allocations (expense_id, contribution_id, amount_kopecks, allocation_rule, financing_share_label, legal_right_type)
                     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                    [expense.id, item.contribution_id, item.amount_kopecks.toString(), rule, shareLabel, item.legal_right_type]
                );
                savedAllocs.push(ar.rows[0]);

                if (financialStatus === 'paid') {
                    await client.query(
                        `UPDATE contributions
                         SET available_kopecks = available_kopecks - $1,
                             paid_kopecks = paid_kopecks + $1,
                             status = CASE
                                 WHEN refunded_kopecks = received_kopecks THEN 'refunded'
                                 WHEN paid_kopecks + $1 = received_kopecks THEN 'allocated'
                                 WHEN reserved_kopecks > 0 AND paid_kopecks + $1 = 0 AND available_kopecks - $1 = 0 THEN 'reserved'
                                 WHEN paid_kopecks + $1 > 0 OR reserved_kopecks > 0 OR refunded_kopecks > 0 THEN 'partially_allocated'
                                 ELSE 'unallocated'
                             END
                         WHERE id = $2`,
                        [item.amount_kopecks.toString(), item.contribution_id]
                    );
                    await client.query(
                        `INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
                         VALUES ('pay', $1, $2, $3, $4, $5)`,
                        [item.contribution_id, expense.id, item.amount_kopecks.toString(), adminId || null, expense.title]
                    );
                } else {
                    await client.query(
                        `UPDATE contributions
                         SET available_kopecks = available_kopecks - $1,
                             reserved_kopecks = reserved_kopecks + $1,
                             status = CASE
                                 WHEN refunded_kopecks = received_kopecks THEN 'refunded'
                                 WHEN paid_kopecks = received_kopecks THEN 'allocated'
                                 WHEN reserved_kopecks + $1 > 0 AND paid_kopecks = 0 AND available_kopecks - $1 = 0 THEN 'reserved'
                                 WHEN paid_kopecks > 0 OR reserved_kopecks + $1 > 0 OR refunded_kopecks > 0 THEN 'partially_allocated'
                                 ELSE 'unallocated'
                             END
                         WHERE id = $2`,
                        [item.amount_kopecks.toString(), item.contribution_id]
                    );
                    await client.query(
                        `INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
                         VALUES ('reserve', $1, $2, $3, $4, $5)`,
                        [item.contribution_id, expense.id, item.amount_kopecks.toString(), adminId || null, expense.title]
                    );
                }
            }

            await client.query('COMMIT');
            return { expense: serializeExpense(expense, savedAllocs), idempotent_replay: false };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // In-memory parity path
    let existing = mem.expenses.find((e) => e.idempotency_key === idempKey);
    if (!existing) {
        const collapsedKey = idempKey.replace(/\s+/g, ' ');
        if (collapsedKey !== idempKey) {
            existing = mem.expenses.find((e) => e.idempotency_key === collapsedKey && !e.request_fingerprint);
        }
    }
    if (existing) {
        const allocs = mem.allocations
            .filter((a) => a.expense_id === existing.id)
            .map((a) => ({
                ...a,
                contribution_ledger_mode: mem.contributions.find((c) => c.id === a.contribution_id)?.ledger_mode || null,
            }));
        const existingPostings = existing.request_fingerprint
            ? []
            : mem.postings.filter((p) => p.expense_id === existing.id);
        const idemCheck = matchesExpenseIdempotency(existing, allocs, requestFingerprint, fingerprintParams, existingPostings);
        if (!idemCheck.matched) {
            const err = new Error('Idempotency key already used with different parameters');
            err.status = 409;
            throw err;
        }
        return {
            expense: serializeExpense(existing, allocs),
            idempotent_replay: true,
            ...(idemCheck.legacy_replay_note ? { legacy_replay_note: idemCheck.legacy_replay_note } : {}),
        };
    }

    if (milestoneId !== null) {
        seedDefaultMilestonesMem();
        const m = mem.milestones.find((x) => x.id === milestoneId);
        if (!m || m.settlement_id !== settlementId) {
            const err = new Error('Milestone does not belong to settlement');
            err.status = 400;
            throw err;
        }
    }

    const eligible = mem.contributions
        .filter((c) => c.settlement_id === settlementId && c.purpose === purpose && c.ledger_mode === 'verified_receipt' && c.available_kopecks > 0n)
        .sort((a, b) => a.id - b.id);

    let plan;
    try {
        if (rule === 'proportional') {
            plan = core.allocateProportionalBigInt(amountBi, eligible);
        } else if (rule === 'fifo') {
            plan = core.allocateFifoBigInt(amountBi, eligible);
        } else {
            const byId = new Map(eligible.map((c) => [c.id, c]));
            plan = core.allocateExplicitBigInt(amountBi, explicitLines, byId);
        }
    } catch (allocErr) {
        allocErr.status = allocErr.code === 'INSUFFICIENT_FUNDS' || allocErr.code === 'ALLOCATION_SUM_MISMATCH' ? 409 : 400;
        throw allocErr;
    }

    const expense = {
        id: mem.nextExpenseId++,
        settlement_id: settlementId,
        purpose,
        title: data.title,
        category,
        amount_kopecks: amountBi,
        milestone_id: milestoneId,
        asset_name: assetName,
        asset_location: assetLocation,
        receipt_url: receiptUrl,
        photo_url: photoUrl,
        allocation_rule: rule,
        status: initialStatus,
        financial_status: financialStatus,
        dispute_status: disputeStatus,
        version: 1,
        idempotency_key: idempKey,
        request_fingerprint: requestFingerprint,
        approved_by: adminId || null,
        paid_at: financialStatus === 'paid' ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
    };
    mem.expenses.push(expense);

    const savedAllocs = [];
    for (const item of plan) {
        const c = mem.contributions.find((x) => x.id === item.contribution_id);
        const shareLabel = core.buildFinancingShareLabel(item.amount_kopecks, amountBi, item.legal_right_type);
        const aRow = {
            id: mem.nextAllocationId++,
            expense_id: expense.id,
            contribution_id: item.contribution_id,
            amount_kopecks: item.amount_kopecks,
            allocation_rule: rule,
            financing_share_label: shareLabel,
            legal_right_type: item.legal_right_type,
            created_at: new Date().toISOString(),
        };
        mem.allocations.push(aRow);
        savedAllocs.push(aRow);

        c.available_kopecks -= item.amount_kopecks;
        if (financialStatus === 'paid') {
            c.paid_kopecks += item.amount_kopecks;
        } else {
            c.reserved_kopecks += item.amount_kopecks;
        }
        c.status = computeContributionStatus(c);

        // Enforce conservation invariant in memory too
        if (c.received_kopecks !== c.available_kopecks + c.reserved_kopecks + c.paid_kopecks + c.refunded_kopecks) {
            throw new Error(`Conservation invariant violated on contribution ${c.id}`);
        }

        mem.postings.push({
            id: mem.nextPostingId++,
            posting_type: financialStatus === 'paid' ? 'pay' : 'reserve',
            contribution_id: c.id,
            expense_id: expense.id,
            amount_kopecks: item.amount_kopecks,
            actor_admin_id: adminId || null,
            note: expense.title,
            created_at: new Date().toISOString(),
        });
    }

    return { expense: serializeExpense(expense, savedAllocs), idempotent_replay: false };
}

function serializeExpense(e, allocs = []) {
    const financialStatus = e.financial_status || (e.status === 'disputed' ? 'reserved' : e.status);
    const disputeStatus = e.dispute_status || (e.status === 'disputed' ? 'open' : 'none');
    const syncedStatus = disputeStatus === 'open' ? 'disputed' : financialStatus;
    const allocationLedgerModes = [
        ...new Set(
            allocs
                .map((a) => a.contribution_ledger_mode || a.ledger_mode)
                .filter(Boolean)
        ),
    ];
    return {
        id: e.id,
        settlement_id: e.settlement_id,
        purpose: e.purpose,
        title: e.title,
        category: e.category,
        amount: core.formatKopecks(e.amount_kopecks),
        milestone_id: e.milestone_id,
        asset_name: e.asset_name,
        asset_location: e.asset_location,
        receipt_url: e.receipt_url,
        photo_url: e.photo_url,
        allocation_rule: e.allocation_rule,
        status: syncedStatus,
        financial_status: financialStatus,
        dispute_status: disputeStatus,
        version: Number(e.version || 1),
        paid_at: e.paid_at,
        created_at: e.created_at,
        allocation_ledger_modes: allocationLedgerModes,
        allocations: allocs.map((a) => ({
            id: a.id,
            contribution_id: a.contribution_id,
            amount: core.formatKopecks(a.amount_kopecks),
            allocation_rule: a.allocation_rule,
            financing_share_label: a.financing_share_label,
            legal_right_type: a.legal_right_type,
        })),
    };
}

function planExpenseTransition(ex, newStatus) {
    const finStatus = ex.financial_status || (ex.status === 'disputed' ? 'reserved' : ex.status);
    const dispStatus = ex.dispute_status || (ex.status === 'disputed' ? 'open' : 'none');
    const curStatus = dispStatus === 'open' ? 'disputed' : finStatus;

    if (newStatus === 'disputed') {
        if (curStatus === 'disputed') {
            const err = new Error('Expense is already in disputed status');
            err.status = 409;
            throw err;
        }
        return {
            nextFinancialStatus: finStatus,
            nextDisputeStatus: 'open',
            nextStatus: 'disputed',
            allocAction: 'none',
            postingType: 'dispute',
            postingNote: 'Расход переведён в спорный статус',
            setPaidAt: false,
        };
    }

    if (curStatus !== 'disputed') {
        if (newStatus === 'paid' && finStatus === 'reserved' && dispStatus !== 'open') {
            return {
                nextFinancialStatus: 'paid',
                nextDisputeStatus: dispStatus,
                nextStatus: 'paid',
                allocAction: 'pay',
                postingType: null,
                postingNote: null,
                setPaidAt: true,
            };
        }
        if (newStatus === 'cancelled' && finStatus === 'reserved' && dispStatus !== 'open') {
            return {
                nextFinancialStatus: 'cancelled',
                nextDisputeStatus: dispStatus,
                nextStatus: 'cancelled',
                allocAction: 'release',
                postingType: null,
                postingNote: null,
                setPaidAt: false,
            };
        }
        const err = new Error(`Переход расхода ${curStatus} -> ${newStatus} запрещён`);
        err.status = 409;
        throw err;
    }

    // curStatus === 'disputed'
    if (newStatus === 'paid') {
        if (finStatus === 'reserved') {
            return {
                nextFinancialStatus: 'paid',
                nextDisputeStatus: 'resolved',
                nextStatus: 'paid',
                allocAction: 'pay',
                postingType: 'resolve',
                postingNote: 'Спор разрешён в пользу оплаты расхода',
                setPaidAt: true,
            };
        }
        if (finStatus === 'paid') {
            return {
                nextFinancialStatus: 'paid',
                nextDisputeStatus: 'resolved',
                nextStatus: 'paid',
                allocAction: 'none',
                postingType: 'resolve',
                postingNote: 'Спор по оплаченному расходу закрыт без повторного списания',
                setPaidAt: false,
            };
        }
        const err = new Error('Cannot mark a cancelled expense as paid via dispute resolution');
        err.status = 409;
        throw err;
    }

    if (newStatus === 'cancelled') {
        if (finStatus === 'reserved') {
            return {
                nextFinancialStatus: 'cancelled',
                nextDisputeStatus: 'resolved',
                nextStatus: 'cancelled',
                allocAction: 'release',
                postingType: 'resolve',
                postingNote: 'Спор разрешён отменой расхода и возвратом резерва',
                setPaidAt: false,
            };
        }
        if (finStatus === 'cancelled') {
            return {
                nextFinancialStatus: 'cancelled',
                nextDisputeStatus: 'resolved',
                nextStatus: 'cancelled',
                allocAction: 'none',
                postingType: 'resolve',
                postingNote: 'Спор по отменённому расходу закрыт',
                setPaidAt: false,
            };
        }
        const err = new Error('Cannot cancel an already paid expense via dispute resolution');
        err.status = 409;
        throw err;
    }

    if (newStatus === 'reserved') {
        if (finStatus === 'reserved') {
            return {
                nextFinancialStatus: 'reserved',
                nextDisputeStatus: 'resolved',
                nextStatus: 'reserved',
                allocAction: 'none',
                postingType: 'resolve',
                postingNote: 'Спор снят, расход возвращён в статус резерва',
                setPaidAt: false,
            };
        }
        const err = new Error('Expense financial state is not reserved');
        err.status = 409;
        throw err;
    }

    const err = new Error(`Переход расхода ${curStatus} -> ${newStatus} запрещён`);
    err.status = 409;
    throw err;
}

async function transitionExpenseStatus(expenseId, newStatus, adminId, expectedVersion) {
    if (!['reserved', 'paid', 'cancelled', 'disputed'].includes(newStatus)) {
        const err = new Error('Недопустимый статус расхода');
        err.status = 400;
        throw err;
    }

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            await assertLedgerWriteGateOpen(client);
            const ex = (await client.query(`SELECT * FROM ledger_expenses WHERE id = $1 FOR UPDATE`, [expenseId])).rows[0];
            if (!ex) { const err = new Error('Расход не найден'); err.status = 404; throw err; }

            if (expectedVersion !== undefined && expectedVersion !== null) {
                if (!isPositiveInt(expectedVersion) || Number(expectedVersion) !== Number(ex.version || 1)) {
                    const err = new Error('Expense version conflict');
                    err.status = 409;
                    throw err;
                }
            }

            const plan = planExpenseTransition(ex, newStatus);
            const allocs = (await client.query(
                `SELECT * FROM expense_allocations WHERE expense_id = $1 ORDER BY contribution_id ASC`,
                [expenseId]
            )).rows;

            if (plan.allocAction === 'pay') {
                for (const a of allocs) {
                    const updC = await client.query(
                        `UPDATE contributions
                         SET reserved_kopecks = reserved_kopecks - $1,
                             paid_kopecks = paid_kopecks + $1,
                             status = CASE
                                 WHEN refunded_kopecks = received_kopecks THEN 'refunded'
                                 WHEN paid_kopecks + $1 = received_kopecks THEN 'allocated'
                                 WHEN reserved_kopecks - $1 > 0 AND paid_kopecks + $1 = 0 AND available_kopecks = 0 THEN 'reserved'
                                 WHEN paid_kopecks + $1 > 0 OR reserved_kopecks - $1 > 0 OR refunded_kopecks > 0 THEN 'partially_allocated'
                                 ELSE 'unallocated'
                             END
                         WHERE id = $2 AND reserved_kopecks >= $1`,
                        [a.amount_kopecks, a.contribution_id]
                    );
                    if (updC.rowCount !== 1) {
                        const err = new Error(`Insufficient reserved_kopecks on contribution ${a.contribution_id}`);
                        err.status = 409;
                        throw err;
                    }
                    await client.query(
                        `INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
                         VALUES ('pay', $1, $2, $3, $4, 'Подтверждение оплаты расхода')`,
                        [a.contribution_id, ex.id, a.amount_kopecks, adminId || null]
                    );
                }
            } else if (plan.allocAction === 'release') {
                for (const a of allocs) {
                    const updC = await client.query(
                        `UPDATE contributions
                         SET reserved_kopecks = reserved_kopecks - $1,
                             available_kopecks = available_kopecks + $1,
                             status = CASE
                                 WHEN refunded_kopecks = received_kopecks THEN 'refunded'
                                 WHEN paid_kopecks = received_kopecks THEN 'allocated'
                                 WHEN reserved_kopecks - $1 > 0 AND paid_kopecks = 0 AND available_kopecks + $1 = 0 THEN 'reserved'
                                 WHEN paid_kopecks > 0 OR reserved_kopecks - $1 > 0 OR refunded_kopecks > 0 THEN 'partially_allocated'
                                 ELSE 'unallocated'
                             END
                         WHERE id = $2 AND reserved_kopecks >= $1`,
                        [a.amount_kopecks, a.contribution_id]
                    );
                    if (updC.rowCount !== 1) {
                        const err = new Error(`Insufficient reserved_kopecks on contribution ${a.contribution_id}`);
                        err.status = 409;
                        throw err;
                    }
                    await client.query(
                        `INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
                         VALUES ('release', $1, $2, $3, $4, 'Освобождение резерва при отмене расхода')`,
                        [a.contribution_id, ex.id, a.amount_kopecks, adminId || null]
                    );
                }
            }

            if (plan.postingType) {
                await client.query(
                    `INSERT INTO ledger_postings (posting_type, expense_id, amount_kopecks, actor_admin_id, note)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [plan.postingType, ex.id, ex.amount_kopecks, adminId || null, plan.postingNote]
                );
            }

            const upd = (await client.query(
                `UPDATE ledger_expenses
                 SET status = $1,
                     financial_status = $2,
                     dispute_status = $3,
                     version = version + 1,
                     paid_at = CASE WHEN $4 THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END
                 WHERE id = $5 RETURNING *`,
                [plan.nextStatus, plan.nextFinancialStatus, plan.nextDisputeStatus, plan.setPaidAt, expenseId]
            )).rows[0];
            await client.query('COMMIT');
            return serializeExpense(upd, allocs);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    const ex = mem.expenses.find((e) => e.id === Number(expenseId));
    if (!ex) { const err = new Error('Расход не найден'); err.status = 404; throw err; }
    if (expectedVersion !== undefined && expectedVersion !== null) {
        if (!isPositiveInt(expectedVersion) || Number(expectedVersion) !== Number(ex.version || 1)) {
            const err = new Error('Expense version conflict');
            err.status = 409;
            throw err;
        }
    }

    const plan = planExpenseTransition(ex, newStatus);
    const allocs = mem.allocations
        .filter((a) => a.expense_id === ex.id)
        .sort((a, b) => a.contribution_id - b.contribution_id);

    if (plan.allocAction === 'pay') {
        for (const a of allocs) {
            const c = mem.contributions.find((x) => x.id === a.contribution_id);
            if (!c || c.reserved_kopecks < a.amount_kopecks) {
                const err = new Error(`Insufficient reserved_kopecks on contribution ${a.contribution_id}`);
                err.status = 409;
                throw err;
            }
            c.reserved_kopecks -= a.amount_kopecks;
            c.paid_kopecks += a.amount_kopecks;
            c.status = computeContributionStatus(c);
            mem.postings.push({
                id: mem.nextPostingId++,
                posting_type: 'pay',
                contribution_id: c.id,
                expense_id: ex.id,
                amount_kopecks: a.amount_kopecks,
                actor_admin_id: adminId || null,
                note: 'Подтверждение оплаты расхода',
                created_at: new Date().toISOString(),
            });
        }
    } else if (plan.allocAction === 'release') {
        for (const a of allocs) {
            const c = mem.contributions.find((x) => x.id === a.contribution_id);
            if (!c || c.reserved_kopecks < a.amount_kopecks) {
                const err = new Error(`Insufficient reserved_kopecks on contribution ${a.contribution_id}`);
                err.status = 409;
                throw err;
            }
            c.reserved_kopecks -= a.amount_kopecks;
            c.available_kopecks += a.amount_kopecks;
            c.status = computeContributionStatus(c);
            mem.postings.push({
                id: mem.nextPostingId++,
                posting_type: 'release',
                contribution_id: c.id,
                expense_id: ex.id,
                amount_kopecks: a.amount_kopecks,
                actor_admin_id: adminId || null,
                note: 'Освобождение резерва при отмене расхода',
                created_at: new Date().toISOString(),
            });
        }
    }

    if (plan.postingType) {
        mem.postings.push({
            id: mem.nextPostingId++,
            posting_type: plan.postingType,
            contribution_id: null,
            expense_id: ex.id,
            amount_kopecks: ex.amount_kopecks,
            actor_admin_id: adminId || null,
            note: plan.postingNote,
            created_at: new Date().toISOString(),
        });
    }

    ex.financial_status = plan.nextFinancialStatus;
    ex.dispute_status = plan.nextDisputeStatus;
    ex.status = plan.nextStatus;
    ex.version = Number(ex.version || 1) + 1;
    if (plan.setPaidAt && !ex.paid_at) {
        ex.paid_at = new Date().toISOString();
    }
    return serializeExpense(ex, allocs);
}

async function listAdminContributions({ settlement_id, ledger_mode, limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const scopedSettlement = settlement_id && settlement_id !== 'all' ? settlement_id : null;

    if (isPgMode()) {
        const clauses = [];
        const params = [];
        if (scopedSettlement) {
            params.push(scopedSettlement);
            clauses.push(`settlement_id = $${params.length}`);
        }
        if (ledger_mode) {
            params.push(ledger_mode);
            clauses.push(`ledger_mode = $${params.length}`);
        }
        const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const countRes = await dbRef.pool.query(
            `SELECT COUNT(*)::int AS total FROM contributions ${whereSql}`,
            params
        );
        const total = Number(countRes.rows[0]?.total || 0);
        const queryParams = [...params, safeLimit, safeOffset];
        const r = await dbRef.pool.query(
            `SELECT * FROM contributions ${whereSql} ORDER BY created_at DESC, id DESC LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
            queryParams
        );
        const contributions = r.rows.map(serializeContribution);
        return {
            contributions,
            total,
            has_more: safeOffset + contributions.length < total,
            limit: safeLimit,
            offset: safeOffset,
        };
    }

    const filteredAll = mem.contributions
        .filter((c) => (!scopedSettlement || c.settlement_id === scopedSettlement) && (!ledger_mode || c.ledger_mode === ledger_mode))
        .sort((a, b) => {
            const dt = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            return dt !== 0 ? dt : b.id - a.id;
        });
    const total = filteredAll.length;
    const contributions = filteredAll.slice(safeOffset, safeOffset + safeLimit).map(serializeContribution);
    return {
        contributions,
        total,
        has_more: safeOffset + contributions.length < total,
        limit: safeLimit,
        offset: safeOffset,
    };
}

async function listAdminExpenses({ settlement_id, status, financial_status, dispute_status, limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const scopedSettlement = settlement_id && settlement_id !== 'all' ? settlement_id : null;

    if (isPgMode()) {
        const clauses = [];
        const params = [];
        if (scopedSettlement) {
            params.push(scopedSettlement);
            clauses.push(`settlement_id = $${params.length}`);
        }
        if (status) {
            params.push(status);
            clauses.push(`status = $${params.length}`);
        }
        if (financial_status) {
            params.push(financial_status);
            clauses.push(`financial_status = $${params.length}`);
        }
        if (dispute_status) {
            params.push(dispute_status);
            clauses.push(`dispute_status = $${params.length}`);
        }
        const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const countRes = await dbRef.pool.query(
            `SELECT COUNT(*)::int AS total FROM ledger_expenses ${whereSql}`,
            params
        );
        const total = Number(countRes.rows[0]?.total || 0);
        const queryParams = [...params, safeLimit, safeOffset];
        const rows = (await dbRef.pool.query(
            `SELECT * FROM ledger_expenses ${whereSql} ORDER BY created_at DESC, id DESC LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
            queryParams
        )).rows;
        const ids = rows.map((e) => e.id);
        const allocs = ids.length
            ? (await dbRef.pool.query(
                `SELECT ea.*, c.ledger_mode AS contribution_ledger_mode
                 FROM expense_allocations ea
                 LEFT JOIN contributions c ON c.id = ea.contribution_id
                 WHERE ea.expense_id = ANY($1)
                 ORDER BY ea.contribution_id ASC`,
                [ids]
            )).rows
            : [];
        const expenses = rows.map((e) => serializeExpense(e, allocs.filter((a) => Number(a.expense_id) === Number(e.id))));
        return {
            expenses,
            total,
            has_more: safeOffset + expenses.length < total,
            limit: safeLimit,
            offset: safeOffset,
        };
    }

    const filteredAll = mem.expenses
        .filter((e) => {
            const eFin = e.financial_status || (e.status === 'disputed' ? 'reserved' : e.status);
            const eDisp = e.dispute_status || (e.status === 'disputed' ? 'open' : 'none');
            return (
                (!scopedSettlement || e.settlement_id === scopedSettlement)
                && (!status || e.status === status)
                && (!financial_status || eFin === financial_status)
                && (!dispute_status || eDisp === dispute_status)
            );
        })
        .sort((a, b) => {
            const dt = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            return dt !== 0 ? dt : b.id - a.id;
        });
    const total = filteredAll.length;
    const expenses = filteredAll.slice(safeOffset, safeOffset + safeLimit).map((e) => {
        const allocs = mem.allocations
            .filter((a) => a.expense_id === e.id)
            .sort((a, b) => a.contribution_id - b.contribution_id)
            .map((a) => ({
                ...a,
                contribution_ledger_mode: mem.contributions.find((c) => c.id === a.contribution_id)?.ledger_mode || null,
            }));
        return serializeExpense(e, allocs);
    });
    return {
        expenses,
        total,
        has_more: safeOffset + expenses.length < total,
        limit: safeLimit,
        offset: safeOffset,
    };
}

async function getAdminExpenseById(expenseId) {
    const eid = Number(expenseId);
    if (!Number.isInteger(eid) || eid <= 0) return null;

    if (isPgMode()) {
        const row = (await dbRef.pool.query(`SELECT * FROM ledger_expenses WHERE id = $1`, [eid])).rows[0];
        if (!row) return null;
        const allocs = (await dbRef.pool.query(
            `SELECT ea.*, c.ledger_mode AS contribution_ledger_mode
             FROM expense_allocations ea
             LEFT JOIN contributions c ON c.id = ea.contribution_id
             WHERE ea.expense_id = $1
             ORDER BY ea.contribution_id ASC`,
            [eid]
        )).rows;
        return serializeExpense(row, allocs);
    }

    const row = mem.expenses.find((e) => e.id === eid);
    if (!row) return null;
    const allocs = mem.allocations
        .filter((a) => a.expense_id === row.id)
        .sort((a, b) => a.contribution_id - b.contribution_id)
        .map((a) => ({
            ...a,
            contribution_ledger_mode: mem.contributions.find((c) => c.id === a.contribution_id)?.ledger_mode || null,
        }));
    return serializeExpense(row, allocs);
}

function emptyModeTotals() {
    return {
        received: core.formatKopecks(0n),
        available: core.formatKopecks(0n),
        reserved: core.formatKopecks(0n),
        paid: core.formatKopecks(0n),
        refunded: core.formatKopecks(0n),
        contributions_count: 0,
    };
}

async function getAdminLedgerSummary(settlementId = 'all') {
    const isAll = !settlementId || settlementId === 'all';
    const byMode = {
        verified_receipt: emptyModeTotals(),
        pledge: emptyModeTotals(),
        legacy_import: emptyModeTotals(),
    };

    if (isPgMode()) {
        const modeRows = (await dbRef.pool.query(
            `SELECT ledger_mode,
                    COALESCE(SUM(received_kopecks),0)::bigint AS received,
                    COALESCE(SUM(available_kopecks),0)::bigint AS available,
                    COALESCE(SUM(reserved_kopecks),0)::bigint AS reserved,
                    COALESCE(SUM(paid_kopecks),0)::bigint AS paid,
                    COALESCE(SUM(refunded_kopecks),0)::bigint AS refunded,
                    COUNT(*)::int AS contributions_count
             FROM contributions
             ${isAll ? '' : 'WHERE settlement_id = $1'}
             GROUP BY ledger_mode`,
            isAll ? [] : [settlementId]
        )).rows;

        for (const r of modeRows) {
            if (!byMode[r.ledger_mode]) {
                byMode[r.ledger_mode] = emptyModeTotals();
            }
            byMode[r.ledger_mode] = {
                received: core.formatKopecks(r.received),
                available: core.formatKopecks(r.available),
                reserved: core.formatKopecks(r.reserved),
                paid: core.formatKopecks(r.paid),
                refunded: core.formatKopecks(r.refunded),
                contributions_count: Number(r.contributions_count || 0),
            };
        }

        const settlementRows = (await dbRef.pool.query(`
            SELECT DISTINCT settlement_id FROM (
                SELECT settlement_id FROM contributions
                UNION
                SELECT settlement_id FROM ledger_expenses
                UNION
                SELECT settlement_id FROM construction_milestones
            ) s
            WHERE settlement_id IS NOT NULL AND settlement_id <> ''
            ORDER BY settlement_id ASC
        `)).rows;
        const settlements = settlementRows.map((r) => r.settlement_id);

        const milestones = isAll
            ? (await dbRef.pool.query(
                `SELECT m.*,
                        COALESCE((
                            SELECT SUM(le.amount_kopecks)
                            FROM ledger_expenses le
                            WHERE le.milestone_id = m.id
                              AND le.settlement_id = m.settlement_id
                              AND le.financial_status = 'paid'
                        ), 0)::bigint AS spent_kopecks
                 FROM construction_milestones m
                 ORDER BY m.settlement_id ASC, m.id ASC`
            )).rows.map((m) => serializeMilestone(m, m.spent_kopecks))
            : await listConstructionMilestones(settlementId);

        const recentExpensesRows = (await dbRef.pool.query(
            `SELECT * FROM ledger_expenses
             ${isAll ? '' : 'WHERE settlement_id = $1'}
             ORDER BY created_at DESC, id DESC
             LIMIT 20`,
            isAll ? [] : [settlementId]
        )).rows;
        const recentIds = recentExpensesRows.map((e) => e.id);
        const recentAllocs = recentIds.length
            ? (await dbRef.pool.query(
                `SELECT ea.*, c.ledger_mode AS contribution_ledger_mode
                 FROM expense_allocations ea
                 LEFT JOIN contributions c ON c.id = ea.contribution_id
                 WHERE ea.expense_id = ANY($1)
                 ORDER BY ea.contribution_id ASC`,
                [recentIds]
            )).rows
            : [];
        const recentExpenses = recentExpensesRows.map((e) =>
            serializeExpense(e, recentAllocs.filter((a) => Number(a.expense_id) === Number(e.id)))
        );

        return {
            settlement_id: isAll ? 'all' : settlementId,
            totals: byMode.verified_receipt,
            by_ledger_mode: byMode,
            settlements,
            milestones,
            recent_expenses: recentExpenses,
        };
    }

    seedDefaultMilestonesMem();
    const acc = {
        verified_receipt: { received: 0n, available: 0n, reserved: 0n, paid: 0n, refunded: 0n, count: 0 },
        pledge: { received: 0n, available: 0n, reserved: 0n, paid: 0n, refunded: 0n, count: 0 },
        legacy_import: { received: 0n, available: 0n, reserved: 0n, paid: 0n, refunded: 0n, count: 0 },
    };
    for (const c of mem.contributions) {
        if (!isAll && c.settlement_id !== settlementId) continue;
        const mode = c.ledger_mode || 'verified_receipt';
        if (!acc[mode]) {
            acc[mode] = { received: 0n, available: 0n, reserved: 0n, paid: 0n, refunded: 0n, count: 0 };
        }
        acc[mode].received += BigInt(c.received_kopecks);
        acc[mode].available += BigInt(c.available_kopecks);
        acc[mode].reserved += BigInt(c.reserved_kopecks);
        acc[mode].paid += BigInt(c.paid_kopecks);
        acc[mode].refunded += BigInt(c.refunded_kopecks);
        acc[mode].count += 1;
    }
    for (const [mode, v] of Object.entries(acc)) {
        byMode[mode] = {
            received: core.formatKopecks(v.received),
            available: core.formatKopecks(v.available),
            reserved: core.formatKopecks(v.reserved),
            paid: core.formatKopecks(v.paid),
            refunded: core.formatKopecks(v.refunded),
            contributions_count: v.count,
        };
    }

    const settlements = [
        ...new Set([
            ...mem.contributions.map((c) => c.settlement_id),
            ...mem.expenses.map((e) => e.settlement_id),
            ...mem.milestones.map((m) => m.settlement_id),
        ].filter(Boolean)),
    ].sort();

    const milestones = isAll
        ? mem.milestones.map((m) => {
            const spent = mem.expenses
                .filter((e) => e.milestone_id === m.id && e.settlement_id === m.settlement_id && e.financial_status === 'paid')
                .reduce((sum, e) => sum + BigInt(e.amount_kopecks), 0n);
            return serializeMilestone(m, spent);
        })
        : await listConstructionMilestones(settlementId);

    const recentExpenses = mem.expenses
        .filter((e) => isAll || e.settlement_id === settlementId)
        .sort((a, b) => {
            const dt = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            return dt !== 0 ? dt : b.id - a.id;
        })
        .slice(0, 20)
        .map((e) => {
            const allocs = mem.allocations
                .filter((a) => a.expense_id === e.id)
                .sort((a, b) => a.contribution_id - b.contribution_id)
                .map((a) => ({
                    ...a,
                    contribution_ledger_mode: mem.contributions.find((c) => c.id === a.contribution_id)?.ledger_mode || null,
                }));
            return serializeExpense(e, allocs);
        });

    return {
        settlement_id: isAll ? 'all' : settlementId,
        totals: byMode.verified_receipt,
        by_ledger_mode: byMode,
        settlements,
        milestones,
        recent_expenses: recentExpenses,
    };
}

async function getMyLedger(userId) {
    if (isPgMode()) {
        const contribs = (await dbRef.pool.query(
            `SELECT * FROM contributions WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        )).rows;
        const cIds = contribs.map((c) => c.id);
        const allocs = cIds.length
            ? (await dbRef.pool.query(
                `SELECT ea.*, le.title AS expense_title, le.category AS expense_category, le.amount_kopecks AS expense_amount_kopecks,
                        le.asset_name, le.asset_location, le.receipt_url, le.photo_url, le.status AS expense_status, le.paid_at
                 FROM expense_allocations ea
                 JOIN ledger_expenses le ON le.id = ea.expense_id
                 WHERE ea.contribution_id = ANY($1)
                 ORDER BY ea.created_at DESC`,
                [cIds]
            )).rows
            : [];
        return buildMyLedgerResponse(contribs, allocs);
    }

    const contribs = mem.contributions.filter((c) => c.user_id === Number(userId)).reverse();
    const cIds = new Set(contribs.map((c) => c.id));
    const allocs = mem.allocations
        .filter((a) => cIds.has(a.contribution_id))
        .map((a) => {
            const le = mem.expenses.find((e) => e.id === a.expense_id);
            return {
                ...a,
                expense_title: le?.title,
                expense_category: le?.category,
                expense_amount_kopecks: le?.amount_kopecks,
                asset_name: le?.asset_name,
                asset_location: le?.asset_location,
                receipt_url: le?.receipt_url,
                photo_url: le?.photo_url,
                expense_status: le?.status,
                paid_at: le?.paid_at,
            };
        });
    return buildMyLedgerResponse(contribs, allocs);
}

function buildMyLedgerResponse(contribs, allocs) {
    let totalReceived = 0n;
    let totalAvailable = 0n;
    let totalReserved = 0n;
    let totalPaid = 0n;
    let totalRefunded = 0n;

    const items = contribs.map((c) => {
        if (c.ledger_mode === 'verified_receipt') {
            totalReceived += BigInt(c.received_kopecks);
            totalAvailable += BigInt(c.available_kopecks);
            totalReserved += BigInt(c.reserved_kopecks);
            totalPaid += BigInt(c.paid_kopecks);
            totalRefunded += BigInt(c.refunded_kopecks);
        }

        const linked = allocs
            .filter((a) => Number(a.contribution_id) === Number(c.id))
            .map((a) => ({
                allocation_id: a.id,
                expense_id: a.expense_id,
                expense_title: a.expense_title,
                expense_category: a.expense_category,
                expense_total: core.formatKopecks(a.expense_amount_kopecks || 0),
                allocated: core.formatKopecks(a.amount_kopecks),
                allocation_rule: a.allocation_rule,
                financing_share_label: a.financing_share_label,
                legal_right_type: a.legal_right_type,
                asset_name: a.asset_name,
                asset_location: a.asset_location,
                receipt_url: a.receipt_url,
                photo_url: a.photo_url,
                expense_status: a.expense_status,
                paid_at: a.paid_at,
            }));

        return {
            ...serializeContribution(c),
            allocations: linked,
        };
    });

    return {
        totals: {
            received: core.formatKopecks(totalReceived),
            available: core.formatKopecks(totalAvailable),
            reserved: core.formatKopecks(totalReserved),
            paid: core.formatKopecks(totalPaid),
            refunded: core.formatKopecks(totalRefunded),
        },
        contributions: items,
    };
}

async function getPublicLedgerSummary(settlementId = DEFAULT_SETTLEMENT) {
    if (isPgMode()) {
        const totalsRes = await dbRef.pool.query(
            `SELECT COALESCE(SUM(received_kopecks),0)::bigint AS received,
                    COALESCE(SUM(available_kopecks),0)::bigint AS available,
                    COALESCE(SUM(reserved_kopecks),0)::bigint AS reserved,
                    COALESCE(SUM(paid_kopecks),0)::bigint AS paid,
                    COALESCE(SUM(refunded_kopecks),0)::bigint AS refunded,
                    COUNT(*)::int AS contributions_count
             FROM contributions WHERE settlement_id = $1 AND ledger_mode = 'verified_receipt'`,
            [settlementId]
        );
        const t = totalsRes.rows[0];
        const milestones = await listConstructionMilestones(settlementId);
        // Public anonymized expenses (no contributor PII!)
        const recentExpenses = (await dbRef.pool.query(
            `SELECT id, title, category, amount_kopecks, asset_name, asset_location, photo_url, status, financial_status, dispute_status, paid_at, created_at
             FROM ledger_expenses WHERE settlement_id = $1 AND status IN ('reserved', 'paid', 'disputed')
             ORDER BY created_at DESC LIMIT 20`,
            [settlementId]
        )).rows.map((e) => ({
            id: e.id,
            title: e.title,
            category: e.category,
            amount: core.formatKopecks(e.amount_kopecks),
            asset_name: e.asset_name,
            asset_location: e.asset_location,
            photo_url: e.photo_url,
            status: e.status,
            financial_status: e.financial_status,
            dispute_status: e.dispute_status,
            paid_at: e.paid_at,
        }));
        return {
            settlement_id: settlementId,
            totals: {
                received: core.formatKopecks(t.received),
                available: core.formatKopecks(t.available),
                reserved: core.formatKopecks(t.reserved),
                paid: core.formatKopecks(t.paid),
                refunded: core.formatKopecks(t.refunded),
                contributions_count: t.contributions_count,
            },
            milestones,
            recent_expenses: recentExpenses,
        };
    }

    const filtered = mem.contributions.filter((c) => c.settlement_id === settlementId && c.ledger_mode === 'verified_receipt');
    let received = 0n, available = 0n, reserved = 0n, paid = 0n, refunded = 0n;
    for (const c of filtered) {
        received += c.received_kopecks;
        available += c.available_kopecks;
        reserved += c.reserved_kopecks;
        paid += c.paid_kopecks;
        refunded += c.refunded_kopecks;
    }
    const milestones = await listConstructionMilestones(settlementId);
    const recentExpenses = mem.expenses
        .filter((e) => e.settlement_id === settlementId && ['reserved', 'paid', 'disputed'].includes(e.status))
        .slice(-20)
        .reverse()
        .map((e) => ({
            id: e.id,
            title: e.title,
            category: e.category,
            amount: core.formatKopecks(e.amount_kopecks),
            asset_name: e.asset_name,
            asset_location: e.asset_location,
            photo_url: e.photo_url,
            status: e.status,
            financial_status: e.financial_status || (e.status === 'disputed' ? 'reserved' : e.status),
            dispute_status: e.dispute_status || (e.status === 'disputed' ? 'open' : 'none'),
            paid_at: e.paid_at,
        }));

    return {
        settlement_id: settlementId,
        totals: {
            received: core.formatKopecks(received),
            available: core.formatKopecks(available),
            reserved: core.formatKopecks(reserved),
            paid: core.formatKopecks(paid),
            refunded: core.formatKopecks(refunded),
            contributions_count: filtered.length,
        },
        milestones,
        recent_expenses: recentExpenses,
    };
}

function serializeMilestone(m, spentKopecks) {
    const spent = BigInt(spentKopecks ?? 0);
    return {
        id: m.id,
        settlement_id: m.settlement_id,
        code: m.code,
        title: m.title,
        category: m.category,
        unit: m.unit,
        planned_qty: Number(m.planned_qty),
        actual_qty: Number(m.actual_qty),
        budget: core.formatKopecks(m.budget_kopecks),
        spent: core.formatKopecks(spent),
        status: m.status,
        data_classification: (spent === 0n && Number(m.actual_qty || 0) === 0) ? 'plan_baseline' : 'recorded_progress',
        photo_url: m.photo_url || null,
        updated_at: m.updated_at,
    };
}

async function listConstructionMilestones(settlementId = DEFAULT_SETTLEMENT) {
    if (isPgMode()) {
        const rows = (await dbRef.pool.query(
            `SELECT m.*,
                    COALESCE((
                        SELECT SUM(le.amount_kopecks)
                        FROM ledger_expenses le
                        WHERE le.milestone_id = m.id
                          AND le.settlement_id = m.settlement_id
                          AND le.financial_status = 'paid'
                    ), 0)::bigint AS spent_kopecks
             FROM construction_milestones m
             WHERE m.settlement_id = $1
             ORDER BY m.id ASC`,
            [settlementId]
        )).rows;
        return rows.map((m) => serializeMilestone(m, m.spent_kopecks));
    }

    seedDefaultMilestonesMem();
    return mem.milestones
        .filter((m) => m.settlement_id === settlementId)
        .map((m) => {
            const spent = mem.expenses
                .filter((e) => e.milestone_id === m.id && e.settlement_id === m.settlement_id && e.financial_status === 'paid')
                .reduce((acc, e) => acc + BigInt(e.amount_kopecks), 0n);
            return serializeMilestone(m, spent);
        });
}

async function upsertConstructionMilestone(data) {
    const validStatuses = ['planned', 'in_progress', 'completed', 'delayed'];
    const status = (data.status === undefined || data.status === null) ? 'planned' : data.status;
    if (!validStatuses.includes(status)) {
        const err = new Error('Недопустимый статус этапа стройки (planned | in_progress | completed | delayed)');
        err.status = 400;
        throw err;
    }

    const plannedQty = data.planned_qty !== undefined && data.planned_qty !== null ? Number(data.planned_qty) : 0;
    const actualQty = data.actual_qty !== undefined && data.actual_qty !== null ? Number(data.actual_qty) : 0;
    if (!Number.isFinite(plannedQty) || plannedQty < 0 || !Number.isFinite(actualQty) || actualQty < 0) {
        const err = new Error('planned_qty и actual_qty должны быть конечными неотрицательными числами');
        err.status = 400;
        throw err;
    }

    const budgetBi = parseKopecks400(data.budget_kopecks ?? 0, 'budget_kopecks');
    if (budgetBi < 0n) {
        const err = new Error('budget_kopecks должен быть неотрицательным');
        err.status = 400;
        throw err;
    }

    const settlementId = data.settlement_id || DEFAULT_SETTLEMENT;
    if (isPgMode()) {
        const r = await dbRef.pool.query(
            `INSERT INTO construction_milestones (settlement_id, code, title, category, unit, planned_qty, actual_qty, budget_kopecks, status, photo_url, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
             ON CONFLICT (settlement_id, code) DO UPDATE SET
                 title = EXCLUDED.title, planned_qty = EXCLUDED.planned_qty, actual_qty = EXCLUDED.actual_qty,
                 budget_kopecks = EXCLUDED.budget_kopecks, status = EXCLUDED.status, photo_url = EXCLUDED.photo_url,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [
                settlementId, data.code, data.title, data.category || 'infrastructure',
                data.unit || 'шт.', plannedQty, actualQty, budgetBi.toString(),
                status, data.photo_url || null,
            ]
        );
        const row = r.rows[0];
        const spentRes = await dbRef.pool.query(
            `SELECT COALESCE(SUM(amount_kopecks), 0)::bigint AS spent_kopecks
             FROM ledger_expenses
             WHERE milestone_id = $1 AND settlement_id = $2 AND financial_status = 'paid'`,
            [row.id, settlementId]
        );
        return serializeMilestone(row, spentRes.rows[0].spent_kopecks);
    }

    seedDefaultMilestonesMem();
    let m = mem.milestones.find((x) => x.settlement_id === settlementId && x.code === data.code);
    if (m) {
        Object.assign(m, {
            title: data.title ?? m.title,
            planned_qty: data.planned_qty !== undefined ? plannedQty : m.planned_qty,
            actual_qty: data.actual_qty !== undefined ? actualQty : m.actual_qty,
            budget_kopecks: data.budget_kopecks !== undefined ? budgetBi : m.budget_kopecks,
            status: data.status !== undefined ? status : m.status,
            photo_url: data.photo_url !== undefined ? data.photo_url : m.photo_url,
            updated_at: new Date().toISOString(),
        });
    } else {
        m = {
            id: mem.nextMilestoneId++,
            settlement_id: settlementId,
            code: data.code,
            title: data.title,
            category: data.category || 'infrastructure',
            unit: data.unit || 'шт.',
            planned_qty: plannedQty,
            actual_qty: actualQty,
            budget_kopecks: budgetBi,
            status,
            photo_url: data.photo_url || null,
            updated_at: new Date().toISOString(),
        };
        mem.milestones.push(m);
    }
    const spent = mem.expenses
        .filter((e) => e.milestone_id === m.id && e.settlement_id === settlementId && e.financial_status === 'paid')
        .reduce((acc, e) => acc + BigInt(e.amount_kopecks), 0n);
    return serializeMilestone(m, spent);
}

module.exports = {
    setDb,
    ensureCoreSchema,
    upsertUserRecord,
    getUserMembership,
    setUserMembership,
    createApplication,
    claimGuestApplication,
    getMyApplication,
    addPortfolioItem,
    resubmitApplication,
    listApplications,
    reviewApplication,
    createProposal,
    openProposal,
    castGovernanceBallot,
    closeProposal,
    listProposals,
    getProposalDetail,
    exportProposalRoster,
    reconcileProposalExternal,
    listCouncilDelegations,
    recordContribution,
    createAndAllocateExpense,
    transitionExpenseStatus,
    listAdminContributions,
    listAdminExpenses,
    getAdminExpenseById,
    getAdminLedgerSummary,
    revalidateLedgerIntegrity,
    getLedgerPreflightReport,
    getMyLedger,
    getPublicLedgerSummary,
    listConstructionMilestones,
    upsertConstructionMilestone,
};
