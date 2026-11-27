-- Sloboda Core Platform R2 Hardening Migration (2026-11-26)
-- Atomic, idempotent upgrade from R1 (c1a02fa7) and fresh R2 installs.
-- Enforces expense financial/dispute state separation, cross-settlement milestone FK,
-- append-only ledger_postings trigger (preserving admin ON DELETE SET NULL),
-- atomic single-active application uniqueness, idempotency fingerprints, and governance invariants.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('sloboda_core_migration_r2'));

-- 1. Contributions: request_fingerprint & ledger_mode constraint
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_contributions_ledger_mode'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM contributions
            WHERE ledger_mode IS NULL OR ledger_mode NOT IN ('verified_receipt', 'pledge', 'legacy_import')
        ) THEN
            ALTER TABLE contributions
                ADD CONSTRAINT chk_contributions_ledger_mode
                CHECK (ledger_mode IN ('verified_receipt', 'pledge', 'legacy_import')) NOT VALID;
        ELSE
            ALTER TABLE contributions
                ADD CONSTRAINT chk_contributions_ledger_mode
                CHECK (ledger_mode IN ('verified_receipt', 'pledge', 'legacy_import'));
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contributions_settlement_purpose
    ON contributions(settlement_id, purpose);
CREATE INDEX IF NOT EXISTS idx_contributions_user
    ON contributions(user_id);

-- 2. Construction milestones: composite unique key (settlement_id, id) for cross-settlement FK
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_construction_milestones_settlement_id'
    ) THEN
        ALTER TABLE construction_milestones
            ADD CONSTRAINT uq_construction_milestones_settlement_id
            UNIQUE (settlement_id, id);
    END IF;
END $$;

-- 3. Ledger expenses: financial_status, dispute_status, version, request_fingerprint & composite milestone FK
ALTER TABLE ledger_expenses ADD COLUMN IF NOT EXISTS financial_status VARCHAR(24);
ALTER TABLE ledger_expenses ADD COLUMN IF NOT EXISTS dispute_status VARCHAR(24);
ALTER TABLE ledger_expenses ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ledger_expenses ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64);

-- Reconstruct financial_status and dispute_status safely for any pre-existing R1 rows
UPDATE ledger_expenses e
SET
    financial_status = CASE
        WHEN e.status = 'paid' THEN 'paid'
        WHEN e.status = 'cancelled' THEN 'cancelled'
        WHEN e.status = 'reserved' THEN 'reserved'
        WHEN e.status = 'disputed' THEN
            CASE
                WHEN EXISTS (SELECT 1 FROM ledger_postings p WHERE p.expense_id = e.id AND p.posting_type = 'pay') THEN 'paid'
                WHEN EXISTS (SELECT 1 FROM ledger_postings p WHERE p.expense_id = e.id AND p.posting_type = 'release') THEN 'cancelled'
                ELSE 'reserved'
            END
        ELSE 'reserved'
    END,
    dispute_status = CASE
        WHEN e.status = 'disputed' THEN 'open'
        WHEN EXISTS (SELECT 1 FROM ledger_postings p WHERE p.expense_id = e.id AND p.posting_type = 'resolve') THEN 'resolved'
        ELSE 'none'
    END
WHERE e.financial_status IS NULL OR e.dispute_status IS NULL;

