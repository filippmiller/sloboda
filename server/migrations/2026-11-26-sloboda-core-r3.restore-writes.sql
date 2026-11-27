-- Sloboda Core Platform Restore Writes After Rollback Fallback (2026-11-26)
-- Removes the read-only rollback guard triggers installed by:
--   2026-11-26-sloboda-core-r3.fallback-readonly.sql

BEGIN;

DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON contributions;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON ledger_expenses;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON expense_allocations;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON ledger_postings;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON construction_milestones;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_proposals;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_voter_snapshots;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_ballots;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_secret_ballots;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON governance_voter_receipts;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON council_delegations;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON member_applications;
DROP TRIGGER IF EXISTS trg_sloboda_rollback_readonly ON portfolio_items;

DROP FUNCTION IF EXISTS sloboda_rollback_readonly_guard();

COMMIT;
