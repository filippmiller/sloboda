#!/usr/bin/env node
/**
 * Real PostgreSQL 17 Integration & Invariant Verification Suite (SLB-R1 / R2 / R3 PG-GATE)
 * Requires DATABASE_URL pointing to a disposable PostgreSQL database and
 * ALLOW_DESTRUCTIVE_PG_VERIFY=true. Forces TEST_NO_DB=false.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('FATAL: DATABASE_URL is required for scripts/verify-pg-core.mjs');
    process.exit(1);
}
if (process.env.ALLOW_DESTRUCTIVE_PG_VERIFY !== 'true') {
    console.error('FATAL: Refusing to drop public schema without ALLOW_DESTRUCTIVE_PG_VERIFY=true (use a disposable test database only).');
    process.exit(1);
}
process.env.TEST_NO_DB = 'false';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const sqlR1 = fs.readFileSync(path.join(rootDir, 'server/migrations/2026-11-26-sloboda-core.sql'), 'utf8');
const sqlR3 = fs.readFileSync(path.join(rootDir, 'server/migrations/2026-11-26-sloboda-core-r3.sql'), 'utf8');
const sqlRollback = fs.readFileSync(path.join(rootDir, 'server/migrations/2026-11-26-sloboda-core.rollback.sql'), 'utf8');
const sqlFallbackReadonly = fs.readFileSync(path.join(rootDir, 'server/migrations/2026-11-26-sloboda-core-r3.fallback-readonly.sql'), 'utf8');
const sqlRestoreWrites = fs.readFileSync(path.join(rootDir, 'server/migrations/2026-11-26-sloboda-core-r3.restore-writes.sql'), 'utf8');

const pool = new Pool({ connectionString: DATABASE_URL });

async function resetBaseSchema() {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.query(`
        CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(200),
            password_hash VARCHAR(255),
            status VARCHAR(32) NOT NULL DEFAULT 'active',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE admins (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(200),
            password_hash VARCHAR(255),
            role VARCHAR(32) NOT NULL DEFAULT 'super_admin',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

function signUserToken(user, secret) {
    return jwt.sign(
        { id: user.id, email: user.email, name: user.name, type: 'user' },
        secret,
        { expiresIn: '1h' }
    );
}

async function apiJson(baseUrl, urlPath, { method = 'GET', token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${baseUrl}${urlPath}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (_) {
        json = { raw: text };
    }
    return { status: res.status, json };
}

async function run() {
    const db = require('../server/db');
    const coreStore = require('../server/services/coreStore');
    const { JWT_SECRET } = require('../server/utils/tokens');
    const moderationRoute = require('../server/routes/moderation');
    const votesRoute = require('../server/routes/votes');
    const rolesRoute = require('../server/routes/roles');

    coreStore.setDb(db);

    // =========================================================================
    // [1/8] Clean Startup, Concurrent & Repeat Idempotency, Non-Pilot Seed, Teardown
    // =========================================================================
    console.log('=== [1/8] Clean Startup, Concurrent Startup, Repeat Idempotency & Empty Rollback Teardown ===');
    await resetBaseSchema();
    await Promise.all([coreStore.ensureCoreSchema(), coreStore.ensureCoreSchema()]);

    const m1 = await pool.query("SELECT code, status, actual_qty FROM construction_milestones WHERE settlement_id = 'sloboda-pilot' ORDER BY code");
    assert.equal(m1.rows.length, 5, 'Concurrent fresh startup must seed 5 pilot milestones');
    for (const row of m1.rows) {
        assert.equal(row.status, 'planned', `Initial pilot milestone ${row.code} must be planned`);
        assert.equal(Number(row.actual_qty), 0, `Initial pilot milestone ${row.code} must have actual_qty=0`);
    }
    const migs = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    assert.deepEqual(
        migs.rows.map((r) => r.version),
        ['2026-11-26-sloboda-core', '2026-11-26-sloboda-core-r2', '2026-11-26-sloboda-core-r3']
    );

    const preflightFresh = await coreStore.getLedgerPreflightReport();
    assert.equal(preflightFresh.is_blocked, false);
    assert.equal(preflightFresh.report.financial.ok, true);

    // Repeat startup idempotency
    await coreStore.ensureCoreSchema();
    const m2 = await pool.query("SELECT COUNT(*)::int AS cnt FROM construction_milestones WHERE settlement_id = 'sloboda-pilot'");
    assert.equal(m2.rows[0].cnt, 5, 'Repeat startup must keep exactly 5 pilot milestones');

    // Non-pilot milestone independence
    await pool.query("DELETE FROM construction_milestones WHERE settlement_id = 'sloboda-pilot'");
    await pool.query(`
        INSERT INTO construction_milestones (settlement_id, code, title, category, unit, planned_qty, actual_qty, budget_kopecks, status)
        VALUES ('other-settlement', 'other_land', 'Other Land', 'land', 'га', 10, 0, 1000000, 'planned')
    `);
    await coreStore.ensureCoreSchema();
    const m3 = await pool.query("SELECT COUNT(*)::int AS cnt FROM construction_milestones WHERE settlement_id = 'sloboda-pilot'");
    assert.equal(m3.rows[0].cnt, 5, 'Non-pilot milestone must NOT suppress pilot seed');

    // Rollback refusal on populated schema
    await assert.rejects(
        () => pool.query(sqlRollback),
        /Refusing destructive rollback/,
        'Rollback MUST refuse when core tables contain rows'
    );

    // Rollback success on empty schema (including sloboda_core_gates & R3 migration cleanup)
    await pool.query('DELETE FROM construction_milestones');
    await pool.query(sqlRollback);
    const tblCheck = await pool.query("SELECT to_regclass('public.member_applications') AS app_reg, to_regclass('public.sloboda_core_gates') AS gate_reg");
    assert.equal(tblCheck.rows[0].app_reg, null, 'Empty rollback must drop core tables');
    assert.equal(tblCheck.rows[0].gate_reg, null, 'Empty rollback must drop sloboda_core_gates');
    const colCheck = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name IN ('membership_status', 'membership_admitted_at', 'settlement_id')
    `);
    assert.equal(colCheck.rows.length, 0, 'Empty rollback must revert added users columns');
    const migAfterRollback = await pool.query(
        "SELECT version FROM schema_migrations WHERE version IN ('2026-11-26-sloboda-core', '2026-11-26-sloboda-core-r2', '2026-11-26-sloboda-core-r3')"
    );
    assert.equal(migAfterRollback.rows.length, 0, 'Empty rollback must remove R1/R2/R3 entries from schema_migrations');
    console.log('PASS [1/8] Concurrent startup, repeat idempotency, non-pilot seed, populated rollback refusal & empty teardown');

    // =========================================================================
    // [2/8] SLB-R2-03 & SLB-R2-04: Clean R1->R3 Upgrade + Corrupted R1 Gate + Unsupported R1 Proposals
    // =========================================================================
    console.log('=== [2/8] SLB-R2-03 & SLB-R2-04: Clean R1->R3 Upgrade, Unsupported Proposals & Integrity Gate ===');
    await resetBaseSchema();
    const adminRes = await pool.query("INSERT INTO admins (email, name, role) VALUES ('super@sloboda.land', 'Super', 'super_admin') RETURNING id");
    const adminId = adminRes.rows[0].id;
    const tempAdminRes = await pool.query("INSERT INTO admins (email, name, role) VALUES ('temp@sloboda.land', 'Temp', 'super_admin') RETURNING id");
    const tempAdminId = tempAdminRes.rows[0].id;
    const r1UserRes = await pool.query("INSERT INTO users (email, name, status) VALUES ('r1member@sloboda.land', 'R1 Member', 'active') RETURNING id");
    const r1UserId = r1UserRes.rows[0].id;

    // Apply ONLY R1 schema
    await pool.query(sqlR1);
    await pool.query("UPDATE users SET membership_status = 'accepted', settlement_id = 'sloboda-pilot' WHERE id = $1", [r1UserId]);

    // Multi-contributor clean R1 history:
    // Contrib 1: 100,000 kopecks fully paid on disputed-after-paid expense
    // Contrib 2: 200,000 kopecks -> 150,000 reserved + 50,000 available
    const r1Contrib1 = (await pool.query(`
        INSERT INTO contributions (settlement_id, purpose, contributor_name, received_kopecks, available_kopecks, reserved_kopecks, paid_kopecks, refunded_kopecks, status, ledger_mode, idempotency_key, verified_by)
        VALUES ('sloboda-pilot', 'general', 'R1 Donor Paid', 100000, 0, 0, 100000, 0, 'allocated', 'verified_receipt', 'r1-contrib-1', $1)
        RETURNING id
    `, [tempAdminId])).rows[0];
    const r1Contrib2 = (await pool.query(`
        INSERT INTO contributions (settlement_id, purpose, contributor_name, received_kopecks, available_kopecks, reserved_kopecks, paid_kopecks, refunded_kopecks, status, ledger_mode, idempotency_key, verified_by)
        VALUES ('sloboda-pilot', 'general', 'R1 Donor Reserved', 200000, 50000, 150000, 0, 0, 'partially_allocated', 'verified_receipt', 'r1-contrib-2', $1)
        RETURNING id
    `, [adminId])).rows[0];

    const r1ExpPaid = (await pool.query(`
        INSERT INTO ledger_expenses (settlement_id, purpose, title, category, amount_kopecks, status, idempotency_key, approved_by, paid_at)
        VALUES ('sloboda-pilot', 'general', 'R1 Disputed Paid', 'roads', 100000, 'disputed', 'r1-exp-1', $1, NOW())
        RETURNING id
    `, [tempAdminId])).rows[0];
    await pool.query(`
        INSERT INTO expense_allocations (expense_id, contribution_id, amount_kopecks, allocation_rule, financing_share_label, legal_right_type)
        VALUES ($1, $2, 100000, 'fifo', '1000.00 ₽ (100.0%)', 'observer_trace')
    `, [r1ExpPaid.id, r1Contrib1.id]);
    await pool.query(`
        INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
        VALUES ('pay', $1, $2, 100000, $3, 'r1 paid before dispute')
    `, [r1Contrib1.id, r1ExpPaid.id, tempAdminId]);

    const r1ExpReserved = (await pool.query(`
        INSERT INTO ledger_expenses (settlement_id, purpose, title, category, amount_kopecks, status, idempotency_key, approved_by)
        VALUES ('sloboda-pilot', 'general', 'R1 Reserved Clean', 'roads', 150000, 'reserved', 'r1-exp-2', $1)
        RETURNING id
    `, [adminId])).rows[0];
    await pool.query(`
        INSERT INTO expense_allocations (expense_id, contribution_id, amount_kopecks, allocation_rule, financing_share_label, legal_right_type)
        VALUES ($1, $2, 150000, 'fifo', '1500.00 ₽ (100.0%)', 'observer_trace')
    `, [r1ExpReserved.id, r1Contrib2.id]);
    await pool.query(`
        INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
        VALUES ('reserve', $1, $2, 150000, $3, 'r1 reserved')
    `, [r1Contrib2.id, r1ExpReserved.id, adminId]);

    // Historical R1 unsupported proposals:
    // (a) closed external proposal (R1 CHECK allows 'belenios' / 'loomio') with protocol_json & protocol_hash
    const histProtoJson = { historical: true, engine: 'belenios', tally: [7, 2] };
    const histProtoHash = crypto.createHash('sha256').update(JSON.stringify(histProtoJson)).digest('hex');
    const r1HistExt = (await pool.query(`
        INSERT INTO governance_proposals
            (title, vote_type, settlement_id, authoritative_engine, secret_ballot, seats_count, options, status, protocol_json, protocol_hash, created_by, closed_at)
        VALUES ('Historical R1 External', 'council_election', 'sloboda-pilot', 'belenios', TRUE, 1, '["A","B"]'::jsonb, 'closed', $1::jsonb, $2, $3, NOW())
        RETURNING id
    `, [JSON.stringify(histProtoJson), histProtoHash, adminId])).rows[0];

    // (b) open seats_count = 3 proposal
    const r1HistMultiSeat = (await pool.query(`
        INSERT INTO governance_proposals
            (title, vote_type, settlement_id, authoritative_engine, secret_ballot, seats_count, options, status, created_by, opened_at)
        VALUES ('Historical R1 Multi-Seat', 'council_election', 'sloboda-pilot', 'native_secret', TRUE, 3, '["Cand 1","Cand 2","Cand 3"]'::jsonb, 'open', $1, NOW())
        RETURNING id
    `, [adminId])).rows[0];
    await pool.query(`
        INSERT INTO governance_voter_snapshots
            (proposal_id, user_id, voter_label, can_vote_member, member_weight, can_vote_capital, capital_weight_kopecks)
        VALUES ($1, $2, 'R1 Member', TRUE, 1, FALSE, 0)
    `, [r1HistMultiSeat.id, r1UserId]);

    // Upgrade via ensureCoreSchema (applies R2 + R3 + preflight) + idempotent repeat
    await coreStore.ensureCoreSchema();
    await coreStore.ensureCoreSchema();

    const upgradedExp = await pool.query('SELECT status, financial_status, dispute_status, version FROM ledger_expenses WHERE id = $1', [r1ExpPaid.id]);
    assert.equal(upgradedExp.rows[0].status, 'disputed');
    assert.equal(upgradedExp.rows[0].financial_status, 'paid', 'R2/R3 upgrade must reconstruct financial_status=paid from postings');
    assert.equal(upgradedExp.rows[0].dispute_status, 'open');

    // Append-only trigger check: block DELETE/UPDATE, allow admin ON DELETE SET NULL
    await assert.rejects(
        () => pool.query('DELETE FROM ledger_postings WHERE expense_id = $1', [r1ExpPaid.id]),
        /append-only/
    );
    await assert.rejects(
        () => pool.query('UPDATE ledger_postings SET amount_kopecks = 1 WHERE expense_id = $1', [r1ExpPaid.id]),
        /append-only/
    );
    await pool.query('DELETE FROM admins WHERE id = $1', [tempAdminId]);
    const postAfterAdminDel = await pool.query('SELECT actor_admin_id FROM ledger_postings WHERE expense_id = $1', [r1ExpPaid.id]);
    assert.equal(postAfterAdminDel.rows[0].actor_admin_id, null, 'Deleting admin must succeed via ON DELETE SET NULL');

    // Clean preflight report & gate
    const preflightR1Up = await coreStore.getLedgerPreflightReport();
    assert.equal(preflightR1Up.report.financial.ok, true, 'Clean R1 history must pass financial integrity check');
    assert.equal(preflightR1Up.is_blocked, false, 'Clean R1 upgrade must leave sloboda_core_gates unblocked');

    // Verify historical unsupported R1 proposals disposition & immutability
    const histExtAfter = (await pool.query('SELECT authoritative_engine, protocol_json, protocol_hash, legacy_r1_unsupported, legacy_r1_disposition FROM governance_proposals WHERE id = $1', [r1HistExt.id])).rows[0];
    assert.equal(histExtAfter.legacy_r1_unsupported, true);
    assert.equal(histExtAfter.legacy_r1_disposition, 'archived_historical_r1');
    assert.equal(histExtAfter.authoritative_engine, 'belenios');
    assert.deepEqual(histExtAfter.protocol_json, histProtoJson);
    assert.equal(histExtAfter.protocol_hash, histProtoHash);

    const histSeatAfter = (await pool.query('SELECT legacy_r1_unsupported, legacy_r1_disposition FROM governance_proposals WHERE id = $1', [r1HistMultiSeat.id])).rows[0];
    assert.equal(histSeatAfter.legacy_r1_unsupported, true);
    assert.equal(histSeatAfter.legacy_r1_disposition, 'frozen_requires_operator_disposition');

    await assert.rejects(
        () => coreStore.castGovernanceBallot({ proposalId: r1HistMultiSeat.id, userId: r1UserId, chamber: 'member', optionIndex: 0 }),
        (err) => err.status === 409 && err.code === 'LEGACY_UNSUPPORTED_PROPOSAL',
        'Frozen R1 unsupported proposal must reject castGovernanceBallot with 409 LEGACY_UNSUPPORTED_PROPOSAL'
    );
    await assert.rejects(
        () => coreStore.closeProposal(r1HistMultiSeat.id),
        (err) => err.status === 409 && err.code === 'LEGACY_UNSUPPORTED_PROPOSAL',
        'Frozen R1 unsupported proposal must reject closeProposal with 409 LEGACY_UNSUPPORTED_PROPOSAL'
    );

    // Creating new external or multi-seat proposal rejected with 400
    await assert.rejects(
        () => coreStore.createProposal({
            title: 'New external blocked',
            vote_type: 'council_election',
            authoritative_engine: 'loomio',
            options: ['A', 'B'],
        }, adminId),
        (err) => err.status === 400
    );
    await assert.rejects(
        () => coreStore.createProposal({
            title: 'New multi-seat blocked',
            vote_type: 'council_election',
            authoritative_engine: 'native_named',
            secret_ballot: false,
            seats_count: 3,
            options: ['A', 'B', 'C'],
        }, adminId),
        (err) => err.status === 400
    );

    // Corrupted R1 reservation gate (SLB-R2-03):
    // Shift 10,000 kopecks from available -> reserved on r1Contrib2 (preserving row conservation, breaking allocation match)
    await pool.query(
        'UPDATE contributions SET available_kopecks = available_kopecks - 10000, reserved_kopecks = reserved_kopecks + 10000 WHERE id = $1',
        [r1Contrib2.id]
    );
    const blockedGate = await coreStore.revalidateLedgerIntegrity();
    assert.equal(blockedGate.report.financial.ok, false);
    assert.ok(blockedGate.report.financial.discrepancies.length > 0);
    assert.equal(blockedGate.is_blocked, true);

    const dbGateBlocked = await pool.query("SELECT is_blocked FROM sloboda_core_gates WHERE gate_key = 'ledger_integrity'");
    assert.equal(dbGateBlocked.rows[0].is_blocked, true);

    await assert.rejects(
        () => coreStore.recordContribution({
            settlement_id: 'sloboda-pilot',
            purpose: 'general',
            contributor_name: 'Blocked Donor',
            amount_kopecks: 10000,
            idempotency_key: 'gate-blocked-contrib',
        }, adminId),
        (err) => err.status === 503 && err.code === 'LEDGER_INTEGRITY_GATE_BLOCKED'
    );
    await assert.rejects(
        () => coreStore.createAndAllocateExpense({
            settlement_id: 'sloboda-pilot',
            purpose: 'general',
            title: 'Blocked Expense',
            category: 'equipment',
            amount_kopecks: 10000,
            idempotency_key: 'gate-blocked-exp',
        }, adminId),
        (err) => err.status === 503 && err.code === 'LEDGER_INTEGRITY_GATE_BLOCKED'
    );
    await assert.rejects(
        () => coreStore.transitionExpenseStatus(r1ExpReserved.id, 'paid', adminId, 1),
        (err) => err.status === 503 && err.code === 'LEDGER_INTEGRITY_GATE_BLOCKED'
    );

    // Documented recovery: restore corrupted contribution row and revalidate
    await pool.query(
        'UPDATE contributions SET available_kopecks = available_kopecks + 10000, reserved_kopecks = reserved_kopecks - 10000 WHERE id = $1',
        [r1Contrib2.id]
    );
    const restoredGate = await coreStore.revalidateLedgerIntegrity();
    assert.equal(restoredGate.report.financial.ok, true);
    assert.equal(restoredGate.is_blocked, false);

    // Writes resume
    const resumedContrib = await coreStore.recordContribution({
        settlement_id: 'sloboda-pilot',
        purpose: 'general',
        contributor_name: 'Resumed Donor',
        amount_kopecks: 25000,
        idempotency_key: 'gate-resumed-contrib',
    }, adminId);
    assert.equal(resumedContrib.idempotent_replay, false);

    // Also verify duplicate pay posting detection blocks gate
    await pool.query(`
        INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
        VALUES ('pay', $1, $2, 100000, $3, 'corrupted duplicate pay posting')
    `, [r1Contrib1.id, r1ExpPaid.id, adminId]);
    const dupPayGate = await coreStore.revalidateLedgerIntegrity();
    assert.equal(dupPayGate.report.financial.ok, false);
    assert.equal(dupPayGate.is_blocked, true);
    assert.ok(dupPayGate.report.financial.discrepancies.some((d) => d.type === 'duplicate_terminal_posting_per_allocation'));
    console.log('PASS [2/8] R1->R3 upgrade, unsupported proposals, append-only trigger & SLB-R2-03 integrity gate block/recovery');

    // =========================================================================
    // [3/8] SLB-R2-05: Rollback / Fallback Read-Only Mode on Populated R3 Schema
    // =========================================================================
    console.log('=== [3/8] SLB-R2-05: Fallback Read-Only Mode & Restore Writes on Populated R3 Schema ===');
    await resetBaseSchema();
    await coreStore.ensureCoreSchema();
    const roAdminId = (await pool.query("INSERT INTO admins (email, name, role) VALUES ('ro@sloboda.land', 'RO Admin', 'super_admin') RETURNING id")).rows[0].id;
    await coreStore.recordContribution({
        settlement_id: 'sloboda-pilot',
        purpose: 'general',
        contributor_name: 'RO Donor',
        amount_kopecks: 100000,
        idempotency_key: 'ro-contrib-1',
    }, roAdminId);
    const roExp = await coreStore.createAndAllocateExpense({
        settlement_id: 'sloboda-pilot',
        purpose: 'general',
        title: 'RO Reserved Expense',
        category: 'equipment',
        amount_kopecks: 40000,
        mark_paid: false,
        idempotency_key: 'ro-exp-1',
    }, roAdminId);

    // Enable fallback read-only mode
    await pool.query(sqlFallbackReadonly);

    // Reads continue to work
    const roContribs = await coreStore.listAdminContributions({ settlement_id: 'all', limit: 10, offset: 0 });
    assert.equal(roContribs.total, 1);
    const roExps = await coreStore.listAdminExpenses({ settlement_id: 'all', limit: 10, offset: 0 });
    assert.equal(roExps.total, 1);
    const roSummary = await coreStore.getAdminLedgerSummary('all');
    assert.equal(roSummary.totals.reserved.kopecks_str, '40000');

    // Simulated R1 direct writes fail with SQLSTATE 55000 (ROLLBACK_READONLY_MODE) and mutate zero rows
    await assert.rejects(
        () => pool.query("UPDATE ledger_expenses SET status = 'paid' WHERE id = $1", [roExp.expense.id]),
        (err) => err.code === '55000' && /ROLLBACK_READONLY_MODE/.test(err.message)
    );
    await assert.rejects(
        () => pool.query("INSERT INTO governance_proposals (title, vote_type, options) VALUES ('R1 Proposal Write', 'council_election', '[\"A\",\"B\"]'::jsonb)"),
        (err) => err.code === '55000' && /ROLLBACK_READONLY_MODE/.test(err.message)
    );
    const expStatusAfterRo = await pool.query('SELECT status, financial_status FROM ledger_expenses WHERE id = $1', [roExp.expense.id]);
    assert.equal(expStatusAfterRo.rows[0].status, 'reserved');
    assert.equal(expStatusAfterRo.rows[0].financial_status, 'reserved');
    const propCountAfterRo = await pool.query('SELECT COUNT(*)::int AS cnt FROM governance_proposals');
    assert.equal(propCountAfterRo.rows[0].cnt, 0);

    // Populated rollback refusal still holds
    await assert.rejects(
        () => pool.query(sqlRollback),
        /Refusing destructive rollback/
    );

    // Restore writes and verify R3 writes & financial integrity pass
    await pool.query(sqlRestoreWrites);
    const roPaid = await coreStore.transitionExpenseStatus(roExp.expense.id, 'paid', roAdminId, 1);
    assert.equal(roPaid.status, 'paid');
    const roReval = await coreStore.revalidateLedgerIntegrity();
    assert.equal(roReval.report.financial.ok, true);
    assert.equal(roReval.is_blocked, false);
    console.log('PASS [3/8] Fallback read-only mode blocks writes (55000), preserves reads, and restore-writes resumes R3 cleanly');

    // =========================================================================
    // [4/8] SLB-R2-06: Legacy Expense Idempotency (request_fingerprint IS NULL)
    // =========================================================================
    console.log('=== [4/8] SLB-R2-06: Legacy R1 Expense Idempotency (request_fingerprint IS NULL) ===');
    const legContrib = (await pool.query(`
        INSERT INTO contributions
            (settlement_id, purpose, contributor_name, received_kopecks, available_kopecks, reserved_kopecks, paid_kopecks, refunded_kopecks, status, ledger_mode, idempotency_key, verified_by)
        VALUES ('sloboda-pilot', 'legacy-check', 'Legacy Donor', 50000, 0, 0, 50000, 0, 'allocated', 'verified_receipt', 'leg-contrib-1', $1)
        RETURNING id
    `, [roAdminId])).rows[0];
    const legExp = (await pool.query(`
        INSERT INTO ledger_expenses
            (settlement_id, purpose, title, category, amount_kopecks, milestone_id, asset_name, asset_location, receipt_url, photo_url,
             allocation_rule, status, financial_status, dispute_status, version, idempotency_key, request_fingerprint, approved_by, paid_at)
        VALUES ('sloboda-pilot', 'legacy-check', 'Legacy Mixer', 'equipment', 50000, NULL,
                'Legacy Mixer Asset', 'Plot 1', 'https://sloboda.land/r/legacy.pdf', 'https://sloboda.land/p/legacy.jpg',
                'fifo', 'paid', 'paid', 'none', 1, 'legacy-r1-exp-1', NULL, $1, NOW())
        RETURNING id
    `, [roAdminId])).rows[0];
    await pool.query(`
        INSERT INTO expense_allocations (expense_id, contribution_id, amount_kopecks, allocation_rule, financing_share_label, legal_right_type)
        VALUES ($1, $2, 50000, 'fifo', '500.00 ₽ (100.0%)', 'observer_trace')
    `, [legExp.id, legContrib.id]);
    await pool.query(`
        INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
        VALUES ('reserve', $1, $2, 50000, $3, 'legacy reserve'),
               ('pay', $1, $2, 50000, $3, 'legacy pay')
    `, [legContrib.id, legExp.id, roAdminId]);

    const postingsBeforeLeg = (await pool.query('SELECT COUNT(*)::int AS cnt FROM ledger_postings')).rows[0].cnt;

    const legacyBaseParams = {
        settlement_id: 'sloboda-pilot',
        purpose: 'legacy-check',
        title: 'Legacy Mixer',
        category: 'equipment',
        amount_kopecks: 50000,
        asset_name: 'Legacy Mixer Asset',
        asset_location: 'Plot 1',
        receipt_url: 'https://sloboda.land/r/legacy.pdf',
        photo_url: 'https://sloboda.land/p/legacy.jpg',
        allocation_rule: 'fifo',
        mark_paid: false,
        idempotency_key: 'legacy-r1-exp-1',
    };
    const legReplay = await coreStore.createAndAllocateExpense(legacyBaseParams, roAdminId);
    assert.equal(legReplay.idempotent_replay, true);
    assert.equal(legReplay.expense.id, legExp.id);

    const legacyMismatches = [
        { ...legacyBaseParams, asset_name: 'Tampered Asset' },
        { ...legacyBaseParams, asset_location: 'Plot 99' },
        { ...legacyBaseParams, receipt_url: 'https://sloboda.land/r/other.pdf' },
        { ...legacyBaseParams, photo_url: 'https://sloboda.land/p/other.jpg' },
        { ...legacyBaseParams, mark_paid: true },
    ];
    for (const badParams of legacyMismatches) {
        await assert.rejects(
            () => coreStore.createAndAllocateExpense(badParams, roAdminId),
            (err) => err.status === 409,
            'Legacy expense replay with mutated field must reject with 409'
        );
    }
    const postingsAfterLeg = (await pool.query('SELECT COUNT(*)::int AS cnt FROM ledger_postings')).rows[0].cnt;
    assert.equal(postingsAfterLeg, postingsBeforeLeg, 'Legacy expense replays/conflicts must insert zero new postings');
    console.log('PASS [4/8] Legacy R1 expense idempotency (request_fingerprint IS NULL) exact replay & field-level 409s');

    // =========================================================================
    // [5/8] SLB-R2-07 & SLB-R2-08: Pagination & Multi-Settlement / Ledger-Mode Scope
    // =========================================================================
    console.log('=== [5/8] SLB-R2-07 & SLB-R2-08: Pagination & Multi-Settlement / Ledger-Mode Scope ===');
    await resetBaseSchema();
    await coreStore.ensureCoreSchema();
    const pgAdminId = (await pool.query("INSERT INTO admins (email, name, role) VALUES ('pag@sloboda.land', 'Pag Admin', 'super_admin') RETURNING id")).rows[0].id;

    // Seed 55 contributions across sloboda-pilot & sloboda-north with verified_receipt, pledge, legacy_import
    const seededContribIds = [];
    for (let i = 1; i <= 45; i++) {
        const settlement = i <= 25 ? 'sloboda-pilot' : 'sloboda-north';
        const c = await coreStore.recordContribution({
            settlement_id: settlement,
            purpose: 'roads',
            contributor_name: `Verified #${i}`,
            amount_kopecks: 100000,
            ledger_mode: 'verified_receipt',
            idempotency_key: `pag-c-ver-${i}`,
        }, pgAdminId);
        seededContribIds.push(c.contribution.id);
    }
    for (let i = 1; i <= 5; i++) {
        const settlement = i <= 3 ? 'sloboda-pilot' : 'sloboda-north';
        const c = await coreStore.recordContribution({
            settlement_id: settlement,
            purpose: 'roads',
            contributor_name: `Pledge #${i}`,
            amount_kopecks: 250000,
            ledger_mode: 'pledge',
            idempotency_key: `pag-c-pledge-${i}`,
        }, pgAdminId);
        seededContribIds.push(c.contribution.id);
    }
    for (let i = 1; i <= 5; i++) {
        const settlement = i <= 3 ? 'sloboda-pilot' : 'sloboda-north';
        const c = await coreStore.recordContribution({
            settlement_id: settlement,
            purpose: 'roads',
            contributor_name: `LegacyImport #${i}`,
            amount_kopecks: 300000,
            ledger_mode: 'legacy_import',
            idempotency_key: `pag-c-legacy-${i}`,
        }, pgAdminId);
        seededContribIds.push(c.contribution.id);
    }

    // Seed 55 expenses across sloboda-pilot (30) & sloboda-north (25); oldest (#1) becomes disputed
    let oldestExpenseId = null;
    for (let i = 1; i <= 55; i++) {
        const settlement = i <= 30 ? 'sloboda-pilot' : 'sloboda-north';
        const exp = await coreStore.createAndAllocateExpense({
            settlement_id: settlement,
            purpose: 'roads',
            title: `Paginated Expense #${i}`,
            category: 'roads',
            amount_kopecks: 10000,
            mark_paid: i > 1,
            idempotency_key: `pag-e-${i}`,
        }, pgAdminId);
        if (i === 1) {
            oldestExpenseId = exp.expense.id;
            await coreStore.transitionExpenseStatus(oldestExpenseId, 'disputed', pgAdminId, 1);
        }
    }

    const cPage1 = await coreStore.listAdminContributions({ settlement_id: 'all', limit: 25, offset: 0 });
    assert.equal(cPage1.total, 55);
    assert.equal(cPage1.has_more, true);
    assert.equal(cPage1.contributions.length, 25);

    const cPage3 = await coreStore.listAdminContributions({ settlement_id: 'all', limit: 25, offset: 50 });
    assert.equal(cPage3.total, 55);
    assert.equal(cPage3.has_more, false);
    assert.equal(cPage3.contributions.length, 5);
    assert.ok(cPage3.contributions.some((c) => c.id === seededContribIds[0]), 'offset=50 must reach oldest contributions');

    const ePage3 = await coreStore.listAdminExpenses({ settlement_id: 'all', limit: 25, offset: 50 });
    assert.equal(ePage3.total, 55);
    assert.equal(ePage3.has_more, false);
    const reachedOldest = ePage3.expenses.find((e) => e.id === oldestExpenseId);
    assert.ok(reachedOldest, 'offset=50 must reach oldest reserved/disputed expense');
    assert.equal(reachedOldest.status, 'disputed');

    const directOldest = await coreStore.getAdminExpenseById(oldestExpenseId);
    assert.ok(directOldest);
    assert.equal(directOldest.id, oldestExpenseId);
    assert.equal(directOldest.status, 'disputed');

    const multiSummary = await coreStore.getAdminLedgerSummary('all');
    assert.deepEqual(multiSummary.totals, multiSummary.by_ledger_mode.verified_receipt);
    assert.equal(multiSummary.totals.contributions_count, 45);
    assert.equal(multiSummary.totals.received.kopecks_str, '4500000');
    assert.equal(multiSummary.totals.reserved.kopecks_str, '10000');
    assert.equal(multiSummary.totals.paid.kopecks_str, '540000');
    assert.equal(multiSummary.by_ledger_mode.pledge.contributions_count, 5);
    assert.equal(multiSummary.by_ledger_mode.pledge.received.kopecks_str, '1250000');
    assert.equal(multiSummary.by_ledger_mode.legacy_import.contributions_count, 5);
    assert.equal(multiSummary.by_ledger_mode.legacy_import.received.kopecks_str, '1500000');
    assert.ok(multiSummary.settlements.includes('sloboda-pilot'));
    assert.ok(multiSummary.settlements.includes('sloboda-north'));
    console.log('PASS [5/8] Admin pagination (>=55 rows), direct expense lookup & multi-settlement/ledger-mode isolation');

    // =========================================================================
    // [6/8] SLB-R2-01: Real PG17 Moderation, Ban Enforcement & Atomic Audit Rollback
    // =========================================================================
    console.log('=== [6/8] SLB-R2-01: Real PG17 Moderation, Ban Enforcement & Atomic Audit Rollback ===');
    await resetBaseSchema();
    const modUsersRes = await pool.query(`
        INSERT INTO users (email, name, status)
        VALUES
            ('reg@sloboda.land', 'Regular User', 'active'),
            ('mod@sloboda.land', 'Junior Mod', 'active'),
            ('supermod@sloboda.land', 'Super Mod', 'active'),
            ('target@sloboda.land', 'Target User', 'active'),
            ('author@sloboda.land', 'Comment Author', 'active'),
            ('legacyban@sloboda.land', 'Legacy Banned', 'active')
        RETURNING id, email, name
    `);
    const [regUser, modUser, superModUser, targetUser, commentAuthor, legacyBannedUser] = modUsersRes.rows;

    // Seed legacy user_bans before R3 migration to verify non-destructive legacy copy
    await pool.query(`
        CREATE TABLE user_bans (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            ban_type VARCHAR(50) NOT NULL,
            reason TEXT NOT NULL,
            banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE,
            lifted_at TIMESTAMP,
            lifted_by INTEGER
        );
        INSERT INTO user_bans (user_id, banned_by, ban_type, reason, is_active)
        VALUES ($1, $2, 'temporary', 'Legacy pre-R3 active ban', true);
    `, [legacyBannedUser.id, superModUser.id]);

    await coreStore.ensureCoreSchema();
    // Re-running R3 SQL directly must remain idempotent for legacy copy
    await pool.query(sqlR3);

    const legacyBanRows = await pool.query('SELECT * FROM forum_bans WHERE user_id = $1', [legacyBannedUser.id]);
    assert.equal(legacyBanRows.rows.length, 1, 'Legacy user_bans copy must preserve active ban without duplication');
    const legacyActiveBan = await db.getActiveBan(legacyBannedUser.id);
    assert.ok(legacyActiveBan && legacyActiveBan.reason === 'Legacy pre-R3 active ban');

    // Minimal forum_comments / forum_votes / forum_reputation tables required by votes route / db helpers
    await pool.query(`
        CREATE TABLE IF NOT EXISTS forum_comments (
            id SERIAL PRIMARY KEY,
            author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            thread_id INTEGER,
            body TEXT NOT NULL,
            is_deleted BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS forum_votes (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            comment_id INTEGER NOT NULL REFERENCES forum_comments(id) ON DELETE CASCADE,
            vote_type VARCHAR(20) NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, comment_id)
        );
        CREATE TABLE IF NOT EXISTS forum_reputation (
            id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            total_points INTEGER DEFAULT 0,
            threads_created INTEGER DEFAULT 0,
            comments_made INTEGER DEFAULT 0,
            upvotes_received INTEGER DEFAULT 0,
            downvotes_received INTEGER DEFAULT 0,
            last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const testCommentId = (await pool.query(
        "INSERT INTO forum_comments (author_id, body) VALUES ($1, 'Forum comment for ban vote test') RETURNING id",
        [commentAuthor.id]
    )).rows[0].id;

    // Seed roles
    await pool.query(`
        INSERT INTO forum_roles (user_id, role)
        VALUES ($1, 'new_user'), ($2, 'moderator'), ($3, 'super_moderator'), ($4, 'new_user'), ($5, 'new_user')
    `, [regUser.id, modUser.id, superModUser.id, targetUser.id, commentAuthor.id]);

    const app = express();
    app.locals.db = db;
    app.use(express.json());
    app.use(cookieParser());
    moderationRoute.setDb(db);
    votesRoute.setDb(db);
    rolesRoute.setDb(db);
    app.use('/api/moderation', moderationRoute.router);
    app.use('/api/votes', votesRoute.router);
    app.use('/api/roles', rolesRoute.router);

    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        const regTok = signUserToken(regUser, JWT_SECRET);
        const modTok = signUserToken(modUser, JWT_SECRET);
        const superModTok = signUserToken(superModUser, JWT_SECRET);
        const targetTok = signUserToken(targetUser, JWT_SECRET);

        // Regular user (new_user) gets 403 on warn / ban / unban
        assert.equal((await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/warn`, {
            method: 'POST', token: regTok, body: { reason: 'Unauthorized warn', severity: 'low' },
        })).status, 403);
        assert.equal((await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/ban`, {
            method: 'POST', token: regTok, body: { reason: 'Unauthorized ban', duration_hours: 1 },
        })).status, 403);
        assert.equal((await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/unban`, {
            method: 'POST', token: regTok, body: { reason: 'Unauthorized unban' },
        })).status, 403);

        // Junior moderator warns targetUser -> forum_warnings + forum_moderation_actions
        const warnRes = await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/warn`, {
            method: 'POST', token: modTok, body: { reason: 'First community guideline warning', severity: 'medium' },
        });
        assert.equal(warnRes.status, 201);
        const warnRows = await pool.query('SELECT * FROM forum_warnings WHERE user_id = $1', [targetUser.id]);
        assert.equal(warnRows.rows.length, 1);
        const warnAuditRows = await pool.query(
            "SELECT * FROM forum_moderation_actions WHERE target_user_id = $1 AND action_type = 'warn_user'",
            [targetUser.id]
        );
        assert.equal(warnAuditRows.rows.length, 1);

        // Junior moderator issues temp ban
        const tempBanRes = await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/ban`, {
            method: 'POST', token: modTok, body: { reason: 'Cooling off temp ban', duration_hours: 24 },
        });
        assert.equal(tempBanRes.status, 201);
        assert.equal(tempBanRes.json.ban.is_active, true);
        assert.equal(tempBanRes.json.ban.ban_type, 'temporary');

        // Active temp ban blocks db.getActiveBan AND POST /api/votes (403)
        assert.ok(await db.getActiveBan(targetUser.id), 'Active temp ban must be returned by db.getActiveBan');
        const blockedVote = await apiJson(baseUrl, '/api/votes', {
            method: 'POST', token: targetTok, body: { commentId: testCommentId, voteType: 'upvote' },
        });
        assert.equal(blockedVote.status, 403);

        // Junior moderator lifts temp ban -> sets lifted_by_user_id and restores POST /api/votes access
        const liftTempRes = await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/unban`, {
            method: 'POST', token: modTok, body: { reason: 'Cooldown completed' },
        });
        assert.equal(liftTempRes.status, 200);
        const liftedTempRow = (await pool.query('SELECT is_active, lifted_by_user_id, lifted_at FROM forum_bans WHERE id = $1', [tempBanRes.json.ban.id])).rows[0];
        assert.equal(liftedTempRow.is_active, false);
        assert.equal(liftedTempRow.lifted_by_user_id, modUser.id);
        assert.ok(liftedTempRow.lifted_at);

        assert.equal(await db.getActiveBan(targetUser.id), undefined, 'Lifted ban must not block db.getActiveBan');
        const restoredVote = await apiJson(baseUrl, '/api/votes', {
            method: 'POST', token: targetTok, body: { commentId: testCommentId, voteType: 'upvote' },
        });
        assert.equal(restoredVote.status, 201);

        // Expired ban does not block
        await pool.query(`
            INSERT INTO forum_bans (user_id, banned_by, ban_type, reason, expires_at, is_active)
            VALUES ($1, $2, 'temporary', 'Already expired ban', NOW() - INTERVAL '2 hours', true)
        `, [targetUser.id, modUser.id]);
        assert.equal(await db.getActiveBan(targetUser.id), undefined, 'Expired ban must NOT block db.getActiveBan');
        const voteWithExpiredBan = await apiJson(baseUrl, '/api/votes', {
            method: 'POST', token: targetTok, body: { commentId: testCommentId, voteType: 'downvote' },
        });
        assert.equal(voteWithExpiredBan.status, 200);

        // Junior moderator CANNOT issue permanent ban (403)
        const modPermBan = await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/ban`, {
            method: 'POST', token: modTok, body: { reason: 'Permanent ban attempt by mod' },
        });
        assert.equal(modPermBan.status, 403);

        // super_moderator issues permanent ban -> moderator CANNOT lift it (403) -> super_moderator lifts it (200)
        const superPermBan = await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/ban`, {
            method: 'POST', token: superModTok, body: { reason: 'Severe persistent abuse' },
        });
        assert.equal(superPermBan.status, 201);
        assert.equal(superPermBan.json.ban.ban_type, 'permanent');
        assert.equal(superPermBan.json.ban.expires_at, null);

        const modLiftPerm = await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/unban`, {
            method: 'POST', token: modTok, body: { reason: 'Mod cannot lift perm ban' },
        });
        assert.equal(modLiftPerm.status, 403);

        const superLiftPerm = await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/unban`, {
            method: 'POST', token: superModTok, body: { reason: 'Appeal accepted by super_moderator' },
        });
        assert.equal(superLiftPerm.status, 200);
        const liftedPermRow = (await pool.query('SELECT is_active, lifted_by_user_id FROM forum_bans WHERE id = $1', [superPermBan.json.ban.id])).rows[0];
        assert.equal(liftedPermRow.is_active, false);
        assert.equal(liftedPermRow.lifted_by_user_id, superModUser.id);

        // Atomic audit rollback: trigger failure on forum_moderation_actions rolls back forum_bans insert
        await pool.query(`
            CREATE OR REPLACE FUNCTION test_fail_audit_insert()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Simulated audit log write failure';
            END;
            $$ LANGUAGE plpgsql;
            CREATE TRIGGER trg_test_fail_audit_insert
                BEFORE INSERT ON forum_moderation_actions
                FOR EACH ROW EXECUTE FUNCTION test_fail_audit_insert();
        `);
        const bansBeforeRollback = (await pool.query('SELECT COUNT(*)::int AS cnt FROM forum_bans')).rows[0].cnt;
        const failedAuditBan = await apiJson(baseUrl, `/api/moderation/users/${targetUser.id}/ban`, {
            method: 'POST', token: superModTok, body: { reason: 'Must rollback ban row when audit fails', duration_hours: 12 },
        });
        assert.equal(failedAuditBan.status, 500);
        const bansAfterRollback = (await pool.query('SELECT COUNT(*)::int AS cnt FROM forum_bans')).rows[0].cnt;
        assert.equal(bansAfterRollback, bansBeforeRollback, 'Audit insert failure MUST atomically roll back forum_bans insert');

        await pool.query(`
            DROP TRIGGER IF EXISTS trg_test_fail_audit_insert ON forum_moderation_actions;
            DROP FUNCTION IF EXISTS test_fail_audit_insert();
        `);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
    console.log('PASS [6/8] Real PG17 moderation RBAC, ban enforcement, expired ban bypass, legacy copy & atomic audit rollback');

    // =========================================================================
    // [7/8] Core R1/R2 PG Invariants: Expense Matrix, Governance (incl. Membership Suspension), Applications Race & Portfolio Version
    // =========================================================================
    console.log('=== [7/8] Core PG Invariants: Expense Matrix, Governance Membership Suspension & Applications Concurrency ===');
    await resetBaseSchema();
    await coreStore.ensureCoreSchema();
    const aRes = await pool.query("INSERT INTO admins (email, name, role) VALUES ('fin@sloboda.land', 'Fin', 'super_admin') RETURNING id");
    const finAdminId = aRes.rows[0].id;
    const uRes = await pool.query(`
        INSERT INTO users (email, name, status, membership_status, settlement_id)
        VALUES ('u1@sloboda.land', 'User One', 'active', 'accepted', 'sloboda-pilot'),
               ('u2@sloboda.land', 'User Two', 'active', 'accepted', 'sloboda-pilot'),
               ('u_memsusp@sloboda.land', 'Membership Suspended User', 'active', 'accepted', 'sloboda-pilot')
        RETURNING id
    `);
    const u1 = uRes.rows[0].id;
    const u2 = uRes.rows[1].id;
    const uMemSusp = uRes.rows[2].id;

    // Cross-settlement milestone
    const otherMs = await pool.query(`
        INSERT INTO construction_milestones (settlement_id, code, title, category, unit, planned_qty, actual_qty, budget_kopecks, status)
        VALUES ('other-settlement', 'other_road', 'Other Road', 'roads', 'км', 5, 0, 500000, 'planned')
        RETURNING id
    `);
    const pilotMs = await pool.query("SELECT id FROM construction_milestones WHERE settlement_id = 'sloboda-pilot' AND code = 'EARTHWORKS_PITS'");

    // Record 10,000 RUB contribution (1,000,000 kopecks)
    const c1 = await coreStore.recordContribution({
        user_id: u1,
        settlement_id: 'sloboda-pilot',
        purpose: 'roads',
        contributor_name: 'User One',
        amount_kopecks: 1000000,
        legal_right_type: 'cooperative_share',
        share_class: 'A',
        idempotency_key: 'pg-contrib-1',
    }, finAdminId);
    assert.equal(c1.idempotent_replay, false);

    await assert.rejects(
        () => coreStore.recordContribution({
            user_id: u1,
            settlement_id: 'sloboda-pilot',
            purpose: 'general',
            contributor_name: 'User One',
            amount_kopecks: 1000000,
            legal_right_type: 'cooperative_share',
            share_class: 'A',
            idempotency_key: 'pg-contrib-1',
        }, finAdminId),
        (err) => err.status === 409
    );

    await assert.rejects(
        () => coreStore.createAndAllocateExpense({
            settlement_id: 'sloboda-pilot',
            purpose: 'roads',
            milestone_id: otherMs.rows[0].id,
            title: 'Cross settlement bad expense',
            category: 'roads',
            amount_kopecks: 100000,
            idempotency_key: 'pg-exp-cross-ms',
        }, finAdminId),
        (err) => err.status === 400
    );

    const expA = await coreStore.createAndAllocateExpense({
        settlement_id: 'sloboda-pilot',
        purpose: 'roads',
        milestone_id: pilotMs.rows[0].id,
        title: 'Road Phase A',
        category: 'roads',
        amount_kopecks: 400000,
        idempotency_key: 'pg-exp-a',
    }, finAdminId);
    const expB = await coreStore.createAndAllocateExpense({
        settlement_id: 'sloboda-pilot',
        purpose: 'roads',
        milestone_id: pilotMs.rows[0].id,
        title: 'Road Phase B',
        category: 'roads',
        amount_kopecks: 400000,
        idempotency_key: 'pg-exp-b',
    }, finAdminId);

    await coreStore.transitionExpenseStatus(expA.expense.id, 'paid', finAdminId, 1);
    await coreStore.transitionExpenseStatus(expA.expense.id, 'disputed', finAdminId, 2);
    await assert.rejects(
        () => coreStore.transitionExpenseStatus(expA.expense.id, 'cancelled', finAdminId, 3),
        (err) => err.status === 409
    );
    await coreStore.transitionExpenseStatus(expA.expense.id, 'paid', finAdminId, 3);

    const balAfterA = await pool.query('SELECT available_kopecks, reserved_kopecks, paid_kopecks FROM contributions WHERE id = $1', [c1.contribution.id]);
    assert.equal(balAfterA.rows[0].available_kopecks, '200000');
    assert.equal(balAfterA.rows[0].reserved_kopecks, '400000', 'Expense B reserve must remain intact at 4000 RUB');
    assert.equal(balAfterA.rows[0].paid_kopecks, '400000', 'Expense A must NOT be double-paid');

    const payPostingsA = await pool.query("SELECT COUNT(*)::int AS cnt FROM ledger_postings WHERE expense_id = $1 AND posting_type = 'pay'", [expA.expense.id]);
    assert.equal(payPostingsA.rows[0].cnt, 1, 'Exactly one pay posting for Expense A');

    await coreStore.transitionExpenseStatus(expB.expense.id, 'disputed', finAdminId, 1);
    await coreStore.transitionExpenseStatus(expB.expense.id, 'reserved', finAdminId, 2);
    await coreStore.transitionExpenseStatus(expB.expense.id, 'disputed', finAdminId, 3);
    await coreStore.transitionExpenseStatus(expB.expense.id, 'cancelled', finAdminId, 4);
    await coreStore.transitionExpenseStatus(expB.expense.id, 'disputed', finAdminId, 5);
    await assert.rejects(
        () => coreStore.transitionExpenseStatus(expB.expense.id, 'paid', finAdminId, 6),
        (err) => err.status === 409
    );
    await coreStore.transitionExpenseStatus(expB.expense.id, 'cancelled', finAdminId, 6);

    const balAfterB = await pool.query('SELECT available_kopecks, reserved_kopecks, paid_kopecks FROM contributions WHERE id = $1', [c1.contribution.id]);
    assert.equal(balAfterB.rows[0].available_kopecks, '600000');
    assert.equal(balAfterB.rows[0].reserved_kopecks, '0');
    assert.equal(balAfterB.rows[0].paid_kopecks, '400000');

    const concResults = await Promise.all(
        Array.from({ length: 5 }, () =>
            coreStore.createAndAllocateExpense({
                settlement_id: 'sloboda-pilot',
                purpose: 'roads',
                milestone_id: pilotMs.rows[0].id,
                title: 'Concurrent Road Final',
                category: 'roads',
                amount_kopecks: 600000,
                mark_paid: true,
                idempotency_key: 'pg-exp-concurrent-1',
            }, finAdminId)
        )
    );
    assert.equal(concResults.filter((r) => !r.idempotent_replay).length, 1);
    assert.equal(concResults.filter((r) => r.idempotent_replay).length, 4);

    // Governance: account suspension (u2) + membership_status suspension (uMemSusp) + active voter (u1)
    const prop = await coreStore.createProposal({
        title: 'Council Secret Election PG',
        vote_type: 'council_election',
        authoritative_engine: 'native_secret',
        secret_ballot: true,
        seats_count: 1,
        quorum_members_pct: 30,
        options: ['Candidate A', 'Candidate B'],
    }, finAdminId);
    const opened = await coreStore.openProposal(prop.id);
    assert.equal(opened.snapshot_count, 3, 'All 3 accepted active members must be in initial snapshot');

    // Account-level suspension AFTER snapshot
    await pool.query("UPDATE users SET status = 'suspended' WHERE id = $1", [u2]);
    await assert.rejects(
        () => coreStore.castGovernanceBallot({ proposalId: prop.id, userId: u2, chamber: 'member', optionIndex: 0 }),
        (err) => err.status === 403,
        'Account-level suspended user MUST be blocked from voting after snapshot'
    );
    const u2Receipt = await pool.query('SELECT COUNT(*)::int AS cnt FROM governance_voter_receipts WHERE proposal_id = $1 AND user_id = $2', [prop.id, u2]);
    assert.equal(u2Receipt.rows[0].cnt, 0);

    // Membership-level suspension (users.status remains 'active', membership_status = 'suspended') AFTER snapshot
    await pool.query("UPDATE users SET membership_status = 'suspended' WHERE id = $1", [uMemSusp]);
    await assert.rejects(
        () => coreStore.castGovernanceBallot({ proposalId: prop.id, userId: uMemSusp, chamber: 'member', optionIndex: 0 }),
        (err) => err.status === 403,
        'Membership-suspended user (even with status=active) MUST be blocked from voting after snapshot'
    );
    const memSuspReceipt = await pool.query('SELECT COUNT(*)::int AS cnt FROM governance_voter_receipts WHERE proposal_id = $1 AND user_id = $2', [prop.id, uMemSusp]);
    assert.equal(memSuspReceipt.rows[0].cnt, 0);

    // Active member votes with frozen weight 1 and proposal closes
    const u1Vote = await coreStore.castGovernanceBallot({ proposalId: prop.id, userId: u1, chamber: 'member', optionIndex: 0 });
    assert.equal(u1Vote.weight_applied, '1');
    const closed = await coreStore.closeProposal(prop.id);
    assert.equal(closed.outcome.adopted, true);
    assert.equal(closed.outcome.mandate_auto_issued, false);
    assert.equal(closed.outcome.majority_rule, 'strict_majority_of_non_abstain_cast_weight');

    const listedForU1 = await coreStore.listProposals(u1);
    const closedRow = listedForU1.find((p) => p.id === prop.id);
    assert.ok(closedRow && closedRow.my_eligibility && closedRow.my_eligibility.can_vote_member === true, 'Closed proposal must expose historical my_eligibility on PG');

    // Applications: concurrent createApplication + claimGuestApplication race, portfolio version bump, revision & terminal accepted
    const u3Res = await pool.query("INSERT INTO users (email, name, status, membership_status, settlement_id) VALUES ('u3@sloboda.land', 'Applicant Three', 'active', 'observer', 'sloboda-pilot') RETURNING id");
    const u3 = u3Res.rows[0].id;

    const appAttempts = await Promise.allSettled([
        coreStore.createApplication({ user_id: u3, full_name: 'Applicant Three', email: 'u3@sloboda.land', skills: 'Carpentry' }),
        coreStore.createApplication({ user_id: u3, full_name: 'Applicant Three', email: 'u3@sloboda.land', skills: 'Carpentry' }),
    ]);
    assert.equal(appAttempts.filter((r) => r.status === 'fulfilled').length, 1);
    const appRej = appAttempts.filter((r) => r.status === 'rejected');
    assert.equal(appRej.length, 1);
    assert.equal(appRej[0].reason.status, 409);
    const okApp = appAttempts.find((r) => r.status === 'fulfilled').value;
    const appId = okApp.application.id;
    assert.equal(okApp.application.claim_token_hash, undefined, 'Must never leak claim_token_hash');

    // Guest app claim by u3 (who already has active app) -> 409 and token NOT consumed
    const guestApp = await coreStore.createApplication({ full_name: 'Guest', email: 'guest@sloboda.land', skills: 'Solar' });
    await assert.rejects(
        () => coreStore.claimGuestApplication(u3, guestApp.claim_token),
        (err) => err.status === 409
    );
    const tokenCheck = await pool.query('SELECT claim_token_used_at FROM member_applications WHERE id = $1', [guestApp.application.id]);
    assert.equal(tokenCheck.rows[0].claim_token_used_at, null, 'Failed claim MUST NOT consume guest token');

    // Concurrent createApplication + claimGuestApplication for the same fresh user
    const uRace = (await pool.query("INSERT INTO users (email, name, status, membership_status, settlement_id) VALUES ('urace@sloboda.land', 'Race User', 'active', 'observer', 'sloboda-pilot') RETURNING id")).rows[0].id;
    const uBackup = (await pool.query("INSERT INTO users (email, name, status, membership_status, settlement_id) VALUES ('ubackup@sloboda.land', 'Backup Claimer', 'active', 'observer', 'sloboda-pilot') RETURNING id")).rows[0].id;
    const guestRace = await coreStore.createApplication({ full_name: 'Guest Race', email: 'guest-race@sloboda.land', skills: 'Plumbing' });
    const [createRaceRes, claimRaceRes] = await Promise.allSettled([
        coreStore.createApplication({ user_id: uRace, full_name: 'Race User', email: 'urace@sloboda.land', skills: 'Carpentry' }),
        coreStore.claimGuestApplication(uRace, guestRace.claim_token),
    ]);
    assert.equal(
        [createRaceRes, claimRaceRes].filter((r) => r.status === 'fulfilled').length,
        1,
        'Concurrent createApplication + claimGuestApplication must allow exactly 1 winner'
    );
    const raceLoser = [createRaceRes, claimRaceRes].find((r) => r.status === 'rejected');
    assert.equal(raceLoser.reason.status, 409);
    const uRaceActiveCnt = (await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM member_applications WHERE user_id = $1 AND status IN ('pending', 'in_review', 'revision_requested', 'accepted')",
        [uRace]
    )).rows[0].cnt;
    assert.equal(uRaceActiveCnt, 1, 'User must have exactly 1 active application after race');
    if (claimRaceRes.status === 'rejected') {
        const gRow = (await pool.query('SELECT user_id, claim_token_used_at FROM member_applications WHERE id = $1', [guestRace.application.id])).rows[0];
        assert.equal(gRow.user_id, null, 'Losing claim must leave user_id NULL');
        assert.equal(gRow.claim_token_used_at, null, 'Losing claim must NOT consume claim_token');
        const backupClaim = await coreStore.claimGuestApplication(uBackup, guestRace.claim_token);
        assert.equal(backupClaim.user_id, uBackup, 'Unconsumed token must remain claimable by another user');
    }

    // Mandatory expected_version -> 400 when omitted
    await assert.rejects(
        () => coreStore.reviewApplication({ applicationId: appId, status: 'in_review', reviewerId: finAdminId }),
        (err) => err.status === 400
    );

    // Request revision (version 1 -> 2), addPortfolioItem bumps version (2 -> 3), stale resubmit (expectedVersion: 2) -> 409
    await coreStore.reviewApplication({ applicationId: appId, status: 'revision_requested', reviewNote: 'Add portfolio link', expectedVersion: 1, reviewerId: finAdminId });
    const portAdded = await coreStore.addPortfolioItem(u3, { title: 'Timber Framing Blueprint', summary: 'Full load calc' });
    assert.equal(portAdded.application_version, 3, 'addPortfolioItem must increment application version');

    await assert.rejects(
        () => coreStore.resubmitApplication({
            userId: u3,
            applicationId: appId,
            skills: 'Carpentry + Timber Framing',
            motivation: 'Stale resubmit attempt',
            expectedVersion: 2,
        }),
        (err) => err.status === 409,
        'Resubmitting with pre-portfolio expectedVersion must fail with 409'
    );

    const resubmitted = await coreStore.resubmitApplication({
        userId: u3,
        applicationId: appId,
        skills: 'Carpentry + Timber Framing',
        motivation: 'Updated motivation',
        expectedVersion: 3,
    });
    assert.equal(resubmitted.status, 'pending');
    assert.equal(resubmitted.version, 4);

    await coreStore.reviewApplication({ applicationId: appId, status: 'accepted', reviewNote: 'Welcome!', expectedVersion: 4, reviewerId: finAdminId });
    await assert.rejects(
        () => coreStore.reviewApplication({ applicationId: appId, status: 'rejected', reviewNote: 'Undo', expectedVersion: 5, reviewerId: finAdminId }),
        (err) => err.status === 409,
        'Accepted application must be terminal'
    );
    console.log('PASS [7/8] Expense matrix, membership suspension, concurrent app/claim race, portfolio version bump & terminal accepted');

    // =========================================================================
    // [8/8] Clean up pools
    // =========================================================================
    console.log('=== [8/8] Clean up pools ===');
    await pool.end();
    if (db.pool && typeof db.pool.end === 'function') {
        await db.pool.end();
    }
    console.log('ALL_PG_CORE_INVARIANTS_PASSED');
}

run().catch(async (err) => {
    console.error('PG_VERIFY_FAILED:', err);
    try { await pool.end(); } catch (_) {}
    process.exit(1);
});
