#!/usr/bin/env node
/**
 * Real PostgreSQL Integration & Invariant Verification Suite (SLB-R1 PG-GATE)
 * Requires DATABASE_URL pointing to a disposable PostgreSQL database and TEST_NO_DB=false.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

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
const sqlRollback = fs.readFileSync(path.join(rootDir, 'server/migrations/2026-11-26-sloboda-core.rollback.sql'), 'utf8');

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

async function run() {
    const db = require('../server/db');
    const coreStore = require('../server/services/coreStore');
    coreStore.setDb(db);

    console.log('=== [1/6] SLB-R1-01: Fresh Startup, Repeat Startup, Non-Pilot Independence & Rollback ===');
    await resetBaseSchema();
    await coreStore.ensureCoreSchema();
    const m1 = await pool.query("SELECT code, status, actual_qty FROM construction_milestones WHERE settlement_id = 'sloboda-pilot' ORDER BY code");
    assert.equal(m1.rows.length, 5, 'Fresh startup must seed 5 pilot milestones');
    for (const row of m1.rows) {
        assert.equal(row.status, 'planned', `Initial pilot milestone ${row.code} must be planned`);
        assert.equal(Number(row.actual_qty), 0, `Initial pilot milestone ${row.code} must have actual_qty=0`);
    }
    const migs = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    assert.deepEqual(migs.rows.map((r) => r.version), ['2026-11-26-sloboda-core', '2026-11-26-sloboda-core-r2']);

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

    // Rollback success on empty schema
    await pool.query('DELETE FROM construction_milestones');
    await pool.query(sqlRollback);
    const tblCheck = await pool.query("SELECT to_regclass('public.member_applications') AS reg");
    assert.equal(tblCheck.rows[0].reg, null, 'Empty rollback must drop core tables');
    const colCheck = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name IN ('membership_status', 'membership_admitted_at', 'settlement_id')
    `);
    assert.equal(colCheck.rows.length, 0, 'Empty rollback must revert added users columns');
    console.log('PASS [1/6] Fresh, repeat, non-pilot seed, populated rollback refusal, empty rollback');

    console.log('=== [2/6] SLB-R1-01 / Gate A #1: Upgrade from R1 (c1a02fa7) Schema with Existing Data ===');
    await resetBaseSchema();
    const adminRes = await pool.query("INSERT INTO admins (email, name, role) VALUES ('super@sloboda.land', 'Super', 'super_admin') RETURNING id");
    const adminId = adminRes.rows[0].id;
    const tempAdminRes = await pool.query("INSERT INTO admins (email, name, role) VALUES ('temp@sloboda.land', 'Temp', 'super_admin') RETURNING id");
    const tempAdminId = tempAdminRes.rows[0].id;

    // Apply ONLY R1 schema and insert R1-era rows (including a disputed-after-paid expense)
    await pool.query(sqlR1);
    const r1Contrib = await pool.query(`
        INSERT INTO contributions (settlement_id, purpose, contributor_name, received_kopecks, available_kopecks, reserved_kopecks, paid_kopecks, refunded_kopecks, status, ledger_mode, idempotency_key, verified_by)
        VALUES ('sloboda-pilot', 'general', 'R1 Donor', 100000, 0, 0, 100000, 0, 'allocated', 'verified_receipt', 'r1-contrib-1', $1)
        RETURNING id
    `, [tempAdminId]);
    const r1Exp = await pool.query(`
        INSERT INTO ledger_expenses (settlement_id, purpose, title, category, amount_kopecks, status, idempotency_key, approved_by, paid_at)
        VALUES ('sloboda-pilot', 'general', 'R1 Disputed Paid', 'roads', 100000, 'disputed', 'r1-exp-1', $1, NOW())
        RETURNING id
    `, [tempAdminId]);
    await pool.query(`
        INSERT INTO ledger_postings (posting_type, contribution_id, expense_id, amount_kopecks, actor_admin_id, note)
        VALUES ('pay', $1, $2, 100000, $3, 'r1 paid before dispute')
    `, [r1Contrib.rows[0].id, r1Exp.rows[0].id, tempAdminId]);

    // Upgrade via ensureCoreSchema (applies R2 + seeds 5 pilot milestones)
    await coreStore.ensureCoreSchema();
    const upgradedExp = await pool.query('SELECT status, financial_status, dispute_status, version FROM ledger_expenses WHERE id = $1', [r1Exp.rows[0].id]);
    assert.equal(upgradedExp.rows[0].status, 'disputed');
    assert.equal(upgradedExp.rows[0].financial_status, 'paid', 'R2 upgrade must reconstruct financial_status=paid from postings');
    assert.equal(upgradedExp.rows[0].dispute_status, 'open');

    // Append-only trigger check: block DELETE/UPDATE, allow admin ON DELETE SET NULL
    await assert.rejects(
        () => pool.query('DELETE FROM ledger_postings WHERE expense_id = $1', [r1Exp.rows[0].id]),
        /append-only/
    );
    await assert.rejects(
        () => pool.query('UPDATE ledger_postings SET amount_kopecks = 1 WHERE expense_id = $1', [r1Exp.rows[0].id]),
        /append-only/
    );
    await pool.query('DELETE FROM admins WHERE id = $1', [tempAdminId]);
    const postAfterAdminDel = await pool.query('SELECT actor_admin_id FROM ledger_postings WHERE expense_id = $1', [r1Exp.rows[0].id]);
    assert.equal(postAfterAdminDel.rows[0].actor_admin_id, null, 'Deleting admin must succeed via ON DELETE SET NULL');
    console.log('PASS [2/6] R1->R2 upgrade backfill + append-only trigger preserving ON DELETE SET NULL');

    console.log('=== [3/6] SLB-R1-02, 06, 08: Expense Dispute Matrix, Reserve Ownership, Concurrent Idempotency & Cross-Settlement Milestone ===');
    await resetBaseSchema();
    await coreStore.ensureCoreSchema();
    const aRes = await pool.query("INSERT INTO admins (email, name, role) VALUES ('fin@sloboda.land', 'Fin', 'super_admin') RETURNING id");
    const finAdminId = aRes.rows[0].id;
    const uRes = await pool.query(`
        INSERT INTO users (email, name, status, membership_status, settlement_id)
        VALUES ('u1@sloboda.land', 'User One', 'active', 'accepted', 'sloboda-pilot'),
               ('u2@sloboda.land', 'User Two', 'active', 'accepted', 'sloboda-pilot')
        RETURNING id
    `);
    const u1 = uRes.rows[0].id;
    const u2 = uRes.rows[1].id;

    // Cross-settlement milestone
    const otherMs = await pool.query(`
        INSERT INTO construction_milestones (settlement_id, code, title, category, unit, planned_qty, actual_qty, budget_kopecks, status)
        VALUES ('other-settlement', 'other_road', 'Other Road', 'roads', 'км', 5, 0, 500000, 'planned')
        RETURNING id
    `);
    const pilotMs = await pool.query("SELECT id FROM construction_milestones WHERE settlement_id = 'sloboda-pilot' AND code = 'roads'");

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

    // Fingerprint conflict on same key with different purpose
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

    // Cross-settlement milestone rejected BEFORE mutating balances
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

    // Create Expense A (4,000 RUB) and Expense B (4,000 RUB) on the same contribution
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

    // Pay A, then dispute A -> cannot cancel paid A; resolving A->paid must NOT double-pay or touch B's reserve!
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

    // Dispute B -> return to reserved -> dispute -> cancel -> dispute -> cannot mark paid
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

    // 5 concurrent identical expense calls for ALL remaining 6,000 RUB -> all 5 succeed (1 created + 4 replays)
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
    const createdCount = concResults.filter((r) => !r.idempotent_replay).length;
    const replayCount = concResults.filter((r) => r.idempotent_replay).length;
    assert.equal(createdCount, 1, 'Exactly one concurrent call should create the expense');
    assert.equal(replayCount, 4, 'Other four concurrent calls must replay idempotently');
    console.log('PASS [3/6] Dispute matrix, reserve ownership, concurrent idempotency & cross-settlement milestone');

    console.log('=== [4/6] SLB-R1-03, 04, 14, 15, 16: Governance Live Suspension, Validation, Closed Eligibility & Reconcile ===');
    await assert.rejects(
        () => coreStore.createProposal({
            title: 'External blocked',
            vote_type: 'council_election',
            authoritative_engine: 'loomio',
            options: ['A', 'B'],
        }, finAdminId),
        (err) => err.status === 400
    );
    await assert.rejects(
        () => coreStore.createProposal({
            title: 'Multi-seat blocked',
            vote_type: 'council_election',
            authoritative_engine: 'native_named',
            secret_ballot: false,
            seats_count: 3,
            options: ['A', 'B', 'C'],
        }, finAdminId),
        (err) => err.status === 400
    );

    const prop = await coreStore.createProposal({
        title: 'Council Secret Election PG',
        vote_type: 'council_election',
        authoritative_engine: 'native_secret',
        secret_ballot: true,
        seats_count: 1,
        quorum_members_pct: 50,
        options: ['Candidate A', 'Candidate B'],
    }, finAdminId);
    await coreStore.openProposal(prop.id);

    // Suspend User 2 AFTER snapshot!
    await pool.query("UPDATE users SET status = 'suspended' WHERE id = $1", [u2]);
    await assert.rejects(
        () => coreStore.castGovernanceBallot({ proposalId: prop.id, userId: u2, chamber: 'member', optionIndex: 0 }),
        (err) => err.status === 403,
        'Account-level suspended user MUST be blocked from voting after snapshot'
    );
    const u2Receipt = await pool.query('SELECT COUNT(*)::int AS cnt FROM governance_voter_receipts WHERE proposal_id = $1 AND user_id = $2', [prop.id, u2]);
    assert.equal(u2Receipt.rows[0].cnt, 0);

    // User 1 votes and proposal closes
    await coreStore.castGovernanceBallot({ proposalId: prop.id, userId: u1, chamber: 'member', optionIndex: 0 });
    const closed = await coreStore.closeProposal(prop.id);
    assert.equal(closed.outcome.adopted, true);
    assert.equal(closed.proposal.protocol_json.mandate_auto_issued, false);
    assert.equal(closed.proposal.protocol_json.majority_rule, 'strict_majority_of_non_abstain_cast_weight');

    // SLB-R1-16: PG listProposals must populate my_eligibility on closed proposals
    const listedForU1 = await coreStore.listProposals(u1);
    const closedRow = listedForU1.find((p) => p.id === prop.id);
    assert.ok(closedRow && closedRow.my_eligibility && closedRow.my_eligibility.can_vote_member === true, 'Closed proposal must expose historical my_eligibility on PG');
    console.log('PASS [4/6] Live suspension revocation, governance contract validation & closed my_eligibility');

    console.log('=== [5/6] SLB-R1-09, 10, 11, 12: Applications Atomic Uniqueness, Claim Token Preservation, Revision & Terminal Accepted ===');
    const u3Res = await pool.query("INSERT INTO users (email, name, status, membership_status, settlement_id) VALUES ('u3@sloboda.land', 'Applicant Three', 'active', 'observer', 'sloboda-pilot') RETURNING id");
    const u3 = u3Res.rows[0].id;

    // Concurrent createApplication for u3 -> 1 succeeds, 1 gets 409
    const appAttempts = await Promise.allSettled([
        coreStore.createApplication({ user_id: u3, full_name: 'Applicant Three', email: 'u3@sloboda.land', skills: 'Carpentry' }),
        coreStore.createApplication({ user_id: u3, full_name: 'Applicant Three', email: 'u3@sloboda.land', skills: 'Carpentry' }),
    ]);
    const okApps = appAttempts.filter((r) => r.status === 'fulfilled');
    const rejApps = appAttempts.filter((r) => r.status === 'rejected');
    assert.equal(okApps.length, 1);
    assert.equal(rejApps.length, 1);
    assert.equal(rejApps[0].reason.status, 409);
    const appId = okApps[0].value.application.id;
    assert.equal(okApps[0].value.application.claim_token_hash, undefined, 'Must never leak claim_token_hash');

    // Guest app claim by u3 (who already has active app) -> 409 and token NOT consumed
    const guestApp = await coreStore.createApplication({ full_name: 'Guest', email: 'guest@sloboda.land', skills: 'Solar' });
    await assert.rejects(
        () => coreStore.claimGuestApplication(u3, guestApp.claim_token),
        (err) => err.status === 409
    );
    const tokenCheck = await pool.query('SELECT claim_token_used_at FROM member_applications WHERE id = $1', [guestApp.application.id]);
    assert.equal(tokenCheck.rows[0].claim_token_used_at, null, 'Failed claim MUST NOT consume guest token');

    // Mandatory expected_version -> 400 when omitted
    await assert.rejects(
        () => coreStore.reviewApplication({ applicationId: appId, status: 'in_review', reviewerId: finAdminId }),
        (err) => err.status === 400
    );

    // Request revision -> applicant edits & resubmits -> reviewer accepts -> terminal accepted rejects revert
    await coreStore.reviewApplication({ applicationId: appId, status: 'revision_requested', reviewNote: 'Add portfolio link', expectedVersion: 1, reviewerId: finAdminId });
    const resubmitted = await coreStore.resubmitApplication({
        userId: u3,
        applicationId: appId,
        skills: 'Carpentry + Timber Framing',
        motivation: 'Updated motivation',
        expectedVersion: 2,
    });
    assert.equal(resubmitted.status, 'pending');
    assert.equal(resubmitted.version, 3);

    await coreStore.reviewApplication({ applicationId: appId, status: 'accepted', reviewNote: 'Welcome!', expectedVersion: 3, reviewerId: finAdminId });
    await assert.rejects(
        () => coreStore.reviewApplication({ applicationId: appId, status: 'rejected', reviewNote: 'Undo', expectedVersion: 4, reviewerId: finAdminId }),
        (err) => err.status === 409,
        'Accepted application must be terminal'
    );
    console.log('PASS [5/6] Applications atomic uniqueness, claim token preservation, revision/resubmit & terminal accepted');

    console.log('=== [6/6] Clean up pool ===');
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
