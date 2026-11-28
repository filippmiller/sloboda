-- Sloboda Core Platform Rollback Read-Only Guard (2026-11-26)
-- Verified rollback target: master (aec59ccdc97f76d5b024333f02dfb0a4ce47175a), which does NOT
-- mount R1 ledger/governance endpoints, paired with this read-only trigger guard so all R2/R3
-- financial, governance, and membership records remain preserved and immutable during rollback.
-- IMPORTANT: R1 (c1a02fa7) is NOT a supported direct fallback binary without fencing its
-- /api/public/ledger/summary route (R1 sums all ledger_mode rows including pledges/imports)
-- and all core write routes; this guard blocks INSERT, UPDATE, DELETE, and TRUNCATE on all
-- 13 core tables with SQLSTATE 55000 (ROLLBACK_READONLY_MODE).
-- To re-enable writes after restoring R3 application code, run:
--   2026-11-26-sloboda-core-r3.restore-writes.sql

BEGIN;

CREATE OR REPLACE FUNCTION sloboda_rollback_readonly_guard()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ROLLBACK_READONLY_MODE: core writes disabled during rollback fallback'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON contributions;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON contributions
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON contributions;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON contributions
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON ledger_expenses;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON ledger_expenses
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON ledger_expenses;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON ledger_expenses
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON expense_allocations;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON expense_allocations
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON expense_allocations;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON expense_allocations
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON ledger_postings;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON ledger_postings
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON ledger_postings;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON ledger_postings
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON construction_milestones;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON construction_milestones
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON construction_milestones;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON construction_milestones
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_proposals;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON governance_proposals
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON governance_proposals;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON governance_proposals
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_voter_snapshots;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON governance_voter_snapshots
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON governance_voter_snapshots;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON governance_voter_snapshots
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_ballots;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON governance_ballots
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON governance_ballots;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON governance_ballots
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_secret_ballots;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON governance_secret_ballots
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON governance_secret_ballots;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON governance_secret_ballots
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_voter_receipts;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON governance_voter_receipts
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON governance_voter_receipts;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON governance_voter_receipts
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON council_delegations;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON council_delegations
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON council_delegations;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON council_delegations
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON member_applications;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON member_applications
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON member_applications;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON member_applications
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON portfolio_items;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON portfolio_items
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly_truncate ON portfolio_items;
CREATE TRIGGER trg_sloboda_rollback_readonly_truncate
    BEFORE TRUNCATE ON portfolio_items
    FOR EACH STATEMENT EXECUTE FUNCTION sloboda_rollback_readonly_guard();

COMMIT;