ALTER TABLE ledger_expenses ALTER COLUMN financial_status SET DEFAULT 'reserved';
ALTER TABLE ledger_expenses ALTER COLUMN financial_status SET NOT NULL;
ALTER TABLE ledger_expenses ALTER COLUMN dispute_status SET DEFAULT 'none';
ALTER TABLE ledger_expenses ALTER COLUMN dispute_status SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ledger_expenses_financial_status') THEN
        ALTER TABLE ledger_expenses
            ADD CONSTRAINT chk_ledger_expenses_financial_status
            CHECK (financial_status IN ('reserved', 'paid', 'cancelled'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ledger_expenses_dispute_status') THEN
        ALTER TABLE ledger_expenses
            ADD CONSTRAINT chk_ledger_expenses_dispute_status
            CHECK (dispute_status IN ('none', 'open', 'resolved'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ledger_expenses_status_sync') THEN
        ALTER TABLE ledger_expenses
            ADD CONSTRAINT chk_ledger_expenses_status_sync
            CHECK (
                (dispute_status = 'open' AND status = 'disputed')
                OR (dispute_status IN ('none', 'resolved') AND status = financial_status)
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ledger_expenses_settlement_milestone') THEN
        IF EXISTS (
            SELECT 1 FROM ledger_expenses e
            WHERE e.milestone_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM construction_milestones m
                  WHERE m.settlement_id = e.settlement_id AND m.id = e.milestone_id
              )
        ) THEN
            ALTER TABLE ledger_expenses
                ADD CONSTRAINT fk_ledger_expenses_settlement_milestone
                FOREIGN KEY (settlement_id, milestone_id)
                REFERENCES construction_milestones (settlement_id, id)
                ON DELETE RESTRICT
                NOT VALID;
        ELSE
            ALTER TABLE ledger_expenses
                ADD CONSTRAINT fk_ledger_expenses_settlement_milestone
                FOREIGN KEY (settlement_id, milestone_id)
                REFERENCES construction_milestones (settlement_id, id)
                ON DELETE RESTRICT;
        END IF;
    END IF;
END $$;

-- 4. Expense allocations: per-expense contribution uniqueness
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_expense_allocations_expense_contribution') THEN
        ALTER TABLE expense_allocations
            ADD CONSTRAINT uq_expense_allocations_expense_contribution
            UNIQUE (expense_id, contribution_id);
    END IF;
END $$;

-- 5. Append-only immutability trigger on ledger_postings
-- Preserves ON DELETE SET NULL on actor_admin_id while blocking any financial mutation or deletion.
CREATE OR REPLACE FUNCTION sloboda_guard_ledger_postings_append_only()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'ledger_postings is append-only: DELETE is prohibited';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.actor_admin_id IS NOT NULL
           AND NEW.actor_admin_id IS NULL
           AND NEW.id = OLD.id
           AND NEW.posting_type = OLD.posting_type
           AND NEW.contribution_id IS NOT DISTINCT FROM OLD.contribution_id
           AND NEW.expense_id IS NOT DISTINCT FROM OLD.expense_id
           AND NEW.amount_kopecks = OLD.amount_kopecks
           AND NEW.note IS NOT DISTINCT FROM OLD.note
           AND NEW.created_at = OLD.created_at THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'ledger_postings is append-only: UPDATE is prohibited';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_postings_append_only ON ledger_postings;
CREATE TRIGGER trg_ledger_postings_append_only
    BEFORE UPDATE OR DELETE ON ledger_postings
    FOR EACH ROW
    EXECUTE FUNCTION sloboda_guard_ledger_postings_append_only();

-- 6. Member applications: status CHECK, claim_token_hash uniqueness, atomic single-active uniqueness
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_member_applications_status') THEN
        ALTER TABLE member_applications
            ADD CONSTRAINT chk_member_applications_status
            CHECK (status IN ('pending', 'in_review', 'revision_requested', 'accepted', 'rejected'));
    END IF;
END $$;

-- Reconcile any pre-existing R1 duplicate active rows (e.g. revision_requested + newer pending)
-- keeping the accepted row or most recent active row per (user_id, settlement_id).
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id, settlement_id
               ORDER BY (CASE WHEN status = 'accepted' THEN 0 ELSE 1 END), created_at DESC, id DESC
           ) AS rn
    FROM member_applications
    WHERE user_id IS NOT NULL AND status IN ('pending', 'in_review', 'revision_requested', 'accepted')
)
UPDATE member_applications m
SET status = 'rejected',
    review_note = COALESCE(m.review_note || E'\n', '') || '[R2 migration] Superseded by newer active application',
    updated_at = CURRENT_TIMESTAMP
FROM ranked r
WHERE m.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_member_applications_claim_token_hash
    ON member_applications(claim_token_hash)
    WHERE claim_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_member_applications_one_active_per_user_settlement
    ON member_applications(user_id, settlement_id)
    WHERE user_id IS NOT NULL AND status IN ('pending', 'in_review', 'revision_requested', 'accepted');

-- 7. Governance proposals: TIMESTAMPTZ closes_at (guarded so repeat runs never shift timezones) & parameter constraints
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'governance_proposals'
          AND column_name = 'closes_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE governance_proposals
            ALTER COLUMN closes_at TYPE TIMESTAMPTZ USING closes_at AT TIME ZONE 'UTC';
    END IF;
END $$;

ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS legacy_r1_unsupported BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS legacy_r1_disposition VARCHAR(64);

-- Mark pre-existing R1 proposals that do not satisfy R2 invariants without altering historical protocol fields
UPDATE governance_proposals
SET
    legacy_r1_unsupported = TRUE,
    legacy_r1_disposition = CASE
        WHEN status IN ('closed', 'cancelled') THEN 'archived_historical_r1'
        ELSE 'frozen_requires_operator_disposition'
    END
WHERE (legacy_r1_unsupported = FALSE OR legacy_r1_disposition IS NULL)
  AND (
      seats_count IS DISTINCT FROM 1
      OR NOT (
          (authoritative_engine = 'native_secret' AND secret_ballot = TRUE)
          OR (authoritative_engine = 'native_named' AND secret_ballot = FALSE)
      )
      OR quorum_members_pct IS NULL OR quorum_members_pct < 1 OR quorum_members_pct > 100
      OR quorum_capital_pct IS NULL OR quorum_capital_pct < 1 OR quorum_capital_pct > 100
      OR (
          abstain_option_index IS NOT NULL
          AND (
              abstain_option_index < 0
              OR abstain_option_index >= CASE
                  WHEN options IS NOT NULL AND jsonb_typeof(options) = 'array' THEN jsonb_array_length(options)
                  ELSE 0
              END
          )
      )
  );

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_governance_proposals_seats_count') THEN
        ALTER TABLE governance_proposals
            ADD CONSTRAINT chk_governance_proposals_seats_count
            CHECK (legacy_r1_unsupported = TRUE OR seats_count = 1);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_governance_proposals_quorum_members') THEN
        ALTER TABLE governance_proposals
            ADD CONSTRAINT chk_governance_proposals_quorum_members
            CHECK (legacy_r1_unsupported = TRUE OR (quorum_members_pct BETWEEN 1 AND 100));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_governance_proposals_quorum_capital') THEN
        ALTER TABLE governance_proposals
            ADD CONSTRAINT chk_governance_proposals_quorum_capital
            CHECK (legacy_r1_unsupported = TRUE OR (quorum_capital_pct BETWEEN 1 AND 100));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_governance_proposals_abstain_index') THEN
        ALTER TABLE governance_proposals
            ADD CONSTRAINT chk_governance_proposals_abstain_index
            CHECK (
                legacy_r1_unsupported = TRUE
                OR abstain_option_index IS NULL
                OR (
                    abstain_option_index >= 0
                    AND abstain_option_index < CASE
                        WHEN options IS NOT NULL AND jsonb_typeof(options) = 'array' THEN jsonb_array_length(options)
                        ELSE 0
                    END
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_governance_proposals_engine_secrecy') THEN
        ALTER TABLE governance_proposals
            ADD CONSTRAINT chk_governance_proposals_engine_secrecy
            CHECK (
                legacy_r1_unsupported = TRUE
                OR (authoritative_engine = 'native_secret' AND secret_ballot = TRUE)
                OR (authoritative_engine = 'native_named' AND secret_ballot = FALSE)
            );
    END IF;
END $$;

INSERT INTO schema_migrations (version)
VALUES ('2026-11-26-sloboda-core-r2')
ON CONFLICT (version) DO NOTHING;

COMMIT;
