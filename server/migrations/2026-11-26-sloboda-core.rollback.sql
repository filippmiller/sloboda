-- Sloboda Core Platform Non-Destructive Rollback (2026-11-26)
-- Policy: NEVER drop populated application, governance, financial, or construction evidence.
-- IMPORTANT: R1 application code is NOT write-compatible with the R2/R3 schema.
-- On a populated database, apply 2026-11-26-sloboda-core-r3.fallback-readonly.sql first so core
-- writes are safely rejected while keeping records readable; once R2/R3 code is restored, apply
-- 2026-11-26-sloboda-core-r3.restore-writes.sql to re-enable core writes.
-- On an empty schema, cleanly removes all core tables, trigger function, user columns, and migration records.

BEGIN;

DO $$
DECLARE
    tbl TEXT;
    cnt BIGINT;
    tables TEXT[] := ARRAY[
        'ledger_postings',
        'expense_allocations',
        'ledger_expenses',
        'construction_milestones',
        'contributions',
        'council_delegations',
        'governance_secret_ballots',
        'governance_voter_receipts',
        'governance_ballots',
        'governance_voter_snapshots',
        'governance_proposals',
        'portfolio_items',
        'member_applications'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF to_regclass('public.' || tbl) IS NOT NULL THEN
            EXECUTE format('LOCK TABLE %I IN ACCESS EXCLUSIVE MODE', tbl);
            EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO cnt;
            IF cnt > 0 THEN
                RAISE EXCEPTION 'Refusing destructive rollback: table % has % rows. Roll back application code while preserving database records.', tbl, cnt;
            END IF;
        END IF;
    END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_ledger_postings_append_only ON ledger_postings;
DROP FUNCTION IF EXISTS sloboda_guard_ledger_postings_append_only();

DROP TABLE IF EXISTS sloboda_core_gates;
DROP TABLE IF EXISTS ledger_postings;
DROP TABLE IF EXISTS expense_allocations;
DROP TABLE IF EXISTS ledger_expenses;
DROP TABLE IF EXISTS construction_milestones;
DROP TABLE IF EXISTS contributions;
DROP TABLE IF EXISTS council_delegations;
DROP TABLE IF EXISTS governance_secret_ballots;
DROP TABLE IF EXISTS governance_voter_receipts;
DROP TABLE IF EXISTS governance_ballots;
DROP TABLE IF EXISTS governance_voter_snapshots;
DROP TABLE IF EXISTS governance_proposals;
DROP TABLE IF EXISTS portfolio_items;
DROP TABLE IF EXISTS member_applications;

ALTER TABLE users DROP COLUMN IF EXISTS membership_status;
ALTER TABLE users DROP COLUMN IF EXISTS membership_admitted_at;
ALTER TABLE users DROP COLUMN IF EXISTS settlement_id;

DELETE FROM schema_migrations WHERE version IN ('2026-11-26-sloboda-core', '2026-11-26-sloboda-core-r2', '2026-11-26-sloboda-core-r3', '2026-11-26-sloboda-core-r4');

COMMIT;
