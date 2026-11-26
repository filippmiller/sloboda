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

let dbRef = null;

function isPgMode() {
    return Boolean(dbRef && dbRef.pool && typeof dbRef.pool.connect === 'function' && process.env.TEST_NO_DB !== 'true');
}

// In-memory store used when TEST_NO_DB=true
const mem = {
    users: new Map(), // userId -> { id, email, name, membership_status, membership_admitted_at, settlement_id }
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
    if (mem.milestones.length > 0) return;
    const defaults = [
        { code: 'EARTHWORKS_PITS', title: 'Котлованы под первую очередь', category: 'earthworks', unit: 'шт.', planned_qty: 20, actual_qty: 0, budget_kopecks: 200000000n, status: 'planned' },
        { code: 'SCREW_PILES', title: 'Винтовые сваи (установлено)', category: 'piles', unit: 'шт.', planned_qty: 240, actual_qty: 0, budget_kopecks: 180000000n, status: 'planned' },
        { code: 'HOUSE_KITS', title: 'Домокомплекты первой очереди', category: 'house_kits', unit: 'комплект', planned_qty: 20, actual_qty: 0, budget_kopecks: 1500000000n, status: 'planned' },
        { code: 'FOAM_PLANT', title: 'Мобильный завод пенобетона', category: 'foam_plant', unit: 'комплекс', planned_qty: 1, actual_qty: 0, budget_kopecks: 450000000n, status: 'planned' },
        { code: 'START_EQUIPMENT', title: 'Стартовый инструмент и техника', category: 'equipment', unit: 'ед.', planned_qty: 15, actual_qty: 0, budget_kopecks: 150000000n, status: 'in_progress' },
    ];
    for (const d of defaults) {
        mem.milestones.push({
            id: mem.nextMilestoneId++,
            settlement_id: 'sloboda-pilot',
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
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const client = await dbRef.pool.connect();
    try {
        await client.query(sql);
        const mCount = await client.query('SELECT COUNT(*)::int AS n FROM construction_milestones');
        if (mCount.rows[0].n === 0) {
            await client.query(`
                INSERT INTO construction_milestones (code, title, category, unit, planned_qty, actual_qty, budget_kopecks, status)
                VALUES
                    ('EARTHWORKS_PITS', 'Котлованы под первую очередь', 'earthworks', 'шт.', 20, 0, 200000000, 'planned'),
                    ('SCREW_PILES', 'Винтовые сваи (установлено)', 'piles', 'шт.', 240, 0, 180000000, 'planned'),
                    ('HOUSE_KITS', 'Домокомплекты первой очереди', 'house_kits', 'комплект', 20, 0, 1500000000, 'planned'),
                    ('FOAM_PLANT', 'Мобильный завод пенобетона', 'foam_plant', 'комплекс', 1, 0, 450000000, 'planned'),
                    ('START_EQUIPMENT', 'Стартовый инструмент и техника', 'equipment', 'ед.', 15, 0, 150000000, 'in_progress')
                ON CONFLICT (code) DO NOTHING
            `);
        }
    } finally {
        client.release();
    }
}

// ============================================
// USER MEMBERSHIP HELPERS
// ============================================

async function upsertUserRecord({ id, email, name, membership_status = 'observer', settlement_id = 'sloboda-pilot' }) {
    if (isPgMode()) {
        if (id) {
            const r = await dbRef.pool.query(
                `SELECT id, email, name, membership_status, membership_admitted_at, settlement_id FROM users WHERE id = $1`,
                [id]
            );
            if (r.rows[0]) return r.rows[0];
        }
        const r = await dbRef.pool.query(
            `SELECT id, email, name, membership_status, membership_admitted_at, settlement_id FROM users WHERE LOWER(email) = LOWER($1)`,
            [email]
        );
        return r.rows[0] || null;
    }
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
        membership_status,
        membership_admitted_at: membership_status === 'accepted' ? new Date().toISOString() : null,
        settlement_id,
    };
    mem.users.set(uid, user);
    return { ...user };
}

async function getUserMembership(userId) {
    if (isPgMode()) {
        const r = await dbRef.pool.query(
            `SELECT id, email, name, membership_status, membership_admitted_at, settlement_id FROM users WHERE id = $1`,
            [userId]
        );
        return r.rows[0] || null;
    }
    const u = mem.users.get(Number(userId));
    return u ? { ...u } : null;
}

async function setUserMembership(userId, status, settlementId = 'sloboda-pilot') {
    const admittedAt = status === 'accepted' ? new Date().toISOString() : null;
    if (isPgMode()) {
        const r = await dbRef.pool.query(
            `UPDATE users
             SET membership_status = $2,
                 membership_admitted_at = CASE WHEN $2 = 'accepted' THEN COALESCE(membership_admitted_at, CURRENT_TIMESTAMP) ELSE membership_admitted_at END,
                 settlement_id = COALESCE($3, settlement_id)
             WHERE id = $1
             RETURNING id, email, name, membership_status, membership_admitted_at, settlement_id`,
            [userId, status, settlementId]
        );
        return r.rows[0] || null;
    }
    let u = mem.users.get(Number(userId));
    if (!u) {
        u = {
            id: Number(userId),
            email: `user${userId}@sloboda.local`,
            name: `Участник #${userId}`,
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

// ============================================
// APPLICATIONS & PORTFOLIO
// ============================================

async function createApplication(data) {
    const settlementId = data.settlement_id || 'sloboda-pilot';
    const claimToken = data.user_id ? null : crypto.randomBytes(24).toString('hex');
    const claimTokenHash = claimToken ? core.sha256Hex(claimToken) : null;

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            if (data.user_id) {
                const existing = await client.query(
                    `SELECT id FROM member_applications
                     WHERE user_id = $1 AND settlement_id = $2 AND status IN ('pending', 'in_review', 'accepted')`,
                    [data.user_id, settlementId]
                );
                if (existing.rows.length > 0) {
                    const err = new Error('У вас уже есть активная или одобренная заявка в этом поселении');
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
            return { application: appRow, portfolio: items, claim_token: claimToken };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    if (data.user_id) {
        const dup = mem.applications.find(
            (a) => a.user_id === Number(data.user_id) && a.settlement_id === settlementId && ['pending', 'in_review', 'accepted'].includes(a.status)
        );
        if (dup) {
            const err = new Error('У вас уже есть активная или одобренная заявка в этом поселении');
            err.status = 409;
            throw err;
        }
        const u = await upsertUserRecord({ id: data.user_id, email: data.email, name: data.full_name, settlement_id: settlementId });
        if (u.membership_status === 'observer') {
            await setUserMembership(u.id, 'applicant', settlementId);
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
    return { application: { ...appRow, claim_token_hash: undefined }, portfolio: items, claim_token: claimToken };
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
            const upd = await client.query(
                `UPDATE member_applications SET user_id = $1, claim_token_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
                [userId, appRow.id]
            );
            await client.query(`UPDATE portfolio_items SET user_id = $1 WHERE application_id = $2`, [userId, appRow.id]);
            await client.query('COMMIT');
            return upd.rows[0];
        } catch (err) {
            await client.query('ROLLBACK');
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
    appRow.user_id = Number(userId);
    appRow.claim_token_used_at = new Date().toISOString();
    appRow.updated_at = new Date().toISOString();
    mem.portfolio.filter((p) => p.application_id === appRow.id).forEach((p) => { p.user_id = Number(userId); });
    return { ...appRow, claim_token_hash: undefined };
}

async function getMyApplication(userId) {
    if (isPgMode()) {
        const appRes = await dbRef.pool.query(
            `SELECT id, user_id, settlement_id, full_name, email, city, primary_domain, skills, motivation,
                    trial_task_title, trial_task_url, status, version, review_note, reviewed_at, created_at, updated_at
             FROM member_applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );
        const appRow = appRes.rows[0] || null;
        const portfolio = appRow
            ? (await dbRef.pool.query(`SELECT * FROM portfolio_items WHERE application_id = $1 ORDER BY created_at DESC`, [appRow.id])).rows
            : [];
        const membership = await getUserMembership(userId);
        return { application: appRow, portfolio, membership };
    }
    const appRow = [...mem.applications].reverse().find((a) => a.user_id === Number(userId)) || null;
    const portfolio = appRow ? mem.portfolio.filter((p) => p.application_id === appRow.id) : [];
    const membership = await getUserMembership(userId);
    return { application: appRow ? { ...appRow, claim_token_hash: undefined } : null, portfolio, membership };
}

async function addPortfolioItem(userId, item) {
    const my = await getMyApplication(userId);
    if (!my.application) {
        const err = new Error('Сначала подайте заявку участника');
        err.status = 400;
        throw err;
    }
    if (isPgMode()) {
        const r = await dbRef.pool.query(
            `INSERT INTO portfolio_items (user_id, application_id, title, domain_code, summary, artifact_url)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [userId, my.application.id, item.title, item.domain_code || my.application.primary_domain, item.summary || null, item.artifact_url || null]
        );
        return r.rows[0];
    }
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
    return { ...row };
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
            ...a,
            claim_token_hash: undefined,
            portfolio: pRes.rows.filter((p) => p.application_id === a.id),
        }));
    }
    const rows = statusFilter ? mem.applications.filter((a) => a.status === statusFilter) : mem.applications;
    return [...rows].reverse().map((a) => ({
        ...a,
        claim_token_hash: undefined,
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
            if (expectedVersion !== undefined && Number(expectedVersion) !== Number(appRow.version)) {
                const err = new Error('Конфликт версий: заявка уже была обновлена другим рецензентом');
                err.status = 409;
                throw err;
            }
            if (status === 'accepted' && !appRow.user_id) {
                const err = new Error('Нельзя принять гостевую заявку без привязанного аккаунта (user_id). Участник должен привязать заявку по claim_token.');
                err.status = 409;
                throw err;
            }
            const upd = await client.query(
                `UPDATE member_applications
                 SET status = $1, review_note = $2, reviewer_id = $3, reviewed_at = CURRENT_TIMESTAMP,
                     version = version + 1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4 RETURNING *`,
                [status, reviewNote || null, reviewerId || null, applicationId]
            );
            if (status === 'accepted' && appRow.user_id) {
                await client.query(
                    `UPDATE users
                     SET membership_status = 'accepted',
                         membership_admitted_at = COALESCE(membership_admitted_at, CURRENT_TIMESTAMP),
                         settlement_id = $2
                     WHERE id = $1`,
                    [appRow.user_id, appRow.settlement_id]
                );
            }
            await client.query('COMMIT');
            return { ...upd.rows[0], claim_token_hash: undefined };
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
    if (expectedVersion !== undefined && Number(expectedVersion) !== Number(appRow.version)) {
        const err = new Error('Конфликт версий: заявка уже была обновлена другим рецензентом');
        err.status = 409;
        throw err;
    }
    if (status === 'accepted' && !appRow.user_id) {
        const err = new Error('Нельзя принять гостевую заявку без привязанного аккаунта (user_id). Участник должен привязать заявку по claim_token.');
        err.status = 409;
        throw err;
    }
    appRow.status = status;
    appRow.review_note = reviewNote || null;
    appRow.reviewer_id = reviewerId || null;
    appRow.reviewed_at = new Date().toISOString();
    appRow.version += 1;
    appRow.updated_at = new Date().toISOString();

    if (status === 'accepted' && appRow.user_id) {
        await setUserMembership(appRow.user_id, 'accepted', appRow.settlement_id);
    }
    return { ...appRow, claim_token_hash: undefined };
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

    const secretBallot = data.secret_ballot !== undefined
        ? Boolean(data.secret_ballot)
        : data.vote_type === 'council_election';
    const engine = data.authoritative_engine || (secretBallot ? 'native_secret' : 'native_named');

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
                data.settlement_id || 'sloboda-pilot', engine, secretBallot,
                data.share_class || null, data.terms_version || 'v1', data.seats_count || 1,
                JSON.stringify(data.options), data.abstain_option_index ?? null,
                data.quorum_members_pct ?? 50, data.quorum_capital_pct ?? 50,
                data.external_election_fingerprint || null, adminId || null, data.closes_at || null,
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
        settlement_id: data.settlement_id || 'sloboda-pilot',
        authoritative_engine: engine,
        secret_ballot: secretBallot,
        share_class: data.share_class || null,
        terms_version: data.terms_version || 'v1',
        seats_count: data.seats_count || 1,
        options: data.options,
        abstain_option_index: data.abstain_option_index ?? null,
        status: 'draft',
        quorum_members_pct: data.quorum_members_pct ?? 50,
        quorum_capital_pct: data.quorum_capital_pct ?? 50,
        roster_hash: null,
        protocol_hash: null,
        protocol_json: null,
        adopted: null,
        winning_option_index: null,
        external_election_fingerprint: data.external_election_fingerprint || null,
        created_by: adminId || null,
        opened_at: null,
        closes_at: data.closes_at || null,
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
            if (prop.status !== 'draft') {
                const err = new Error(`Нельзя открыть голосование в статусе ${prop.status}`);
                err.status = 409;
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
    if (prop.status !== 'draft') {
        const err = new Error(`Нельзя открыть голосование в статусе ${prop.status}`);
        err.status = 409;
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

    // Live check: suspended accounts cannot vote even with an active JWT
    const liveUser = await getUserMembership(userId);
    if (liveUser && (liveUser.membership_status === 'suspended' || (liveUser.status && liveUser.status !== 'active'))) {
        const err = new Error('Учётная запись приостановлена');
        err.status = 403;
        throw err;
    }

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            const pRes = await client.query(`SELECT * FROM governance_proposals WHERE id = $1 FOR UPDATE`, [proposalId]);
            const prop = pRes.rows[0];
            if (!prop) { const err = new Error('Голосование не найдено'); err.status = 404; throw err; }
            if (prop.authoritative_engine === 'loomio' || prop.authoritative_engine === 'belenios') {
                const err = new Error(`Голосование привязано к внешнему движку ${prop.authoritative_engine}; прямой приём бюллетеней отключён`);
                err.status = 409;
                throw err;
            }
            if (prop.status !== 'open') { const err = new Error('Голосование закрыто или ещё не открыто'); err.status = 409; throw err; }
            if (prop.closes_at && new Date(prop.closes_at).getTime() < Date.now()) {
                const err = new Error('Срок голосования истёк'); err.status = 409; throw err;
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

    const prop = mem.proposals.find((p) => p.id === Number(proposalId));
    if (!prop) { const err = new Error('Голосование не найдено'); err.status = 404; throw err; }
    if (prop.authoritative_engine === 'loomio' || prop.authoritative_engine === 'belenios') {
        const err = new Error(`Голосование привязано к внешнему движку ${prop.authoritative_engine}; прямой приём бюллетеней отключён`);
        err.status = 409;
        throw err;
    }
    if (prop.status !== 'open') { const err = new Error('Голосование закрыто или ещё не открыто'); err.status = 409; throw err; }
    if (prop.closes_at && new Date(prop.closes_at).getTime() < Date.now()) {
        const err = new Error('Срок голосования истёк'); err.status = 409; throw err;
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
        return rows.map((p) => sanitizeProposalForRead(p, null));
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

async function recordContribution(data, adminId) {
    const amountBi = core.toBigIntKopecks(data.amount_kopecks, 'amount_kopecks');
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

    const idempKey = data.idempotency_key || null;
    const settlementId = data.settlement_id || 'sloboda-pilot';
    const purpose = data.purpose || 'general';

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            if (idempKey) {
                const dup = await client.query(`SELECT * FROM contributions WHERE idempotency_key = $1`, [idempKey]);
                if (dup.rows[0]) {
                    const existing = dup.rows[0];
                    if (BigInt(existing.received_kopecks) !== amountBi || Number(existing.user_id || 0) !== Number(data.user_id || 0)) {
                        const err = new Error('Idempotency key conflict with different payload');
                        err.status = 409;
                        throw err;
                    }
                    await client.query('COMMIT');
                    return { contribution: serializeContribution(existing), idempotent_replay: true };
                }
            }
            const r = await client.query(
                `INSERT INTO contributions
                 (user_id, settlement_id, purpose, contributor_name, received_kopecks, available_kopecks,
                  reserved_kopecks, paid_kopecks, refunded_kopecks, share_class, terms_version,
                  legal_right_type, status, ledger_mode, payment_ref, idempotency_key, note, verified_by)
                 VALUES ($1,$2,$3,$4,$5,$5,0,0,0,$6,$7,$8,'unallocated',$9,$10,$11,$12,$13)
                 RETURNING *`,
                [
                    data.user_id || null, settlementId, purpose, data.contributor_name || 'Участник',
                    amountBi.toString(), data.share_class || null, data.terms_version || 'v1',
                    legalRightType, data.ledger_mode || 'verified_receipt', data.payment_ref || null,
                    idempKey, data.note || null, adminId || null,
                ]
            );
            const row = r.rows[0];
            await client.query(
                `INSERT INTO ledger_postings (posting_type, contribution_id, amount_kopecks, actor_admin_id, note)
                 VALUES ('receipt', $1, $2, $3, $4)`,
                [row.id, amountBi.toString(), adminId || null, data.note || 'Поступление взноса']
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

    if (idempKey) {
        const existing = mem.contributions.find((c) => c.idempotency_key === idempKey);
        if (existing) {
            if (BigInt(existing.received_kopecks) !== amountBi || Number(existing.user_id || 0) !== Number(data.user_id || 0)) {
                const err = new Error('Idempotency key conflict with different payload');
                err.status = 409;
                throw err;
            }
            return { contribution: serializeContribution(existing), idempotent_replay: true };
        }
    }

    const row = {
        id: mem.nextContributionId++,
        user_id: data.user_id ? Number(data.user_id) : null,
        settlement_id: settlementId,
        purpose,
        contributor_name: data.contributor_name || 'Участник',
        received_kopecks: amountBi,
        available_kopecks: amountBi,
        reserved_kopecks: 0n,
        paid_kopecks: 0n,
        refunded_kopecks: 0n,
        share_class: data.share_class || null,
        terms_version: data.terms_version || 'v1',
        legal_right_type: legalRightType,
        status: 'unallocated',
        ledger_mode: data.ledger_mode || 'verified_receipt',
        payment_ref: data.payment_ref || null,
        idempotency_key: idempKey,
        note: data.note || null,
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
        note: data.note || 'Поступление взноса',
        created_at: new Date().toISOString(),
    });
    return { contribution: serializeContribution(row), idempotent_replay: false };
}

async function createAndAllocateExpense(data, adminId) {
    const amountBi = core.toBigIntKopecks(data.amount_kopecks, 'amount_kopecks');
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
    const initialStatus = data.mark_paid ? 'paid' : 'reserved';
    const settlementId = data.settlement_id || 'sloboda-pilot';
    const purpose = data.purpose || 'general';
    const idempKey = data.idempotency_key || null;

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            if (idempKey) {
                const dup = await client.query(`SELECT * FROM ledger_expenses WHERE idempotency_key = $1`, [idempKey]);
                if (dup.rows[0]) {
                    const ex = dup.rows[0];
                    if (BigInt(ex.amount_kopecks) !== amountBi || ex.title !== data.title) {
                        const err = new Error('Idempotency key conflict with different expense payload');
                        err.status = 409;
                        throw err;
                    }
                    const allocs = (await client.query(`SELECT * FROM expense_allocations WHERE expense_id = $1 ORDER BY contribution_id ASC`, [ex.id])).rows;
                    await client.query('COMMIT');
                    return { expense: serializeExpense(ex, allocs), idempotent_replay: true };
                }
            }

            // Lock eligible contributions in stable id ASC order to prevent deadlocks & double-spend
            const contribRows = (await client.query(
                `SELECT * FROM contributions
                 WHERE settlement_id = $1 AND purpose = $2 AND available_kopecks > 0
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
                    plan = core.allocateExplicitBigInt(amountBi, data.allocations, byId);
                }
            } catch (allocErr) {
                allocErr.status = allocErr.code === 'INSUFFICIENT_FUNDS' || allocErr.code === 'ALLOCATION_SUM_MISMATCH' ? 409 : 400;
                throw allocErr;
            }

            const expRes = await client.query(
                `INSERT INTO ledger_expenses
                 (settlement_id, purpose, title, category, amount_kopecks, milestone_id, asset_name,
                  asset_location, receipt_url, photo_url, allocation_rule, status, idempotency_key, approved_by, paid_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                 RETURNING *`,
                [
                    settlementId, purpose, data.title, data.category || 'equipment', amountBi.toString(),
                    data.milestone_id || null, data.asset_name || data.title, data.asset_location || null,
                    data.receipt_url || null, data.photo_url || null, rule, initialStatus, idempKey,
                    adminId || null, initialStatus === 'paid' ? new Date().toISOString() : null,
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

                if (initialStatus === 'paid') {
                    await client.query(
                        `UPDATE contributions
                         SET available_kopecks = available_kopecks - $1,
                             paid_kopecks = paid_kopecks + $1,
                             status = CASE WHEN available_kopecks - $1 = 0 AND reserved_kopecks = 0 THEN 'allocated' ELSE 'partially_allocated' END
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
                             status = CASE WHEN available_kopecks - $1 = 0 AND paid_kopecks = 0 THEN 'reserved' ELSE 'partially_allocated' END
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
    if (idempKey) {
        const existing = mem.expenses.find((e) => e.idempotency_key === idempKey);
        if (existing) {
            if (BigInt(existing.amount_kopecks) !== amountBi || existing.title !== data.title) {
                const err = new Error('Idempotency key conflict with different expense payload');
                err.status = 409;
                throw err;
            }
            const allocs = mem.allocations.filter((a) => a.expense_id === existing.id);
            return { expense: serializeExpense(existing, allocs), idempotent_replay: true };
        }
    }

    const eligible = mem.contributions
        .filter((c) => c.settlement_id === settlementId && c.purpose === purpose && c.available_kopecks > 0n)
        .sort((a, b) => a.id - b.id);

    let plan;
    try {
        if (rule === 'proportional') {
            plan = core.allocateProportionalBigInt(amountBi, eligible);
        } else if (rule === 'fifo') {
            plan = core.allocateFifoBigInt(amountBi, eligible);
        } else {
            const byId = new Map(eligible.map((c) => [c.id, c]));
            plan = core.allocateExplicitBigInt(amountBi, data.allocations, byId);
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
        category: data.category || 'equipment',
        amount_kopecks: amountBi,
        milestone_id: data.milestone_id ? Number(data.milestone_id) : null,
        asset_name: data.asset_name || data.title,
        asset_location: data.asset_location || null,
        receipt_url: data.receipt_url || null,
        photo_url: data.photo_url || null,
        allocation_rule: rule,
        status: initialStatus,
        idempotency_key: idempKey,
        approved_by: adminId || null,
        paid_at: initialStatus === 'paid' ? new Date().toISOString() : null,
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
        if (initialStatus === 'paid') {
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
            posting_type: initialStatus === 'paid' ? 'pay' : 'reserve',
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
        status: e.status,
        paid_at: e.paid_at,
        created_at: e.created_at,
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

async function transitionExpenseStatus(expenseId, newStatus, adminId) {
    if (!['paid', 'disputed', 'cancelled'].includes(newStatus)) {
        const err = new Error('Недопустимый статус расхода');
        err.status = 400;
        throw err;
    }

    if (isPgMode()) {
        const client = await dbRef.pool.connect();
        try {
            await client.query('BEGIN');
            const ex = (await client.query(`SELECT * FROM ledger_expenses WHERE id = $1 FOR UPDATE`, [expenseId])).rows[0];
            if (!ex) { const err = new Error('Расход не найден'); err.status = 404; throw err; }
            if (ex.status === newStatus) {
                const allocs = (await client.query(`SELECT * FROM expense_allocations WHERE expense_id = $1`, [expenseId])).rows;
                await client.query('COMMIT');
                return serializeExpense(ex, allocs);
            }
            const allocs = (await client.query(`SELECT * FROM expense_allocations WHERE expense_id = $1 ORDER BY contribution_id ASC`, [expenseId])).rows;

            if ((ex.status === 'reserved' || ex.status === 'disputed') && newStatus === 'paid') {
                for (const a of allocs) {
                    await client.query(
                        `UPDATE contributions
                         SET reserved_kopecks = reserved_kopecks - $1,
                             paid_kopecks = paid_kopecks + $1,
                             status = CASE WHEN available_kopecks = 0 AND reserved_kopecks - $1 = 0 THEN 'allocated' ELSE 'partially_allocated' END
                         WHERE id = $2`,
                        [a.amount_kopecks, a.contribution_id]
                    );
                    await client.query(
                        `INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
                         VALUES ('pay', $1, $2, $3, $4, 'Подтверждение оплаты расхода')`,
                        [a.contribution_id, ex.id, a.amount_kopecks, adminId || null]
                    );
                }
            } else if ((ex.status === 'reserved' || ex.status === 'disputed') && newStatus === 'cancelled') {
                for (const a of allocs) {
                    await client.query(
                        `UPDATE contributions
                         SET reserved_kopecks = reserved_kopecks - $1,
                             available_kopecks = available_kopecks + $1,
                             status = CASE WHEN paid_kopecks = 0 AND reserved_kopecks - $1 = 0 THEN 'unallocated' ELSE 'partially_allocated' END
                         WHERE id = $2`,
                        [a.amount_kopecks, a.contribution_id]
                    );
                    await client.query(
                        `INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
                         VALUES ('release', $1, $2, $3, $4, 'Освобождение резерва при отмене расхода')`,
                        [a.contribution_id, ex.id, a.amount_kopecks, adminId || null]
                    );
                }
            } else if (newStatus === 'disputed') {
                await client.query(
                    `INSERT INTO ledger_postings (posting_type, expense_id, amount_kopecks, actor_admin_id, note)
                     VALUES ('dispute', $1, $2, $3, 'Расход переведён в спорный статус')`,
                    [ex.id, ex.amount_kopecks, adminId || null]
                );
            } else {
                const err = new Error(`Переход расхода ${ex.status} -> ${newStatus} запрещён`);
                err.status = 409;
                throw err;
            }

            const upd = (await client.query(
                `UPDATE ledger_expenses SET status = $1, paid_at = CASE WHEN $1 = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END WHERE id = $2 RETURNING *`,
                [newStatus, expenseId]
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
    const allocs = mem.allocations.filter((a) => a.expense_id === ex.id);
    if (ex.status === newStatus) return serializeExpense(ex, allocs);

    if ((ex.status === 'reserved' || ex.status === 'disputed') && newStatus === 'paid') {
        for (const a of allocs) {
            const c = mem.contributions.find((x) => x.id === a.contribution_id);
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
        ex.paid_at = new Date().toISOString();
    } else if ((ex.status === 'reserved' || ex.status === 'disputed') && newStatus === 'cancelled') {
        for (const a of allocs) {
            const c = mem.contributions.find((x) => x.id === a.contribution_id);
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
    } else if (newStatus === 'disputed') {
        mem.postings.push({
            id: mem.nextPostingId++,
            posting_type: 'dispute',
            contribution_id: null,
            expense_id: ex.id,
            amount_kopecks: ex.amount_kopecks,
            actor_admin_id: adminId || null,
            note: 'Расход переведён в спорный статус',
            created_at: new Date().toISOString(),
        });
    } else {
        const err = new Error(`Переход расхода ${ex.status} -> ${newStatus} запрещён`);
        err.status = 409;
        throw err;
    }

    ex.status = newStatus;
    return serializeExpense(ex, allocs);
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
        totalReceived += BigInt(c.received_kopecks);
        totalAvailable += BigInt(c.available_kopecks);
        totalReserved += BigInt(c.reserved_kopecks);
        totalPaid += BigInt(c.paid_kopecks);
        totalRefunded += BigInt(c.refunded_kopecks);

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

async function getPublicLedgerSummary(settlementId = 'sloboda-pilot') {
    if (isPgMode()) {
        const totalsRes = await dbRef.pool.query(
            `SELECT COALESCE(SUM(received_kopecks),0)::bigint AS received,
                    COALESCE(SUM(available_kopecks),0)::bigint AS available,
                    COALESCE(SUM(reserved_kopecks),0)::bigint AS reserved,
                    COALESCE(SUM(paid_kopecks),0)::bigint AS paid,
                    COALESCE(SUM(refunded_kopecks),0)::bigint AS refunded,
                    COUNT(*)::int AS contributions_count
             FROM contributions WHERE settlement_id = $1`,
            [settlementId]
        );
        const t = totalsRes.rows[0];
        const milestones = await listConstructionMilestones(settlementId);
        // Public anonymized expenses (no contributor PII!)
        const recentExpenses = (await dbRef.pool.query(
            `SELECT id, title, category, amount_kopecks, asset_name, asset_location, photo_url, status, paid_at, created_at
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

    const filtered = mem.contributions.filter((c) => c.settlement_id === settlementId);
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
        spent: core.formatKopecks(spentKopecks),
        status: m.status,
        photo_url: m.photo_url || null,
        updated_at: m.updated_at,
    };
}

async function listConstructionMilestones(settlementId = 'sloboda-pilot') {
    if (isPgMode()) {
        const rows = (await dbRef.pool.query(
            `SELECT m.*,
                    COALESCE((
                        SELECT SUM(lp.amount_kopecks)
                        FROM ledger_postings lp
                        JOIN ledger_expenses le ON le.id = lp.expense_id
                        WHERE le.milestone_id = m.id
                          AND le.settlement_id = m.settlement_id
                          AND lp.posting_type = 'pay'
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
            // Derived strictly from 'pay' ledger postings scoped to same settlement
            const expenseIds = new Set(
                mem.expenses
                    .filter((e) => e.milestone_id === m.id && e.settlement_id === m.settlement_id)
                    .map((e) => e.id)
            );
            const spent = mem.postings
                .filter((p) => p.posting_type === 'pay' && expenseIds.has(p.expense_id))
                .reduce((acc, p) => acc + BigInt(p.amount_kopecks), 0n);
            return serializeMilestone(m, spent);
        });
}

async function upsertConstructionMilestone(data) {
    const budgetBi = core.toBigIntKopecks(data.budget_kopecks ?? 0, 'budget_kopecks');
    const settlementId = data.settlement_id || 'sloboda-pilot';
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
                data.unit || 'шт.', data.planned_qty ?? 0, data.actual_qty ?? 0, budgetBi.toString(),
                data.status || 'planned', data.photo_url || null,
            ]
        );
        return serializeMilestone(r.rows[0], 0n);
    }

    seedDefaultMilestonesMem();
    let m = mem.milestones.find((x) => x.settlement_id === settlementId && x.code === data.code);
    if (m) {
        Object.assign(m, {
            title: data.title ?? m.title,
            planned_qty: data.planned_qty ?? m.planned_qty,
            actual_qty: data.actual_qty ?? m.actual_qty,
            budget_kopecks: budgetBi,
            status: data.status ?? m.status,
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
            planned_qty: data.planned_qty ?? 0,
            actual_qty: data.actual_qty ?? 0,
            budget_kopecks: budgetBi,
            status: data.status || 'planned',
            photo_url: data.photo_url || null,
            updated_at: new Date().toISOString(),
        };
        mem.milestones.push(m);
    }
    return serializeMilestone(m, 0n);
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
    getMyLedger,
    getPublicLedgerSummary,
    listConstructionMilestones,
    upsertConstructionMilestone,
};
