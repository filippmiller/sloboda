-- Sloboda Core Platform Rollback Read-Only Guard (2026-11-26)
-- Use this BEFORE rolling back application code to R1 on a populated R2/R3 database.
-- R1 application code is NOT write-compatible with the R2/R3 schema; this guard keeps
-- all financial, governance, and membership evidence readable while blocking core mutations.
-- To re-enable writes after restoring R2/R3 application code, run:
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

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON ledger_expenses;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON ledger_expenses
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON expense_allocations;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON expense_allocations
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON ledger_postings;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON ledger_postings
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON construction_milestones;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON construction_milestones
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_proposals;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON governance_proposals
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_voter_snapshots;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON governance_voter_snapshots
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_ballots;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON governance_ballots
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_secret_ballots;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON governance_secret_ballots
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_voter_receipts;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON governance_voter_receipts
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON council_delegations;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON council_delegations
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON member_applications;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON member_applications
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON portfolio_items;
CREATE TRIGGER trg_sloboda_rollback_readonly
    BEFORE INSERT OR UPDATE OR DELETE ON portfolio_items
    FOR EACH ROW EXECUTE FUNCTION sloboda_rollback_readonly_guard();

COMMIT;
