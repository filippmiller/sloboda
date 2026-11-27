-- Sloboda Core Platform R3 Hardening Migration (2026-11-26)
-- Atomic, idempotent upgrade on both fresh installs and already-migrated R2 databases.
-- Adds sloboda_core_gates reconciliation barrier table, ensures legacy R1 governance disposition
-- columns/constraints, and establishes canonical forum_* moderation tables without requiring forum_threads.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('sloboda_core_migration_r3'));

-- 1. Core integrity gate persistence table
CREATE TABLE IF NOT EXISTS sloboda_core_gates (
    gate_key VARCHAR(64) PRIMARY KEY,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Governance R1 unsupported disposition columns & constraints (idempotent for already-migrated R2 DBs)
ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS legacy_r1_unsupported BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS legacy_r1_disposition VARCHAR(64);

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
      OR (abstain_option_index IS NOT NULL AND abstain_option_index < 0)
  );

ALTER TABLE governance_proposals DROP CONSTRAINT IF EXISTS chk_governance_proposals_seats_count;
ALTER TABLE governance_proposals
    ADD CONSTRAINT chk_governance_proposals_seats_count
    CHECK (legacy_r1_unsupported = TRUE OR seats_count = 1);

ALTER TABLE governance_proposals DROP CONSTRAINT IF EXISTS chk_governance_proposals_quorum_members;
ALTER TABLE governance_proposals
    ADD CONSTRAINT chk_governance_proposals_quorum_members
    CHECK (legacy_r1_unsupported = TRUE OR (quorum_members_pct BETWEEN 1 AND 100));

ALTER TABLE governance_proposals DROP CONSTRAINT IF EXISTS chk_governance_proposals_quorum_capital;
ALTER TABLE governance_proposals
    ADD CONSTRAINT chk_governance_proposals_quorum_capital
    CHECK (legacy_r1_unsupported = TRUE OR (quorum_capital_pct BETWEEN 1 AND 100));

ALTER TABLE governance_proposals DROP CONSTRAINT IF EXISTS chk_governance_proposals_abstain_index;
ALTER TABLE governance_proposals
    ADD CONSTRAINT chk_governance_proposals_abstain_index
    CHECK (legacy_r1_unsupported = TRUE OR abstain_option_index IS NULL OR abstain_option_index >= 0);

ALTER TABLE governance_proposals DROP CONSTRAINT IF EXISTS chk_governance_proposals_engine_secrecy;
ALTER TABLE governance_proposals
    ADD CONSTRAINT chk_governance_proposals_engine_secrecy
    CHECK (
        legacy_r1_unsupported = TRUE
        OR (authoritative_engine = 'native_secret' AND secret_ballot = TRUE)
        OR (authoritative_engine = 'native_named' AND secret_ballot = FALSE)
    );

