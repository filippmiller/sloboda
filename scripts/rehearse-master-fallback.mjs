#!/usr/bin/env node
/**
 * Actual-Master Fallback Runtime Rehearsal (SLB-R3-E01 & SLB-R3-03 exact-master preflight)
 *
 * 1. Enforces shared disposable PostgreSQL guard (config + current_database() on same client).
 * 2. Checks out exact BASE master (aec59ccdc97f76d5b024333f02dfb0a4ce47175a) in a temporary worktree,
 *    boots it against a clean disposable DB to initialize exact master schema, and runs pre-DDL
 *    scripts/preflight-sloboda-core.mjs (asserting exit 0, schema_state=NOT_INSTALLED, zero mutations).
 * 3. Upgrades the DB to the current candidate (R4), seeds contributions (verified + pledge),
 *    reserved expense, and governance proposal, and records deterministic SHA-256 content digests,
 *    row counts, and integer kopeck sums.
 * 4. Applies 2026-11-26-sloboda-core-r3.fallback-readonly.sql.
 * 5. Boots actual master@aec59cc server/index.js against the fenced populated R4 DB; prints exact
 *    HEAD and TREE of both master@aec59cc and the candidate; verifies /api/health 200 and verifies
 *    core API routes (/api/public/ledger/summary, /api/governance/proposals, /api/applications/my,
 *    POST /api/admin/ledger/contributions) do NOT serve core JSON API on master@aec59cc.
 * 6. Stops master@aec59cc, removes worktree, and verifies core table row counts, integer kopeck
 *    sums, and deterministic SHA-256 content digests are bit-for-bit unchanged.
 * 7. Applies 2026-11-26-sloboda-core-r3.restore-writes.sql, boots the new candidate server/index.js,
 *    verifies /api/public/ledger/summary returns verified-only totals, performs a real candidate
 *    write (new contribution + expense status transition to paid) asserting expected row & posting
 *    deltas, and verifies revalidateLedgerIntegrity() returns report.financial.ok=true & is_blocked=false.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { assertSafeDisposablePgConfig, assertConnectedDisposablePg } = require('../server/utils/pgTestGuard');

const PINNED_MASTER_SHA = 'aec59ccdc97f76d5b024333f02dfb0a4ce47175a';
const REHEARSAL_JWT_SECRET = process.env.JWT_SECRET || 'rehearsal-secret-32-chars-minimum';
const label = 'actual-master fallback rehearsal (scripts/rehearse-master-fallback.mjs)';
const { dbName } = assertSafeDisposablePgConfig(process.env.DATABASE_URL, process.env, label);
process.env.TEST_NO_DB = 'false';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const sqlFallbackReadonly = fs.readFileSync(path.join(rootDir, 'server/migrations/2026-11-26-sloboda-core-r3.fallback-readonly.sql'), 'utf8');
const sqlRestoreWrites = fs.readFileSync(path.join(rootDir, 'server/migrations/2026-11-26-sloboda-core-r3.restore-writes.sql'), 'utf8');

function git(args, cwd = rootDir) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function waitForHealth(baseUrl, child, labelName, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (child.exitCode !== null) {
            throw new Error(`${labelName} exited prematurely with code ${child.exitCode}`);
        }
        try {
            const res = await fetch(`${baseUrl}/api/health`);
            if (res.status === 200) {
                return await res.json();
            }
        } catch {
            // retry
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Timed out waiting for ${labelName} health at ${baseUrl}/api/health`);
}

function startServer(cwd, port, extraEnv = {}) {
    const logs = [];
    const child = spawn(process.execPath, ['server/index.js'], {
        cwd,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: String(port),
            DISABLE_CLIENT_BUILD: 'true',
            TEST_NO_DB: 'false',
            DATABASE_URL: process.env.DATABASE_URL,
            JWT_SECRET: REHEARSAL_JWT_SECRET,
            ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@sloboda.land',
            ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'testpassword123',
            ...extraEnv,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => logs.push(d.toString()));
    child.stderr.on('data', (d) => logs.push(d.toString()));
    return { child, logs };
}

async function stopServer(child) {
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise((resolve) => {
        const t = setTimeout(() => {
            if (child.exitCode === null) child.kill('SIGKILL');
            resolve();
        }, 5000);
        child.once('exit', () => {
            clearTimeout(t);
            resolve();
        });
    });
}

async function snapshotCoreData(pool) {
    const tables = [
        { name: 'member_applications', order: 'id' },
        { name: 'portfolio_items', order: 'id' },
        { name: 'governance_proposals', order: 'id' },
        { name: 'governance_voter_snapshots', order: 'id' },
        { name: 'governance_ballots', order: 'id' },
        { name: 'governance_voter_receipts', order: 'id' },
        { name: 'governance_secret_ballots', order: 'id' },
        { name: 'council_delegations', order: 'id' },
        { name: 'contributions', order: 'id' },
        { name: 'construction_milestones', order: 'id' },
        { name: 'ledger_expenses', order: 'id' },
        { name: 'expense_allocations', order: 'id' },
        { name: 'ledger_postings', order: 'id' },
        { name: 'sloboda_core_gates', order: 'gate_key' },
    ];
    const counts = {};
    const digests = {};
    for (const t of tables) {
        const res = await pool.query(`SELECT * FROM public.${t.name} ORDER BY ${t.order} ASC`);
        counts[t.name] = res.rows.length;
        digests[t.name] = crypto.createHash('sha256').update(JSON.stringify(res.rows)).digest('hex');
    }
    const sumsRes = await pool.query(`
        SELECT
            COALESCE(SUM(received_kopecks) FILTER (WHERE ledger_mode = 'verified_receipt'), 0)::bigint::text AS verified_received,
            COALESCE(SUM(available_kopecks) FILTER (WHERE ledger_mode = 'verified_receipt'), 0)::bigint::text AS verified_available,
            COALESCE(SUM(reserved_kopecks) FILTER (WHERE ledger_mode = 'verified_receipt'), 0)::bigint::text AS verified_reserved,
            COALESCE(SUM(paid_kopecks) FILTER (WHERE ledger_mode = 'verified_receipt'), 0)::bigint::text AS verified_paid,
            COALESCE(SUM(received_kopecks) FILTER (WHERE ledger_mode = 'pledge'), 0)::bigint::text AS pledge_received
        FROM public.contributions
    `);
    return { counts, digests, sums: sumsRes.rows[0] };
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloboda-master-fallback-'));
let masterProc = null;
let candidateProc = null;

try {
    const client = await pool.connect();
    try {
        const actualDb = await assertConnectedDisposablePg(client, dbName, label);
        console.log(`[rehearsal] Guard verified disposable DB=${actualDb}`);
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    } finally {
        client.release();
    }

    const candidateHead = git(['rev-parse', 'HEAD']);
    const candidateTree = git(['rev-parse', 'HEAD^{tree}']);
    git(['rev-parse', '--verify', `${PINNED_MASTER_SHA}^{commit}`]);
    git(['worktree', 'add', '--detach', worktreeDir, PINNED_MASTER_SHA]);
    const masterHead = git(['rev-parse', 'HEAD'], worktreeDir);
    const masterTree = git(['rev-parse', 'HEAD^{tree}'], worktreeDir);
    assert.equal(masterHead, PINNED_MASTER_SHA, 'Worktree HEAD must equal pinned master SHA');

    // Share root node_modules so master@aec59cc boots with installed server dependencies
    const wtNodeModules = path.join(worktreeDir, 'node_modules');
    if (!fs.existsSync(wtNodeModules)) {
        fs.symlinkSync(path.join(rootDir, 'node_modules'), wtNodeModules, 'junction');
    }

    console.log(`[rehearsal] PINNED_MASTER_HEAD=${masterHead} TREE=${masterTree}`);
    console.log(`[rehearsal] CANDIDATE_HEAD=${candidateHead} TREE=${candidateTree}`);

    // Step 1: Boot exact master@aec59cc against clean DB to initialize exact master schema
    const masterPort1 = 3311;
    const m1 = startServer(worktreeDir, masterPort1);
    masterProc = m1.child;
    const h1 = await waitForHealth(`http://127.0.0.1:${masterPort1}`, masterProc, 'master@aec59cc (clean init)');
    assert.equal(h1.status, 'ok');
    await stopServer(masterProc);
    masterProc = null;

    // Run pre-DDL preflight CLI on exact master@aec59cc schema
    const tablesBeforePreflight = (await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC`
    )).rows.map((r) => r.table_name);
    const preflightOut = execFileSync(process.execPath, [path.join(rootDir, 'scripts/preflight-sloboda-core.mjs')], {
        cwd: rootDir,
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        encoding: 'utf8',
    });
    const preflightJson = JSON.parse(preflightOut);
    assert.equal(preflightJson.schema.schema_state, 'NOT_INSTALLED', 'Exact master schema must classify as NOT_INSTALLED');
    assert.equal(preflightJson.financial.ok, true);
    assert.equal(preflightJson.financial.skipped_reason, 'core_schema_not_installed');
    const tablesAfterPreflight = (await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC`
    )).rows.map((r) => r.table_name);
    assert.deepEqual(tablesAfterPreflight, tablesBeforePreflight, 'Pre-DDL preflight must not mutate DB');
    console.log('[rehearsal] PASS Step 1: exact master@aec59cc schema initialized & pre-DDL preflight classified NOT_INSTALLED with zero mutations');

    // Step 2: Upgrade to candidate R4 & populate core tables
    const db = require('../server/db');
    const coreStore = require('../server/services/coreStore');
    coreStore.setDb(db);
    await coreStore.ensureCoreSchema();

    const adminRow = (await pool.query(
        `INSERT INTO public.admins (email, name, role, password_hash)
         VALUES ('rehearsal.admin@sloboda.land', 'Rehearsal Admin', 'super_admin', 'x')
         ON CONFLICT (email) DO UPDATE SET role = 'super_admin'
         RETURNING id`
    )).rows[0];
    const adminId = adminRow.id;

    await coreStore.recordContribution({
        settlement_id: 'sloboda-pilot',
        purpose: 'general',
        contributor_name: 'Rehearsal Verified Donor',
        amount_kopecks: 150000,
        ledger_mode: 'verified_receipt',
        idempotency_key: 'reh-verified-1',
    }, adminId);
    await coreStore.recordContribution({
        settlement_id: 'sloboda-pilot',
        purpose: 'general',
        contributor_name: 'Rehearsal Pledge Donor',
        amount_kopecks: 300000,
        ledger_mode: 'pledge',
        idempotency_key: 'reh-pledge-1',
    }, adminId);
    const reservedExp = await coreStore.createAndAllocateExpense({
        settlement_id: 'sloboda-pilot',
        purpose: 'general',
        title: 'Rehearsal Reserved Expense',
        category: 'equipment',
        amount_kopecks: 50000,
        mark_paid: false,
        idempotency_key: 'reh-exp-1',
    }, adminId);
    await pool.query(`
        INSERT INTO public.governance_proposals
            (title, vote_type, settlement_id, authoritative_engine, secret_ballot, seats_count, options, status, created_by)
        VALUES ('Rehearsal Proposal', 'council_election', 'sloboda-pilot', 'native_secret', TRUE, 1, '["Yes","No"]'::jsonb, 'draft', $1)
    `, [adminId]);
    const rehApp = (await pool.query(`
        INSERT INTO public.member_applications
            (full_name, email, city, primary_domain, skills, motivation, status, version)
        VALUES ('Rehearsal Applicant', 'reh.applicant@sloboda.land', 'Казань', 'ENG', 'Solar', 'Build', 'pending', 1)
        RETURNING id
    `)).rows[0];
    await pool.query(`
        INSERT INTO public.portfolio_items (application_id, title, domain_code, summary)
        VALUES ($1, 'Rehearsal Solar Array', 'ENG', '10kW')
    `, [rehApp.id]);

    const beforeSnapshot = await snapshotCoreData(pool);
    assert.equal(beforeSnapshot.counts.contributions, 2);
    assert.equal(beforeSnapshot.counts.ledger_expenses, 1);
    assert.equal(beforeSnapshot.counts.governance_proposals, 1);
    assert.equal(beforeSnapshot.sums.verified_received, '150000');
    assert.equal(beforeSnapshot.sums.verified_available, '100000');
    assert.equal(beforeSnapshot.sums.verified_reserved, '50000');
    assert.equal(beforeSnapshot.sums.pledge_received, '300000');
    console.log('[rehearsal] PASS Step 2: populated R4 core DB snapshot recorded', JSON.stringify(beforeSnapshot));

    // Step 3: Apply fallback read-only SQL fence
    await pool.query(sqlFallbackReadonly);

    // Step 4: Boot actual master@aec59cc against fenced populated R4 DB
    const masterPort2 = 3312;
    const m2 = startServer(worktreeDir, masterPort2);
    masterProc = m2.child;
    const h2 = await waitForHealth(`http://127.0.0.1:${masterPort2}`, masterProc, 'master@aec59cc (fenced R4 DB)');
    assert.equal(h2.status, 'ok');

    // Verify new core API endpoints do NOT serve core JSON API on master@aec59cc
    // (At aec59cc, unmatched GETs fall through to SPA/landing HTML or 404; unmatched POSTs return 404)
    for (const ep of ['/api/public/ledger/summary', '/api/governance/proposals', '/api/applications/my']) {
        const res = await fetch(`http://127.0.0.1:${masterPort2}${ep}`);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const bodyText = await res.text();
        assert.ok(
            res.status === 404 || !ct.includes('application/json'),
            `master@aec59cc MUST NOT serve JSON core API at ${ep} (got status=${res.status}, content-type=${ct}, body=${bodyText.slice(0, 120)})`
        );
    }
    const postContribRes = await fetch(`http://127.0.0.1:${masterPort2}/api/admin/ledger/contributions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_kopecks: 1000, idempotency_key: 'master-should-not-exist' }),
    });
    assert.equal(postContribRes.status, 404, 'master@aec59cc must return 404 for POST /api/admin/ledger/contributions');

    await stopServer(masterProc);
    masterProc = null;

    // Step 5: Verify core data is bit-for-bit unchanged after master@aec59cc runtime
    const afterMasterSnapshot = await snapshotCoreData(pool);
    assert.deepEqual(afterMasterSnapshot, beforeSnapshot, 'Core data counts, sums, and SHA-256 digests MUST be bit-for-bit unchanged after master@aec59cc fallback');
    console.log('[rehearsal] PASS Step 3-5: actual master@aec59cc booted on fenced R4 DB, core API absent, core data bit-for-bit unchanged');

    // Step 6: Restore writes, boot candidate server, verify public read + real candidate writes + integrity gate
    await pool.query(sqlRestoreWrites);
    const candPort = 3313;
    const c1 = startServer(rootDir, candPort);
    candidateProc = c1.child;
    const hc = await waitForHealth(`http://127.0.0.1:${candPort}`, candidateProc, 'candidate R4 server');
    assert.equal(hc.status, 'ok');

    const pubLedgerRes = await fetch(`http://127.0.0.1:${candPort}/api/public/ledger/summary?settlement_id=sloboda-pilot`);
    assert.equal(pubLedgerRes.status, 200);
    const pubLedgerJson = await pubLedgerRes.json();
    assert.equal(pubLedgerJson.totals.received.kopecks_str, '150000', 'Candidate public ledger must report verified_receipt only');

    // Perform real candidate writes via the candidate server's authenticated HTTP endpoints
    // to prove the SQL write fence was lifted end-to-end (HTTP -> route -> coreStore -> PG)
    const jwt = require('jsonwebtoken');
    const adminJwt = jwt.sign(
        { id: adminId, email: 'rehearsal.admin@sloboda.land', role: 'super_admin' },
        REHEARSAL_JWT_SECRET,
        { expiresIn: '1h' }
    );

    const httpContribRes = await fetch(`http://127.0.0.1:${candPort}/api/admin/ledger/contributions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminJwt}`,
        },
        body: JSON.stringify({
            settlement_id: 'sloboda-pilot',
            purpose: 'general',
            contributor_name: 'Post-Restore HTTP Donor',
            amount_kopecks: 25000,
            ledger_mode: 'verified_receipt',
            idempotency_key: 'reh-post-restore-http-1',
        }),
    });
    assert.equal(httpContribRes.status, 201, `Post-restore HTTP contribution write must succeed with 201 (got ${httpContribRes.status})`);
    const httpContribJson = await httpContribRes.json();
    assert.equal(httpContribJson.idempotent_replay, false);

    const httpPayRes = await fetch(`http://127.0.0.1:${candPort}/api/admin/ledger/expenses/${reservedExp.expense.id}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminJwt}`,
        },
        body: JSON.stringify({
            status: 'paid',
            expected_version: 1,
        }),
    });
    assert.equal(httpPayRes.status, 200, `Post-restore HTTP expense transition must succeed with 200 (got ${httpPayRes.status})`);
    const httpPayJson = await httpPayRes.json();
    assert.equal(httpPayJson.expense.status, 'paid');
    assert.equal(httpPayJson.expense.financial_status, 'paid');

    const postWriteSnapshot = await snapshotCoreData(pool);
    assert.equal(postWriteSnapshot.counts.contributions, 3);
    assert.equal(postWriteSnapshot.sums.verified_received, '175000');
    assert.equal(postWriteSnapshot.sums.verified_available, '125000');
    assert.equal(postWriteSnapshot.sums.verified_reserved, '0');
    assert.equal(postWriteSnapshot.sums.verified_paid, '50000');

    const reval = await coreStore.revalidateLedgerIntegrity();
    assert.equal(reval.report.financial.ok, true);
    assert.equal(reval.is_blocked, false);

    await stopServer(candidateProc);
    candidateProc = null;
    await db.pool.end();
    console.log('ALL_MASTER_FALLBACK_REHEARSAL_PASSED');
} finally {
    await stopServer(masterProc);
    await stopServer(candidateProc);
    try {
        git(['worktree', 'remove', '--force', worktreeDir]);
    } catch {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
    }
    await pool.end().catch(() => {});
}
