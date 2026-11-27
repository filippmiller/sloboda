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

CREATE TABLE IF NOT EXISTS forum_reputation (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_points INTEGER DEFAULT 0,
    posts_created INTEGER DEFAULT 0,
    threads_created INTEGER DEFAULT 0,
    comments_made INTEGER DEFAULT 0,
    upvotes_received INTEGER DEFAULT 0,
    downvotes_received INTEGER DEFAULT 0,
    days_since_registration INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_reputation_user ON forum_reputation(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_reputation_points ON forum_reputation(total_points DESC);

-- Non-destructive idempotent data copy from legacy user_roles / user_bans / user_warnings / user_reputation / moderation_actions if present
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

    IF to_regclass('public.user_reputation') IS NOT NULL THEN
        SELECT string_agg(quote_ident(c1.column_name), ', ' ORDER BY c1.ordinal_position)
        INTO shared_cols
        FROM information_schema.columns c1
        JOIN information_schema.columns c2
          ON c2.table_schema = 'public'
         AND c2.table_name = 'forum_reputation'
         AND c2.column_name = c1.column_name
        WHERE c1.table_schema = 'public'
          AND c1.table_name = 'user_reputation'
          AND c1.column_name <> 'id';

        IF shared_cols IS NOT NULL AND shared_cols <> '' THEN
            EXECUTE format(
                'INSERT INTO forum_reputation (%s) SELECT %s FROM user_reputation ur WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id) ON CONFLICT (user_id) DO NOTHING',
                shared_cols,
                shared_cols
            );
        END IF;
    END IF;

    IF to_regclass('public.moderation_actions') IS NOT NULL THEN
        DECLARE
            ma_cols TEXT[];
            mod_expr TEXT;
            act_expr TEXT;
            target_user_expr TEXT;
            target_comment_expr TEXT;
            target_thread_expr TEXT;
            comment_fk_table TEXT;
            thread_fk_table TEXT;
            reason_expr TEXT;
            created_expr TEXT;
            created_cmp_expr TEXT;
            details_base_expr TEXT;
            details_extra_parts TEXT[] := ARRAY['''migrated_from'', ''moderation_actions'''];
            details_expr TEXT;
        BEGIN
            SELECT COALESCE(array_agg(column_name::text), ARRAY[]::text[])
            INTO ma_cols
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'moderation_actions';

            -- Inspect actual FK target tables on forum_moderation_actions (supports forum_comments/comments and forum_threads/threads)
            SELECT c.confrelid::regclass::text INTO comment_fk_table
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE c.conrelid = 'public.forum_moderation_actions'::regclass
              AND c.contype = 'f'
              AND a.attname = 'target_comment_id'
            LIMIT 1;

            SELECT c.confrelid::regclass::text INTO thread_fk_table
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE c.conrelid = 'public.forum_moderation_actions'::regclass
              AND c.contype = 'f'
              AND a.attname = 'target_thread_id'
            LIMIT 1;

            IF 'target_comment_id' = ANY(ma_cols) AND comment_fk_table IS NOT NULL THEN
                target_comment_expr := format('CASE WHEN EXISTS (SELECT 1 FROM %s r WHERE r.id = ma.target_comment_id) THEN ma.target_comment_id ELSE NULL END', comment_fk_table);
            ELSIF 'target_comment_id' = ANY(ma_cols) THEN
                target_comment_expr := 'ma.target_comment_id';
            ELSE
                target_comment_expr := 'NULL::integer';
            END IF;

            IF 'target_thread_id' = ANY(ma_cols) AND thread_fk_table IS NOT NULL THEN
                target_thread_expr := format('CASE WHEN EXISTS (SELECT 1 FROM %s r WHERE r.id = ma.target_thread_id) THEN ma.target_thread_id ELSE NULL END', thread_fk_table);
            ELSIF 'target_thread_id' = ANY(ma_cols) THEN
                target_thread_expr := 'ma.target_thread_id';
            ELSE
                target_thread_expr := 'NULL::integer';
            END IF;

            mod_expr := CASE
                WHEN 'moderator_id' = ANY(ma_cols)
                    THEN 'CASE WHEN ma.moderator_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = ma.moderator_id) THEN ma.moderator_id ELSE NULL END'
                ELSE 'NULL::integer'
            END;
            act_expr := CASE
                WHEN 'action_type' = ANY(ma_cols) THEN 'COALESCE(ma.action_type, ''legacy_action'')'
                ELSE '''legacy_action''::varchar(50)'
            END;
            target_user_expr := CASE
                WHEN 'target_user_id' = ANY(ma_cols)
                    THEN 'CASE WHEN ma.target_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = ma.target_user_id) THEN ma.target_user_id ELSE NULL END'
                ELSE 'NULL::integer'
            END;
            reason_expr := CASE
                WHEN 'reason' = ANY(ma_cols) THEN 'ma.reason'
                ELSE 'NULL::text'
            END;
            IF 'created_at' = ANY(ma_cols) THEN
                created_expr := 'ma.created_at';
                created_cmp_expr := 'fma.created_at IS NOT DISTINCT FROM (ma.created_at)';
            ELSE
                created_expr := 'CURRENT_TIMESTAMP';
                created_cmp_expr := 'TRUE';
            END IF;

            IF 'details' = ANY(ma_cols) THEN
                details_base_expr := 'CASE WHEN ma.details IS NULL THEN ''{}''::jsonb WHEN jsonb_typeof(ma.details::jsonb) = ''object'' THEN ma.details::jsonb ELSE jsonb_build_object(''legacy_details'', ma.details::jsonb) END';
            ELSE
                details_base_expr := '''{}''::jsonb';
            END IF;

            IF 'id' = ANY(ma_cols) THEN
                details_extra_parts := array_append(details_extra_parts, '''legacy_action_id'', ma.id');
            END IF;
            IF 'target_comment_id' = ANY(ma_cols) THEN
                details_extra_parts := array_append(details_extra_parts, '''target_comment_id'', ma.target_comment_id');
            END IF;
            IF 'target_thread_id' = ANY(ma_cols) THEN
                details_extra_parts := array_append(details_extra_parts, '''target_thread_id'', ma.target_thread_id');
            END IF;
            IF 'target_post_id' = ANY(ma_cols) THEN
                details_extra_parts := array_append(details_extra_parts, '''target_post_id'', ma.target_post_id');
            END IF;

            details_expr := format(
                '(%s) || jsonb_strip_nulls(jsonb_build_object(%s))',
                details_base_expr,
                array_to_string(details_extra_parts, ', ')
            );

            EXECUTE format(
                'INSERT INTO forum_moderation_actions (moderator_id, action_type, target_user_id, target_comment_id, target_thread_id, reason, details, created_at)
                 SELECT %s, %s, %s, %s, %s, %s, %s, %s
                 FROM moderation_actions ma
                 WHERE NOT EXISTS (
                     SELECT 1 FROM forum_moderation_actions fma
                     WHERE fma.moderator_id IS NOT DISTINCT FROM (%s)
                       AND fma.action_type = (%s)
                       AND fma.target_user_id IS NOT DISTINCT FROM (%s)
                       AND fma.reason IS NOT DISTINCT FROM (%s)
                       AND fma.details IS NOT DISTINCT FROM (%s)
                       AND %s
                 )',
                mod_expr, act_expr, target_user_expr,
                target_comment_expr,
                target_thread_expr,
                reason_expr, details_expr, created_expr,
                mod_expr, act_expr, target_user_expr, reason_expr, details_expr, created_cmp_expr
            );
        END;
    END IF;
END $$;

INSERT INTO schema_migrations (version)
VALUES ('2026-11-26-sloboda-core-r3')
ON CONFLICT (version) DO NOTHING;

COMMIT;