-- 3. Canonical Moderation Schema (SLB-R2-01) — does not require forum_threads or forum_comments
CREATE TABLE IF NOT EXISTS forum_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'new_user' NOT NULL,
    can_post BOOLEAN DEFAULT TRUE,
    can_comment BOOLEAN DEFAULT TRUE,
    can_upload_images BOOLEAN DEFAULT FALSE,
    can_create_threads BOOLEAN DEFAULT FALSE,
    can_edit_own_posts BOOLEAN DEFAULT FALSE,
    can_delete_own_posts BOOLEAN DEFAULT FALSE,
    can_pin_threads BOOLEAN DEFAULT FALSE,
    can_lock_threads BOOLEAN DEFAULT FALSE,
    can_delete_others_content BOOLEAN DEFAULT FALSE,
    can_ban_users BOOLEAN DEFAULT FALSE,
    can_warn_users BOOLEAN DEFAULT FALSE,
    can_ban_users_temporary BOOLEAN DEFAULT FALSE,
    can_ban_users_permanent BOOLEAN DEFAULT FALSE,
    can_appoint_moderators BOOLEAN DEFAULT FALSE,
    can_remove_moderators BOOLEAN DEFAULT FALSE,
    can_view_mod_log BOOLEAN DEFAULT FALSE,
    can_view_user_history BOOLEAN DEFAULT FALSE,
    can_view_ip_info BOOLEAN DEFAULT FALSE,
    can_access_admin_panel BOOLEAN DEFAULT FALSE,
    can_manage_categories BOOLEAN DEFAULT FALSE,
    can_move_threads BOOLEAN DEFAULT FALSE,
    can_edit_thread_tags BOOLEAN DEFAULT FALSE,
    can_merge_threads BOOLEAN DEFAULT FALSE,
    can_view_reports BOOLEAN DEFAULT FALSE,
    can_resolve_reports BOOLEAN DEFAULT FALSE,
    can_edit_wiki BOOLEAN DEFAULT FALSE,
    can_suggest_categories BOOLEAN DEFAULT FALSE,
    can_bookmark BOOLEAN DEFAULT FALSE,
    can_report BOOLEAN DEFAULT TRUE,
    can_upvote BOOLEAN DEFAULT TRUE,
    can_downvote BOOLEAN DEFAULT FALSE,
    can_see_vote_counts BOOLEAN DEFAULT FALSE,
    can_see_deleted_indicator BOOLEAN DEFAULT FALSE,
    moderates_all_categories BOOLEAN DEFAULT FALSE,
    promoted_at TIMESTAMP,
    promoted_by INTEGER REFERENCES admins(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_roles_user ON forum_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_roles_role ON forum_roles(role);

CREATE TABLE IF NOT EXISTS forum_bans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ban_type VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    lifted_at TIMESTAMP,
    lifted_by INTEGER REFERENCES admins(id),
    lifted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE forum_bans ADD COLUMN IF NOT EXISTS lifted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_forum_bans_user ON forum_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_bans_active ON forum_bans(is_active);

CREATE TABLE IF NOT EXISTS forum_warnings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    severity VARCHAR(50) DEFAULT 'low',
    reason TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_warnings_user ON forum_warnings(user_id);

CREATE TABLE IF NOT EXISTS forum_moderation_actions (
    id SERIAL PRIMARY KEY,
    moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    target_comment_id INTEGER,
    target_thread_id INTEGER,
    reason TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_moderation_actions_moderator ON forum_moderation_actions(moderator_id);
CREATE INDEX IF NOT EXISTS idx_forum_moderation_actions_target_user ON forum_moderation_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_forum_moderation_actions_type ON forum_moderation_actions(action_type);

-- Non-destructive idempotent data copy from legacy user_roles / user_bans / user_warnings if present
DO $$
DECLARE
    shared_cols TEXT;
BEGIN
    IF to_regclass('public.user_roles') IS NOT NULL THEN
        SELECT string_agg(quote_ident(c1.column_name), ', ' ORDER BY c1.ordinal_position)
        INTO shared_cols
        FROM information_schema.columns c1
        JOIN information_schema.columns c2
          ON c2.table_schema = 'public'
         AND c2.table_name = 'forum_roles'
         AND c2.column_name = c1.column_name
        WHERE c1.table_schema = 'public'
          AND c1.table_name = 'user_roles'
          AND c1.column_name <> 'id';

        IF shared_cols IS NOT NULL AND shared_cols <> '' THEN
            EXECUTE format(
                'INSERT INTO forum_roles (%s) SELECT %s FROM user_roles ON CONFLICT (user_id) DO NOTHING',
                shared_cols,
                shared_cols
            );
        END IF;
    END IF;

    IF to_regclass('public.user_bans') IS NOT NULL THEN
        INSERT INTO forum_bans (user_id, banned_by, ban_type, reason, banned_at, expires_at, is_active, lifted_at, lifted_by)
        SELECT ub.user_id, ub.banned_by, ub.ban_type, ub.reason, ub.banned_at, ub.expires_at, ub.is_active, ub.lifted_at, ub.lifted_by
        FROM user_bans ub
        WHERE NOT EXISTS (
            SELECT 1 FROM forum_bans fb
            WHERE fb.user_id = ub.user_id
              AND fb.ban_type = ub.ban_type
              AND fb.reason = ub.reason
              AND fb.banned_at IS NOT DISTINCT FROM ub.banned_at
        );
    END IF;

    IF to_regclass('public.user_warnings') IS NOT NULL THEN
        INSERT INTO forum_warnings (user_id, issued_by, severity, reason, created_at)
        SELECT uw.user_id, uw.issued_by, uw.severity, uw.reason, uw.created_at
        FROM user_warnings uw
        WHERE NOT EXISTS (
            SELECT 1 FROM forum_warnings fw
            WHERE fw.user_id = uw.user_id
              AND fw.reason = uw.reason
              AND fw.created_at IS NOT DISTINCT FROM uw.created_at
        );
    END IF;
END $$;

INSERT INTO schema_migrations (version)
VALUES ('2026-11-26-sloboda-core-r3')
ON CONFLICT (version) DO NOTHING;

COMMIT;
