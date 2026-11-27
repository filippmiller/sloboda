-- Sloboda Core Platform R4 Hardening Migration (2026-11-27)
-- Idempotent upgrade on both fresh installs and already-migrated R3 databases.
-- Ensures governance_proposals abstain_option_index classification and CHECK constraint
-- use CASE-guarded jsonb_array_length(options) so non-array JSONB values never throw in PostgreSQL.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('sloboda_core_migration_r4'));

UPDATE public.governance_proposals
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

ALTER TABLE public.governance_proposals DROP CONSTRAINT IF EXISTS chk_governance_proposals_abstain_index;
ALTER TABLE public.governance_proposals
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

INSERT INTO public.schema_migrations (version)
VALUES ('2026-11-26-sloboda-core-r4')
ON CONFLICT (version) DO NOTHING;

COMMIT;
